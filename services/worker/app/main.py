"""Worker internal API (BUILD_SPEC §4). Called by the web app's route handlers with the user's
Supabase access token; every request is authenticated and checked against org membership."""

from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app import builds
from app.auth import CurrentUser, require_org_member
from app.config import get_settings
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.log import configure_logging
from app.models.build import BuildRequest

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


class BuildSummary(BaseModel):
    id: UUID
    key: str
    status: str
    title: str


class BuildCreated(BaseModel):
    build: BuildSummary
    job: Job


@app.post("/builds", status_code=status.HTTP_201_CREATED)
def create_build(body: BuildRequest, user: CurrentUser) -> BuildCreated:
    """Creates a build and queues its `build` job in one transaction."""
    require_org_member(user, body.org_id)
    try:
        build, job = builds.create_build(
            org_id=body.org_id,
            template_id=body.template_id,
            brand_id=body.brand_id,
            product_id=body.product_id,
            wizard=body.wizard,
            created_by=user.id,
        )
    except builds.BuildInputsMissingError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That template, brand or product isn't available."
        ) from exc
    return BuildCreated(build=BuildSummary.model_validate(build), job=job)
