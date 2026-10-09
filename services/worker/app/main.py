"""Worker internal API (BUILD_SPEC §4). Called by the web app's route handlers with the user's
Supabase access token; every request is authenticated and checked against org membership."""

from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app import builds, templates
from app.auth import CurrentUser, require_org_member
from app.config import get_settings
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.log import configure_logging
from app.models.build import BuildRequest
from app.models.template import LayoutAction, TemplateEditorState

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


class UseTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    template_id: UUID


class TemplateSummary(BaseModel):
    id: UUID
    slug: str
    name: str
    type: str
    version: int


@app.post("/templates/use", status_code=status.HTTP_201_CREATED)
def use_template(body: UseTemplateRequest, user: CurrentUser) -> TemplateSummary:
    """Copies a library template into the org (BUILD_SPEC §8.3, D61)."""
    require_org_member(user, body.org_id)
    try:
        row = templates.use_library_template(body.org_id, body.template_id, user.id)
    except templates.TemplateNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That template isn't in the library."
        ) from exc
    return TemplateSummary.model_validate(row)


# ── Section editor (BUILD_SPEC §8.3, B1.1b) ───────────────────────────────────

CHANGED_ELSEWHERE = "This template changed in another tab or by someone else. Reload to see it."


class TemplateEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    base_version: int  # the version the editor showed when the edit was made


class LayoutEditRequest(TemplateEdit):
    action: LayoutAction


class RestoreRequest(TemplateEdit):
    version: int


def _editor_call(fn: Any, *args: Any) -> TemplateEditorState:
    try:
        state: TemplateEditorState = fn(*args)
    except templates.TemplateNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That template isn't in your workspace."
        ) from exc
    except templates.TemplateConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, CHANGED_ELSEWHERE) from exc
    except templates.TemplateEditError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return state


@app.get("/templates/{template_id}/editor")
def template_editor(template_id: UUID, org_id: UUID, user: CurrentUser) -> TemplateEditorState:
    """The section editor's view of one of the org's templates."""
    require_org_member(user, org_id)
    return _editor_call(templates.editor_state, org_id, template_id)


@app.post("/templates/{template_id}/layout")
def edit_template_layout(
    template_id: UUID, body: LayoutEditRequest, user: CurrentUser
) -> TemplateEditorState:
    """Reorders, removes, duplicates or renames a section, saving a new version."""
    require_org_member(user, body.org_id)
    return _editor_call(
        templates.edit_layout, body.org_id, template_id, user.id, body.base_version, body.action
    )


@app.post("/templates/{template_id}/undo")
def undo_template(template_id: UUID, body: TemplateEdit, user: CurrentUser) -> TemplateEditorState:
    require_org_member(user, body.org_id)
    return _editor_call(templates.step, body.org_id, template_id, body.base_version, "undo")


@app.post("/templates/{template_id}/redo")
def redo_template(template_id: UUID, body: TemplateEdit, user: CurrentUser) -> TemplateEditorState:
    require_org_member(user, body.org_id)
    return _editor_call(templates.step, body.org_id, template_id, body.base_version, "redo")


@app.post("/templates/{template_id}/restore")
def restore_template_version(
    template_id: UUID, body: RestoreRequest, user: CurrentUser
) -> TemplateEditorState:
    require_org_member(user, body.org_id)
    return _editor_call(
        templates.restore, body.org_id, template_id, user.id, body.base_version, body.version
    )
