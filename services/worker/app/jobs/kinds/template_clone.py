"""`template_clone` (BUILD_SPEC §8.4, B2.1): a competitor's page becomes one of the org's
templates, `origin=cloned`. Steps:
1. load the page (the fetch ladder; through the proxy only if the org's flag allows it, D4), or
   read the HTML the user pasted (POST /templates/clone saved it as source.html);
2. check it's a page, not a bot check or a fragment;
3. download its stylesheets;
4. clone it (the deterministic pass in `engines/clone.py`);
5. save index and source HTML and a picture for its card, and the template row.
No AI and no cost. It queues the analysis (`template_analyze`, B2.2: sections, blueprint,
rules); until that is confirmed the template can be previewed but not built from. Started only
by POST /templates/clone, which checks the clone terms and the org's clone flag first."""

import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

import structlog
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.config import get_settings
from app.db import transaction
from app.engines import clone
from app.fetch import browser, ladder
from app.fetch.safety import check_public_url
from app.jobs import queue
from app.jobs.context import JobContext
from app.jobs.errors import JobInterrupted, UserFacingError
from app.models.template import TemplateType
from app.providers import storage
from app.templates import free_slug

log = structlog.get_logger()
TOTAL = 5
MAX_PAGE_BYTES = 15_000_000
MAX_SHEET_BYTES = 3_000_000
MAX_CSS_BYTES = 10_000_000


class TemplateClonePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: UUID
    url: str | None = Field(default=None, max_length=2000)  # the page to fetch
    pasted: bool = False  # or: the user pasted its HTML, waiting in storage as source.html
    source_url: str | None = Field(default=None, max_length=2000)  # where pasted HTML came from
    name: str | None = Field(default=None, max_length=120)
    type: TemplateType = "advertorial"

    @model_validator(mode="after")
    def one_source(self) -> "TemplateClonePayload":
        if bool(self.url) == self.pasted:
            raise ValueError("give either a url or pasted HTML")
        return self


def folder(org_id: UUID, template_id: UUID) -> str:
    return f"{org_id}/{template_id}"


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "clone"


def _org(org_id: UUID) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute(
            "select settings, clone_terms_accepted_at from orgs where id = %(o)s",
            {"o": org_id},
        ).fetchone()
    if row is None:
        raise UserFacingError("This workspace no longer exists.")
    return dict(row)


def _stylesheets(urls: list[str]) -> dict[str, str]:
    """Each stylesheet's CSS, six at a time; ones that fail or overflow are left out (the page
    keeps linking them)."""

    def download(url: str) -> tuple[str, str | None]:
        try:
            data, _ = ladder.fetch_bytes(url, max_bytes=MAX_SHEET_BYTES)
        except Exception as exc:  # a missing stylesheet shouldn't stop the clone
            log.info("stylesheet skipped", url=url, error=str(exc))
            return url, None
        return url, data.decode("utf-8", errors="replace")

    sheets: dict[str, str] = {}
    total = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for url, css in pool.map(download, urls):
            if css is not None and total + len(css) <= MAX_CSS_BYTES:
                sheets[url] = css
                total += len(css)
    return sheets


def run(ctx: JobContext) -> dict[str, Any]:
    payload = TemplateClonePayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    base = folder(org_id, payload.template_id)
    try:
        return _clone(ctx, payload, org_id, base)
    except JobInterrupted:
        raise  # resumes later: keep the pasted page
    except Exception:
        # Nothing half-made stays behind: the files go, and no template row was written.
        try:
            storage.remove_folder("templates", base)
        except Exception as exc:
            log.warning("clone cleanup failed", folder=base, error=str(exc))
        raise


