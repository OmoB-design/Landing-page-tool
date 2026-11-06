"""`product_fidelity` (BUILD_SPEC §10.5, B3.2c, D116): the product check at the end of every build,
and the fixes when pictures are live and the wizard chose AI pictures (app/fidelity.py).

The check looks at the page's pictures against the product's photos (one vision call; none when
there's nothing to look at, such as a page of product photos and free placeholders) and is kept in
the report (`images.product_fix`), so the image studio can offer Match product without checking
again. In mock mode nothing is fixed: the studio's Match product makes the placeholders when asked.
Never blocks the build: a failure is a warning.
"""

from typing import Any
from uuid import UUID

from app import fidelity, images
from app.db import transaction
from app.engines import fidelity as engine
from app.engines import image_edits
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("product_fidelity", "Checked the product in the pictures")
def product_fidelity(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    photos: list[str] = list(state["product"].get("images") or [])
    rules = state["template"].get("instructions") or {}
    generic = [str(g) for g in rules.get("generic_images") or [] if g]
    html = read_page(state)
    images_state = {**state.get("images", {})}
    try:
        found = fidelity.check(
            html, photos, image_rules=str(rules.get("image_rules") or ""), generic_rules=generic
        )
    except Exception as exc:  # the check is a convenience: never block the build
        images_state["product_fix"] = {"skipped": "check_failed"}
        return {
            "images": images_state,
            "_warnings": [f"The product check couldn't run ({type(exc).__name__})."],
        }
    fixes = fidelity.fixes_for(html, photos, found)
    live = not state.get("mock_images", True) and bool(
        state.get("wizard", {}).get("ai_images", True)
    )
    update: dict[str, Any] = {}
    stats: dict[str, Any] = {"checked": len(found.items), "to_fix": len(fixes)}
    if live and fixes:
        made = [fidelity.make(html, photos, fix, ctx.org_id) for fix in fixes]
        placed: list[tuple[int, str, fidelity.Made]] = []
        for m in made:
            for number in m.fix.numbers if m.src else ():
                html, before = image_edits.set_src(html, number, m.src or "")
                placed.append((number, before, m))
        if placed:
            _versions(UUID(str(ctx.build_id)), placed)
            update.update(write_page(state, "product_fidelity", html))
        result = {m.fix.src: m for m in made}
        found = found.model_copy(
            update={
                "items": [
                    i.model_copy(
                        update={
                            "verdict": "fixed" if result[i.src].src else "failed",
                            "src": result[i.src].src or i.src,
                        }
                    )
                    if i.verdict == "fix" and i.src in result
                    else i
                    for i in found.items
                ],
                "fingerprint": fidelity.fingerprint_now(html, photos, generic),
            }
        )
        stats.update(fixed=len(placed), failed=sum(1 for m in made if not m.src))
    images_state["product_fix"] = found.model_dump(mode="json")
    warnings = (
        [f"The product couldn't be matched in {stats['failed']} picture(s)."]
        if stats.get("failed")
        else []
    )
    return {"images": images_state, **update, "_stats": stats, "_warnings": warnings}


def _versions(build_id: UUID, placed: list[tuple[int, str, fidelity.Made]]) -> None:
    """Each fixed picture becomes its image's newest version (the build's own kept as the first),
    so the studio can restore it."""
    with transaction() as conn:
        for number, before, m in placed:
            images.record(
                conn, build_id, number, before=before, src=m.src or "", source="edited",
                asset_id=m.asset_id, prompt=engine.INSTRUCTION,
            )  # fmt: skip
