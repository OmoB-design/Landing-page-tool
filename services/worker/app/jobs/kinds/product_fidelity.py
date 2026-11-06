"""`product_fidelity` (BUILD_SPEC §10.5, B3.2c, D116): the product check on a built page, and with
`fix` a match: the pictures the check found recreated with the real product and placed as one
undoable change (app/fidelity.py). A check that's running becomes a match when Match product is
clicked meanwhile (its payload gains `fix`, read again once the check is done).
"""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app import desk, fidelity, images
from app.db import transaction
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.providers import fal
from app.providers.ledger import node_context


class FidelityPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    build_id: UUID
    fix: bool = False


def dedupe_key(payload: FidelityPayload) -> str:
    return f"fidelity:{payload.build_id}"


def _wants_fix(job_id: UUID) -> bool:
    with transaction() as conn:
        row = conn.execute(
            "select coalesce((payload->>'fix')::boolean, false) as fix from jobs where id = %(j)s",
            {"j": job_id},
        ).fetchone()
    return bool(row and row["fix"])


def run(ctx: JobContext) -> dict[str, Any]:
    payload = FidelityPayload.model_validate(ctx.job.payload)
    org_id, build_id = ctx.job.org_id, payload.build_id
    try:
        with transaction() as conn:
            build = desk._load(conn, org_id, build_id)
            html = desk._page(build)
            photos = images._product_photos(conn, org_id, build_id)
            image_rules, generic = fidelity.rules(conn, build["template_id"])
        found = fidelity.stored(build)
        fresh = found is not None and found.fingerprint == fidelity.fingerprint_now(
            html, photos, generic
        )
        if found is None or not fresh:
            ctx.progress("Checking the pictures", data={"match": {"step": "checking"}})
            with node_context("product_fidelity"):
                found = fidelity.check(html, photos, image_rules=image_rules, generic_rules=generic)
            with transaction() as conn:
                fidelity.store(conn, build_id, found)
        fixes = fidelity.fixes_for(html, photos, found)
        summary: dict[str, Any] = {
            "build_id": str(build_id),
            "checked": len(found.items),
            "to_fix": len(fixes),
            "reason": found.reason,
        }
        if not (payload.fix or _wants_fix(ctx.job.id)):
            return summary
        if not fixes:
            return {**summary, "fixed": 0, "failed": 0}
        made = []
        for index, fix in enumerate(fixes):
            ctx.check_stopping()
            ctx.progress(
                f"Matching the product: picture {index + 1} of {len(fixes)}",
                data={"match": {"step": "fixing", "done": index, "total": len(fixes)}},
            )
            with node_context("product_fidelity"):
                made.append(fidelity.make(html, photos, fix, org_id))
        ctx.progress("Putting them on the page", data={"match": {"step": "placing"}})
        placed, version = fidelity.place(org_id, build_id, ctx.job.created_by, made, wait=ctx.sleep)
        # The check now knows which pictures were fixed (and which failed).
        result = {m.fix.src: m for m in made}
        items = [
            i.model_copy(
                update={
                    "verdict": "fixed" if result[i.src].src else "failed",
                    "src": result[i.src].src or i.src,
                }
            )
            if i.verdict == "fix" and i.src in result
            else i
            for i in found.items
        ]
        with transaction() as conn:
            build = desk._load(conn, org_id, build_id)
            page = desk._page(build)
            updated = found.model_copy(
                update={
                    "items": items,
                    "fingerprint": fidelity.fingerprint_now(page, photos, generic),
                }
            )
            fidelity.store(conn, build_id, updated)
    except (desk.DeskEditError, desk.DeskNotFoundError) as exc:
        raise UserFacingError(
            str(exc) or "That page isn't available.", code="match_not_placed"
        ) from exc
    except fal.ImagesNotConfiguredError as exc:
        raise UserFacingError(
            "Real pictures need a fal key on the worker (FAL_KEY).", code="images_not_configured"
        ) from exc
    failed = sum(1 for m in made if not m.src)
    return {
        **summary,
        "fixed": placed,
        "failed": failed,
        "page_version": version,
        "mock": any(m.mock for m in made),
    }
