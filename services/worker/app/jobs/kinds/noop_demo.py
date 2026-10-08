"""`noop_demo`: five timed steps with progress events, to prove the job loop and the providers
end to end. Step 3 asks the AI and step 4 draws an image, both in mock mode whatever the
settings, so the demo never costs anything; each records a $0 ledger row. A retried or resumed
run continues after the last finished step."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db import transaction
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.providers import anthropic, fal, storage


class NoopDemoPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: int = Field(5, ge=1, le=10)
    step_seconds: float = Field(2.0, ge=0, le=10)
    # Demonstrates the failure path: fail with a user-facing error when this step is reached.
    fail_at: int | None = Field(None, ge=1, le=10)


def run(ctx: JobContext) -> dict[str, Any]:
    payload = NoopDemoPayload.model_validate(ctx.job.payload)
    done = ctx.last_progress("step")
    start = int(done) + 1 if isinstance(done, int) else 1
    if start > 1:
        ctx.progress(f"Resuming after step {start - 1}", data={"total": payload.steps})

    for step in range(start, payload.steps + 1):
        ctx.sleep(payload.step_seconds)
        if payload.fail_at == step:
            raise UserFacingError(
                f"The demo job stopped at step {step} on purpose.", code="demo_failure"
            )
        if step == 3:
            reply = anthropic.generate(
                role="fast",
                ledger_kind="other",
                prompt="Say hello to the LP Platform owner in five words.",
                max_tokens=50,
                mock=True,
            )
            ctx.progress(f"Asked the AI ({reply.model}): {reply.text}", node="demo_ai")
        if step == 4:
            image = fal.generate_image(prompt="Placeholder", width=640, height=480, mock=True)
            asset = storage.store_asset(ctx.job.org_id, image.data, image.mime)
            ctx.progress("Drew a placeholder image and saved it", data={"image_url": asset.url})
        ctx.progress(
            f"Step {step} of {payload.steps} done",
            data={"step": step, "total": payload.steps},
        )
    return {"steps": payload.steps, **_ledger_summary(ctx)}


def _ledger_summary(ctx: JobContext) -> dict[str, Any]:
    """What this job recorded in the ledger, and its saved image, for the demo card."""
    with transaction() as conn:
        row = conn.execute(
            """
            select count(*) as rows, coalesce(sum(cost_usd), 0) as cost
            from ledger_entries where job_id = %(job)s and org_id = %(org)s
            """,
            {"job": ctx.job.id, "org": ctx.job.org_id},
        ).fetchone()
    image_url = ctx.last_progress("image_url")
    cost_usd: Decimal = row["cost"] if row else Decimal(0)
    return {
        "ledger_rows": row["rows"] if row else 0,
        "cost_usd": str(cost_usd),
        "image_url": image_url if isinstance(image_url, str) else None,
    }
