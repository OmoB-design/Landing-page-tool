"""What a finished step found (I3): a short line and up to four colours, shown under the step in
the job's checklist while the rest of the job runs. It rides on the step's progress event as
`data.found`, so the web needs no per-job knowledge to show it."""

from collections.abc import Iterable
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.engines.colors import parse_color, to_hex

MAX_COLORS = 4
MAX_TEXT = 80


class Found(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=MAX_TEXT)
    colors: list[str] = Field(default_factory=list, max_length=MAX_COLORS)


def found(text: str | None = None, colors: Iterable[str | None] = ()) -> dict[str, Any] | None:
    """`data.found` for a progress event, or None when the step found nothing worth showing.
    Colours are normalised to `#rrggbb`, deduplicated and capped; anything unparseable is
    dropped. The text is trimmed to one short line."""
    hexes: list[str] = []
    for raw in colors:
        rgb = parse_color(raw) if raw else None
        if rgb is None:
            continue
        value = to_hex(rgb)
        if value not in hexes:
            hexes.append(value)
        if len(hexes) == MAX_COLORS:
            break
    line = " ".join(text.split()) if text else ""
    if len(line) > MAX_TEXT:
        line = line[: MAX_TEXT - 1].rstrip() + "…"
    if not line and not hexes:
        return None
    return Found(text=line or None, colors=hexes).model_dump()
