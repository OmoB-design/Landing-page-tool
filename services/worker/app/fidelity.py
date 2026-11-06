"""Match product everywhere (BUILD_SPEC §10.5 and §11.2, B3.2c, D116): the pictures on a page that
show a product that isn't the real one are recreated with the real product.

The **check** is automatic: every build ends with it, and the image studio runs it again (a job)
when the page's pictures have changed since the last one. One Claude vision call sees up to three
product photos and a thumbnail of each candidate picture (app/engines/fidelity.py) and says which
to fix; free placeholder pictures and pictures that won't download are skipped without asking.
The check is kept in the build's report (`images.product_fix`).

A **match** (one click in the studio, or Buddy) fixes what the check found: at most 10 pictures,
each an edit on fal with one product photo as the reference ($0.15 a picture once live; a free
placeholder in mock mode), and puts them on the page as it is then as **one undoable change**,
each picture also a new version of its image. One check or match runs per page at a time.
"""

import base64
import binascii
import io
import json
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from psycopg.types.json import Jsonb

from app import desk, image_ai, images
from app.config import get_settings
from app.db import transaction
from app.engines import fidelity as engine
from app.engines import image_edits
from app.fetch.ladder import FetchError, fetch_bytes
from app.jobs import queue
from app.models.images import MatchStarted, ProductCheck, ProductCheckItem, ProductMatch
from app.providers import anthropic, cost, fal, storage

KIND = "product_fidelity"
THUMB = 384
PHOTO_THUMB = 512
# The free mock pictures' grey (app/providers/fal.py `mock_image`).
PLACEHOLDER_GREY = (214, 214, 219)
FETCH_LIMIT = 8_000_000


def _photos(product_photos: list[str]) -> list[str]:
    return product_photos[: engine.MAX_PHOTOS]


# ---------- pictures -------------------------------------------------------------------------


def _download(src: str) -> bytes | None:
    """A picture's bytes: a data URL decoded, anything else downloaded (the fetch ladder's
    guarded client); None when it can't be had."""
    if src.startswith("data:"):
        try:
            return base64.b64decode(src.split(",", 1)[1], validate=False)
        except (IndexError, binascii.Error):
            return None
    try:
        data, _ = fetch_bytes(src, max_bytes=FETCH_LIMIT)
    except (FetchError, ValueError):
        return None
    return data


def is_placeholder(image: Image.Image) -> bool:
    """One of LP's own free mock pictures (mostly its flat grey), not worth checking."""
    small = image.convert("RGB").resize((32, 32))
    grey_r, grey_g, grey_b = PLACEHOLDER_GREY
    close = 0
    for y in range(32):
        for x in range(32):
            r, g, b = small.getpixel((x, y))  # type: ignore[misc]
            if abs(r - grey_r) <= 8 and abs(g - grey_g) <= 8 and abs(b - grey_b) <= 8:
                close += 1
    return close >= 0.75 * 32 * 32


@dataclass(frozen=True)
class Thumb:
    jpeg: bytes | None  # None when it couldn't be read
    placeholder: bool = False


def thumbnail(src: str, side: int = THUMB) -> Thumb:
    """A small JPEG of a picture for the check (transparent parts on white)."""
    data = _download(src)
    if not data:
        return Thumb(None)
    try:
        opened = Image.open(io.BytesIO(data))
        opened.load()
    except (UnidentifiedImageError, OSError, ValueError):
        return Thumb(None)
    image: Image.Image = opened
    if is_placeholder(image):
        return Thumb(None, placeholder=True)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        image = flat
    image = image.convert("RGB")
    image.thumbnail((side, side))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=80)
    return Thumb(out.getvalue())


def _image_block(jpeg: bytes) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.b64encode(jpeg).decode(),
        },
    }


# ---------- the check ------------------------------------------------------------------------


def _mock_reply(found: list[engine.Candidate]) -> str:
    """Mock mode's answer, so the flow can be tried for free: scenes need fixing, the rest are
    fine (nothing was really looked at; the check says so)."""
    pictures = [
        {"image": c.number, "verdict": "fix" if c.kind == "scene" else "ok", "photo": 1,
         "note": "Mock mode: not really looked at."}
        for c in found
    ]  # fmt: skip
    return json.dumps({"pictures": pictures})


