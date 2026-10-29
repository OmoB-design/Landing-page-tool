"""Worker internal API (BUILD_SPEC §4). Called by the web app's route handlers with the user's
Supabase access token; every request is authenticated and checked against org membership."""

from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app import builds, desk, publishing, templates, trash
from app.auth import CurrentUser, require_org_member
from app.config import get_settings
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.log import configure_logging
from app.models.build import BuildRequest
from app.models.desk import (
    CopyEditRequest,
    DeskChange,
    DeskState,
    RecolorRequest,
    RedraftRequest,
    SnapshotRestoreRequest,
    StatusRequest,
)
from app.models.publishing import (
    IntegrationsState,
    PublishingState,
    PublishRequest,
    ShopifyConnectRequest,
    ShopifyTemplate,
    TestingSwitchRequest,
    ThemeFile,
    UnpublishRequest,
    VercelConnectRequest,
)
from app.models.template import LayoutAction, TemplateEditorState
from app.models.trash import TrashKind, TrashRequest, TrashState
from app.publish import shopify_page

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


class RetryBuildRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID


@app.post("/builds/{build_id}/retry", status_code=status.HTTP_201_CREATED)
def retry_build(build_id: UUID, body: RetryBuildRequest, user: CurrentUser) -> BuildCreated:
    """Queues a failed build again; it picks up after the last step that finished."""
    require_org_member(user, body.org_id)
    try:
        build, job = builds.retry_build(org_id=body.org_id, build_id=build_id, created_by=user.id)
    except builds.BuildNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn't available.") from exc
    except builds.BuildNotFailedError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Only a failed build can be retried."
        ) from exc
    return BuildCreated(build=BuildSummary.model_validate(build), job=job)


# ── Review desk (BUILD_SPEC §11.1, D84) ──────────────────────────────────────

PAGE_CHANGED_ELSEWHERE = (
    "This page changed in another tab or by someone else. Reload to see the latest."
)


def _desk_call(fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except desk.DeskNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn't available.") from exc
    except desk.DeskConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, PAGE_CHANGED_ELSEWHERE) from exc
    except desk.DeskEditError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@app.get("/builds/{build_id}/desk")
def build_desk(build_id: UUID, org_id: UUID, user: CurrentUser) -> DeskState:
    """A finished build's status and version, every sentence of its page, and its snapshots."""
    require_org_member(user, org_id)
    state: DeskState = _desk_call(desk.desk_state, org_id, build_id)
    return state


@app.get("/builds/{build_id}/proof")
def build_proof(build_id: UUID, org_id: UUID, user: CurrentUser) -> Response:
    """The page with every sentence marked, for the desk's preview (never stored)."""
    require_org_member(user, org_id)
    html, version = _desk_call(desk.proof_html, org_id, build_id)
    return Response(
        html,
        media_type="text/html; charset=utf-8",
        headers={"X-Page-Version": str(version), "Cache-Control": "no-store"},
    )


@app.post("/builds/{build_id}/copy")
def edit_build_copy(build_id: UUID, body: CopyEditRequest, user: CurrentUser) -> DeskState:
    """Saves edited sentences, after a snapshot of the page as it was."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.edit_copy, body.org_id, build_id, user.id, body.base_version, body.edits
    )
    return state


@app.post("/builds/{build_id}/status")
def set_build_status(build_id: UUID, body: StatusRequest, user: CurrentUser) -> DeskState:
    """Approve, or send an approved page back to review."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.set_status, body.org_id, build_id, user.id, body.base_version, body.status
    )
    return state


@app.post("/builds/{build_id}/undo")
def undo_build_change(build_id: UUID, body: DeskChange, user: CurrentUser) -> DeskState:
    """Puts back the page before the last change."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(desk.undo, body.org_id, build_id, body.base_version)
    return state


@app.post("/builds/{build_id}/restore")
def restore_build_snapshot(
    build_id: UUID, body: SnapshotRestoreRequest, user: CurrentUser
) -> DeskState:
    """Makes an earlier page current again (itself undoable)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.restore, body.org_id, build_id, user.id, body.base_version, body.seq
    )
    return state


@app.post("/builds/{build_id}/recolor")
def recolor_build(build_id: UUID, body: RecolorRequest, user: CurrentUser) -> DeskState:
    """Recolours the page to the given colours (undoable)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.recolor, body.org_id, build_id, user.id, body.base_version, body.colors
    )
    return state


@app.post("/builds/{build_id}/redraft")
def redraft_build(build_id: UUID, body: RedraftRequest, user: CurrentUser) -> DeskState:
    """Queues a redraft (a job, D86); the desk shows it running and pauses other changes."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(desk.start_redraft, body.org_id, build_id, user.id, body)
    return state


# ── Publishing (BUILD_SPEC §12, D87) ─────────────────────────────────────────


def _publish_call(fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except publishing.PublishNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn't available.") from exc
    except publishing.PublishConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, PAGE_CHANGED_ELSEWHERE) from exc
    except publishing.PublishError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


def _require_role(user_id: UUID, org_id: UUID, roles: set[str], what: str) -> None:
    if publishing.role_of(org_id, user_id) not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {what} can do that.")


@app.get("/integrations")
def get_integrations(org_id: UUID, user: CurrentUser) -> IntegrationsState:
    """The org's Vercel connection (never the token) and the testing switch."""
    require_org_member(user, org_id)
    return publishing.integrations_state(org_id, user.id)


@app.post("/integrations/vercel")
def connect_vercel(body: VercelConnectRequest, user: CurrentUser) -> IntegrationsState:
    """Checks the token with Vercel and stores it in Vault. Owners and admins."""
    require_org_member(user, body.org_id)
    _require_role(user.id, body.org_id, {"owner", "admin"}, "owners and admins")
    _publish_call(publishing.connect_vercel, body.org_id, user.id, body.token, body.team_id)
    return publishing.integrations_state(body.org_id, user.id)


