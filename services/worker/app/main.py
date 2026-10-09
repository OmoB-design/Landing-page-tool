"""Worker internal API (BUILD_SPEC §4). Called by the web app's route handlers with the user's
Supabase access token; every request is authenticated and checked against org membership."""

from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.auth import CurrentUser, require_org_member
from app.config import get_settings
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.log import configure_logging

configure_logging(get_settings().log_level)

app = FastAPI(title="LP Platform worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class EnqueueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    kind: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)


class EnqueueResponse(BaseModel):
    job: Job
    # False when an identical job was already queued or running and was returned instead.
    created: bool


@app.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(body: EnqueueRequest, user: CurrentUser, response: Response) -> EnqueueResponse:
    kind = KINDS.get(body.kind)
    if kind is None or not kind.user_startable:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown job kind: {body.kind}."
        )
    require_org_member(user, body.org_id)
    try:
        model = kind.payload_model.model_validate(body.payload)
    except ValidationError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, exc.errors(include_url=False)
        ) from exc

    job, created = queue.enqueue(
        org_id=body.org_id,
        kind=kind.name,
        payload=model.model_dump(mode="json"),
        created_by=user.id,
        dedupe_key=kind.dedupe(model) if kind.dedupe else None,
        max_attempts=kind.max_attempts,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return EnqueueResponse(job=job, created=created)
