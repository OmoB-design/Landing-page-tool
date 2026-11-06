"""Product fidelity (BUILD_SPEC §10.5, B3.2c, D116), the pure part: which of a page's pictures the
check looks at, what it's told, and which pictures to fix from its answer. No I/O here.

A picture is a candidate when it's a raster image the build numbered (`data-lp-img`) that could
show the product in a scene: not the brand's logo, not a product photo slot or one of the product's
own photos, not a picture the template keeps as it is (`data-lp-keep`) or wants generic
(`data-lp-generic`, or the template's `generic_images` rules), not an SVG and not under 160 px.
At most 30 are checked, in page order; at most 10 are fixed in one run, and pictures that show the
same source are fixed once.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Literal

from bs4 import Tag

from app.engines.clone_build import matches_rule
from app.engines.html import parse

MIN_SIDE = 160
MAX_CANDIDATES = 30
MAX_FIXES = 10
MAX_PHOTOS = 3

# What the edit model is asked for each fix (with the picture and one product photo).
INSTRUCTION = (
    "Recreate this exact image with the real product from the reference photo in place of the "
    "product shown: keep the same scene, framing, angle, light, people and everything else; "
    "change nothing but the product, and add no text."
)

SKIP_ATTRS = ("data-lp-logo", "data-lp-product", "data-lp-keep", "data-lp-generic")
_RASTER_DATA = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,", re.I)

Verdict = Literal["fix", "ok", "no_product"]


@dataclass(frozen=True)
class Candidate:
    number: int
    src: str
    kind: str  # person, scene or image
    alt: str = ""


@dataclass
class Skipped:
    kept: int = 0  # logos, product photos, kept or generic pictures
    vector: int = 0
    small: int = 0
    over: int = 0  # past the 30 checked

    def as_dict(self) -> dict[str, int]:
        return {"kept": self.kept, "vector": self.vector, "small": self.small, "over": self.over}


@dataclass(frozen=True)
class Fix:
    """One picture to fix, and every image on the page that shows it."""

    src: str
    numbers: tuple[int, ...]
    reference: int  # the product photo to use, from 1


@dataclass
class Plan:
    fixes: list[Fix] = field(default_factory=list)
    # Pictures the check wanted fixed past the 10 a run fixes.
    over: int = 0


def _size(img: Tag) -> int:
    try:
        return max(int(str(img.get("width") or 0)), int(str(img.get("height") or 0)))
    except ValueError:
        return 0


def _is_vector(src: str) -> bool:
    plain = src.split("?", 1)[0].lower()
    return plain.endswith(".svg") or src.lower().startswith("data:image/svg")


def candidates(
    html: str, *, product_photos: list[str] | None = None, generic_rules: list[str] | None = None
) -> tuple[list[Candidate], Skipped]:
    """The pictures to check, in page order, and how many were left out (and why)."""
    soup = parse(html)
    photos = set(product_photos or [])
    out: list[Candidate] = []
    skipped = Skipped()
    for img in soup.select("img[data-lp-img]"):
        if not isinstance(img, Tag) or not str(img.get("data-lp-img", "")).isdigit():
            continue
        src = str(img.get("src") or "").strip()
        if (
            not src
            or any(img.has_attr(a) for a in SKIP_ATTRS)
            or src in photos
            or (bool(generic_rules) and matches_rule(img, soup, generic_rules or []))
        ):
            skipped.kept += 1
            continue
        if _is_vector(src) or (src.startswith("data:") and not _RASTER_DATA.match(src)):
            skipped.vector += 1
            continue
        size = _size(img)
        if 0 < size < MIN_SIDE:
            skipped.small += 1
            continue
        if len(out) >= MAX_CANDIDATES:
            skipped.over += 1
            continue
        kind = (
            "person" if img.has_attr("data-lp-person") else
            "scene" if img.has_attr("data-lp-scene") else "image"
        )  # fmt: skip
        out.append(Candidate(int(str(img["data-lp-img"])), src, kind, str(img.get("alt") or "")))
    return out, skipped


def fingerprint(found: list[Candidate]) -> str:
    """What the check saw (each picture's number and address): a check whose fingerprint differs
    from the page's is out of date."""
    raw = json.dumps([[c.number, c.src] for c in found], separators=(",", ":"))
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def plan(found: list[Candidate], verdicts: dict[int, tuple[Verdict, int]], photos: int) -> Plan:
    """The fixes for the pictures the check marked `fix`: one per source (every image showing it
    is fixed by the same picture), in page order, at most 10; each with a product photo that
    exists (the first, when the check named one that doesn't)."""
    by_src: dict[str, list[int]] = {}
    refs: dict[str, int] = {}
    for c in found:
        verdict, reference = verdicts.get(c.number, ("ok", 1))
        if verdict != "fix":
            continue
        if c.src not in by_src:
            by_src[c.src] = []
            refs[c.src] = reference if 1 <= reference <= max(photos, 1) else 1
        by_src[c.src].append(c.number)
    items = list(by_src.items())
    return Plan(
        fixes=[Fix(src, tuple(numbers), refs[src]) for src, numbers in items[:MAX_FIXES]],
        over=max(0, len(items) - MAX_FIXES),
    )


SYSTEM = """You check the pictures on a product landing page against the real product.

You see the product's own photos first, then each picture on the page, labelled with its image \
number. For every picture, decide:
- "fix": it shows a product that is meant to be this product but doesn't look like it (a \
generic or different bottle, box, can, shoe or pack, another brand's product, the wrong colour \
or shape). It will be recreated with the real product.
- "ok": it shows this product as it really looks, closely enough.
- "no_product": no product is shown, or the product isn't the point (a person on their own, a \
place, food, an icon, a chart, a screenshot, text).
For "fix", say which product photo (its number) shows the product best from that angle. Be \
conservative: when unsure, answer "ok" or "no_product"; a fix costs money and changes the picture. \
Keep each note under 12 words, plain English, saying what you saw."""


def prompt(found: list[Candidate], photos: int, image_rules: str = "") -> str:
    """The words after the pictures: what to answer for."""
    numbers = ", ".join(str(c.number) for c in found)
    rules = f"\n\nTEMPLATE IMAGE RULES:\n{image_rules.strip()}" if image_rules.strip() else ""
    return f"The product photos are 1 to {photos}. Answer for every picture: {numbers}.{rules}"


def reply_schema() -> dict[str, object]:
    return {
        "type": "object",
        "properties": {
            "pictures": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "image": {"type": "integer"},
                        "verdict": {"type": "string", "enum": ["fix", "ok", "no_product"]},
                        "photo": {"type": "integer"},
                        "note": {"type": "string"},
                    },
                    "required": ["image", "verdict", "photo", "note"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["pictures"],
        "additionalProperties": False,
    }


def read_reply(reply: object) -> dict[int, tuple[Verdict, int, str]]:
    """The check's answer as {image number: (verdict, product photo, note)}; anything unreadable
    is left out (so it counts as "ok")."""
    out: dict[int, tuple[Verdict, int, str]] = {}
    pictures = reply.get("pictures") if isinstance(reply, dict) else None
    for item in pictures if isinstance(pictures, list) else []:
        if not isinstance(item, dict):
            continue
        verdict = item.get("verdict")
        try:
            number, photo = int(str(item.get("image"))), int(str(item.get("photo") or 1))
        except (TypeError, ValueError):
            continue
        if verdict in ("fix", "ok", "no_product"):
            out[number] = (verdict, photo, " ".join(str(item.get("note") or "").split())[:120])
    return out
