"""Supabase Storage over its REST API with the secret key (D44), and the `assets` index:
images and fonts are stored once per org, deduplicated by content hash (BUILD_SPEC §5.2)."""

import hashlib
import io
import threading
import uuid
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from PIL import Image, UnidentifiedImageError

from app.config import get_settings
from app.db import transaction

EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "font/woff2": "woff2",
    "text/javascript": "js",
}


class StorageError(RuntimeError):
    pass


# Exports inline every image, so a page can be megabytes: uploads get minutes, not httpx's 5 s
# default (a slow link timed out publishing, 2026-10-28).
TIMEOUT = httpx.Timeout(15.0, read=120.0, write=300.0)


# One client for the whole process (B4.5, D124): it keeps its connections to storage open, so a
# request doesn't open a new secure connection each time (0.3 to 1 s each from far away, a few ms
# beside the database). httpx's client is safe to share between the worker's threads.
_client: httpx.Client | None = None
_client_lock = threading.Lock()


def _http() -> httpx.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client(
                    timeout=TIMEOUT,
                    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                )
    return _client


def _send(method: str, url: str, action: str, **kwargs: Any) -> httpx.Response:
    try:
        response = _http().request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        raise StorageError(f"Storage {action} timed out.") from exc
    except httpx.HTTPError as exc:
        raise StorageError(f"Couldn't reach storage ({action}).") from exc
    return _check(response, action)


def _base() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/storage/v1"


def _headers() -> dict[str, str]:
    key = get_settings().supabase_secret_key
    if not key:
        raise StorageError("SUPABASE_SECRET_KEY is not set in services/worker/.env.")
    return {"apikey": key}


def _check(response: httpx.Response, action: str) -> httpx.Response:
    if response.is_error:
        raise StorageError(f"Storage {action} failed ({response.status_code}): {response.text}")
    return response


def upload(bucket: str, path: str, data: bytes, content_type: str, *, upsert: bool = False) -> None:
    headers = {**_headers(), "Content-Type": content_type, "x-upsert": str(upsert).lower()}
    _send("POST", f"{_base()}/object/{bucket}/{path}", "upload", content=data, headers=headers)


def download(bucket: str, path: str) -> bytes:
    return _send("GET", f"{_base()}/object/{bucket}/{path}", "download", headers=_headers()).content


def remove(bucket: str, paths: list[str]) -> None:
    _send(
        "DELETE",
        f"{_base()}/object/{bucket}",
        "delete",
        json={"prefixes": paths},
        headers=_headers(),
    )


LIST_PAGE = 1000


def list_files(bucket: str, folder: str) -> list[str]:
    """Every file under a folder, its subfolders too, as full paths (for removing a folder)."""
    found: list[str] = []
    folders = [folder.strip("/")]
    while folders:
        current = folders.pop()
        offset = 0
        while True:
            entries: list[dict[str, Any]] = _send(
                "POST",
                f"{_base()}/object/list/{bucket}",
                "list",
                json={"prefix": current, "limit": LIST_PAGE, "offset": offset},
                headers=_headers(),
            ).json()
            for entry in entries:
                path = f"{current}/{entry['name']}"
                # Folders come back without an id.
                (found if entry.get("id") else folders).append(path)
            if len(entries) < LIST_PAGE:
                break
            offset += LIST_PAGE
    return found


def remove_folder(bucket: str, folder: str) -> int:
    """Removes every file under a folder; returns how many."""
    paths = list_files(bucket, folder)
    for start in range(0, len(paths), LIST_PAGE):
        remove(bucket, paths[start : start + LIST_PAGE])
    return len(paths)


def signed_url(bucket: str, path: str, expires: int = 3600) -> str:
    """A link to a private object that works for `expires` seconds (the thread's pictures in the
    page editor, B3.1d)."""
    response = _send(
        "POST",
        f"{_base()}/object/sign/{bucket}/{path}",
        "signing",
        headers=_headers(),
        json={"expiresIn": expires},
    )
    body = response.json()
    signed = body.get("signedURL") or body.get("signedUrl")
    if not isinstance(signed, str):
        raise StorageError("Storage signing answered without a link.")
    return f"{_base()}{signed}"


