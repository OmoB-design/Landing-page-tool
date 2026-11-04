"""A Top 5 ranking build's competitors (BUILD_SPEC §8.7, D53, D102): what each competitor's
product page says, as stored in `build_competitors` and carried in the build's state."""

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.product import Review

Naming = Literal["neutral", "real"]


class CompetitorClaims(BaseModel):
    """The AI pass's structured output: what the page itself says about its product."""

    summary: str
    claims: list[str]


class Competitor(BaseModel):
    """One competitor of a ranking build. With neutral naming, `label` is what the page shows
    and every text field has the competitor's own names replaced by it."""

    rank: int = Field(ge=2, le=5)
    url: str
    status: Literal["pulled", "failed"]
    error: str | None = None
    label: str
    name: str | None = None
    vendor: str | None = None
    currency: str | None = None
    price: Decimal | None = None
    sale_price: Decimal | None = None
    image_asset_id: UUID | None = None
    image_url: str | None = None
    summary: str | None = None
    claims: list[str] = Field(default_factory=list)
    rating: Decimal | None = None
    rating_best: Decimal | None = None
    rating_count: int | None = None
    reviews: list[Review] = Field(default_factory=list)
    pull_source: str | None = None
    warnings: list[str] = Field(default_factory=list)


class Sourced(BaseModel):
    """A sentence or table cell and the facts it rests on, by id ("2.c1", "1.price"; see
    `engines.comparison`)."""

    text: str
    sources: list[str]


class RankTake(BaseModel):
    """'Our take' on one competitor (B2.4b, D103): what stands out, and a fair trade-off."""

    rank: int
    stands_out: Sourced
    worth_knowing: Sourced


class ComparisonCell(BaseModel):
    rank: int
    text: str
    sources: list[str]


class ComparisonAxis(BaseModel):
    """One point the table compares (materials, returns…), with a cell per product, #1 included."""

    name: str
    cells: list[ComparisonCell]


class Comparison(BaseModel):
    """A ranking page's comparison, written by one AI call from the products' facts only."""

    takes: list[RankTake]
    axes: list[ComparisonAxis]
