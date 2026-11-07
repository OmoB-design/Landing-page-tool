"""`publish_shopify_editable` (BUILD_SPEC §12.6, D121, B4.2): the page as a draft page in the
brand's Shopify store made of theme sections, every text, picture and video in it editable in
Shopify's theme editor.

1. A 24-hour token from the store owner's app (D90) for Shopify Files and the page; the store's
   Theme Access password (Vault) for the theme files.
2. The store's live theme (a page can only use templates from the live theme).
3. The page's pictures move to Shopify Files (as for a draft page, D90): the picture blocks' image
   pickers point at them.
4. The theme files from the page and its template's editor map, split into sections by the layout
   check (B4.3, `publish/parity`: columns, sticky parts and spacing as on the page, checked at
   three widths), and checked against Shopify's sizes before anything goes up.
5. Up with Shopify CLI in two steps, block types first (Shopify drops block settings it doesn't
   know yet), adding or replacing only LP's own `lp-…` files.
6. A new unpublished page for this version, `<key>-v<N>`, using the version's template; the
   publication records it with its admin and theme-editor addresses. A draft isn't live: the
   page's status doesn't change.
"""

import time
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict

from app import editor_parts, publishing, vault
from app.db import transaction
from app.engines import shopify_theme
from app.jobs.context import JobContext
from app.jobs.errors import JobInterrupted, UserFacingError
from app.jobs.kinds.publish_shopify import STORAGE_FAILED, _fail, _move_files
from app.pipeline.runtime import BUCKET
from app.providers import shopify_cli, storage
from app.providers.shopify import ShopifyError, admin_page_url
from app.publish import parity, shopify_page

TOTAL = 6
MAX_VERSION_TRIES = 20


class PublishEditablePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    publication_id: UUID
    page_version: int


def run(ctx: JobContext) -> dict[str, Any]:
    payload = PublishEditablePayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        return _publish(ctx, payload, org_id)
    except storage.StorageError as exc:
        _fail(payload.publication_id, org_id, STORAGE_FAILED)
        raise UserFacingError(STORAGE_FAILED, code="storage") from exc
    except (ShopifyError, shopify_cli.ThemeAccessError) as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise UserFacingError(exc.message, code="shopify") from exc
    except shopify_theme.ThemeTooBigError as exc:
        _fail(payload.publication_id, org_id, str(exc))
        raise UserFacingError(str(exc), code="too_big") from exc
    except UserFacingError as exc:
        _fail(payload.publication_id, org_id, exc.message)
        raise
    except JobInterrupted:
        raise  # the worker is stopping: the job goes back to the queue and resumes; not a failure
    except Exception:
        _fail(payload.publication_id, org_id, "Something went wrong while publishing to Shopify.")
        raise


def editor_url(shop: str, theme_id: int, suffix: str) -> str:
    """The theme editor on the draft's template (`four-xyz.myshopify.com` → `four-xyz`). The
    editor can't open a hidden page (owner's test on FourU, 2026-11-06: "Failed to load the
    page"), but it opens the page's template, which is where the page's words and pictures live."""
    store = shop.removesuffix(".myshopify.com")
    return (
        f"https://admin.shopify.com/store/{store}/themes/{theme_id}/editor?template=page.{suffix}"
    )


