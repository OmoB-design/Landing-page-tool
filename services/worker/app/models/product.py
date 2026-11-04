"""Products (BUILD_SPEC §7.2, §7.4, §7.5). `PulledProduct` is what `product_pull` reads from the
store or page; `ProductEnrichment` and `Briefing` are the AI passes' structured outputs. Field
names match the `products` table and its JSON columns where they overlap."""

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

PullSource = Literal["shopify_json", "jsonld", "og", "h1"]


class ProductImage(BaseModel):
    source_url: str
    alt: str | None = None
    asset_id: UUID | None = None


class ProductVariant(BaseModel):
    name: str
    options: dict[str, str] = Field(default_factory=dict)
    price: Decimal | None = None
    compare_at_price: Decimal | None = None
    available: bool | None = None
    image_source_url: str | None = None
    image_asset_id: UUID | None = None


class PricingLine(BaseModel):
    """A way to buy other than one-off, e.g. a subscription from a Shopify selling plan."""

    label: str
    group: str | None = None
    price: Decimal | None = None
    compare_at_price: Decimal | None = None


class PulledProduct(BaseModel):
    handle: str
    name: str
    url: str
    vendor: str | None = None
    product_type: str | None = None
    currency: str | None = None
    # `price` is the regular price; `sale_price` is set only when the product sells for less.
    price: Decimal | None = None
    sale_price: Decimal | None = None
    description: str | None = None
    images: list[ProductImage] = Field(default_factory=list)
    variants: list[ProductVariant] = Field(default_factory=list)
    pricing_lines: list[PricingLine] = Field(default_factory=list)
    pull_source: PullSource


class Review(BaseModel):
    """One customer review a page publishes in its structured data (JSON-LD `Review`)."""

    body: str = Field(max_length=600)
    title: str | None = Field(default=None, max_length=200)
    author: str | None = Field(default=None, max_length=120)
    rating: Decimal | None = None
    best: Decimal | None = None


class ReviewSummary(BaseModel):
    """A product page's rating and reviews (JSON-LD `AggregateRating` and `Review`), for the
    Top 5 ranking's competitors (B2.4a). Everything is optional: many pages publish none."""

    rating: Decimal | None = None
    best: Decimal | None = None
    count: int | None = None
    reviews: list[Review] = Field(default_factory=list)


class ProductSpec(BaseModel):
    label: str
    value: str


class ProductEnrichment(BaseModel):
    """The enrichment pass's output (structured output schema)."""

    description: str
    usps: list[str]
    specs: list[ProductSpec]
    selling_context: str


class Audience(BaseModel):
    name: str
    description: str


class Briefing(BaseModel):
    """The wizard briefing (BUILD_SPEC §7.5): four audiences plus benefits, features and
    objections. Cached in `product_strategy` with kind `briefing`."""

    audiences: list[Audience]
    benefits: list[str]
    features: list[str]
    objections: list[str]
