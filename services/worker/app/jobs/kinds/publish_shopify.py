"""`publish_shopify_page` (BUILD_SPEC §12.5, D90): the page as an unpublished page in the brand's
Shopify store.

1. A 24-hour token from the store owner's app (its client id and the secret in Vault).
2. The page's styles and body inside `div.lp-funnel`, scripts dropped.
3. Its images move to Shopify's file CDN (Shopify fetches each from its address; at most 80;
   one that isn't ready in time keeps its address).
4. Over Shopify's size, the CSS moves to a CDN file the body links; still over, it stops.
5. The full-width template (a bare layout and a page template): used when the main theme has
   both files (written by an earlier publish, or added by hand: Shopify refuses theme writes to
   apps without an exemption); otherwise written when Shopify allows it; otherwise the page
   uses the theme's own page template, fitted into it (scoped CSS, the theme's header and footer
   hidden; `shopify_page.body(scoped=True)`), and the publication says so (`full_width`).
6. An unpublished page with the page's key as its address; publishing again updates it.
7. The publication records the draft and its admin address. The page's status doesn't change:
   a draft isn't live.
"""

import time
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict

from app import publishing, vault
from app.db import transaction
from app.engines.export import export_page
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.pipeline.runtime import BUCKET
from app.providers import storage
from app.providers.shopify import ShopifyError, admin_page_url
from app.publish import shopify_page

TOTAL = 5
STORAGE_FAILED = (
    "Couldn't save the page in storage (the connection was too slow or dropped). Try again."
)
FILE_WAIT_SECONDS = 60.0
FILE_POLL_SECONDS = 2.0


class PublishShopifyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    publication_id: UUID
    page_version: int


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


def run(ctx: JobContext) -> dict[str, Any]:
    payload = PublishShopifyPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        return _publish(ctx, payload, org_id)
    except storage.StorageError as exc:
        _fail(payload.publication_id, org_id, STORAGE_FAILED)
        raise UserFacingError(STORAGE_FAILED, code="storage") from exc
    except ShopifyError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise UserFacingError(exc.message, code="shopify") from exc
    except UserFacingError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise
    except Exception:
        _fail(payload.publication_id, org_id, "Something went wrong while publishing to Shopify.")
        raise


def _move_files(
    client: Any, urls: list[tuple[str, str]], sleep: Any = time.sleep
) -> dict[str, str]:
    """address → CDN address for the files Shopify made ready in time."""
    ids = client.create_files(urls)
    if not ids:
        return {}
    ready: dict[str, str] = {}
    waited = 0.0
    while True:
        status = client.file_urls(list(ids.values()))
        for url, file_id in ids.items():
            cdn = status.get(file_id)
            if cdn:
                ready[url] = cdn
        pending = [f for u, f in ids.items() if u not in ready and f in status]
        if not pending or waited >= FILE_WAIT_SECONDS:
            return ready
        sleep(FILE_POLL_SECONDS)
        waited += FILE_POLL_SECONDS


def _full_width(client: Any) -> tuple[str | None, str | None, str]:
    """(the template suffix or None, why it isn't used, the progress line)."""
    theme_id = client.main_theme()
    if not theme_id:
        return None, "The store has no published theme.", "Fitted into the theme's page"
    wanted = list(shopify_page.THEME_FILES)
    try:
        present = client.theme_files(theme_id, wanted)
    except ShopifyError:
        present = set()
    if present >= set(wanted):
        return shopify_page.TEMPLATE_SUFFIX, None, "Using the full-width template"
    try:
        problems = client.upsert_theme_files(theme_id, shopify_page.THEME_FILES)
    except ShopifyError as exc:
        problems = [exc.message]
    if problems:
        return None, problems[0], "Fitted into the theme's page"
    return shopify_page.TEMPLATE_SUFFIX, None, "Installed the full-width template"


