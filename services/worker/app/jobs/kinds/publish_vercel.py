"""`publish_vercel` (BUILD_SPEC §12.3, D87): puts an approved page on the org's Vercel account.

1. The page is exported (one self-contained file, as the HTML download) and kept with the
   publication, so later deployments of the brand's site can carry it again.
2. The brand's project (`lp-<prefix>`) is found or created, with Vercel Authentication off.
3. Every live page of the brand is uploaded with this one (`/<key>`), and a production deployment
   is created; the job waits until Vercel says it is ready with its address assigned.
4. The page's address is opened once, to be sure visitors can see it.
5. The publication is marked succeeded with the address, and the build becomes Published (unless
   the page changed while it was publishing).
"""

import time
from typing import Any
from uuid import UUID

import httpx
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict

from app import publishing, vault
from app.db import transaction
from app.engines.export import export_page
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.pipeline.runtime import BUCKET, build_prefix
from app.providers import storage
from app.providers.vercel import VercelClient, VercelError, production_host
from app.publish import site
from app.publish.assets import resolver

TOTAL = 5
CHECK_ATTEMPTS = 6
CHECK_WAIT_SECONDS = 2.0


class PublishVercelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    publication_id: UUID
    page_version: int


def dedupe_key(payload: PublishVercelPayload) -> str:
    return f"publish:{payload.build_id}"


def _fail(publication_id: UUID, org_id: UUID, message: str) -> None:
    with transaction() as conn:
        conn.execute(
            """
            update publications set status = 'failed',
                   details = coalesce(details, '{}'::jsonb) || %(d)s
            where id = %(p)s and org_id = %(o)s
            """,
            {"d": Jsonb({"error": message}), "p": publication_id, "o": org_id},
        )


def _brand_pages(conn: Any, org_id: UUID, brand_id: UUID, build_id: UUID) -> dict[str, str]:
    """The brand's other live pages: each build's newest successful Vercel publication."""
    rows = conn.execute(
        """
        select distinct on (p.build_id) b.key, p.details->>'html_path' as html_path
        from publications p join builds b on b.id = p.build_id
        where p.org_id = %(o)s and b.brand_id = %(brand)s and b.deleted_at is null
          and p.destination = 'vercel' and p.status = 'succeeded' and p.build_id <> %(b)s
        order by p.build_id, p.created_at desc
        """,
        {"o": org_id, "brand": brand_id, "b": build_id},
    ).fetchall()
    return {r["key"]: r["html_path"] for r in rows if r["html_path"]}


def _project(client: VercelClient, meta: dict[str, Any], brand_id: UUID, prefix: str) -> str:
    """The brand's project name: the one recorded, else `lp-<prefix>` created now (with a short
    suffix if that name is taken by a project we didn't make)."""
    recorded = (meta.get("projects") or {}).get(str(brand_id))
    if recorded and client.project(recorded["name"]) is not None:
        return str(recorded["name"])
    name = site.project_name(prefix)
    if client.project(name) is not None:
        name = f"{name}-{str(brand_id)[:4]}"
    project = client.project(name) or client.create_project(name)
    client.make_public(str(project["id"]))
    meta.setdefault("projects", {})[str(brand_id)] = {"id": project["id"], "name": name}
    return name


def _opens(url: str) -> int:
    """The status the page answers with (follows redirects), after a few tries."""
    status = 0
    for attempt in range(CHECK_ATTEMPTS):
        try:
            status = httpx.get(url, follow_redirects=True, timeout=15.0).status_code
        except httpx.HTTPError:
            status = 0
        if status == 200:
            return status
        if attempt + 1 < CHECK_ATTEMPTS:
            time.sleep(CHECK_WAIT_SECONDS)
    return status


def run(ctx: JobContext) -> dict[str, Any]:
    payload = PublishVercelPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        return _publish(ctx, payload, org_id)
    except VercelError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise UserFacingError(exc.message, code="vercel") from exc
    except UserFacingError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise
    except Exception:
        _fail(payload.publication_id, org_id, "Something went wrong while publishing.")
        raise


