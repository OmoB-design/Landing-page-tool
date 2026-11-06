"""Creating a build (BUILD_SPEC §9 step 6): the build row with its key and its `build` job, in
one transaction. Used by POST /builds and the smoke-build command; a batch (B3.5) makes a page
from each of several templates in one go. Retrying a failed build queues
its `build` job again (POST /builds/{id}/retry)."""

from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import transaction
from app.engines import targeting
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.models.build import BatchPage, BatchState, BuildWizard, FolderColor
from app.models.template import RANKING_TYPE


class BuildInputsMissingError(Exception):
    """The template, brand or product isn't available to this org."""


class TemplateNotReadyError(Exception):
    """A cloned template is built from once its analysis is confirmed (B2.2, D96)."""


class CompetitorsMissingError(Exception):
    """A Top 5 ranking build needs its four competitor pages (B2.4a)."""


class BuildNotFoundError(Exception):
    """No such build in this org."""


class BuildNotFailedError(Exception):
    """Only a failed build can be retried (one that is queued or building is still going)."""


def _template(conn: Any, org_id: UUID, template_id: UUID) -> dict[str, Any]:
    """A template this org can build from: the library's or its own, active; a cloned one once its
    analysis is confirmed (B2.2, D96)."""
    template = conn.execute(
        """
        select id, name, type, origin, version, blueprint, reviewed_at from templates
        where id = %(t)s and (org_id is null or org_id = %(o)s)
          and deleted_at is null and status = 'active'
        """,
        {"t": template_id, "o": org_id},
    ).fetchone()
    if template is None:
        raise BuildInputsMissingError
    if template["origin"] == "cloned" and not (template["blueprint"] and template["reviewed_at"]):
        raise TemplateNotReadyError
    return dict(template)


def _product(conn: Any, org_id: UUID, brand_id: UUID, product_id: UUID) -> dict[str, Any]:
    product = conn.execute(
        """
        select p.id, p.name from products p join brands b on b.id = p.brand_id
        where p.id = %(p)s and p.brand_id = %(b)s and p.org_id = %(o)s and b.org_id = %(o)s
          and p.deleted_at is null and b.deleted_at is null
        """,
        {"p": product_id, "b": brand_id, "o": org_id},
    ).fetchone()
    if product is None:
        raise BuildInputsMissingError
    return dict(product)


def _add_build(
    conn: Any,
    *,
    org_id: UUID,
    template: dict[str, Any],
    product: dict[str, Any],
    brand_id: UUID,
    wizard: BuildWizard,
    created_by: UUID | None,
    batch_id: UUID | None = None,
) -> tuple[dict[str, Any], Job]:
    """The build row with its key (only the worker allocates keys, D27, D57) and its `build` job,
    in the caller's transaction."""
    # Competitors belong to ranking pages only (B2.4a, D102).
    if template["type"] == RANKING_TYPE and wizard.competitors is None:
        raise CompetitorsMissingError
    if template["type"] != RANKING_TYPE:
        wizard = wizard.model_copy(update={"competitors": None})
    key = conn.execute("select allocate_build_key(%(b)s) as key", {"b": brand_id}).fetchone()
    assert key is not None
    build = conn.execute(
        """
        insert into builds (org_id, brand_id, product_id, template_id, template_version, key,
                            origin, status, title, wizard, targeting, mock_images,
                            created_by, batch_id, created_at)
        values (%(o)s, %(b)s, %(p)s, %(t)s, %(v)s, %(key)s, %(origin)s, 'queued', %(title)s,
                %(wizard)s, %(targeting)s, %(mock)s, %(user)s, %(batch)s, clock_timestamp())
        returning id, key, status, title
        """,
        {
            "o": org_id, "b": brand_id, "p": product["id"], "t": template["id"],
            "v": template["version"], "key": key["key"], "origin": template["origin"],
            "title": f"{template['name']} · {product['name']}",
            "wizard": Jsonb(wizard.model_dump(mode="json")),
            "targeting": Jsonb(targeting.compose(wizard.model_dump(mode="json"))),
            "mock": get_settings().lp_mock_images, "user": created_by, "batch": batch_id,
        },
    ).fetchone()  # fmt: skip
    assert build is not None
    kind = KINDS["build"]
    job, _ = queue.enqueue(
        org_id=org_id,
        kind=kind.name,
        payload={"build_id": str(build["id"])},
        created_by=created_by,
        build_id=build["id"],
        max_attempts=kind.max_attempts,
        conn=conn,
    )
    return dict(build), job


