"""Publishing on the review desk (BUILD_SPEC §12, D87): the org's Vercel connection and testing
switch, a build's gate and publish history, and starting a publish (a job, `publish_vercel`).

A page is published from Approved (or again once Published). The gate's reasons are checked when
the publish starts; passing them ("Publish anyway") is recorded on the publication with who did it.
Publications are written here and by the job only (members can't write them).
"""

from typing import Any
from uuid import UUID

from psycopg import errors
from psycopg.types.json import Jsonb

from app import vault
from app.config import get_settings
from app.db import transaction
from app.jobs import queue
from app.models.publishing import (
    GateBlocker,
    IntegrationsState,
    Publication,
    PublishingState,
    VercelConnection,
    VercelProject,
)
from app.providers.vercel import VercelClient, VercelError
from app.publish import gate

PUBLISHABLE = {"approved", "published"}


class PublishNotFoundError(Exception):
    pass


class PublishConflictError(Exception):
    """The page changed since it was shown (another tab)."""


class PublishError(Exception):
    """A publish the build doesn't allow now; the message is shown to the user."""


def vercel_client(token: str, team_id: str | None) -> VercelClient:
    """The Vercel client (tests replace it with one on a fake transport)."""
    return VercelClient(token, team_id)


# ── the org's settings ────────────────────────────────────────────────────────


def _role(conn: Any, org_id: UUID, user_id: UUID) -> str:
    row = conn.execute(
        "select role from org_members where org_id = %(o)s and user_id = %(u)s",
        {"o": org_id, "u": user_id},
    ).fetchone()
    return str(row["role"]) if row else "member"


def integrations_state(org_id: UUID, user_id: UUID) -> IntegrationsState:
    with transaction() as conn:
        row = conn.execute(
            """
            select i.token_last4, i.meta, i.created_at, o.allow_placeholder_publish,
                   coalesce(p.display_name, u.email) as connected_by
            from orgs o
            left join integrations i on i.org_id = o.id and i.kind = 'vercel'
            left join auth.users u on u.id = i.created_by
            left join profiles p on p.user_id = i.created_by
            where o.id = %(o)s
            """,
            {"o": org_id},
        ).fetchone()
        role = _role(conn, org_id, user_id)
    vercel = None
    if row and row["created_at"]:
        meta = row["meta"] or {}
        vercel = VercelConnection(
            account=str(meta.get("account") or ""),
            team_id=meta.get("team_id"),
            token_last4=row["token_last4"],
            connected_at=row["created_at"],
            connected_by=row["connected_by"],
            projects=[
                VercelProject(brand_id=brand_id, name=str(project.get("name") or ""))
                for brand_id, project in (meta.get("projects") or {}).items()
            ],
        )
    return IntegrationsState(
        vercel=vercel,
        allow_placeholder_publish=bool(row and row["allow_placeholder_publish"]),
        role=role,  # type: ignore[arg-type]
    )


def connect_vercel(org_id: UUID, user_id: UUID, token: str, team_id: str | None) -> None:
    """Checks the token with Vercel, then stores it in Vault (replacing any earlier one)."""
    client = vercel_client(token.strip(), team_id or None)
    try:
        account, team_id = client.account()
    except VercelError as exc:
        raise PublishError(exc.message) from exc
    finally:
        client.close()
    with transaction() as conn:
        old = conn.execute(
            "select vault_secret_id, meta from integrations "
            "where org_id = %(o)s and kind = 'vercel'",
            {"o": org_id},
        ).fetchone()
        secret_id = vault.store(conn, token.strip(), label=f"vercel:{org_id}")
        # Brand projects are kept when the account stays the same.
        projects = (
            (old["meta"] or {}).get("projects", {})
            if old and (old["meta"] or {}).get("account") == account
            else {}
        )
        meta = {"account": account, "team_id": team_id or None, "projects": projects}
        conn.execute(
            """
            insert into integrations (org_id, kind, vault_secret_id, token_last4, meta, created_by)
            values (%(o)s, 'vercel', %(s)s, %(l)s, %(m)s, %(u)s)
            on conflict (org_id, kind) do update set
              vault_secret_id = excluded.vault_secret_id, token_last4 = excluded.token_last4,
              meta = excluded.meta, created_by = excluded.created_by, created_at = now()
            """,
            {
                "o": org_id, "s": secret_id, "l": vault.last4(token.strip()), "m": Jsonb(meta),
                "u": user_id,
            },
        )  # fmt: skip
        if old:
            vault.remove(conn, old["vault_secret_id"])


def disconnect_vercel(org_id: UUID) -> None:
    with transaction() as conn:
        row = conn.execute(
            "delete from integrations where org_id = %(o)s and kind = 'vercel' "
            "returning vault_secret_id",
            {"o": org_id},
        ).fetchone()
        if row:
            vault.remove(conn, row["vault_secret_id"])


