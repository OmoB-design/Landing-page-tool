"""`write_report` (BUILD_SPEC §10.2, §10.6): the final page becomes `working.html`, the report
is stored on the build, and the build is ready for review."""

from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb

from app.db import transaction
from app.pipeline.runtime import BUCKET, PipelineContext, build_prefix, node, read_page
from app.pipeline.state import BuildState
from app.providers import storage


def _money(value: Decimal | None) -> float:
    return float(value or 0)


@node("write_report", "Wrote the report")
def write_report(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    path = f"{build_prefix(state['org_id'], state['build_id'])}/working.html"
    storage.upload(
        BUCKET, path, read_page(state).encode("utf-8"), "text/html; charset=utf-8", upsert=True
    )
    with transaction() as conn:
        rows = conn.execute(
            """
            select kind, node, coalesce(sum(cost_usd), 0) as cost from ledger_entries
            where build_id = %(b)s and org_id = %(o)s group by kind, node
            """,
            {"b": ctx.build_id, "o": ctx.org_id},
        ).fetchall()
    by_kind: dict[str, float] = {}
    by_node: dict[str, float] = {}
    for row in rows:
        by_kind[row["kind"]] = by_kind.get(row["kind"], 0) + _money(row["cost"])
        by_node[row["node"] or "other"] = by_node.get(row["node"] or "other", 0) + _money(
            row["cost"]
        )
    images = state.get("images", {})
    report: dict[str, Any] = {
        "mode": state["origin"],
        "template": {k: state["template"][k] for k in ("id", "slug", "name", "type", "version")},
        "status": "needs_review",
        "verdict": (state["template"].get("source") or {}).get("verdict"),
        "targeting": state.get("targeting", {}),
        "layout": state.get("layout", {}),
        "brand": state.get("brand_stats", {}),
        "copy": state.get("copy", {}),
        "images": images,
        "finalize": state.get("finalize", {}),
        "compliance": state.get("compliance", {}),
        # Clones only (B2.3): what the clone steps removed, and the source leaks left.
        **(
            {
                "blueprint": state.get("blueprint_stats", {}),
                "residue": state.get("residue", {}),
                "source": state["template"].get("source", {}),
            }
            if state["origin"] == "cloned"
            else {}
        ),
        "cost": {
            "total_usd": round(sum(by_kind.values()), 6),
            "breakdown_by_kind": by_kind,
            "breakdown_by_node": by_node,
        },
        "mock_images": bool(images.get("mock")),
        "warnings": state.get("warnings", []),
        "nodes": [r["node"] for r in state.get("node_reports", [])] + ["write_report"],
    }
    with transaction() as conn:
        conn.execute(
            """
            update builds set working_html_path = %(path)s, report = %(report)s,
              status = 'needs_review', mock_images = %(mock)s
            where id = %(b)s and org_id = %(o)s
            """,
            {
                "path": path,
                "report": Jsonb(report),
                "mock": report["mock_images"],
                "b": ctx.build_id,
                "o": ctx.org_id,
            },
        )
    return {"report": report, "_stats": {"cost_usd": report["cost"]["total_usd"]}}