def create_build(
    *,
    org_id: UUID,
    template_id: UUID,
    brand_id: UUID,
    product_id: UUID,
    wizard: BuildWizard,
    created_by: UUID | None,
) -> tuple[dict[str, Any], Job]:
    """One page: its build and job in one transaction."""
    with transaction() as conn:
        template = _template(conn, org_id, template_id)
        product = _product(conn, org_id, brand_id, product_id)
        return _add_build(
            conn, org_id=org_id, template=template, product=product, brand_id=brand_id,
            wizard=wizard, created_by=created_by,
        )  # fmt: skip


class BatchTooBigError(Exception):
    """More pages than the workspace may still start this hour (B3.5)."""

    def __init__(self, room: int) -> None:
        super().__init__(room)
        self.room = room


def create_batch(
    *,
    org_id: UUID,
    template_ids: list[UUID],
    brand_id: UUID,
    product_id: UUID,
    wizard: BuildWizard,
    created_by: UUID | None,
) -> tuple[UUID, list[tuple[dict[str, Any], Job]]]:
    """A page from each template for one product (B3.5, D115), all in one transaction: every
    template is checked first and nothing is started unless they all can be, within the hourly
    cap. The pages share a batch id, so the batch screen can follow them together. The ranking
    templates in it share the wizard's one set of competitors."""
    chosen = list(dict.fromkeys(template_ids))  # each template once, in the order chosen
    batch_id = uuid4()
    with transaction() as conn:
        product = _product(conn, org_id, brand_id, product_id)
        templates = [_template(conn, org_id, t) for t in chosen]
        room = queue.remaining(conn, org_id, KINDS["build"].name)
        if room is not None and len(templates) > room:
            raise BatchTooBigError(room)
        # Its folder in the Pages list (B3.5b), red until the team picks another colour.
        conn.execute(
            "insert into build_batches (id, org_id, created_by) values (%(id)s, %(o)s, %(by)s)",
            {"id": batch_id, "o": org_id, "by": created_by},
        )
        made = []
        for template in templates:
            made.append(
                _add_build(
                    conn,
                    org_id=org_id,
                    template=template,
                    product=product,
                    brand_id=brand_id,
                    wizard=wizard,
                    created_by=created_by,
                    batch_id=batch_id,
                )
            )
    return batch_id, made


