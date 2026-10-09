"""`image_pass` (BUILD_SPEC §10.4), mock mode. Product slots get the product's real photos.
Scene and person slots get free placeholder images while images are mocked (D15), or product
photos for scenes when AI images are off. The image planner and real images arrive in B1.3."""

from typing import Any

from app.engines import images as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState
from app.providers import fal, storage

REAL_IMAGES_LATER = "Real AI images arrive in B1.3; scenes use the product's photos for now."


@node("image_pass", "Placed the images")
def image_pass(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    html, slots = engine.number_slots(read_page(state))
    product = state["product"]
    photos: list[str] = product["images"]
    ai_images = bool(state.get("wizard", {}).get("ai_images", True))
    mock = bool(state.get("mock_images", True))
    warnings: list[str] = []
    chosen: dict[int, str] = {}
    mock_urls: dict[tuple[str, int, int], str] = {}
    counts = {kind: 0 for kind in ("product", "scene", "person", "logo", "keep", "other")}
    used = {"product_photos": 0, "mock_images": 0}

    def mock_image(kind: str, width: int, height: int) -> str:
        key = (kind, width, height)
        if key not in mock_urls:
            image = fal.generate_image(
                prompt=f"{kind} image for {product['name']}", width=width, height=height, mock=True
            )
            mock_urls[key] = storage.store_asset(ctx.org_id, image.data, image.mime).url
        return mock_urls[key]

    def photo(index: int) -> str | None:
        return photos[index % len(photos)] if photos else None

    product_index = scene_index = 0
    for slot in slots:
        counts[slot.kind] += 1
        if slot.kind == "product":
            if url := photo(product_index):
                chosen[slot.number] = url
                product_index += 1
                used["product_photos"] += 1
        elif slot.kind == "scene":
            if ai_images and mock:
                chosen[slot.number] = mock_image("scene", slot.width, slot.height)
                used["mock_images"] += 1
            elif url := photo(scene_index):
                chosen[slot.number] = url
                scene_index += 1
                used["product_photos"] += 1
        elif slot.kind == "person" and ai_images and mock:
            chosen[slot.number] = mock_image("person", slot.width, slot.height)
            used["mock_images"] += 1

    if counts["product"] and not photos:
        warnings.append("The product has no photos, so product slots keep the template's image.")
    if ai_images and not mock and (counts["scene"] or counts["person"]):
        warnings.append(REAL_IMAGES_LATER)
    html, applied = engine.apply_images(html, chosen)
    stats = {"plan_stats": counts, **used, **applied}
    images = {
        **state.get("images", {}),
        **stats,
        "mock": used["mock_images"] > 0,
        "warning": " ".join(warnings) or None,
    }
    return {
        **write_page(state, "image_pass", html),
        "images": images,
        "_stats": stats,
        "_warnings": warnings,
        "_message": (
            f"Placed {_count(used['product_photos'], 'product photo')} and "
            f"{_count(used['mock_images'], 'placeholder image')}"
        ),
    }


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"