def set_testing_switch(org_id: UUID, allow: bool) -> None:
    with transaction() as conn:
        conn.execute(
            "update orgs set allow_placeholder_publish = %(a)s where id = %(o)s",
            {"a": allow, "o": org_id},
        )


def role_of(org_id: UUID, user_id: UUID) -> str:
    with transaction() as conn:
        return _role(conn, org_id, user_id)


# ── a build's publishing ──────────────────────────────────────────────────────


def _load(conn: Any, org_id: UUID, build_id: UUID, *, lock: bool = False) -> dict[str, Any]:
    build = conn.execute(
        f"""
        select b.id, b.org_id, b.brand_id, b.key, b.status, b.page_version, b.report, b.origin,
               b.mock_images, b.working_html_path, o.allow_placeholder_publish
        from builds b join orgs o on o.id = b.org_id
        where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
        {"for update of b" if lock else ""}
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    if build is None or not build["working_html_path"]:
        raise PublishNotFoundError
    return dict(build)


def _blockers(build: dict[str, Any]) -> list[gate.Blocker]:
    return gate.blockers(
        build["report"] or {},
        mock_images=bool(build["mock_images"]),
        origin=build["origin"],
        allow_placeholders=bool(build["allow_placeholder_publish"]),
        residue_min=get_settings().lp_residue_min_score,
    )


def _publication(row: dict[str, Any]) -> Publication:
    details = row["details"] or {}
    return Publication(
        id=row["id"],
        destination=row["destination"],
        status=row["status"],
        url=row["url"],
        created_at=row["created_at"],
        created_by=row["created_by"],
        gate_overridden=row["gate_overridden"],
        override_reasons=list(row["override_reasons"] or []),
        error=details.get("error"),
        page_version=details.get("page_version"),
        project=details.get("project"),
        seconds=details.get("seconds"),
    )


def publishing_state(org_id: UUID, build_id: UUID) -> PublishingState:
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
        rows = [
            dict(r)
            for r in conn.execute(
                """
                select id, destination, status, url, created_at, created_by, gate_overridden,
                       override_reasons, details, job_id
                from publications where build_id = %(b)s and org_id = %(o)s
                order by created_at desc limit 50
                """,
                {"b": build_id, "o": org_id},
            ).fetchall()
        ]
        connected = conn.execute(
            "select 1 from integrations where org_id = %(o)s and kind = 'vercel'", {"o": org_id}
        ).fetchone()
    running = next((r for r in rows if r["status"] == "pending"), None)
    live = next(
        (r for r in rows if r["status"] == "succeeded" and r["destination"] == "vercel"), None
    )
    return PublishingState(
        build_id=build["id"],
        status=build["status"],
        page_version=build["page_version"],
        gate=[
            GateBlocker(code=b.code, message=b.message, overridable=b.overridable)
            for b in _blockers(build)
        ],
        vercel_connected=connected is not None,
        live=_publication(live) if live else None,
        running=_publication(running) if running else None,
        job_id=running["job_id"] if running else None,
        publications=[_publication(r) for r in rows],
    )


def start_publish(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, override: bool
) -> PublishingState:
    """Checks the page and the gate, records the publication (pending, with any override) and
    queues the job, in one transaction."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        if build["page_version"] != base_version:
            raise PublishConflictError
        if build["status"] not in PUBLISHABLE:
            raise PublishError("Approve the page before publishing it.")
        if not conn.execute(
            "select 1 from integrations where org_id = %(o)s and kind = 'vercel'", {"o": org_id}
        ).fetchone():
            raise PublishError("Connect Vercel in Settings first.")
        found = _blockers(build)
        if not gate.can_publish(found, override=override):
            stuck = [b.message for b in found if not b.overridable] or [b.message for b in found]
            raise PublishError("Publishing is blocked: " + " ".join(stuck))
        row = conn.execute(
            """
            insert into publications (org_id, build_id, destination, status, gate_overridden,
                                      override_reasons, details, created_by)
            values (%(o)s, %(b)s, 'vercel', 'pending', %(over)s, %(reasons)s, %(details)s, %(u)s)
            returning id
            """,
            {
                "o": org_id, "b": build_id, "over": bool(found),
                "reasons": Jsonb([b.code for b in found]) if found else None,
                "details": Jsonb({"page_version": build["page_version"]}), "u": user_id,
            },
        ).fetchone()  # fmt: skip
        assert row is not None
        try:
            job, _ = queue.enqueue(
                org_id=org_id,
                kind="publish_vercel",
                payload={
                    "build_id": str(build_id),
                    "publication_id": str(row["id"]),
                    "page_version": build["page_version"],
                },
                created_by=user_id,
                dedupe_key=f"publish:{build_id}",
                build_id=build_id,
                max_attempts=1,
                conn=conn,
            )
        except errors.UniqueViolation as exc:
            raise PublishError("This page is being published already.") from exc
        conn.execute(
            "update publications set job_id = %(j)s where id = %(p)s", {"j": job.id, "p": row["id"]}
        )
    return publishing_state(org_id, build_id)
