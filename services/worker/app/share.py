"""The client review link (B3.6, BUILD_SPEC §11.4, D55, D119).

Approving a page keeps a copy of it as approved (`stamp`, called by the desk's Approve); a page's
client link shows that copy to anyone who has the link, with no sign-in. Approving again replaces
the copy, so the same link moves on to the newest approved version; editing the page changes
nothing the client sees until then. One live link per page; it expires after 30 days and can be
turned off, and a new one made.

A link's token isn't stored: it's the link's id with a signature made from the worker's secret
(`LP_SHARE_SECRET`), checked the same way when the link is opened, so the database holds nothing a
reader could open a page with, and the team can copy the link again whenever they like.
"""

import base64
import contextlib
import hashlib
import hmac
import html
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.db import transaction
from app.models.share import ReviewInfo, ShareLink, ShareState
from app.providers import storage

BUCKET = "builds"
# Pages approved (now or before) can be shared; a published page was approved before it went out.
SHAREABLE = {"approved", "published"}
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_SIGNATURE_BYTES = 18


class ShareNotFoundError(Exception):
    """No such page in this workspace."""


class ShareUnavailableError(Exception):
    """The worker has no LP_SHARE_SECRET, so links can't be made or opened."""


class ShareRefusedError(Exception):
    """The page has no approved version to show yet."""


# ── Tokens ───────────────────────────────────────────────────────────────────


def _secret() -> bytes:
    secret = get_settings().lp_share_secret
    if not secret:
        raise ShareUnavailableError
    return secret.encode("utf-8")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _signature(link_id: UUID) -> bytes:
    digest = hmac.new(_secret(), b"lp-share-v1:" + link_id.bytes, hashlib.sha256).digest()
    return digest[:_SIGNATURE_BYTES]


def token_for(link_id: UUID) -> str:
    """The link's token: its id, then its signature (46 URL-safe characters)."""
    return _b64(link_id.bytes) + _b64(_signature(link_id))


def link_id_from(token: str) -> UUID | None:
    """The link a token belongs to, or None when it isn't one of ours."""
    if len(token) != 46 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        return None
    try:
        link_id = UUID(bytes=_unb64(token[:22]))
        signature = _unb64(token[22:])
    except ValueError:
        return None
    return link_id if hmac.compare_digest(signature, _signature(link_id)) else None


# ── The approved copy ────────────────────────────────────────────────────────


def copy_path(org_id: UUID, build_id: UUID, version: int) -> str:
    return f"{org_id}/{build_id}/approved/v{version}.html"


def stamp(conn: Any, build: dict[str, Any]) -> None:
    """Keeps the page as it is now as its approved version (inside the caller's transaction): the
    client link shows this copy until the page is approved again."""
    row = conn.execute(
        "select approved_copy_path from builds where id = %(b)s and org_id = %(o)s",
        {"b": build["id"], "o": build["org_id"]},
    ).fetchone()
    old = row["approved_copy_path"] if row else None
    path = copy_path(build["org_id"], build["id"], build["page_version"])
    page = storage.download(BUCKET, build["working_html_path"])
    storage.upload(BUCKET, path, page, "text/html; charset=utf-8", upsert=True)
    conn.execute(
        """
        update builds set approved_copy_path = %(p)s, approved_copy_version = %(v)s,
               approved_copy_at = now()
        where id = %(b)s and org_id = %(o)s
        """,
        {"p": path, "v": build["page_version"], "b": build["id"], "o": build["org_id"]},
    )
    if old and old != path:
        # A stray old copy is harmless: the build's folder goes when the page is deleted.
        with contextlib.suppress(storage.StorageError):
            storage.remove(BUCKET, [old])


# ── The team's side ──────────────────────────────────────────────────────────


