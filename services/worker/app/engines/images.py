"""Image slots (BUILD_SPEC §10.2 `prepare_media_slots`, §10.4 image pass plumbing). Pure.

The planner and real image providers arrive in B1.3; these helpers find and number the slots,
work out their sizes, and write the chosen images in.
"""

import re
from dataclasses import dataclass
from typing import Literal

from bs4 import Tag

from app.engines.html import parse, serialize

SlotKind = Literal["product", "scene", "person", "logo", "keep", "other"]
PLACEHOLDER = (
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20"
    "width%3D%2216%22%20height%3D%229%22%2F%3E"
)
DEFAULT_SIZES: dict[str, tuple[int, int]] = {
    "product": (800, 800),
    "scene": (1200, 900),  # 4:3, the spec's default scene ratio
    "person": (256, 256),
}
MAX_SIDE = 1600


def prepare_media_slots(html: str) -> tuple[str, dict[str, object]]:
    """`.lp-media-slot` placeholders (videos and animations in the source) become scene image
    slots that keep the slot's aspect ratio and radius, for the image pass to fill."""
    soup = parse(html)
    slots = [
        t for t in soup.find_all(class_="lp-media-slot")
        if isinstance(t, Tag) and "display:none" not in str(t.get("style", "")).replace(" ", "")
    ]  # fmt: skip
    for slot in slots:
        aspect = str(slot.get("data-aspect") or "4/3")
        radius = str(slot.get("data-radius") or "0")
        image = soup.new_tag(
            "img",
            attrs={
                "class": "lp-scene-slot",
                "data-lp-scene": "",
                "data-aspect": aspect,
                "src": PLACEHOLDER,
                "alt": "",
                "style": (
                    f"width: 100%; aspect-ratio: {aspect}; object-fit: cover; "
                    f"border-radius: {radius};"
                ),
            },
        )
        slot.replace_with(image)
    return serialize(soup), {"media_slots": len(slots)}


@dataclass(frozen=True)
class Slot:
    number: int
    kind: SlotKind
    width: int
    height: int


def slot_kind(img: Tag) -> SlotKind:
    for attr, kind in (
        ("data-lp-keep", "keep"), ("data-lp-logo", "logo"), ("data-lp-product", "product"),
        ("data-lp-person", "person"), ("data-lp-scene", "scene"),
    ):  # fmt: skip
        if img.has_attr(attr):
            return kind  # type: ignore[return-value]
    return "other"


def _aspect(value: str) -> float | None:
    match = re.match(r"^\s*([\d.]+)\s*/\s*([\d.]+)\s*$", value)
    if match and float(match.group(2)):
        return float(match.group(1)) / float(match.group(2))
    return None


def slot_size(img: Tag, kind: SlotKind) -> tuple[int, int]:
    """The pixel size to generate for a slot: its width/height attributes, else its aspect
    ratio on the default width, else the default for its kind. Capped at 1600 px."""
    default_w, default_h = DEFAULT_SIZES.get(kind, (800, 600))
    try:
        width, height = int(str(img.get("width"))), int(str(img.get("height")))
    except ValueError:
        width, height = 0, 0
    if not (width and height):
        aspect = _aspect(str(img.get("data-aspect") or ""))
        width, height = (default_w, round(default_w / aspect)) if aspect else (default_w, default_h)
    if kind == "person":
        side = max(256, min(512, max(width, height) * 2))
        return side, side
    scale = min(1.0, MAX_SIDE / max(width, height))
    return max(64, round(width * scale)), max(64, round(height * scale))


def number_slots(html: str) -> tuple[str, list[Slot]]:
    """Gives every `<img>` a stable `data-lp-img` number (keeping existing ones) and lists the
    slots in document order."""
    soup = parse(html)
    images = [t for t in soup.find_all("img") if isinstance(t, Tag)]
    taken = {int(str(i["data-lp-img"])) for i in images if str(i.get("data-lp-img", "")).isdigit()}
    next_number = max(taken, default=0) + 1
    slots: list[Slot] = []
    for img in images:
        if not str(img.get("data-lp-img", "")).isdigit():
            img["data-lp-img"] = str(next_number)
            next_number += 1
        kind = slot_kind(img)
        width, height = slot_size(img, kind)
        slots.append(Slot(int(str(img["data-lp-img"])), kind, width, height))
    return serialize(soup), slots


def apply_images(
    html: str, chosen: dict[int, str], *, drop: set[int] | None = None
) -> tuple[str, dict[str, object]]:
    """Writes the chosen image URL into each numbered slot; slots in `drop` are removed (a
    failed scene or person is dropped, never replaced with a packshot: D22)."""
    soup = parse(html)
    replaced = dropped = 0
    for img in soup.select("img[data-lp-img]"):
        if not isinstance(img, Tag) or not str(img["data-lp-img"]).isdigit():
            continue
        number = int(str(img["data-lp-img"]))
        if drop and number in drop:
            img.decompose()
            dropped += 1
        elif number in chosen:
            img["src"] = chosen[number]
            for attr in ("srcset", "sizes", "loading"):
                if attr in img.attrs:
                    del img[attr]
            replaced += 1
    return serialize(soup), {"replaced": replaced, "dropped": dropped}
