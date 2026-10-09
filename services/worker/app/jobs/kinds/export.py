"""`export` (BUILD_SPEC §12.2): the build's page as one self-contained `export/index.html`,
offered as an HTML download. Assets in our storage are inlined; anything else is left as a
link and listed in the result."""

import mimetypes
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db import transaction
from app.engines.export import Resolver, export_page
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.pipeline.runtime import BUCKET, build_prefix
from app.providers import storage
from app.providers.storage import StorageError

TOTAL = 2


class ExportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID


def dedupe_key(payload: ExportPayload) -> str:
    return f"export:{payload.build_id}"


def _resolver(org_id: UUID) -> Resolver:
    org_assets = storage.public_url("assets", "")  # …/object/public/assets/
    library_assets = storage.public_url("library-assets", "")

    def resolve(url: str) -> tuple[bytes, str] | None:
        clean = url.split("?", 1)[0]
        if clean.startswith(org_assets):
            bucket, path = "assets", clean[len(org_assets) :]
            # Only this org's own assets: their paths start with the org id (D3).
            if not path.startswith(f"{org_id}/"):
                return None
        elif clean.startswith(library_assets):
            bucket, path = "library-assets", clean[len(library_assets) :]  # shared, public
        else:
            return None
        try:
            data = storage.download(bucket, path)
        except StorageError:
            return None
        return data, mimetypes.guess_type(path)[0] or "application/octet-stream"

    return resolve


def run(ctx: JobContext) -> dict[str, Any]:
    payload = ExportPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    with transaction() as conn:
        build = conn.execute(
            "select id, key, working_html_path from builds where id = %(b)s and org_id = %(o)s",
            {"b": payload.build_id, "o": org_id},
        ).fetchone()
    if build is None or not build["working_html_path"]:
        raise UserFacingError("That page isn't built yet.", code="not_built")
    html = storage.download(BUCKET, build["working_html_path"]).decode("utf-8")
    exported, stats = export_page(html, _resolver(org_id))
    ctx.progress(f"Inlined {stats['inlined']} files", data={"step": 1, "total": TOTAL})
    path = f"{build_prefix(str(org_id), str(build['id']))}/export/index.html"
    storage.upload(BUCKET, path, exported.encode("utf-8"), "text/html; charset=utf-8", upsert=True)
    with transaction() as conn:
        conn.execute(
            "update builds set export_html_path = %(p)s where id = %(b)s and org_id = %(o)s",
            {"p": path, "b": build["id"], "o": org_id},
        )
    ctx.progress("Saved the export", data={"step": 2, "total": TOTAL})
    return {"build_id": str(build["id"]), "key": build["key"], "path": path, **stats}