def _build(conn: Any, org_id: UUID, build_id: UUID, *, lock: bool = False) -> dict[str, Any]:
    row = conn.execute(
        f"""
        select id, org_id, status, page_version, working_html_path, approved_copy_path,
               approved_copy_version, approved_copy_at
        from builds
        where id = %(b)s and org_id = %(o)s and deleted_at is null
        {"for update" if lock else ""}
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    if row is None:
        raise ShareNotFoundError
    return dict(row)


def _live(conn: Any, org_id: UUID, build_id: UUID) -> dict[str, Any] | None:
    row = conn.execute(
        """
        select id, created_at, expires_at, views, last_viewed_at from share_links
        where build_id = %(b)s and org_id = %(o)s and revoked_at is null
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    return dict(row) if row else None


def _state(conn: Any, org_id: UUID, build_id: UUID) -> ShareState:
    build = _build(conn, org_id, build_id)
    link = _live(conn, org_id, build_id)
    approved = build["approved_copy_version"]
    shareable = approved is not None or build["status"] in SHAREABLE
    return ShareState(
        can_share=shareable,
        approved_version=approved,
        approved_at=build["approved_copy_at"],
        page_version=build["page_version"],
        changed_since=approved is not None and approved != build["page_version"],
        link=(
            ShareLink(
                token=token_for(link["id"]),
                created_at=link["created_at"],
                expires_at=link["expires_at"],
                expired=link["expires_at"] <= datetime.now(UTC),
                views=link["views"],
                last_viewed_at=link["last_viewed_at"],
            )
            if link
            else None
        ),
    )


def share_state(org_id: UUID, build_id: UUID) -> ShareState:
    _secret()
    with transaction() as conn:
        return _state(conn, org_id, build_id)


def make_link(org_id: UUID, build_id: UUID, user_id: UUID | None) -> ShareState:
    """The page's client link: the live one, or a new one when there's none or it has expired. A
    page approved before links existed gets its approved copy now."""
    _secret()
    with transaction() as conn:
        build = _build(conn, org_id, build_id, lock=True)
        if build["approved_copy_path"] is None:
            if build["status"] not in SHAREABLE:
                raise ShareRefusedError(
                    "Approve the page first: the client link shows the approved version."
                )
            stamp(conn, build)
        link = _live(conn, org_id, build_id)
        if link is not None and link["expires_at"] <= datetime.now(UTC):
            conn.execute(
                "update share_links set revoked_at = now() where id = %(i)s", {"i": link["id"]}
            )
            link = None
        if link is None:
            conn.execute(
                """
                insert into share_links (org_id, build_id, created_by)
                values (%(o)s, %(b)s, %(u)s)
                """,
                {"o": org_id, "b": build_id, "u": user_id},
            )
        return _state(conn, org_id, build_id)


def turn_off(org_id: UUID, build_id: UUID) -> ShareState:
    """Turns the page's link off: it stops working at once. A new link can be made after."""
    _secret()
    with transaction() as conn:
        _build(conn, org_id, build_id, lock=True)
        conn.execute(
            """
            update share_links set revoked_at = now()
            where build_id = %(b)s and org_id = %(o)s and revoked_at is null
            """,
            {"b": build_id, "o": org_id},
        )
        return _state(conn, org_id, build_id)


# ── The client's side (no sign-in) ───────────────────────────────────────────


_FIND = """
    select l.id, b.approved_copy_path, b.approved_copy_at
    from share_links l join builds b on b.id = l.build_id and b.org_id = l.org_id
    where l.id = %(i)s and l.revoked_at is null and l.expires_at > now()
      and b.deleted_at is null and b.approved_copy_path is not null
"""


def _open(conn: Any, token: str, *, count: bool) -> dict[str, Any] | None:
    link_id = link_id_from(token)
    if link_id is None:
        return None
    row = conn.execute(_FIND, {"i": link_id}).fetchone()
    if row is None:
        return None
    if count:
        conn.execute(
            "update share_links set views = views + 1, last_viewed_at = now() where id = %(i)s",
            {"i": link_id},
        )
    return dict(row)


def review_info(token: str) -> ReviewInfo | None:
    """The approved page's title and date for the client's page; None when the link isn't one, has
    expired or was turned off."""
    with transaction() as conn:
        found = _open(conn, token, count=False)
    if found is None:
        return None
    page = storage.download(BUCKET, found["approved_copy_path"]).decode("utf-8", "replace")
    match = _TITLE.search(page)
    title = html.unescape(re.sub(r"\s+", " ", match.group(1))).strip() if match else ""
    return ReviewInfo(title=title or "Your page", approved_at=found["approved_copy_at"])


def review_html(token: str) -> str | None:
    """The approved page itself, for the client's view, counting the visit (the page loads once per
    visit, while the title may be asked for more than once); None as for `review_info`."""
    with transaction() as conn:
        found = _open(conn, token, count=True)
    if found is None:
        return None
    return storage.download(BUCKET, found["approved_copy_path"]).decode("utf-8", "replace")
