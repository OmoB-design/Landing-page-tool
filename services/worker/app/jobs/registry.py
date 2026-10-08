"""Job kinds the worker knows how to run."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from app.jobs.context import JobContext
from app.jobs.kinds import noop_demo

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
    ]
}