def _publish(ctx: JobContext, payload: PublishShopifyPayload, org_id: UUID) -> dict[str, Any]:
    started = time.monotonic()
    with transaction() as conn:
        build = conn.execute(
            """
            select b.id, b.key, b.title, b.brand_id, b.working_html_path
            from builds b where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
            """,
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
        store = (
            conn.execute(
                """
                select shop_domain, client_id, vault_secret_id from store_connections
                where brand_id = %(brand)s and org_id = %(o)s and status = 'connected'
                """,
                {"brand": build["brand_id"], "o": org_id},
            ).fetchone()
            if build
            else None
        )
        secret = vault.read(conn, store["vault_secret_id"]) if store else None
        # The draft to update: the newest one, unless it was removed since (then a new page).
        last = conn.execute(
            """
            select status, details->>'page_id' as page_id from publications
            where build_id = %(b)s and org_id = %(o)s and destination = 'shopify_page'
              and status in ('succeeded', 'unpublished')
            order by created_at desc limit 1
            """,
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
        previous = last if last and last["status"] == "succeeded" and last["page_id"] else None
    if build is None or not build["working_html_path"]:
        raise UserFacingError("That page isn't there any more.", code="build_missing")
    if store is None or not secret:
        raise UserFacingError("This brand's Shopify store isn't connected any more.")
    shop = store["shop_domain"]

    token = publishing.shopify_token(shop, store["client_id"], secret)
    client = publishing.shopify_client(shop, token.access_token)
    try:
        template, theme_note, template_step = _full_width(client)
        html = storage.download(BUCKET, build["working_html_path"]).decode("utf-8")
        exported, _ = export_page(html, lambda url: None)  # keeps addresses, drops markers
        body = shopify_page.body(exported, scoped=template is None)
        ctx.progress("Packed the page for Shopify", data={"step": 1, "total": TOTAL})

        urls = shopify_page.asset_urls(body)
        cdn = _move_files(client, [(url, "IMAGE") for url in urls]) if urls else {}
        body = shopify_page.rewrite(body, cdn)
        ctx.progress(
            f"Moved {len(cdn)} of {len(urls)} images to Shopify", data={"step": 2, "total": TOTAL}
        )

        css_file = None
        if len(body.encode("utf-8")) > shopify_page.MAX_BODY_BYTES:
            body, css = shopify_page.without_styles(body)
            path = f"{org_id}/{build['id']}/shopify/{payload.publication_id}.css"
            storage.upload("assets", path, css.encode("utf-8"), "text/css", upsert=True)
            moved = _move_files(client, [(storage.public_url("assets", path), "FILE")])
            css_file = next(iter(moved.values()), None)
            if not css_file:
                raise UserFacingError("The page is too big for Shopify, even with its CSS moved.")
            body = f'<link rel="stylesheet" href="{css_file}">\n{body}'
            if len(body.encode("utf-8")) > shopify_page.MAX_BODY_BYTES:
                raise UserFacingError("The page is too big for Shopify (over 512 KB).")

        ctx.progress(template_step, data={"step": 3, "total": TOTAL})

        handle = shopify_page.handle(build["key"])
        page = client.save_page(
            page_id=previous["page_id"] if previous else None,
            title=build["title"] or build["key"],
            handle=handle,
            body=body,
            template_suffix=template,
        )
        ctx.progress("Saved the draft page", data={"step": 4, "total": TOTAL})
    finally:
        client.close()

    admin_url = admin_page_url(shop, str(page["id"]))
    seconds = round(time.monotonic() - started)
    with transaction() as conn:
        conn.execute(
            """
            update publications set status = 'succeeded', url = %(url)s, admin_url = %(admin)s,
                   details = coalesce(details, '{}'::jsonb) || %(d)s
            where id = %(p)s and org_id = %(o)s
            """,
            {
                "url": f"https://{shop}/pages/{page.get('handle') or handle}", "admin": admin_url,
                "p": payload.publication_id, "o": org_id,
                "d": Jsonb({
                    "page_id": page["id"], "handle": page.get("handle") or handle, "shop": shop,
                    "template": template, "full_width": template is not None,
                    "theme_note": theme_note, "moved_files": len(cdn),
                    "css_file": css_file, "seconds": seconds,
                }),
            },
        )  # fmt: skip
    ctx.progress("The draft is in Shopify", data={"step": 5, "total": TOTAL})
    return {"build_id": str(build["id"]), "admin_url": admin_url, "template": template}


# ── removing the draft ────────────────────────────────────────────────────────


class UnpublishShopifyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    publication_id: UUID


def run_unpublish(ctx: JobContext) -> dict[str, Any]:
    """`unpublish_shopify_page`: deletes the draft page from the brand's store (a page already
    deleted in Shopify counts as removed) and records it; the images it moved stay in the store's
    files."""
    payload = UnpublishShopifyPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        return _unpublish(ctx, payload, org_id)
    except ShopifyError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise UserFacingError(exc.message, code="shopify") from exc
    except UserFacingError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise
    except Exception:
        _fail(payload.publication_id, org_id, "Something went wrong while removing the draft.")
        raise


def _unpublish(ctx: JobContext, payload: UnpublishShopifyPayload, org_id: UUID) -> dict[str, Any]:
    with transaction() as conn:
        draft = conn.execute(
            """
            select p.url, p.details->>'page_id' as page_id, b.brand_id
            from publications p join builds b on b.id = p.build_id
            where p.build_id = %(b)s and p.org_id = %(o)s and p.destination = 'shopify_page'
              and p.status = 'succeeded' and p.details ? 'page_id'
            order by p.created_at desc limit 1
            """,
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
        store = (
            conn.execute(
                """
                select shop_domain, client_id, vault_secret_id from store_connections
                where brand_id = %(brand)s and org_id = %(o)s and status = 'connected'
                """,
                {"brand": draft["brand_id"], "o": org_id},
            ).fetchone()
            if draft
            else None
        )
        secret = vault.read(conn, store["vault_secret_id"]) if store else None
    if draft is None:
        raise UserFacingError("This page has no Shopify draft to remove.", code="no_draft")
    if store is None or not secret:
        raise UserFacingError("This brand's Shopify store isn't connected any more.")
    shop = store["shop_domain"]
    token = publishing.shopify_token(shop, store["client_id"], secret)
    client = publishing.shopify_client(shop, token.access_token)
    try:
        existed = client.delete_page(draft["page_id"])
    finally:
        client.close()
    ctx.progress(
        "Removed the draft from Shopify" if existed else "The draft was already gone from Shopify",
        data={"step": 1, "total": 1},
    )
    with transaction() as conn:
        conn.execute(
            """
            update publications set status = 'unpublished', url = %(url)s,
                   details = coalesce(details, '{}'::jsonb) || %(d)s
            where id = %(p)s and org_id = %(o)s
            """,
            {
                "url": draft["url"], "p": payload.publication_id, "o": org_id,
                "d": Jsonb({
                    "page_id": draft["page_id"], "shop": shop, "already_gone": not existed,
                }),
            },
        )  # fmt: skip
    return {"build_id": str(payload.build_id), "removed": existed}
