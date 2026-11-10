"""`finalize_common` (BUILD_SPEC §10.2): meta, favicon, emails, FAQ, prices, selling points."""

from typing import Any

from app.engines import offers
from app.engines.finalize import FinalizeInputs
from app.engines.finalize import finalize_common as engine
from app.engines.money import format_price
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("finalize_common", "Finished the page")
def finalize_common(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand, product, offer = state["brand"], state["product"], state.get("offer")
    currency = product["currency"]
    # The page's offer (B7.2b, D146) decides the prices and the sale badges' real percent.
    prices = offers.page_prices(product["price"], product["sale_price"], offer)
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
        cta_url=offers.checkout_url(product["url"], offer, source=product.get("pull_source")),
        price=format_price(prices.now, currency),
        compare_price=format_price(prices.regular, currency),
        usps=product["usps"],
        sale_percent=prices.percent,
        promo_text=(offer or {}).get("promo_text"),
        product_image_urls=product["images"],
    )
    html, stats = engine(read_page(state), inputs)
    warnings = (
        [] if inputs.price else ["The product has no price, so the template's price is kept."]
    )
    checkout = offers.checkout_warning(offer, prices, currency)
    if checkout:
        warnings.append(checkout)
    if offer:
        # The report's record of the offer as the page shows it; the Publish window repeats the
        # checkout warning (B7.2b).
        stats = {
            **stats,
            "offer": {
                "name": offer.get("name"),
                "price": inputs.price,
                "regular": inputs.compare_price,
                "checkout_link": inputs.cta_url is not None,
                "checkout_warning": checkout,
            },
        }
    return {
        **write_page(state, "finalize_common", html),
        "finalize": stats,
        "_stats": stats,
        "_warnings": warnings,
    }
