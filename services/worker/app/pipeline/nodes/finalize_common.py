"""`finalize_common` (BUILD_SPEC §10.2): meta, favicon, emails, FAQ, prices, selling points."""

from typing import Any

from app.engines.finalize import FinalizeInputs
from app.engines.finalize import finalize_common as engine
from app.engines.money import format_price
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("finalize_common", "Finished the page")
def finalize_common(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand, product = state["brand"], state["product"]
    currency = product["currency"]
    on_sale = product["sale_price"] is not None
    current = product["sale_price"] if on_sale else product["price"]
    description = brand["meta_description"] or product["description"] or brand["tagline"]
    inputs = FinalizeInputs(
        brand_name=brand["name"],
        product_name=product["name"],
        language=brand["language"],
        meta_title=brand["meta_title"],
        meta_description=description,
        og_image_url=product["images"][0] if product["images"] else None,
        favicon_url=brand["favicon_url"],
        support_email=brand["support_email"],
        brand_url=brand["url"],
        product_url=product["url"],
        price=format_price(current, currency),
        compare_price=format_price(product["price"], currency) if on_sale else None,
        usps=product["usps"],
        sale_percent=brand["sale_percent"],
        promo_text=brand["promo_text"],
        product_image_urls=product["images"],
    )
    html, stats = engine(read_page(state), inputs)
    warnings = (
        [] if inputs.price else ["The product has no price, so the template's price is kept."]
    )
    return {
        **write_page(state, "finalize_common", html),
        "finalize": stats,
        "_stats": stats,
        "_warnings": warnings,
    }
