"""Job kinds the worker knows how to run."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from app.jobs.context import JobContext
from app.jobs.kinds import brand_assets, brand_autofetch, noop_demo, product_briefing, product_pull

Handler = Callable[[JobContext], dict[str, Any] | None]


@dataclass(frozen=True)
class JobKind:
    name: str
    title: str
    handler: Handler
    payload_model: type[BaseModel]
    # Whether users may start it through POST /jobs (others are started by the worker itself).
    user_startable: bool = False
    max_attempts: int = 2
    # Paid jobs: a second identical request while one is queued or running returns that job.
    dedupe: Callable[[Any], str] | None = None


KINDS: dict[str, JobKind] = {
    kind.name: kind
    for kind in [
        JobKind(
            name="noop_demo",
            title="Demo job",
            handler=noop_demo.run,
            payload_model=noop_demo.NoopDemoPayload,
            user_startable=True,
        ),
        JobKind(
            name="brand_autofetch",
            title="Brand fetch",
            handler=brand_autofetch.run,
            payload_model=brand_autofetch.BrandAutofetchPayload,
            user_startable=True,
        ),
        JobKind(
            name="brand_assets",
            title="Brand logo",
            handler=brand_assets.run,
            payload_model=brand_assets.BrandAssetsPayload,
            user_startable=True,
        ),
        JobKind(
            name="product_pull",
            title="Product pull",
            handler=product_pull.run,
            payload_model=product_pull.ProductPullPayload,
            user_startable=True,
            dedupe=product_pull.dedupe_key,
        ),
        JobKind(
            name="product_briefing",
            title="Product briefing",
            handler=product_briefing.run,
            payload_model=product_briefing.ProductBriefingPayload,
            user_startable=True,
            dedupe=product_briefing.dedupe_key,
        ),
    ]
}
