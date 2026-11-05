"""The image studio (BUILD_SPEC §11.2, B3.2a, D109): replacing, cropping and describing one image
of a built page, with its last five versions.

Each change is a desk change (one undo step, the claims checked again) and, for a new picture, a
version in `image_versions` (the build's original is kept as the first, so it can be restored).
An image can only become a picture LP stores, one of the product's photos, or one already on the
page: never an arbitrary address.
"""

import base64
import io
import re
from typing import Any
from uuid import UUID

from PIL import Image

from app import desk
from app.config import get_settings
from app.db import transaction
from app.engines import image_edits
from app.engines.html import parse
from app.models.desk import DeskState
from app.models.images import (
    MAX_UPLOAD_BYTES,
    ImageAdjust,
    ImageChoice,
    ImageReplace,
    ImageRestore,
    ImageStudio,
    ImageUpload,
    ImageVersion,
    StudioImage,
    UploadedImage,
)
from app.providers import storage

MAX_VERSIONS = 5  # BUILD_SPEC §10.4: max 5 versions per slot
KIND_LABELS = {
    "product": "Product photo",
    "person": "Person",
    "scene": "Scene",
    "kept": "From the template",
    "logo": "Logo",
    "image": "Image",
}
_DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$")


def _product_photos(conn: Any, org_id: UUID, build_id: UUID) -> list[str]:
    row = conn.execute(
        """
        select p.images from builds b join products p on p.id = b.product_id and p.org_id = b.org_id
        where b.id = %(b)s and b.org_id = %(o)s
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    if not row:
        return []
    ids = [str(i["asset_id"]) for i in row["images"] or [] if i.get("asset_id")]
    urls: dict[str, str] = {}
    if ids:
        for asset in conn.execute(
            "select id, bucket, path from assets where org_id = %(o)s and id::text = any(%(ids)s)",
            {"o": org_id, "ids": ids},
        ).fetchall():
            urls[str(asset["id"])] = storage.public_url(asset["bucket"], asset["path"])
    photos = []
    for image in row["images"] or []:
        url = urls.get(str(image.get("asset_id"))) or image.get("source_url")
        if isinstance(url, str) and url.startswith("https://") and url not in photos:
            photos.append(url)
    return photos


def _versions(conn: Any, build_id: UUID, number: int) -> list[dict[str, Any]]:
    return [
        dict(r)
        for r in conn.execute(
            """
            select id, seq, source::text as source, src, created_at, is_current
            from image_versions where build_id = %(b)s and slot = %(n)s
            order by seq desc
            """,
            {"b": build_id, "n": number},
        ).fetchall()
    ]


def _image(html: str, number: int) -> image_edits.PageImage:
    found = next((i for i in image_edits.page_images(html) if i.number == number), None)
    if found is None:
        raise desk.DeskNotFoundError
    return found


def studio(org_id: UUID, build_id: UUID, number: int) -> ImageStudio:
    """One image of the page: its details, the last five versions, and what it can become."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        html = desk._page(build)
        labels = desk._labels(conn, build["template_id"])
        photos = _product_photos(conn, org_id, build_id)
        versions = _versions(conn, build_id, number)
        built = own_styles(conn, build_id).get(number)
    image = _image(html, number)
    # Changed by the studio: it kept the image's own style, or (changed before it kept one) the
    # page's oldest version styled it differently.
    changed = (image.own_style is not None and image.own_style != image.style) or (
        image.own_style is None and built is not None and built != image.style
    )
    others = [
        i
        for i in image_edits.page_images(html)
        if i.number != number and i.kind != "logo" and i.src.startswith("https://")
    ]
    seen: set[str] = set()
    page_images = []
    for other in others:
        if other.src in seen or other.src == image.src:
            continue
        seen.add(other.src)
        where = labels.get(other.section or "", other.section or "the page")
        page_images.append(
            ImageChoice(
                src=other.src,
                label=f"{KIND_LABELS.get(other.kind, 'Image')} in {where}",
                number=other.number,
            )
        )
    return ImageStudio(
        image=StudioImage(
            **{k: getattr(image, k) for k in ("number", "src", "alt", "kind", "section")},
            section_label=labels.get(image.section or "") if image.section else None,
            ratio=image.ratio,
            fit=image.fit,
            focus=image.focus,
            changed=changed,
        ),
        versions=[
            ImageVersion(
                id=v["id"],
                seq=v["seq"],
                source=v["source"],
                src=v["src"] or "",
                created_at=v["created_at"],
                # What the page shows now (an undo can bring back an older picture).
                current=v["src"] == image.src,
            )
            for v in versions[:MAX_VERSIONS]
            if v["src"]
        ],
        product_photos=[
            ImageChoice(src=url, label=f"Product photo {i}") for i, url in enumerate(photos, 1)
        ],
        page_images=page_images,
    )


def allowed_src(conn: Any, org_id: UUID, build_id: UUID, html: str, src: str) -> bool:
    """Whether an image may become `src`: a picture in LP's storage, a product photo, or one
    already on the page (or in this build's image history)."""
    if src.startswith(f"{get_settings().supabase_url.rstrip('/')}/storage/v1/object/public/"):
        return True
    if src in {i.src for i in image_edits.page_images(html)}:
        return True
    if src in _product_photos(conn, org_id, build_id):
        return True
    row = conn.execute(
        "select 1 from image_versions where build_id = %(b)s and src = %(s)s limit 1",
        {"b": build_id, "s": src},
    ).fetchone()
    return row is not None


def record(
    conn: Any,
    build_id: UUID,
    number: int,
    *,
    before: str,
    src: str,
    source: str,
    asset_id: UUID | None = None,
    prompt: str | None = None,
) -> None:
    """A new picture for image `number` becomes its current version. The first time, the picture
    it replaced is kept as the original; only the newest five are kept."""
    versions = _versions(conn, build_id, number)
    if not versions:
        conn.execute(
            """
            insert into image_versions (build_id, slot, seq, source, src, is_current)
            values (%(b)s, %(n)s, 1, 'original', %(s)s, false)
            """,
            {"b": build_id, "n": number, "s": before},
        )
        top = 1
    else:
        top = max(v["seq"] for v in versions)
        conn.execute(
            "update image_versions set is_current = false where build_id = %(b)s and slot = %(n)s",
            {"b": build_id, "n": number},
        )
    conn.execute(
        """
        insert into image_versions (build_id, slot, seq, asset_id, source, prompt, src, is_current)
        values (%(b)s, %(n)s, %(seq)s, %(a)s, %(source)s::image_source, %(p)s, %(s)s, true)
        """,
        {
            "b": build_id, "n": number, "seq": top + 1, "a": asset_id, "source": source,
            "p": prompt, "s": src,
        },
    )  # fmt: skip
    conn.execute(
        """
        delete from image_versions where build_id = %(b)s and slot = %(n)s and seq not in (
            select seq from image_versions where build_id = %(b)s and slot = %(n)s
            order by seq desc limit %(keep)s
        )
        """,
        {"b": build_id, "n": number, "keep": MAX_VERSIONS},
    )


def own_styles(conn: Any, build_id: UUID) -> dict[int, str]:
    """Each image's style on the page's oldest kept version, for "Original" on an image the studio
    changed before it kept the image's own style (empty when there's no older page)."""
    row = conn.execute(
        "select html_path from build_snapshots where build_id = %(b)s order by seq limit 1",
        {"b": build_id},
    ).fetchone()
    if not row or not row["html_path"]:
        return {}
    try:
        old = storage.download(desk.BUCKET, row["html_path"]).decode("utf-8")
    except Exception:  # the old page is gone: "Original" takes off the crop only
        return {}
    return {
        int(str(tag["data-lp-img"])): str(tag.get("style") or "")
        for tag in parse(old).select("img[data-lp-img]")
        if str(tag.get("data-lp-img", "")).isdigit() and not tag.has_attr(image_edits.OWN_STYLE)
    }


def _where(conn: Any, build: dict[str, Any], image: image_edits.PageImage) -> str:
    if not image.section:
        return ""
    label = desk._labels(conn, build["template_id"]).get(image.section) or image.section
    return f" in {label}"


def replace(
    org_id: UUID, build_id: UUID, user_id: UUID | None, number: int, request: ImageReplace
) -> DeskState:
    """Image `number` shows a new picture (a product photo, another image on the page, or an
    upload), as one undoable change and a new version."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        desk._check(conn, build, request.base_version)
        html = desk._page(build)
        image = _image(html, number)
        if not allowed_src(conn, org_id, build_id, html, request.src):
            raise desk.DeskEditError("That picture isn't one LP stores or the page already uses.")
        try:
            new_html, before = image_edits.set_src(html, number, request.src)
        except image_edits.ImageEditError as exc:
            raise desk.DeskEditError(str(exc)) from exc
        what = {"product": "a product photo", "reused": "another image", "uploaded": "an upload"}
        reason = f"Replaced an image{_where(conn, build, image)} with {what[request.source]}"
        stale = desk._change(conn, build, reason=reason, user_id=user_id, html=new_html)
        record(
            conn, build_id, number, before=before, src=request.src, source=request.source,
            asset_id=request.asset_id,
        )  # fmt: skip
    return desk._finish(org_id, build_id, stale)


def adjust(
    org_id: UUID, build_id: UUID, user_id: UUID | None, number: int, request: ImageAdjust
) -> DeskState:
    """Image `number`'s shape, fit, focus or alt text, as one undoable change."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        desk._check(conn, build, request.base_version)
        html = desk._page(build)
        image = _image(html, number)
        own = own_styles(conn, build_id).get(number) if request.ratio == "original" else None
        try:
            new_html = html
            if request.ratio or request.fit or request.focus:
                new_html = image_edits.set_shape(
                    new_html, number, ratio=request.ratio, fit=request.fit, focus=request.focus,
                    own_style=own,
                )  # fmt: skip
            if request.alt is not None:
                new_html = image_edits.set_alt(new_html, number, request.alt)
        except image_edits.ImageEditError as exc:
            raise desk.DeskEditError(str(exc)) from exc
        if new_html == html:
            raise desk.DeskEditError("Nothing changed.")
        where = _where(conn, build, image)
        reason = (
            f"Changed an image's alt text{where}"
            if request.alt is not None and not (request.ratio or request.fit or request.focus)
            else f"Cropped an image{where}"
        )
        stale = desk._change(conn, build, reason=reason, user_id=user_id, html=new_html)
    return desk._finish(org_id, build_id, stale)


def restore(
    org_id: UUID, build_id: UUID, user_id: UUID | None, number: int, request: ImageRestore
) -> DeskState:
    """Image `number` shows one of its earlier versions again (one undoable change)."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        desk._check(conn, build, request.base_version)
        html = desk._page(build)
        image = _image(html, number)
        version = next(
            (v for v in _versions(conn, build_id, number) if v["id"] == request.version_id), None
        )
        if version is None or not version["src"]:
            raise desk.DeskEditError("That version isn't kept any more.")
        try:
            new_html = (
                html
                if image.src == version["src"]
                else image_edits.set_src(html, number, version["src"])[0]
            )
            if version["source"] == "original":
                # The build's own picture comes back as it was built: the crop goes too.
                new_html = image_edits.set_shape(
                    new_html, number, ratio="original",
                    own_style=own_styles(conn, build_id).get(number),
                )  # fmt: skip
        except image_edits.ImageEditError as exc:
            raise desk.DeskEditError(str(exc)) from exc
        if new_html == html:
            raise desk.DeskEditError("That picture is already on the page as it was.")
        reason = f"Restored an earlier image{_where(conn, build, image)}"
        stale = desk._change(conn, build, reason=reason, user_id=user_id, html=new_html)
        # Two steps: one current version per image is a unique index, checked row by row.
        conn.execute(
            "update image_versions set is_current = false"
            " where build_id = %(b)s and slot = %(n)s and is_current",
            {"b": build_id, "n": number},
        )
        conn.execute(
            "update image_versions set is_current = true where id = %(v)s and build_id = %(b)s",
            {"v": request.version_id, "b": build_id},
        )
    return desk._finish(org_id, build_id, stale)


def upload(org_id: UUID, build_id: UUID, request: ImageUpload) -> UploadedImage:
    """A picture from the user's computer, checked (PNG, JPEG or WebP, up to 8 MB) and stored as
    one of the workspace's assets."""
    with transaction() as conn:
        desk._load(conn, org_id, build_id)
    match = _DATA_URL.match(request.data_url.strip())
    if not match:
        raise desk.DeskEditError("Pictures must be PNG, JPEG or WebP.")
    data = base64.b64decode(match.group(2))
    if len(data) > MAX_UPLOAD_BYTES:
        raise desk.DeskEditError("Pictures can be up to 8 MB.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
    except Exception as exc:
        raise desk.DeskEditError("That picture couldn't be read.") from exc
    asset = storage.store_asset(org_id, data, f"image/{match.group(1)}")
    return UploadedImage(asset_id=asset.id, url=asset.url)
