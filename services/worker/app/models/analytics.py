"""Analytics (B1.6b, BUILD_SPEC §14): what the workspace spent and built over a period."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

AnalyticsRange = Literal["30d", "90d", "12m"]


class SpendPoint(BaseModel):
    # The day, week (its Monday) or month (its 1st) the spend falls in.
    start: date
    spend_usd: Decimal


class Share(BaseModel):
    """One slice of the spend (a brand, a template, a kind of call)."""

    key: str
    label: str
    spend_usd: Decimal


class StatusCount(BaseModel):
    status: str
    count: int


class AnalyticsState(BaseModel):
    range: AnalyticsRange
    since: date
    bucket: Literal["day", "week", "month"]
    spend_usd: Decimal
    pages_built: int
    # Over the pages built in the period that cost anything; None when none did.
    average_page_cost_usd: Decimal | None
    pages_published: int
    spend_over_time: list[SpendPoint]
    by_brand: list[Share]
    by_template: list[Share]
    by_kind: list[Share]
    pages_by_status: list[StatusCount]
