"""The Top 5 ranking's competitor slots (BUILD_SPEC §8.7, D53, D102). Pure: HTML and the pulled
competitors in, the page with ranks #2 to #5 filled plus stats out.

A ranking template marks each competitor entry `data-lp-rank="<2..5>"` and, inside it, the
fields to fill: `data-lp-rank-name`, `-price`, `-summary`, the rating (`-rating` holding
`-rating-value`, `-rating-count` and `-stars`), the claims list (`-claims`, its first child
cloned per claim, text in `-claim-text`), a review (`-quote` with `-quote-text` and
`-quote-author`) and `img[data-lp-rank-image]`. A comparison table row is
`tr[data-lp-rank-row="<n>"]` with the same name, price and rating-value cells. Anything with
no data is removed, so the page never shows a made-up figure. A rank whose page couldn't be read
loses its section and row; `data-lp-number` renumbers the rest. Filled entries are locked
(`data-lp-lock`) so the copy pass never rewrites a competitor's own words.
"""

import copy
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from bs4 import BeautifulSoup, Tag

from app.engines.html import parse, serialize, set_text

RANKS = (2, 3, 4, 5)
MAX_CLAIMS = 4
QUOTE_CHARS = 220
LETTERS = {2: "B", 3: "C", 4: "D", 5: "E"}
# A host's name ("ritual" from ritual.com) is only treated as a brand name from this length.
MIN_NAME = 3
# Where a product title's own name ends: "The Manhattan - Oatmeal", "Capri X Sneaker in White".
TITLE_BREAK = re.compile(r"\s+(?:[-|/:\u2013\u2014]|in|by)\s+", re.IGNORECASE)
# Words a title starts with that aren't its name: "The", "Men's", "Women's".
TITLE_LEAD = re.compile(r"^(?:the|unisex|(?:wo)?men['\u2019]?s|kids['\u2019]?)\s+", re.IGNORECASE)


def neutral_label(rank: int) -> str:
    """The name a competitor goes by with neutral naming: "Brand B" for #2, up to "Brand E"."""
    return f"Brand {LETTERS[rank]}"


def name_forms(title: str | None) -> list[str]:
    """A product title and the shorter forms copy calls it by: "Men's Alta High Top - Mid Grey"
    gives itself, "Men's Alta High Top" and "Alta High Top". A form without its leading words
    must keep two words, so a plain word ("Military" from "Men's Military") is never replaced
    wherever it appears."""
    title = (title or "").strip()
    if not title:
        return []
    head = TITLE_BREAK.split(title, maxsplit=1)[0].strip()
    bare = head
    while (shorter := TITLE_LEAD.sub("", bare)) != bare:
        bare = shorter
    forms = [title, head] + ([bare] if len(bare.split()) >= 2 else [])
    return list(dict.fromkeys(f for f in forms if f))


def neutralise(text: str, names: list[str], label: str) -> str:
    """`text` with the competitor's own names (product, vendor, site) replaced by its label,
    longest first, whole words only, any case: so a quoted claim or review can't name them."""
    out = text
    for name in sorted({n.strip() for n in names if n and len(n.strip()) >= MIN_NAME}, key=len,
                       reverse=True):  # fmt: skip
        out = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", label, out, flags=re.IGNORECASE)
    return out


@dataclass
class RankEntry:
    rank: int
    name: str  # what the page shows: the label, or the real product name
    price: str | None = None  # formatted, e.g. "$39.00"
    summary: str | None = None
    rating: Decimal | None = None
    best: Decimal | None = None
    count: int | None = None
    claims: list[str] = field(default_factory=list)
    quote: str | None = None
    quote_author: str | None = None
    image_url: str | None = None  # None keeps the template's silhouette


def _fill(scope: Tag, attr: str, text: str | None) -> None:
    for el in scope.select(f"[{attr}]"):
        if text:
            set_text(el, text)
        else:
            el.decompose()