@app.delete("/integrations/vercel")
def disconnect_vercel(org_id: UUID, user: CurrentUser) -> IntegrationsState:
    require_org_member(user, org_id)
    _require_role(user.id, org_id, {"owner", "admin"}, "owners and admins")
    publishing.disconnect_vercel(org_id)
    return publishing.integrations_state(org_id, user.id)


@app.post("/integrations/shopify")
def connect_shopify(body: ShopifyConnectRequest, user: CurrentUser) -> IntegrationsState:
    """Checks a brand's store owner app with Shopify, then keeps it (the secret in Vault)."""
    require_org_member(user, body.org_id)
    _require_role(user.id, body.org_id, {"owner", "admin"}, "owners and admins")
    _publish_call(
        publishing.connect_shopify,
        body.org_id,
        user.id,
        body.brand_id,
        body.shop_domain,
        body.client_id,
        body.client_secret,
    )
    return publishing.integrations_state(body.org_id, user.id)


@app.get("/integrations/shopify/template")
def shopify_template(user: CurrentUser) -> ShopifyTemplate:
    """The full-width template's two files, for the store owner to add to their theme once."""
    del user  # signed in is enough: the files are the same for everyone
    return ShopifyTemplate(
        files=[ThemeFile(path=path, body=body) for path, body in shopify_page.THEME_FILES.items()]
    )


@app.delete("/integrations/shopify")
def disconnect_shopify(org_id: UUID, brand_id: UUID, user: CurrentUser) -> IntegrationsState:
    require_org_member(user, org_id)
    _require_role(user.id, org_id, {"owner", "admin"}, "owners and admins")
    publishing.disconnect_shopify(org_id, brand_id)
    return publishing.integrations_state(org_id, user.id)


@app.post("/orgs/{org_id}/testing")
def set_testing_switch(
    org_id: UUID, body: TestingSwitchRequest, user: CurrentUser
) -> IntegrationsState:
    """The owner's switch that lets pages with placeholder images be published (D87)."""
    require_org_member(user, org_id)
    _require_role(user.id, org_id, {"owner"}, "the owner")
    publishing.set_testing_switch(org_id, body.allow_placeholder_publish)
    return publishing.integrations_state(org_id, user.id)


@app.get("/builds/{build_id}/publishing")
def build_publishing(build_id: UUID, org_id: UUID, user: CurrentUser) -> PublishingState:
    """What blocks publishing, the live page, a publish in progress and the history."""
    require_org_member(user, org_id)
    state: PublishingState = _publish_call(publishing.publishing_state, org_id, build_id)
    return state


@app.post("/builds/{build_id}/publish")
def publish_build(build_id: UUID, body: PublishRequest, user: CurrentUser) -> PublishingState:
    """Queues a publish to Vercel after the gate (passing it with `override` is recorded)."""
    require_org_member(user, body.org_id)
    state: PublishingState = _publish_call(
        publishing.start_publish,
        body.org_id,
        build_id,
        user.id,
        body.base_version,
        body.override,
        body.destination,
    )
    return state


@app.post("/builds/{build_id}/unpublish")
def unpublish_build(build_id: UUID, body: UnpublishRequest, user: CurrentUser) -> PublishingState:
    """Queues taking the page down from Vercel (D89; the brand's other pages stay up) or removing
    its draft from the brand's Shopify store."""
    require_org_member(user, body.org_id)
    state: PublishingState = _publish_call(
        publishing.start_unpublish, body.org_id, build_id, user.id, body.destination
    )
    return state


# ── Trash (B1.6a, D92) ────────────────────────────────────────────────────────


def _trash_call(fn: Any, *args: Any) -> None:
    try:
        fn(*args)
    except trash.TrashNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except trash.TrashError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


def _trash_state(org_id: UUID, user_id: UUID) -> TrashState:
    return TrashState(
        items=trash.list_trash(org_id),
        can_permanently_delete=publishing.role_of(org_id, user_id) in {"owner", "admin"},
    )


@app.get("/trash")
def get_trash(org_id: UUID, user: CurrentUser) -> TrashState:
    """What's in the workspace's Trash (7 days), newest first."""
    require_org_member(user, org_id)
    return _trash_state(org_id, user.id)


@app.post("/trash/{kind}/{item_id}")
def move_to_trash(kind: TrashKind, item_id: UUID, body: TrashRequest, user: CurrentUser) -> None:
    """Moves a page, brand, product or template to Trash (a page can't while it's building or
    published; a brand takes its pages and products with it)."""
    require_org_member(user, body.org_id)
    _trash_call(trash.move_to_trash, body.org_id, kind, item_id, user.id)


@app.post("/trash/{kind}/{item_id}/restore")
def restore_from_trash(
    kind: TrashKind, item_id: UUID, body: TrashRequest, user: CurrentUser
) -> TrashState:
    require_org_member(user, body.org_id)
    _trash_call(trash.restore, body.org_id, kind, item_id)
    return _trash_state(body.org_id, user.id)


@app.delete("/trash/{kind}/{item_id}")
def delete_from_trash(
    kind: TrashKind, item_id: UUID, org_id: UUID, user: CurrentUser
) -> TrashState:
    """Deletes it for good, with its stored files. Owners and admins."""
    require_org_member(user, org_id)
    _require_role(user.id, org_id, {"owner", "admin"}, "owners and admins")
    _trash_call(trash.delete_for_good, org_id, kind, item_id)
    return _trash_state(org_id, user.id)


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
