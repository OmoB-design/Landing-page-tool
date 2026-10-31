"""Analytics (B1.6b, BUILD_SPEC §14): the workspace's AI spend over 30 days, 90 days or 12 months
(by day, week or month), split by brand, template and kind of call, with the pages built in the
period by status and their average cost. Spend comes from the ledger (trashed pages' spend still
counts: it was spent); pages exclude the trashed ones.
"""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import transaction
from app.models.analytics import (
    AnalyticsRange,
    AnalyticsState,
    Share,
    SpendPoint,
    StatusCount,
)

RANGES: dict[str, tuple[str, str]] = {
    # range: (how far back, bucket)
    "30d": ("30 days", "day"),
    "90d": ("90 days", "week"),
    "12m": ("12 months", "month"),
}
KIND_LABELS = {
    "copy": "Copy",
    "vision": "Vision",
    "analysis": "Analysis",
    "image": "Images",
    "edit": "Edits",
    "agent": "Agent",
    "other": "Other",
}


def _shares(rows: list[Any]) -> list[Share]:
    return [
        Share(key=str(r["key"]), label=r["label"], spend_usd=Decimal(r["spend"]))
        for r in rows
        if r["spend"]
    ]


def analytics(org_id: UUID, range_: AnalyticsRange) -> AnalyticsState:
    back, bucket = RANGES[range_]
    with transaction() as conn:
        row = conn.execute(
            "select date_trunc(%(bucket)s, (now() at time zone 'utc') - %(back)s::interval)::date"
            " as since",
            {"bucket": bucket, "back": back},
        ).fetchone()
        assert row is not None
        since: date = row["since"]
        params = {"o": org_id, "since": since, "bucket": bucket}
        spend_rows = conn.execute(
            """
            select s.start::date as start, coalesce(sum(l.cost_usd), 0) as spend
            from generate_series(%(since)s::timestamp,
                                 date_trunc(%(bucket)s, now() at time zone 'utc'),
                                 ('1 ' || %(bucket)s)::interval) as s(start)
            left join ledger_entries l
              on l.org_id = %(o)s
             and date_trunc(%(bucket)s, l.created_at at time zone 'utc') = s.start
            group by s.start order by s.start
            """,
            params,
        ).fetchall()
        in_period = "l.org_id = %(o)s and l.created_at >= %(since)s::timestamp at time zone 'utc'"
        by_brand = conn.execute(
            f"""
            select coalesce(l.brand_id::text, 'none') as key,
                   coalesce(b.name, case when l.brand_id is null then 'No brand'
                                         else 'Deleted brand' end) as label,
                   sum(l.cost_usd) as spend
            from ledger_entries l left join brands b on b.id = l.brand_id
            where {in_period}
            group by 1, 2 order by spend desc nulls last
            """,
            params,
        ).fetchall()
        by_template = conn.execute(
            f"""
            select coalesce(t.id::text, 'none') as key,
                   coalesce(t.name, 'No page') as label, sum(l.cost_usd) as spend
            from ledger_entries l
            left join builds bu on bu.id = l.build_id
            left join templates t on t.id = bu.template_id
            where {in_period}
            group by 1, 2 order by spend desc nulls last
            """,
            params,
        ).fetchall()
        by_kind = conn.execute(
            f"""
            select l.kind::text as key, l.kind::text as label, sum(l.cost_usd) as spend
            from ledger_entries l where {in_period}
            group by 1, 2 order by spend desc nulls last
            """,
            params,
        ).fetchall()
        pages = conn.execute(
            """
            select status::text as status, count(*) as n,
                   sum(cost_usd) filter (where cost_usd > 0) as cost,
                   count(*) filter (where cost_usd > 0) as costed
            from builds
            where org_id = %(o)s and deleted_at is null
              and created_at >= %(since)s::timestamp at time zone 'utc'
            group by status
            """,
            params,
        ).fetchall()
    built = sum(int(p["n"]) for p in pages)
    costed = sum(int(p["costed"]) for p in pages)
    cost = sum((Decimal(p["cost"]) for p in pages if p["cost"] is not None), Decimal(0))
    order = ["needs_review", "approved", "published", "building", "queued", "failed"]
    statuses = sorted(pages, key=lambda p: order.index(p["status"]) if p["status"] in order else 9)
    return AnalyticsState(
        range=range_,
        since=since,
        bucket=bucket,  # type: ignore[arg-type]  # one of RANGES' buckets
        spend_usd=sum((Decimal(r["spend"]) for r in spend_rows), Decimal(0)),
        pages_built=built,
        average_page_cost_usd=(cost / costed).quantize(Decimal("0.0001")) if costed else None,
        pages_published=next((int(p["n"]) for p in pages if p["status"] == "published"), 0),
        spend_over_time=[
            SpendPoint(start=r["start"], spend_usd=Decimal(r["spend"])) for r in spend_rows
        ],
        by_brand=_shares(by_brand),
        by_template=_shares(by_template),
        by_kind=[
            s.model_copy(update={"label": KIND_LABELS.get(s.key, s.label)})
            for s in _shares(by_kind)
        ],
        pages_by_status=[StatusCount(status=p["status"], count=int(p["n"])) for p in statuses],
    )
