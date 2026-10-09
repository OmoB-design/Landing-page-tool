"""Supabase Storage over its REST API with the secret key (D44), and the `assets` index:
images and fonts are stored once per org, deduplicated by content hash (BUILD_SPEC §5.2)."""

import hashlib
import io
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
}


class StorageError(RuntimeError):
    pass


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
    response = httpx.post(f"{_base()}/object/{bucket}/{path}", content=data, headers=headers)
    _check(response, "upload")


def download(bucket: str, path: str) -> bytes:
    response = httpx.get(f"{_base()}/object/{bucket}/{path}", headers=_headers())
    return _check(response, "download").content


def remove(bucket: str, paths: list[str]) -> None:
    response = httpx.request(
        "DELETE", f"{_base()}/object/{bucket}", json={"prefixes": paths}, headers=_headers()
    )
    _check(response, "delete")


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