def _score(value: Any) -> int | None:
    """A clone's residue score from the report (text in the JSON), or None."""
    try:
        return round(float(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def batch_state(org_id: UUID, batch_id: UUID) -> BatchState:
    """A batch's pages with how each is getting on: its build's status, what its job is doing now,
    its place in line while it waits (a workspace runs two builds at a time), or why it failed."""
    with transaction() as conn:
        rows = conn.execute(
            """
            select b.id, b.key, b.title, b.status, b.created_at, b.template_id,
                   b.origin, b.cost_usd, b.created_by, b.updated_at,
                   b.report->'residue'->>'score' as residue,
                   t.name as template_name, t.type as template_type,
                   br.name as brand, p.name as product,
                   j.id as job_id, j.status as job_status, j.created_at as job_created,
                   j.started_at, j.finished_at,
                   j.error->>'message' as error,
                   (select e.message from job_events e where e.job_id = j.id
                     order by e.ts desc limit 1) as step
            from builds b
            join templates t on t.id = b.template_id
            join brands br on br.id = b.brand_id
            join products p on p.id = b.product_id
            left join lateral (
              select id, status, created_at, started_at, finished_at, error from jobs
              where build_id = b.id and kind = %(kind)s order by created_at desc limit 1
            ) j on true
            where b.org_id = %(o)s and b.batch_id = %(batch)s and b.deleted_at is null
            order by b.created_at, b.key
            """,
            {"o": org_id, "batch": batch_id, "kind": KINDS["build"].name},
        ).fetchall()
        if not rows:
            raise BuildNotFoundError
        waiting = conn.execute(
            """
            select id from jobs
            where org_id = %(o)s and kind = %(kind)s and status = 'queued'
            order by created_at, id
            """,
            {"o": org_id, "kind": KINDS["build"].name},
        ).fetchall()
        folder = conn.execute(
            "select folder_color from build_batches where id = %(b)s and org_id = %(o)s",
            {"b": batch_id, "o": org_id},
        ).fetchone()
    line = {row["id"]: index + 1 for index, row in enumerate(waiting)}
    pages = [
        BatchPage(
            id=r["id"],
            key=r["key"],
            title=r["title"],
            template_id=r["template_id"],
            template_name=r["template_name"],
            template_type=r["template_type"],
            status=r["status"],
            job_id=r["job_id"],
            step=r["step"] if r["job_status"] == "running" else None,
            waiting=line.get(r["job_id"]) if r["job_status"] == "queued" else None,
            error=r["error"] if r["status"] == "failed" else None,
            origin=r["origin"],
            residue_score=_score(r["residue"]),
            cost_usd=float(r["cost_usd"] or 0),
            created_by=r["created_by"],
            updated_at=r["updated_at"],
            started_at=r["started_at"],
            finished_at=r["finished_at"],
        )
        for r in rows
    ]
    return BatchState(
        batch_id=batch_id, brand=rows[0]["brand"], product=rows[0]["product"],
        created_at=rows[0]["created_at"], pages=pages,
        folder_color=folder["folder_color"] if folder else "red",
    )  # fmt: skip


def set_folder_color(org_id: UUID, batch_id: UUID, color: FolderColor) -> FolderColor:
    """Colours a batch's folder for the whole workspace (B3.5b). A batch started before folders
    had colours (or by an older worker) gets its row now."""
    with transaction() as conn:
        found = conn.execute(
            """
            select 1 from builds
            where org_id = %(o)s and batch_id = %(b)s and deleted_at is null limit 1
            """,
            {"o": org_id, "b": batch_id},
        ).fetchone()
        if found is None:
            raise BuildNotFoundError
        row = conn.execute(
            """
            insert into build_batches (id, org_id, folder_color)
            values (%(b)s, %(o)s, %(c)s)
            on conflict (id) do update set folder_color = excluded.folder_color
              where build_batches.org_id = excluded.org_id
            returning folder_color
            """,
            {"b": batch_id, "o": org_id, "c": color},
        ).fetchone()
    if row is None:  # the id belongs to another workspace's batch
        raise BuildNotFoundError
    color_set: FolderColor = row["folder_color"]
    return color_set


def retry_build(
    *, org_id: UUID, build_id: UUID, created_by: UUID | None
) -> tuple[dict[str, Any], Job]:
    """Queues a failed build again, as a new `build` job. Its LangGraph thread kept a checkpoint
    after every node that finished, so the retry repeats only the step that failed and those after
    it (nothing already done is paid for twice). The build row is locked while it is checked, so
    two quick presses queue one job."""
    with transaction() as conn:
        build = conn.execute(
            """
            select id, status from builds
            where id = %(b)s and org_id = %(o)s and deleted_at is null
            for update
            """,
            {"b": build_id, "o": org_id},
        ).fetchone()
        if build is None:
            raise BuildNotFoundError
        if build["status"] != "failed":
            raise BuildNotFailedError
        updated = conn.execute(
            """
            update builds set status = 'queued', updated_at = now()
            where id = %(b)s and org_id = %(o)s
            returning id, key, status, title
            """,
            {"b": build_id, "o": org_id},
        ).fetchone()
        assert updated is not None
        kind = KINDS["build"]
        job, _ = queue.enqueue(
            org_id=org_id,
            kind=kind.name,
            payload={"build_id": str(build_id)},
            created_by=created_by,
            build_id=build_id,
            max_attempts=kind.max_attempts,
            conn=conn,
        )
    return dict(updated), job
