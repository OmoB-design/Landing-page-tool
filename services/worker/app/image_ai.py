"""AI pictures in the image studio (BUILD_SPEC §11.2, B3.2b, D110): a new picture for an image
(generate), or the one it shows changed (edit), with up to three of the product's photos as
references. Built against fal (nano-banana-pro, $0.15 a picture); in mock mode (the default) each
picture is a free grey placeholder that names what was asked.

A picture is a job (`image_generate` / `image_edit`, one at a time per image), so the page stays
editable while it's made; when it's ready it goes onto the page as it is then, as one undoable
desk change and a new version of the image. While Lander or a redraft works on the page it waits
for them (their save would otherwise clash).
"""

import time
import uuid
from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

from app import desk, images
from app.config import get_settings
from app.db import transaction
from app.engines import image_edits
from app.engines import images as slots
from app.engines.html import parse
from app.jobs import queue
from app.models.images import ImageAI, ImageAIRequest, ImageJob
from app.providers import cost, fal

Mode = Literal["generate", "edit"]
KINDS = {"generate": "image_generate", "edit": "image_edit"}
SOURCES = {"generate": "generated", "edit": "edited"}
WAIT_SECONDS = 300
MAX_SIDE = 1600


def ai_state() -> ImageAI:
    settings = get_settings()
    price = cost.image_cost(settings.lp_fal_t2i_model)
    return ImageAI(mock=settings.lp_mock_images, price=str(price) if price is not None else None)


def making(conn: Any, build_id: UUID, number: int) -> ImageJob | None:
    """The picture being made for image `number`, if one is queued or running."""
    row = conn.execute(
        """
        select id, kind from jobs
        where build_id = %(b)s and kind = any(%(k)s) and status in ('queued', 'running')
          and payload->>'number' = %(n)s
        order by created_at desc limit 1
        """,
        {"b": build_id, "k": list(KINDS.values()), "n": str(number)},
    ).fetchone()
    if row is None:
        return None
    return ImageJob(
        job_id=row["id"], mode="generate" if row["kind"] == KINDS["generate"] else "edit"
    )


def references(conn: Any, org_id: UUID, build_id: UUID, numbers: list[int]) -> list[str]:
    """The product photos named by number (from 1), as their addresses."""
    photos = images._product_photos(conn, org_id, build_id)
    out = []
    for n in numbers:
        if not 1 <= n <= len(photos):
            raise desk.DeskEditError(f"There's no product photo {n}.")
        if photos[n - 1] not in out:
            out.append(photos[n - 1])
    return out


def start(
    org_id: UUID, build_id: UUID, user_id: UUID | None, number: int, request: ImageAIRequest
) -> ImageJob:
    """Queues a picture for image `number`: one at a time per image."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        if build["status"] not in desk.EDITABLE:
            raise desk.DeskEditError(
                "This page can't be changed while it builds or after it failed."
            )
        image = images._image(desk._page(build), number)
        if image.kind == "logo":
            raise desk.DeskEditError("That's the brand's logo: change it on the brand.")
        refs = references(conn, org_id, build_id, request.product_photos)
        if making(conn, build_id, number) is not None:
            raise desk.DeskEditError("A picture is already being made for this image.")
        job, created = queue.enqueue(
            org_id=org_id,
            kind=KINDS[request.mode],
            payload={
                "build_id": str(build_id),
                "number": number,
                "prompt": request.prompt.strip(),
                "references": refs,
            },
            created_by=user_id,
            dedupe_key=f"image:{build_id}:{number}",
            build_id=build_id,
            max_attempts=1,
            conn=conn,
        )
        if not created:
            raise desk.DeskEditError("A picture is already being made for this image.")
    return ImageJob(job_id=job.id, mode=request.mode)


def size_for(html: str, number: int) -> tuple[int, int]:
    """The size to make image `number`'s picture at: its shape in the studio if it has one, else
    its slot's size (width and height, aspect, or the default for its kind)."""
    tag = parse(html).select_one(f'img[data-lp-img="{int(number)}"]')
    if tag is None:
        return 1024, 768
    shape = next((i for i in image_edits.page_images(html) if i.number == number), None)
    if shape and shape.ratio in image_edits.RATIOS:
        w, h = (int(x) for x in image_edits.RATIOS[shape.ratio].split(" / "))
        return (1024, round(1024 * h / w)) if w >= h else (round(1024 * w / h), 1024)
    kind = slots.slot_kind(tag)
    width, height = slots.slot_size(tag, "scene" if kind in ("other", "keep", "logo") else kind)
    scale = min(1.0, MAX_SIDE / max(width, height))
    return max(256, round(width * scale)), max(256, round(height * scale))


