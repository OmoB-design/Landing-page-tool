"""Pydantic models mirroring the jobs and job_events tables."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
EventLevel = Literal["info", "warn", "error"]


class Job(BaseModel):
    id: UUID
    org_id: UUID
    kind: str
    status: JobStatus
    payload: dict[str, Any]
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    dedupe_key: str | None = None
    build_id: UUID | None = None
    attempts: int
    max_attempts: int
    run_after: datetime
    locked_by: str | None = None
    locked_at: datetime | None = None
    heartbeat_at: datetime | None = None
    created_by: UUID | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class JobEvent(BaseModel):
    id: int
    job_id: UUID
    org_id: UUID
    ts: datetime
    level: EventLevel
    node: str | None = None
    message: str
    data: dict[str, Any] | None = None