def check(
    html: str,
    product_photos: list[str],
    *,
    image_rules: str = "",
    generic_rules: list[str] | None = None,
) -> ProductCheck:
    """Looks at the page's pictures against the product's photos (one vision call, about two
    cents; none when there's nothing to look at)."""
    photos = _photos(product_photos)
    found, skipped = engine.candidates(
        html, product_photos=product_photos, generic_rules=generic_rules or []
    )
    now = datetime.now(UTC)
    base = ProductCheck(
        checked_at=now, fingerprint=engine.fingerprint(found), skipped=skipped.as_dict(),
        photos=len(photos),
    )  # fmt: skip
    if not photos:
        return base.model_copy(update={"reason": "no_product_photos"})
    with ThreadPoolExecutor(max_workers=6) as pool:
        refs = list(pool.map(lambda s: thumbnail(s, PHOTO_THUMB), photos))
        thumbs = list(pool.map(lambda c: thumbnail(c.src), found))
    readable = [(i + 1, t.jpeg) for i, t in enumerate(refs) if t.jpeg]
    if not readable:
        return base.model_copy(update={"reason": "photos_unreadable"})
    items: dict[int, ProductCheckItem] = {}
    ask: list[tuple[engine.Candidate, bytes]] = []
    for c, t in zip(found, thumbs, strict=True):
        if t.placeholder:
            items[c.number] = ProductCheckItem(number=c.number, src=c.src, verdict="placeholder")
        elif t.jpeg is None:
            items[c.number] = ProductCheckItem(number=c.number, src=c.src, verdict="unreadable")
        else:
            ask.append((c, t.jpeg))
    mock = False
    if ask:
        content: list[dict[str, Any]] = [{"type": "text", "text": "The real product's photos:"}]
        for n, jpeg in readable:
            content += [{"type": "text", "text": f"Product photo {n}"}, _image_block(jpeg)]
        content.append({"type": "text", "text": "The pictures on the page:"})
        for c, jpeg in ask:
            content += [{"type": "text", "text": f"Image {c.number}"}, _image_block(jpeg)]
        content.append(
            {"type": "text", "text": engine.prompt([c for c, _ in ask], len(readable), image_rules)}
        )
        result = anthropic.generate(
            role="vision",
            ledger_kind="vision",
            system=engine.SYSTEM,
            messages=[{"role": "user", "content": content}],
            json_schema=engine.reply_schema(),
            max_tokens=3000,
            mock_text=_mock_reply([c for c, _ in ask]),
        )
        mock = result.mock
        try:
            verdicts = engine.read_reply(result.json())
        except ValueError:
            verdicts = {}
        for c, _ in ask:
            verdict, photo, note = verdicts.get(c.number, ("ok", 1, ""))
            items[c.number] = ProductCheckItem(
                number=c.number, src=c.src, verdict=verdict,
                photo=photo if verdict == "fix" else None, note=note,
            )  # fmt: skip
    ordered = [items[c.number] for c in found if c.number in items]
    plan = engine.plan(found, _verdicts(ordered), len(photos))
    return base.model_copy(update={"items": ordered, "mock": mock, "over": plan.over})


def _verdicts(items: list[ProductCheckItem]) -> dict[int, tuple[engine.Verdict, int]]:
    return {i.number: ("fix", i.photo or 1) if i.verdict == "fix" else ("ok", 1) for i in items}


def fixes_for(html: str, product_photos: list[str], found: ProductCheck) -> list[engine.Fix]:
    """What a match would fix on the page as it is now: the check's `fix` pictures that still show
    the picture the check saw."""
    now = {i.number: i.src for i in image_edits.page_images(html)}
    current = [
        engine.Candidate(i.number, i.src, "scene")
        for i in found.items
        if i.verdict == "fix" and now.get(i.number) == i.src
    ]
    return engine.plan(current, _verdicts(found.items), len(_photos(product_photos))).fixes


# ---------- the fixes ------------------------------------------------------------------------


@dataclass(frozen=True)
class Made:
    fix: engine.Fix
    src: str | None  # the new picture (None when it couldn't be made)
    asset_id: UUID | None
    mock: bool
    error: str | None = None


