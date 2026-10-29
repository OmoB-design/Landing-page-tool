"""Trash (B1.6a, D92). Pages, brands, products and templates are deleted softly (`deleted_at`) and
wait 7 days in Settings → Trash, where anyone in the workspace can restore them; then the job loop
deletes them for good with their stored files (owners and admins can do it sooner).

- A page can't go to Trash while it's building or published (live on Vercel, a Shopify draft, or a
  publish under way): unpublish it first. A brand can't while any of its pages is.
- A brand takes its pages and products with it (`trashed_with`) and brings them back; they leave
  Trash with it.
- Removing a product or a template leaves the pages made with it working. Deleted for good while
  pages still use it, it's hidden (`purged_at`) and its row goes once the last of them does.
- Images in `assets` are shared between pages, so they stay.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import structlog

from app import vault
from app.db import transaction
from app.models.trash import TrashItem, TrashKind
from app.pipeline.runtime import BUCKET as BUILDS_BUCKET
from app.providers import storage

log = structlog.get_logger()

RETENTION = timedelta(days=7)
TEMPLATES_BUCKET = "templates"
TABLES: dict[str, str] = {
    "page": "builds",
    "brand": "brands",
    "product": "products",
    "template": "templates",
}

# The pages among `ids` that are published: their newest finished publication on Vercel or
# Shopify is a publish (not an unpublish), or a publish is under way.
PUBLISHED = """
    select b.key from builds b
    where b.org_id = %(o)s and b.id = any(%(ids)s) and exists (
      select 1 from (
        select distinct on (p.destination) p.status from publications p
        where p.build_id = b.id and p.status in ('succeeded', 'unpublished', 'pending')
        order by p.destination, p.created_at desc
      ) newest where newest.status in ('succeeded', 'pending')
    )
    order by b.key
"""


class TrashError(RuntimeError):
    """Why the item can't move (shown to the person)."""


class TrashNotFoundError(TrashError):
    """No such item in this workspace."""


def _now() -> datetime:
    return datetime.now(UTC)


def _row(conn: Any, kind: TrashKind, org_id: UUID, item_id: UUID) -> dict[str, Any]:
    table = TABLES[kind]
    purged = " and purged_at is null" if kind in ("product", "template") else ""
    row = conn.execute(
        f"select * from {table} where id = %(i)s and org_id = %(o)s{purged} for update",
        {"i": item_id, "o": org_id},
    ).fetchone()
    if row is None:
        raise TrashNotFoundError("That isn't there any more.")
    return dict(row)


def _keys(rows: list[Any]) -> str:
    return ", ".join(r["key"] for r in rows)


def _check_pages(conn: Any, org_id: UUID, ids: list[UUID], brand: str | None) -> None:
    """Refuses while any of the pages is building or published."""
    if not ids:
        return
    busy = conn.execute(
        "select key from builds where org_id = %(o)s and id = any(%(ids)s) "
        "and status in ('queued', 'building') order by key",
        {"o": org_id, "ids": ids},
    ).fetchall()
    if busy:
        raise TrashError(
            f"{brand} has pages still building ({_keys(busy)}). Wait for them to finish, then "
            "delete the brand."
            if brand
            else f"{_keys(busy)} is still building. Wait for it to finish, then delete it."
        )
    published = conn.execute(PUBLISHED, {"o": org_id, "ids": ids}).fetchall()
    if published:
        raise TrashError(
            f"{brand} has published pages ({_keys(published)}). Unpublish them, and remove any "
            "Shopify drafts, then delete the brand."
            if brand
            else f"{_keys(published)} is published. Unpublish it, and remove any Shopify draft, "
            "then delete it."
        )


def move_to_trash(org_id: UUID, kind: TrashKind, item_id: UUID, user_id: UUID) -> None:
    with transaction() as conn:
        row = _row(conn, kind, org_id, item_id)
        if row["deleted_at"] is not None:
            return  # in Trash already
        params = {"i": item_id, "o": org_id, "u": user_id}
        if kind == "page":
            _check_pages(conn, org_id, [item_id], None)
        if kind == "brand":
            pages = conn.execute(
                "select id from builds where brand_id = %(i)s and org_id = %(o)s "
                "and deleted_at is null",
                params,
            ).fetchall()
            _check_pages(conn, org_id, [p["id"] for p in pages], row["name"])
            for table in ("builds", "products"):
                conn.execute(
                    f"update {table} set deleted_at = now(), deleted_by = %(u)s, "
                    "trashed_with = %(i)s "
                    "where brand_id = %(i)s and org_id = %(o)s and deleted_at is null",
                    params,
                )
        conn.execute(
            f"update {TABLES[kind]} set deleted_at = now(), deleted_by = %(u)s "
            "where id = %(i)s and org_id = %(o)s",
            params,
        )