def prompt_for(mode: Mode, prompt: str, has_references: bool) -> str:
    """What fal is asked: the user's words, with the page's rules for pictures."""
    words = prompt.strip().rstrip(".")
    if mode == "edit":
        keep = " The product must look exactly like the product in the reference photos."
        return f"{words}. Keep everything else in the picture as it is." + (
            keep if has_references else ""
        )
    show = " Show the product exactly as it looks in the reference photos."
    return (
        f"{words}. A natural, photographic picture for a product landing page, with no text, "
        "logos or watermarks." + (show if has_references else "")
    )


def make(
    mode: Mode, prompt: str, current_src: str, refs: list[str], width: int, height: int
) -> tuple[bytes, str, bool]:
    """A picture from fal: an edit of the current one (with the references), a new one with the
    product (references only), or a new one from words. Mock mode makes a free placeholder that
    names what was asked (each one different, so making another always changes the page)."""
    full = prompt_for(mode, prompt, bool(refs))
    if mode == "edit":
        result = fal.edit_image(
            prompt=full, image_urls=[current_src, *refs], width=width, height=height
        )
    elif refs:
        result = fal.edit_image(prompt=full, image_urls=refs, width=width, height=height)
    else:
        result = fal.generate_image(prompt=full, width=width, height=height)
    if result.mock:
        words = " ".join(prompt.split())
        kind = "EDIT" if mode == "edit" else "PICTURE"
        short = words if len(words) <= 18 else words[:17].rstrip() + "…"
        label = f"AI {kind} (MOCK)\n{short}\n#{uuid.uuid4().hex[:4]}"
        return fal.mock_image(width, height, label=label), "image/jpeg", True
    return result.data, result.mime, False


def apply(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    number: int,
    *,
    src: str,
    asset_id: UUID | None,
    mode: Mode,
    prompt: str,
    mock: bool,
    wait: Callable[[float], None],
) -> int:
    """Puts the new picture on the page as it is now (one undoable change) and keeps it as the
    image's newest version; returns the page's version. Waits while Lander or a redraft works on
    the page. A placeholder marks the page as having one (the publish gate's)."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        with transaction() as conn:
            build = desk._load(conn, org_id, build_id, lock=True)
            if desk._redraft(conn, build_id) is None:
                if build["status"] not in desk.EDITABLE:
                    raise desk.DeskEditError(
                        "The page can't be changed now, so the picture wasn't placed."
                    )
                html = desk._page(build)
                found = next((i for i in image_edits.page_images(html) if i.number == number), None)
                if found is None:
                    raise desk.DeskEditError(
                        f"Image {number} isn't on the page any more, so the picture wasn't placed."
                    )
                new_html, before = image_edits.set_src(html, number, src)
                what = "Made a new picture" if mode == "generate" else "Edited a picture"
                reason = f"{what} with AI{images._where(conn, build, found)}"
                stale = desk._change(conn, build, reason=reason, user_id=user_id, html=new_html)
                images.record(
                    conn, build_id, number, before=before, src=src, source=SOURCES[mode],
                    asset_id=asset_id, prompt=prompt,
                )  # fmt: skip
                if mock:
                    conn.execute(
                        "update builds set mock_images = true where id = %(b)s", {"b": build_id}
                    )
                version = int(build["page_version"]) + 1
                break
        if time.monotonic() > deadline:
            raise desk.DeskEditError(
                "Lander was still working on the page, so the picture wasn't placed. Try again."
            )
        wait(3)
    desk._remove(stale)
    return version