def make(html: str, product_photos: list[str], fix: engine.Fix, org_id: UUID) -> Made:
    """One fix: the picture recreated with the product photo it names (fal's edit model), stored
    as one of the workspace's assets. Mock mode makes a free placeholder saying so."""
    photos = _photos(product_photos)
    reference = photos[min(fix.reference, len(photos)) - 1]
    width, height = image_ai.size_for(html, fix.numbers[0])
    try:
        result = fal.edit_image(
            prompt=engine.INSTRUCTION, image_urls=[fix.src, reference], width=width, height=height
        )
    except fal.ImagesNotConfiguredError:
        raise
    except Exception as exc:  # one picture failing doesn't stop the others
        return Made(fix, None, None, False, error=type(exc).__name__)
    if result.mock:
        label = f"PRODUCT MATCHED (MOCK)\nphoto {fix.reference}\n#{uuid.uuid4().hex[:4]}"
        data, mime = fal.mock_image(width, height, label=label), "image/jpeg"
    else:
        data, mime = result.data, result.mime
    asset = storage.store_asset(org_id, data, mime)
    return Made(fix, asset.url, asset.id, result.mock)


def _where(conn: Any, build: dict[str, Any], numbers: list[int], html: str) -> str:
    found = [i for i in image_edits.page_images(html) if i.number in numbers]
    sections = {i.section for i in found if i.section}
    if len(sections) != 1:
        return ""
    return images._where(conn, build, found[0])


def place(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    made: list[Made],
    *,
    wait: Callable[[float], None],
) -> tuple[int, int]:
    """Puts the new pictures on the page as it is now, as one undoable change, each a new version
    of its image; returns (pictures placed, the page's version). A picture whose image changed
    meanwhile is left alone. Waits while Buddy or a redraft works on the page."""
    ready = [m for m in made if m.src]
    deadline = time.monotonic() + image_ai.WAIT_SECONDS
    while True:
        with transaction() as conn:
            build = desk._load(conn, org_id, build_id, lock=True)
            if desk._redraft(conn, build_id) is None:
                if build["status"] not in desk.EDITABLE:
                    raise desk.DeskEditError(
                        "The page can't be changed now, so the pictures weren't placed."
                    )
                html = desk._page(build)
                now = {i.number: i.src for i in image_edits.page_images(html)}
                placed: list[tuple[int, str, Made]] = []
                for m in ready:
                    for number in m.fix.numbers:
                        if now.get(number) == m.fix.src and m.src:
                            html, before = image_edits.set_src(html, number, m.src)
                            placed.append((number, before, m))
                if not placed:
                    return 0, int(build["page_version"])
                count = len(placed)
                where = _where(conn, build, [n for n, _, _ in placed], html)
                reason = f"Matched the product in {count} picture{'' if count == 1 else 's'}{where}"
                stale = desk._change(conn, build, reason=reason, user_id=user_id, html=html)
                for number, before, m in placed:
                    images.record(
                        conn, build_id, number, before=before, src=m.src or "", source="edited",
                        asset_id=m.asset_id, prompt=engine.INSTRUCTION,
                    )  # fmt: skip
                if any(m.mock for _, _, m in placed):
                    conn.execute(
                        "update builds set mock_images = true where id = %(b)s", {"b": build_id}
                    )
                version = int(build["page_version"]) + 1
                break
        if time.monotonic() > deadline:
            raise desk.DeskEditError(
                "Buddy was still working on the page, so the pictures weren't placed. Try again."
            )
        wait(3)
    desk._remove(stale)
    return count, version


# ---------- the check kept on the build ------------------------------------------------------


def stored(build: dict[str, Any]) -> ProductCheck | None:
    raw = ((build.get("report") or {}).get("images") or {}).get("product_fix")
    if not isinstance(raw, dict) or "fingerprint" not in raw:
        return None
    try:
        return ProductCheck.model_validate(raw)
    except ValueError:
        return None


def store(conn: Any, build_id: UUID, found: ProductCheck) -> None:
    conn.execute(
        """
        update builds set report = jsonb_set(
          coalesce(report, '{}'::jsonb), '{images}',
          coalesce(report->'images', '{}'::jsonb) || jsonb_build_object('product_fix', %(c)s::jsonb)
        )
        where id = %(b)s
        """,
        {"b": build_id, "c": Jsonb(found.model_dump(mode="json"))},
    )


def rules(conn: Any, template_id: UUID) -> tuple[str, list[str]]:
    """The template's image rules (for the check's prompt) and its generic-picture rules."""
    row = conn.execute(
        "select instructions from templates where id = %(t)s", {"t": template_id}
    ).fetchone()
    instructions = (row["instructions"] if row else None) or {}
    generic = instructions.get("generic_images") or []
    return str(instructions.get("image_rules") or ""), [str(g) for g in generic if g]