def _next_version(conn: Any, client: Any, org_id: UUID, build_id: UUID, base: str) -> int:
    """One past the newest editable draft of this page, and free in the store."""
    row = conn.execute(
        """
        select max((details->>'version')::int) as v from publications
        where build_id = %(b)s and org_id = %(o)s and destination = 'shopify_editable'
          and status = 'succeeded'
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    version = int(row["v"] or 0) + 1 if row else 1
    for _ in range(MAX_VERSION_TRIES):
        if not client.page_exists(f"{base}-v{version}"):
            return version
        version += 1
    raise UserFacingError("Couldn't find a free address for the draft page in the store.")


def _publish(ctx: JobContext, payload: PublishEditablePayload, org_id: UUID) -> dict[str, Any]:
    started = time.monotonic()
    with transaction() as conn:
        build = conn.execute(
            """
            select b.id, b.key, b.title, b.brand_id, b.template_id, b.working_html_path,
                   b.page_version, b.status
            from builds b where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
            """,
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
        store = (
            conn.execute(
                """
                select shop_domain, client_id, vault_secret_id, theme_secret_id
                from store_connections
                where brand_id = %(brand)s and org_id = %(o)s and status = 'connected'
                """,
                {"brand": build["brand_id"], "o": org_id},
            ).fetchone()
            if build
            else None
        )
        secret = vault.read(conn, store["vault_secret_id"]) if store else None
        password = (
            vault.read(conn, store["theme_secret_id"])
            if store and store["theme_secret_id"]
            else None
        )
        page_map = editor_parts.template_map(conn, build["template_id"]) if build else None
    if build is None or not build["working_html_path"] or page_map is None:
        raise UserFacingError("That page isn't there any more.", code="build_missing")
    if not publishing.approved_as_pressed(build, payload.page_version):
        raise UserFacingError(publishing.EDITED_SINCE, code="page_changed")
    if store is None or not secret:
        raise UserFacingError("This brand's Shopify store isn't connected any more.")
    if not password:
        raise UserFacingError(
            "Add the store's Theme Access password in Settings → Connections to publish editable "
            "sections."
        )
    shop = store["shop_domain"]

    token = publishing.shopify_token(shop, store["client_id"], secret)
    client = publishing.shopify_client(shop, token.access_token)
    try:
        theme = publishing.theme_live(shop, password)
        ctx.progress(f"Found the live theme, {theme['name']}", data={"step": 1, "total": TOTAL})

        html = storage.download(BUCKET, build["working_html_path"]).decode("utf-8")
        urls = shopify_page.asset_urls(html)
        cdn = _move_files(client, [(url, "IMAGE") for url in urls]) if urls else {}
        html = shopify_page.rewrite(html, cdn)
        shop_files = {address: shopify_theme.file_names(address) for address in cdn.values()}
        ctx.progress(
            f"Moved {len(cdn)} of {len(urls)} pictures to Shopify", data={"step": 2, "total": TOTAL}
        )

        base = shopify_page.handle(build["key"])
        with transaction() as conn:
            version = _next_version(conn, client, org_id, build["id"], base)
        # The layout check (B4.3, D122): the split into Shopify sections that keeps the page's
        # columns, sticky parts and spacing, checked in a browser at three widths.
        layout = parity.check(
            html, page_map, slug=build["key"], version=version, shop_files=shop_files
        )
        files = layout.files
        ctx.progress(
            f"Made {files.sections} sections with {files.texts} texts and {files.images} pictures "
            + ("to edit; the layout matches" if layout.matched else "to edit (layout differs)"),
            data={"step": 3, "total": TOTAL},
        )

        problems = shopify_cli.push(shop, password, theme["id"], [files.blocks, files.files])
        if problems:
            raise UserFacingError("Shopify didn't take the page's theme files: " + problems[0])
        ctx.progress(
            "Added the page's files to the theme",
            data={"step": 4, "total": TOTAL},
            check_stop=False,
        )

        handle = f"{base}-v{version}"
        page = client.save_page(
            page_id=None,
            title=f"{build['title'] or build['key']} (v{version})",
            handle=handle,
            body="",
            template_suffix=files.suffix,
        )
        ctx.progress("Saved the draft page", data={"step": 5, "total": TOTAL}, check_stop=False)
    finally:
        client.close()

    handle = str(page.get("handle") or handle)
    admin_url = admin_page_url(shop, str(page["id"]))
    editor = editor_url(shop, theme["id"], files.suffix)
    seconds = round(time.monotonic() - started)
    with transaction() as conn:
        conn.execute(
            """
            update publications set status = 'succeeded', url = %(url)s, admin_url = %(admin)s,
                   editor_url = %(editor)s, version = %(v)s,
                   details = coalesce(details, '{}'::jsonb) || %(d)s
            where id = %(p)s and org_id = %(o)s
            """,
            {
                "url": f"https://{shop}/pages/{handle}", "admin": admin_url, "editor": editor,
                "v": version, "p": payload.publication_id, "o": org_id,
                "d": Jsonb({
                    "page_id": page["id"], "handle": handle, "shop": shop, "version": version,
                    "theme_id": theme["id"], "theme": theme["name"], "template": files.suffix,
                    "sections": files.sections, "texts": files.texts, "images": files.images,
                    "media": files.media, "notes": files.notes, "moved_files": len(cdn),
                    "seconds": seconds,
                    "layout": {
                        "mode": layout.mode, "matched": layout.matched, "tries": layout.tries,
                        "widths": layout.widths, "kept_together": layout.kept_together,
                        "differences": layout.differences,
                    },
                }),
            },
        )  # fmt: skip
    ctx.progress(
        "The editable draft is in Shopify", data={"step": 6, "total": TOTAL}, check_stop=False
    )
    return {"build_id": str(build["id"]), "admin_url": admin_url, "editor_url": editor}
