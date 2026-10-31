"""`regenerate_variants` (BUILD_SPEC §10.2): one picker unit per product option."""

from typing import Any

from app.engines.brand_parts import VariantUnit
from app.engines.brand_parts import regenerate_variants as engine
from app.engines.money import format_price
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("regenerate_variants", "Built the product options")
def regenerate_variants(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    product = state["product"]
    currency = product["currency"]
    units = [
        VariantUnit(v["name"], format_price(v["price"], currency), v["image_url"])
        for v in product["variants"]
    ] or [
        VariantUnit(
            product["name"], format_price(product["sale_price"] or product["price"], currency)
        )
    ]
    html, stats = engine(read_page(state), units)
    warnings = (
        [f"The picker shows the first 8 of {len(units)} options."] if stats["truncated"] else []
    )
    # D100: a clone's option picker isn't rebuilt yet; it keeps the source's layout, reworded.
    if state["origin"] == "cloned" and state["template"]["blueprint"].get("variant_sections"):
        warnings.append(
            "The source's product options keep their layout with new words; check their names "
            "and prices on the page."
        )
    return {
        **write_page(state, "regenerate_variants", html),
        "brand_stats": {**state.get("brand_stats", {}), "variants": stats},
        "_stats": stats,
        "_warnings": warnings,
    }