def restore(org_id: UUID, kind: TrashKind, item_id: UUID) -> None:
    with transaction() as conn:
        row = _row(conn, kind, org_id, item_id)
        if row["deleted_at"] is None:
            return  # back already
        if row["deleted_at"] < _now() - RETENTION:
            raise TrashError("Its 7 days are over: it's being deleted for good.")
        if row.get("trashed_with"):
            raise TrashError("It went to Trash with its brand. Restore the brand to bring it back.")
        params = {"i": item_id, "o": org_id}
        if kind in ("page", "product"):
            brand = conn.execute(
                "select name, deleted_at from brands where id = %(b)s and org_id = %(o)s",
                {"b": row["brand_id"], "o": org_id},
            ).fetchone()
            if brand is not None and brand["deleted_at"] is not None:
                raise TrashError(
                    f"Its brand, {brand['name']}, is in Trash. Restore the brand first."
                )
        if kind == "template":
            taken = conn.execute(
                "select 1 from templates where org_id = %(o)s and slug = %(s)s "
                "and deleted_at is null and id <> %(i)s",
                {**params, "s": row["slug"]},
            ).fetchone()
            if taken:
                raise TrashError(
                    f"Another template is called {row['name']} now. Rename it, then restore this "
                    "one."
                )
        if kind == "brand":
            for table in ("builds", "products"):
                conn.execute(
                    f"update {table} set deleted_at = null, deleted_by = null, trashed_with = null "
                    "where trashed_with = %(i)s and org_id = %(o)s",
                    params,
                )
        conn.execute(
            f"update {TABLES[kind]} set deleted_at = null, deleted_by = null "
            "where id = %(i)s and org_id = %(o)s",
            params,
        )


def _purge(conn: Any, org_id: UUID, kind: TrashKind, item_id: UUID) -> list[tuple[str, str]]:
    """Deletes the item's rows for good (inside the caller's transaction); returns the storage
    folders to remove once that's committed."""
    params = {"i": item_id, "o": org_id}
    if kind == "page":
        conn.execute("delete from builds where id = %(i)s and org_id = %(o)s", params)
        return [(BUILDS_BUCKET, f"{org_id}/{item_id}")]
    if kind == "brand":
        pages = conn.execute(
            "delete from builds where brand_id = %(i)s and org_id = %(o)s returning id", params
        ).fetchall()
        for store in conn.execute(
            "select vault_secret_id from store_connections where brand_id = %(i)s "
            "and org_id = %(o)s and vault_secret_id is not null",
            params,
        ).fetchall():
            vault.remove(conn, store["vault_secret_id"])
        conn.execute("delete from brands where id = %(i)s and org_id = %(o)s", params)
        return [(BUILDS_BUCKET, f"{org_id}/{p['id']}") for p in pages]
    column = "product_id" if kind == "product" else "template_id"
    used = conn.execute(
        f"select 1 from builds where {column} = %(i)s and org_id = %(o)s limit 1", params
    ).fetchone()
    if used:  # pages still use it: hidden for good, the row kept for them
        conn.execute(
            f"update {TABLES[kind]} set purged_at = now() where id = %(i)s and org_id = %(o)s",
            params,
        )
        return []
    conn.execute(f"delete from {TABLES[kind]} where id = %(i)s and org_id = %(o)s", params)
    return [(TEMPLATES_BUCKET, f"{org_id}/{item_id}")] if kind == "template" else []


def _remove_files(folders: list[tuple[str, str]]) -> None:
    for bucket, folder in folders:
        try:
            storage.remove_folder(bucket, folder)
        except storage.StorageError as exc:  # the rows are gone; stray files are harmless
            log.warning("trash: couldn't remove stored files", folder=folder, error=str(exc))