def _clone(
    ctx: JobContext, payload: TemplateClonePayload, org_id: UUID, base: str
) -> dict[str, Any]:
    org = _org(org_id)
    if not (org["settings"] or {}).get("clone_enabled", True):
        raise UserFacingError("Cloning is switched off for this workspace.", code="clone_disabled")
    if org["clone_terms_accepted_at"] is None:
        raise UserFacingError("Accept the clone terms first.", code="clone_terms")

    # 1. The page.
    if payload.url:
        settings = get_settings()
        proxy = (
            settings.lp_fetch_proxy
            if settings.lp_fetch_proxy and (org["settings"] or {}).get("proxy_fetch_enabled")
            else None
        )
        page = ladder.fetch_page(payload.url, max_bytes=MAX_PAGE_BYTES, proxy=proxy)
        html, page_url = page.html, page.url
        storage.upload(
            "templates", f"{base}/source.html", html.encode("utf-8"),
            "text/html; charset=utf-8", upsert=True,
        )  # fmt: skip
        ctx.progress(
            f"Loaded {clone.source_host(page_url)}"
            + (" with a browser" if page.via == "browser" else ""),
            data={"step": 1, "total": TOTAL},
        )
    else:
        html = storage.download("templates", f"{base}/source.html").decode("utf-8", "replace")
        found = payload.source_url or clone.page_address(html)
        if not found or not found.lower().startswith(("http://", "https://")):
            raise UserFacingError(
                "We couldn't tell where this page came from. Add its address so its images and "
                "styles load.",
                code="no_address",
            )
        page_url = found
        ctx.progress(
            f"Read the pasted page ({len(html) // 1024} KB)", data={"step": 1, "total": TOTAL}
        )

    # 2. Is it a page?
    try:
        clone.validate(html)
    except clone.CloneRejectedError as exc:
        raise UserFacingError(str(exc), code="not_a_page") from exc
    ctx.progress("Checked it's a real page", data={"step": 2, "total": TOTAL})

    # 3. Its stylesheets.
    urls = []
    for url in clone.stylesheet_urls(html, page_url):
        try:
            urls.append(check_public_url(url))
        except UserFacingError:
            continue
    sheets = _stylesheets(urls)
    ctx.progress(
        f"Brought in {len(sheets)} of {len(urls)} stylesheets"
        if urls
        else "No stylesheets to bring in",
        data={"step": 3, "total": TOTAL},
    )

    # 4. The clone.
    result = clone.clone_page(html, page_url, sheets)
    stats = result.stats
    media = int(str(stats["videos"])) + int(str(stats["lottie"]))
    ctx.progress(
        f"Cleaned it up: {stats['trackers_removed']} trackers removed, "
        f"{media} {'video' if media == 1 else 'videos'} set aside",
        data={"step": 4, "total": TOTAL},
    )

    # 5. Save it.
    warnings: list[str] = []
    if result.verdict == "rebuild_native":
        warnings.append(
            "This looks like a store's product page, not a landing page: its layout leans on the "
            "store's cart and theme. You can still use it, but a landing page will rebuild better."
        )
    missing = int(str(stats["stylesheets_missing"]))
    if missing:
        warnings.append(
            f"Couldn't download {missing} of the page's stylesheets; until analysis, they still "
            "load from the source site."
        )
    storage.upload(
        "templates", f"{base}/v1.html", result.html.encode("utf-8"),
        "text/html; charset=utf-8", upsert=True,
    )  # fmt: skip
    thumb_path: str | None = f"{base}/thumb.jpg"
    try:
        shot = browser.screenshot_html(clone.with_base(result.html, page_url))
        storage.upload("templates", f"{base}/thumb.jpg", shot, "image/jpeg", upsert=True)
    except Exception as exc:  # the card shows its icon instead
        log.warning("clone thumbnail failed", error=str(exc))
        thumb_path = None
        warnings.append("Couldn't take a picture of the page for its card.")

    name = " ".join((payload.name or result.title or result.source_host).split())[:120]
    with transaction() as conn:
        conn.execute(
            """
            insert into templates (id, org_id, origin, status, slug, name, type, html_path,
                                   source_html_path, thumb_path, source_url, source_host,
                                   source_name, platform, verdict, version, created_by)
            values (%(id)s, %(o)s, 'cloned', 'active', %(slug)s, %(name)s, %(type)s, %(html)s,
                    %(source)s, %(thumb)s, %(url)s, %(host)s, %(source_name)s, %(platform)s,
                    %(verdict)s, 1, %(user)s)
            """,
            {
                "id": payload.template_id, "o": org_id,
                "slug": free_slug(conn, org_id, slugify(name)), "name": name,
                "type": payload.type, "html": f"{base}/v1.html", "source": f"{base}/source.html",
                "thumb": thumb_path, "url": page_url, "host": result.source_host,
                "source_name": result.source_name, "platform": result.platform,
                "verdict": result.verdict, "user": ctx.job.created_by,
            },
        )  # fmt: skip
        conn.execute(
            """
            insert into template_versions (template_id, version, html_path, sections, reason,
                                           created_by)
            values (%(t)s, 1, %(path)s, %(sections)s, %(reason)s, %(user)s)
            """,
            {
                "t": payload.template_id, "path": f"{base}/v1.html", "sections": Jsonb([]),
                "reason": f"Cloned from {result.source_host}", "user": ctx.job.created_by,
            },
        )  # fmt: skip
        # The analysis (B2.2) starts straight away, unless the hourly cap is reached.
        analysis_job_id: str | None = None
        try:
            analysis_job, _ = queue.enqueue(
                org_id=org_id, kind="template_analyze",
                payload={"template_id": str(payload.template_id)},
                created_by=ctx.job.created_by, max_attempts=1,
                dedupe_key=f"template_analyze:{payload.template_id}", conn=conn,
            )  # fmt: skip
            analysis_job_id = str(analysis_job.id)
        except queue.RateLimitedError as exc:
            warnings.append(f"{exc.message} Analyse it from Yours then.")
    ctx.progress(f"Saved {name}", data={"step": 5, "total": TOTAL})
    return {
        "template_id": str(payload.template_id),
        "name": name,
        "source_url": page_url,
        "source_host": result.source_host,
        "source_name": result.source_name,
        "platform": result.platform,
        "verdict": result.verdict,
        "warnings": warnings,
        "stats": stats,
        "analysis_job_id": analysis_job_id,
    }