def shorten(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:-")
    return f"{cut}…"


def _rating_value(entry: RankEntry) -> str | None:
    return f"{entry.rating.normalize():f}" if entry.rating is not None else None


def _fill_entry(scope: Tag, entry: RankEntry) -> dict[str, int]:
    _fill(scope, "data-lp-rank-name", entry.name)
    _fill(scope, "data-lp-rank-price", entry.price)
    _fill(scope, "data-lp-rank-summary", entry.summary)

    for block in scope.select("[data-lp-rank-rating]"):
        if entry.rating is None:
            block.decompose()
            continue
        _fill(block, "data-lp-rank-rating-value", _rating_value(entry))
        count = f"{entry.count:,} {'review' if entry.count == 1 else 'reviews'}" if entry.count \
            else None  # fmt: skip
        _fill(block, "data-lp-rank-rating-count", count)
        best = entry.best or Decimal(5)
        share = max(Decimal(0), min(Decimal(100), entry.rating / best * 100))
        for stars in block.select("[data-lp-rank-stars]"):
            stars["style"] = f"--rating: {share.quantize(Decimal(1))}%"

    claims = [c for c in entry.claims if c.strip()][:MAX_CLAIMS]
    for block in scope.select("[data-lp-rank-claims]"):
        rows = [child for child in block.children if isinstance(child, Tag)]
        if not claims or not rows:
            block.decompose()
            continue
        model = rows[0]
        for row in rows:
            row.extract()
        for claim in claims:
            row = copy.copy(model)
            target = row.select_one("[data-lp-rank-claim-text]") or row
            set_text(target, claim)
            block.append(row)

    for block in scope.select("[data-lp-rank-quote]"):
        if not entry.quote:
            block.decompose()
            continue
        _fill(block, "data-lp-rank-quote-text", shorten(entry.quote, QUOTE_CHARS))
        _fill(block, "data-lp-rank-quote-author", entry.quote_author)

    for img in scope.select("img[data-lp-rank-image]"):
        if entry.image_url:
            img["src"] = entry.image_url
            img["alt"] = entry.name
            img.attrs.pop("srcset", None)
        else:
            img["alt"] = f"{entry.name} (product not shown)"
    return {
        "claims": len(claims),
        "rating": int(entry.rating is not None),
        "quote": int(bool(entry.quote)),
    }


def _fill_row(row: Tag, entry: RankEntry) -> None:
    _fill(row, "data-lp-rank-name", entry.name)
    for attr, text in (
        ("data-lp-rank-price", entry.price),
        ("data-lp-rank-rating-value", _rating_value(entry)),
    ):
        for cell in row.select(f"[{attr}]"):
            set_text(cell, text or "—")


def _section_of(tag: Tag) -> Tag:
    if tag.has_attr("data-lp-section"):
        return tag
    parent = tag.find_parent(attrs={"data-lp-section": True})
    return parent if isinstance(parent, Tag) else tag


def fill_ranking(html: str, entries: list[RankEntry]) -> tuple[str, dict[str, Any]]:
    soup: BeautifulSoup = parse(html)
    by_rank = {entry.rank: entry for entry in entries}
    stats: dict[str, Any] = {"filled": [], "removed": [], "claims": 0, "ratings": 0, "quotes": 0,
                             "slots_missing": []}  # fmt: skip
    for rank in RANKS:
        slots = soup.select(f'[data-lp-rank="{rank}"]')
        rows = soup.select(f'tr[data-lp-rank-row="{rank}"]')
        entry = by_rank.get(rank)
        if not slots:
            stats["slots_missing"].append(rank)
        if entry is None:
            for slot in slots:
                section = _section_of(slot)
                if section.parent is not None:
                    section.decompose()
            for row in rows:
                row.decompose()
            if slots or rows:
                stats["removed"].append(rank)
            continue
        for slot in slots:
            counts = _fill_entry(slot, entry)
            slot["data-lp-lock"] = ""
            stats["claims"] += counts["claims"]
            stats["ratings"] += counts["rating"]
            stats["quotes"] += counts["quote"]
        for row in rows:
            _fill_row(row, entry)
            row["data-lp-lock"] = ""
        if slots or rows:
            stats["filled"].append(rank)
    return serialize(soup), stats