def _publish(ctx: JobContext, payload: PublishVercelPayload, org_id: UUID) -> dict[str, Any]:
    started = time.monotonic()
    with transaction() as conn:
        build = conn.execute(
            """
            select b.id, b.key, b.brand_id, b.working_html_path, b.page_version, br.prefix
            from builds b join brands br on br.id = b.brand_id
            where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
            """,
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
        integration = conn.execute(
            "select vault_secret_id, meta from integrations "
            "where org_id = %(o)s and kind = 'vercel'",
            {"o": org_id},
        ).fetchone()
        token = vault.read(conn, integration["vault_secret_id"]) if integration else None
        others = _brand_pages(conn, org_id, build["brand_id"], build["id"]) if build else {}
    if build is None or not build["working_html_path"]:
        raise UserFacingError("That page isn't there any more.", code="build_missing")
    if integration is None or not token:
        raise UserFacingError("Vercel isn't connected any more. Connect it in Settings.")

    html = storage.download(BUCKET, build["working_html_path"]).decode("utf-8")
    exported, stats = export_page(html, resolver(org_id))
    html_path = (
        f"{build_prefix(str(org_id), str(build['id']))}/published/{payload.publication_id}.html"
    )
    storage.upload(BUCKET, html_path, exported.encode("utf-8"), "text/html; charset=utf-8")
    pages = {build["key"]: exported}
    for key, path in others.items():
        pages[key] = storage.download(BUCKET, path).decode("utf-8")
    ctx.progress("Packed the page", data={"step": 1, "total": TOTAL})

    meta = dict(integration["meta"] or {})
    client = publishing.vercel_client(token, meta.get("team_id"))
    try:
        project = _project(client, meta, build["brand_id"], build["prefix"])
        with transaction() as conn:
            conn.execute(
                "update integrations set meta = %(m)s where org_id = %(o)s and kind = 'vercel'",
                {"m": Jsonb(meta), "o": org_id},
            )
        ctx.progress(f"Set up the Vercel project {project}", data={"step": 2, "total": TOTAL})

        uploads = [client.upload(path, data) for path, data in site.files(pages).items()]
        deployment = client.deploy(project, uploads)
        ctx.progress("Deploying on Vercel", data={"step": 3, "total": TOTAL})
        ready = client.wait_ready(str(deployment["id"]))
    finally:
        client.close()
    host = production_host(ready, project)
    url = f"https://{host}/{site.page_path(build['key'])}"
    ctx.progress("Vercel finished the deployment", data={"step": 4, "total": TOTAL})

    status = _opens(url)
    if status != 200:
        raise UserFacingError(
            f"Vercel deployed the page, but {url} answered {status or 'nothing'}: it may still "
            "need a login (Deployment Protection) or a minute to appear."
        )
    seconds = round(time.monotonic() - started)
    with transaction() as conn:
        conn.execute(
            """
            update publications set status = 'succeeded', url = %(url)s,
                   details = coalesce(details, '{}'::jsonb) || %(d)s
            where id = %(p)s and org_id = %(o)s
            """,
            {
                "url": url, "p": payload.publication_id, "o": org_id,
                "d": Jsonb({
                    "deployment_id": ready.get("id"), "project": project, "host": host,
                    "html_path": html_path, "seconds": seconds, "pages": len(pages),
                    "inlined": stats.get("inlined"),
                }),
            },
        )  # fmt: skip
        conn.execute(
            """
            update builds set status = 'published'
            where id = %(b)s and org_id = %(o)s and page_version = %(v)s
              and status in ('approved', 'published')
            """,
            {"b": build["id"], "o": org_id, "v": payload.page_version},
        )
    ctx.progress("The page is live", data={"step": 5, "total": TOTAL})
    return {"build_id": str(build["id"]), "url": url, "project": project, "seconds": seconds}
