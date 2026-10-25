"""Which images and files an exported page may inline (D59): the org's own assets and the shared
library assets in our storage; anything else stays a link."""

import mimetypes
from uuid import UUID

from app.engines.export import Resolver
from app.providers import storage
from app.providers.storage import StorageError


def resolver(org_id: UUID) -> Resolver:
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