SIGN_BATCH = 100


def signed_urls(bucket: str, paths: list[str], expires: int = 3600) -> dict[str, str]:
    """Links for many private objects in one request per hundred (a conversation's pictures:
    signing them one by one took 17 s for Lander's ALL-1 thread, owner 2026-11-05). Returns each
    path's link; a path storage couldn't sign is left out."""
    out: dict[str, str] = {}
    unique = list(dict.fromkeys(p for p in paths if p))
    for start in range(0, len(unique), SIGN_BATCH):
        chunk = unique[start : start + SIGN_BATCH]
        response = _send(
            "POST",
            f"{_base()}/object/sign/{bucket}",
            "signing",
            headers=_headers(),
            json={"expiresIn": expires, "paths": chunk},
        )
        body = response.json()
        for item in body if isinstance(body, list) else []:
            signed = item.get("signedURL") or item.get("signedUrl")
            if isinstance(signed, str) and item.get("path") and not item.get("error"):
                out[str(item["path"])] = f"{_base()}{signed}"
    return out


def public_url(bucket: str, path: str) -> str:
    """Only for public buckets (`assets`)."""
    return f"{_base()}/object/public/{bucket}/{path}"


@dataclass(frozen=True)
class Asset:
    id: UUID
    org_id: UUID
    bucket: str
    path: str
    sha256: str
    mime: str
    width: int | None
    height: int | None
    bytes: int

    @property
    def url(self) -> str:
        return public_url(self.bucket, self.path)


def store_asset(org_id: UUID, data: bytes, mime: str, *, source_url: str | None = None) -> Asset:
    """Stores bytes in the public `assets` bucket under an unguessable path, or returns the
    org's existing asset with the same content."""
    digest = hashlib.sha256(data).hexdigest()
    existing = _find_asset(org_id, digest)
    if existing:
        return existing

    width = height = None
    if mime.startswith("image/") and mime != "image/svg+xml":
        try:
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
        except UnidentifiedImageError:
            pass
    path = f"{org_id}/{uuid.uuid4()}.{EXTENSIONS.get(mime, 'bin')}"
    upload("assets", path, data, mime)
    with transaction() as conn:
        row = conn.execute(
            """
            insert into assets (org_id, bucket, path, sha256, mime, width, height, bytes,
                                source_url)
            values (%(org)s, 'assets', %(path)s, %(sha)s, %(mime)s, %(w)s, %(h)s, %(bytes)s,
                    %(source)s)
            on conflict (org_id, sha256) do nothing
            returning *
            """,
            {
                "org": org_id,
                "path": path,
                "sha": digest,
                "mime": mime,
                "w": width,
                "h": height,
                "bytes": len(data),
                "source": source_url,
            },
        ).fetchone()
    if row is None:  # stored concurrently by another job: keep theirs, drop ours
        remove("assets", [path])
        found = _find_asset(org_id, digest)
        if found is None:
            raise StorageError("Asset vanished after a concurrent insert.")
        return found
    return _asset(row)


def _find_asset(org_id: UUID, digest: str) -> Asset | None:
    with transaction() as conn:
        row = conn.execute(
            "select * from assets where org_id = %(org)s and sha256 = %(sha)s",
            {"org": org_id, "sha": digest},
        ).fetchone()
    return _asset(row) if row else None


def _asset(row: dict[str, Any]) -> Asset:
    return Asset(
        id=row["id"],
        org_id=row["org_id"],
        bucket=row["bucket"],
        path=row["path"],
        sha256=row["sha256"],
        mime=row["mime"],
        width=row["width"],
        height=row["height"],
        bytes=row["bytes"],
    )