def delete_for_good(org_id: UUID, kind: TrashKind, item_id: UUID) -> None:
    with transaction() as conn:
        row = _row(conn, kind, org_id, item_id)
        if row["deleted_at"] is None:
            raise TrashError("Move it to Trash first.")
        if row.get("trashed_with"):
            raise TrashError("It went to Trash with its brand: it's deleted with the brand.")
        folders = _purge(conn, org_id, kind, item_id)
    _remove_files(folders)


def purge_expired(org_id: UUID | None = None) -> int:
    """The job loop's hourly sweep: deletes for good what has been in Trash over 7 days, and the
    hidden products and templates no page uses any more (every workspace, or one: tests). Returns
    how many items went."""
    cutoff = _now() - RETENTION
    with transaction() as conn:
        due = [
            (r["org_id"], r["kind"], r["id"])
            for r in conn.execute(
                """
                select * from (
                select org_id, 'page' as kind, id from builds
                where deleted_at < %(c)s and trashed_with is null
                union all
                select org_id, 'brand', id from brands where deleted_at < %(c)s
                union all
                select org_id, 'product', id from products
                where (deleted_at < %(c)s and trashed_with is null and purged_at is null)
                   or (purged_at is not null
                       and not exists (select 1 from builds b where b.product_id = products.id))
                union all
                select org_id, 'template', id from templates
                where org_id is not null
                  and ((deleted_at < %(c)s and purged_at is null)
                       or (purged_at is not null
                           and not exists (select 1 from builds b
                                           where b.template_id = templates.id)))
                ) due where %(o)s::uuid is null or due.org_id = %(o)s
                """,
                {"c": cutoff, "o": org_id},
            ).fetchall()
        ]
    purged = 0
    for owner, kind, item_id in due:
        try:
            with transaction() as conn:
                folders = _purge(conn, owner, kind, item_id)
            _remove_files(folders)
            purged += 1
        except Exception as exc:  # one stuck item mustn't stop the rest
            log.warning(
                "trash: couldn't delete for good", kind=kind, id=str(item_id), error=str(exc)
            )
    return purged


def _with(pages: int, products: int) -> str | None:
    parts = [
        f"{n} {word}{'' if n == 1 else 's'}"
        for n, word in ((pages, "page"), (products, "product"))
        if n
    ]
    return f"With {' and '.join(parts)}" if parts else None


def list_trash(org_id: UUID) -> list[TrashItem]:
    cutoff = _now() - RETENTION
    with transaction() as conn:
        rows = conn.execute(
            """
            select 'page' as kind, b.id, b.key || ' · ' || b.title as name, br.name as detail,
                   b.deleted_at, pr.display_name as deleted_by, 0 as pages, 0 as products
            from builds b join brands br on br.id = b.brand_id
            left join profiles pr on pr.user_id = b.deleted_by
            where b.org_id = %(o)s and b.deleted_at >= %(c)s and b.trashed_with is null
            union all
            select 'brand', br.id, br.name, null, br.deleted_at, pr.display_name,
                   (select count(*) from builds b where b.trashed_with = br.id),
                   (select count(*) from products p where p.trashed_with = br.id)
            from brands br left join profiles pr on pr.user_id = br.deleted_by
            where br.org_id = %(o)s and br.deleted_at >= %(c)s
            union all
            select 'product', p.id, p.name, br.name, p.deleted_at, pr.display_name, 0, 0
            from products p join brands br on br.id = p.brand_id
            left join profiles pr on pr.user_id = p.deleted_by
            where p.org_id = %(o)s and p.deleted_at >= %(c)s and p.trashed_with is null
              and p.purged_at is null
            union all
            select 'template', t.id, t.name, null, t.deleted_at, pr.display_name, 0, 0
            from templates t left join profiles pr on pr.user_id = t.deleted_by
            where t.org_id = %(o)s and t.deleted_at >= %(c)s and t.purged_at is null
            order by deleted_at desc
            """,
            {"o": org_id, "c": cutoff},
        ).fetchall()
    return [
        TrashItem(
            kind=r["kind"],
            id=r["id"],
            name=r["name"],
            detail=_with(r["pages"], r["products"]) if r["kind"] == "brand" else r["detail"],
            deleted_at=r["deleted_at"],
            deleted_by=r["deleted_by"],
            expires_at=r["deleted_at"] + RETENTION,
        )
        for r in rows
    ]