def fingerprint_now(html: str, product_photos: list[str], generic_rules: list[str]) -> str:
    found, _ = engine.candidates(html, product_photos=product_photos, generic_rules=generic_rules)
    return engine.fingerprint(found)


# ---------- jobs and the studio's view -------------------------------------------------------


def running(conn: Any, build_id: UUID) -> dict[str, Any] | None:
    """The check or match queued or running on this page, if any."""
    row = conn.execute(
        """
        select id, payload from jobs
        where build_id = %(b)s and kind = %(k)s and status in ('queued', 'running')
        order by created_at desc limit 1
        """,
        {"b": build_id, "k": KIND},
    ).fetchone()
    return dict(row) if row else None


def _enqueue(conn: Any, org_id: UUID, build_id: UUID, user_id: UUID | None, fix: bool) -> UUID:
    job, _ = queue.enqueue(
        org_id=org_id,
        kind=KIND,
        payload={"build_id": str(build_id), "fix": fix},
        created_by=user_id,
        dedupe_key=f"fidelity:{build_id}",
        build_id=build_id,
        max_attempts=1,
        conn=conn,
    )
    return job.id


def price() -> str | None:
    found = cost.image_cost(get_settings().lp_fal_edit_model)
    return str(found) if found is not None else None


def match_state(
    conn: Any,
    org_id: UUID,
    build: dict[str, Any],
    html: str,
    user_id: UUID | None,
    *,
    ensure: bool = True,
) -> ProductMatch:
    """What the studio shows for Match product everywhere. With `ensure`, a check is queued when
    the last one is out of date (the pictures changed) and nothing's running: the check is
    automatic."""
    photos = images._product_photos(conn, org_id, build["id"])
    mock = get_settings().lp_mock_images
    if not photos:
        return ProductMatch(status="unavailable", reason="no_product_photos", mock=mock)
    job = running(conn, build["id"])
    found = stored(build)
    _, generic = rules(conn, build["template_id"])
    fresh = found is not None and found.fingerprint == fingerprint_now(html, photos, generic)
    if job is None and not fresh and ensure and build["status"] in desk.EDITABLE:
        job = {"id": _enqueue(conn, org_id, build["id"], user_id, fix=False), "payload": {}}
    counts: dict[str, Any] = {}
    if found is not None and fresh:
        counts = {
            "checked": len(
                [i for i in found.items if i.verdict not in ("unreadable", "placeholder")]
            ),
            "to_fix": len(fixes_for(html, photos, found)),
            "ok": found.count("ok") + found.count("no_product"),
            "fixed": found.count("fixed"),
        }
    if job is not None:
        fixing = bool((job.get("payload") or {}).get("fix"))
        return ProductMatch(
            status="fixing" if fixing else "checking", job_id=job["id"], price=price(), mock=mock,
            **counts,
        )  # fmt: skip
    return ProductMatch(status="ready", price=price(), mock=mock, **counts)


def studio_match(org_id: UUID, build_id: UUID, user_id: UUID | None) -> ProductMatch:
    """The page's Match product state for the image studio (queues the automatic check when the
    last one is out of date)."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        return match_state(conn, org_id, build, desk._page(build), user_id)


def matching_job(conn: Any, build_id: UUID) -> UUID | None:
    """The match (not a check) queued or running on the page, for the editor to follow."""
    job = running(conn, build_id)
    return job["id"] if job and (job.get("payload") or {}).get("fix") else None


def start(org_id: UUID, build_id: UUID, user_id: UUID | None) -> MatchStarted:
    """Match product everywhere: a job that fixes what the check found (checking first when the
    check is out of date). One check or match at a time per page."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        if build["status"] not in desk.EDITABLE:
            raise desk.DeskEditError(
                "This page can't be changed while it builds or after it failed."
            )
        if not images._product_photos(conn, org_id, build_id):
            raise desk.DeskEditError("The product has no photos to match the pictures to.")
        job = running(conn, build_id)
        if job is not None:
            if (job.get("payload") or {}).get("fix"):
                raise desk.DeskEditError("The product is already being matched on this page.")
            # A check is running: the match follows it (the check's job hands over).
            conn.execute(
                "update jobs set payload = payload || '{\"fix\": true}'::jsonb where id = %(j)s",
                {"j": job["id"]},
            )
            return MatchStarted(job_id=job["id"])
        return MatchStarted(job_id=_enqueue(conn, org_id, build_id, user_id, fix=True))
