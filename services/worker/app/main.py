"""Worker internal API (BUILD_SPEC §4). Called by the web app's route handlers with the user's
Supabase access token; every request is authenticated and checked against org membership."""

from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app import (
    agent,
    analytics,
    builds,
    clones,
    desk,
    editor_parts,
    fidelity,
    image_ai,
    images,
    members,
    mobile,
    publishing,
    qa,
    share,
    templates,
    trash,
)
from app.auth import CurrentUser, require_org_member
from app.config import get_settings
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.log import configure_logging
from app.models.agent import (
    AgentRate,
    AgentRequest,
    AgentRestore,
    AgentStart,
    AgentStop,
    AgentThread,
    AgentThreads,
)
from app.models.analytics import AnalyticsRange, AnalyticsState
from app.models.build import (
    BatchFolder,
    BatchFolderRequest,
    BatchRequest,
    BatchState,
    BuildRequest,
)
from app.models.clone import CloneRequest, CloneTermsRequest, CloneTermsState
from app.models.desk import (
    CopyEditRequest,
    DeskChange,
    DeskState,
    FormatRequest,
    RecolorRequest,
    RedraftRequest,
    SectionRequest,
    SnapshotRestoreRequest,
    StatusRequest,
)
from app.models.editor_map import PageParts
from app.models.images import (
    ImageAdjust,
    ImageAIRequest,
    ImageJob,
    ImageReplace,
    ImageRestore,
    ImageStudio,
    ImageUpload,
    MatchStarted,
    UploadedImage,
)
from app.models.members import (
    Accepted,
    AcceptRequest,
    InviteInfo,
    InviteRequest,
    MembersState,
    RoleRequest,
)
from app.models.publishing import (
    IntegrationsState,
    PublishingState,
    PublishRequest,
    ShopifyConnectRequest,
    ShopifyTemplate,
    TestingSwitchRequest,
    ThemeAccessRequest,
    ThemeFile,
    UnpublishRequest,
    VercelConnectRequest,
)
from app.models.qa import QaStart, QaStarted, QaState
from app.models.share import ReviewInfo, ShareRequest, ShareState
from app.models.template import LayoutAction, TemplateEditorState, TemplateInstructions
from app.models.trash import TrashKind, TrashRequest, TrashState
from app.publish import shopify_page

configure_logging(get_settings().log_level)

app = FastAPI(title="LP Platform worker", version="0.1.0")


@app.exception_handler(queue.RateLimitedError)
def _rate_limited(_request: Request, exc: queue.RateLimitedError) -> JSONResponse:
    """A workspace past its hourly cap on starting work (D94): 429 with when to try again."""
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": exc.message},
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


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
    except builds.TemplateNotReadyError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Confirm this cloned page's analysis before building from it.",
        ) from exc
    except builds.CompetitorsMissingError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "A ranking page needs its four competitor pages. Add them in the Competitors step.",
        ) from exc
    return BuildCreated(build=BuildSummary.model_validate(build), job=job)


class BatchCreated(BaseModel):
    batch_id: UUID
    builds: list[BuildSummary]


@app.post("/builds/batch", status_code=status.HTTP_201_CREATED)
def create_batch(body: BatchRequest, user: CurrentUser) -> BatchCreated:
    """A page from each chosen template for one product (B3.5, D115): all of them or none."""
    require_org_member(user, body.org_id)
    try:
        batch_id, made = builds.create_batch(
            org_id=body.org_id,
            template_ids=body.template_ids,
            brand_id=body.brand_id,
            product_id=body.product_id,
            wizard=body.wizard,
            created_by=user.id,
        )
    except builds.BuildInputsMissingError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "One of those templates, or the brand or product, isn't available.",
        ) from exc
    except builds.TemplateNotReadyError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "A cloned page in the batch needs its analysis confirmed first.",
        ) from exc
    except builds.CompetitorsMissingError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The ranking page needs its four competitor pages. Add them in the Competitors step.",
        ) from exc
    except builds.BatchTooBigError as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            (
                f"You can start {exc.room} more page{'' if exc.room == 1 else 's'} this hour. "
                "Untick some templates, or try again later."
            )
            if exc.room
            else "This workspace has started its 20 pages for this hour. Try again later.",
        ) from exc
    return BatchCreated(
        batch_id=batch_id, builds=[BuildSummary.model_validate(build) for build, _ in made]
    )


@app.get("/builds/batch/{batch_id}")
def get_batch(batch_id: UUID, org_id: UUID, user: CurrentUser) -> BatchState:
    """A batch's pages and how each is getting on (B3.5): the batch screen polls this."""
    require_org_member(user, org_id)
    try:
        return builds.batch_state(org_id, batch_id)
    except builds.BuildNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That batch isn't available.") from exc


@app.patch("/builds/batch/{batch_id}")
def set_batch_folder(batch_id: UUID, body: BatchFolderRequest, user: CurrentUser) -> BatchFolder:
    """The colour of a batch's folder in the Pages list (B3.5b), for everyone in the workspace."""
    require_org_member(user, body.org_id)
    try:
        color = builds.set_folder_color(body.org_id, batch_id, body.folder_color)
    except builds.BuildNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That batch isn't available.") from exc
    return BatchFolder(folder_color=color)


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


def _desk_call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return fn(*args, **kwargs)
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


@app.get("/builds/{build_id}/parts")
def build_parts(build_id: UUID, org_id: UUID, user: CurrentUser) -> PageParts:
    """Each section's parts (texts, pictures, videos) for the page editor's tree (B4.4, D123),
    named as Shopify's theme editor names them."""
    require_org_member(user, org_id)
    found: PageParts = _desk_call(editor_parts.page_parts, org_id, build_id)
    return found


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


# ── The client review link (B3.6, D119) ─────────────────────────────────────────

GONE = "This link isn't available any more."


def _share_call(fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except share.ShareNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That page isn't available.") from exc
    except share.ShareUnavailableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Client links aren't set up yet: the worker needs LP_SHARE_SECRET.",
        ) from exc
    except share.ShareRefusedError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@app.get("/builds/{build_id}/share")
def get_share(build_id: UUID, org_id: UUID, user: CurrentUser) -> ShareState:
    """The page's client link and what it shows (the review desk's Client link)."""
    require_org_member(user, org_id)
    state: ShareState = _share_call(share.share_state, org_id, build_id)
    return state


@app.post("/builds/{build_id}/share")
def make_share(build_id: UUID, body: ShareRequest, user: CurrentUser) -> ShareState:
    """Makes the page's client link (or gives the live one); needs an approved version."""
    require_org_member(user, body.org_id)
    state: ShareState = _share_call(share.make_link, body.org_id, build_id, user.id)
    return state


@app.delete("/builds/{build_id}/share")
def turn_off_share(build_id: UUID, org_id: UUID, user: CurrentUser) -> ShareState:
    """Turns the page's client link off at once."""
    require_org_member(user, org_id)
    state: ShareState = _share_call(share.turn_off, org_id, build_id)
    return state


@app.get("/review/{token}")
def review_info(token: str) -> ReviewInfo:
    """The client's page (no sign-in): the approved page's title and date."""
    found: ReviewInfo | None = _share_call(share.review_info, token)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, GONE)
    return found


@app.get("/review/{token}/html")
def review_html(token: str) -> Response:
    """The approved page itself, for the client's view (no sign-in). Counts a visit."""
    page: str | None = _share_call(share.review_html, token)
    if page is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, GONE)
    return Response(
        page, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"}
    )


@app.post("/builds/{build_id}/copy")
def edit_build_copy(build_id: UUID, body: CopyEditRequest, user: CurrentUser) -> DeskState:
    """Saves edited sentences, after a snapshot of the page as it was."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.edit_copy, body.org_id, build_id, user.id, body.base_version, body.edits,
        typing=body.typing,
    )  # fmt: skip
    return state


@app.post("/builds/{build_id}/format")
def format_build_text(build_id: UUID, body: FormatRequest, user: CurrentUser) -> DeskState:
    """Formats the selected text (B3.1g, D118): bold, italic, underline, strikethrough, a link,
    colour, highlight, size or clear, on exactly the characters selected; one undoable change."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.format_text, body.org_id, build_id, user.id, body.base_version, body.ranges,
        body.format,
    )  # fmt: skip
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
    state: DeskState = _desk_call(desk.undo, body.org_id, build_id, user.id, body.base_version)
    return state


@app.post("/builds/{build_id}/redo")
def redo_build_change(build_id: UUID, body: DeskChange, user: CurrentUser) -> DeskState:
    """Puts back the change Undo took off last (the page editor, B3.1a)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(desk.redo, body.org_id, build_id, user.id, body.base_version)
    return state


@app.post("/builds/{build_id}/sections")
def edit_build_sections(build_id: UUID, body: SectionRequest, user: CurrentUser) -> DeskState:
    """Moves, duplicates or removes a section of the page (the page editor, B3.1a)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(
        desk.edit_sections, body.org_id, build_id, user.id, body.base_version, body.action
    )
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


# ── The image studio (BUILD_SPEC §11.2, B3.2a, D109) ───────────────────────────


@app.get("/builds/{build_id}/qa")
def preview_check(build_id: UUID, org_id: UUID, user: CurrentUser) -> QaState:
    """The page's preview check (B3.3a): screenshots at desktop and phone widths, its share image
    and link preview, the version they show, and whether a check is under way."""
    require_org_member(user, org_id)
    found: QaState = _desk_call(qa.status, org_id, build_id)
    return found


@app.post("/builds/{build_id}/qa")
def preview_check_start(build_id: UUID, body: QaStart, user: CurrentUser) -> QaStarted:
    """Refresh: a new preview check of the page as it is now (a job; free)."""
    require_org_member(user, body.org_id)
    started: QaStarted = _desk_call(qa.start, body.org_id, build_id, user.id)
    return started


@app.post("/builds/{build_id}/phone-fix")
def phone_fix_start(build_id: UUID, body: QaStart, user: CurrentUser) -> QaStarted:
    """Fix for phone (B3.3b): Claude's phone-only CSS from the page at 390 px (a job; about 5 to
    10 cents); the page stays editable and the fixes land as one undoable change."""
    require_org_member(user, body.org_id)
    started: QaStarted = _desk_call(mobile.start, body.org_id, build_id, user.id)
    return started


@app.get("/builds/{build_id}/images/{number}")
def image_studio(build_id: UUID, number: int, org_id: UUID, user: CurrentUser) -> ImageStudio:
    """One image of the page: its details, its last five versions and what it can become."""
    require_org_member(user, org_id)
    found: ImageStudio = _desk_call(images.studio, org_id, build_id, number)
    # Match product everywhere (B3.2c): the page's product check, run again when out of date.
    match = _desk_call(fidelity.studio_match, org_id, build_id, user.id)
    return found.model_copy(update={"match": match})


@app.post("/builds/{build_id}/images/upload")
def image_upload(build_id: UUID, body: ImageUpload, user: CurrentUser) -> UploadedImage:
    """A picture from the user's computer, stored as one of the workspace's assets."""
    require_org_member(user, body.org_id)
    stored: UploadedImage = _desk_call(images.upload, body.org_id, build_id, body)
    return stored


@app.post("/builds/{build_id}/images/{number}/ai")
def image_ai_start(
    build_id: UUID, number: int, body: ImageAIRequest, user: CurrentUser
) -> ImageJob:
    """A new picture for the image, or the one it shows edited, with AI (B3.2b): a job; the page
    stays editable while it's made and the picture goes on as one undoable change."""
    require_org_member(user, body.org_id)
    started: ImageJob = _desk_call(image_ai.start, body.org_id, build_id, user.id, number, body)
    return started


@app.post("/builds/{build_id}/images/match")
def image_match_start(build_id: UUID, body: QaStart, user: CurrentUser) -> MatchStarted:
    """Match product everywhere (B3.2c, D116): the pictures the product check found are recreated
    with the real product (a job; up to 10 pictures, $0.15 each once live) and placed as one
    undoable change."""
    require_org_member(user, body.org_id)
    started: MatchStarted = _desk_call(fidelity.start, body.org_id, build_id, user.id)
    return started


@app.post("/builds/{build_id}/images/{number}/replace")
def image_replace(build_id: UUID, number: int, body: ImageReplace, user: CurrentUser) -> DeskState:
    """The image shows a product photo, another image on the page, or an upload (undoable)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(images.replace, body.org_id, build_id, user.id, number, body)
    return state


@app.post("/builds/{build_id}/images/{number}/adjust")
def image_adjust(build_id: UUID, number: int, body: ImageAdjust, user: CurrentUser) -> DeskState:
    """The image's shape, fit, focus or alt text (undoable)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(images.adjust, body.org_id, build_id, user.id, number, body)
    return state


@app.post("/builds/{build_id}/images/{number}/restore")
def image_restore(build_id: UUID, number: int, body: ImageRestore, user: CurrentUser) -> DeskState:
    """The image shows one of its earlier versions again (undoable)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(images.restore, body.org_id, build_id, user.id, number, body)
    return state


# ── Lander, the page editor's agent (BUILD_SPEC §11.3, B3.1c, D106) ──────────


@app.post("/builds/{build_id}/agent")
def agent_request(build_id: UUID, body: AgentRequest, user: CurrentUser) -> AgentStart:
    """A request to Lander: saved in its conversation and queued as a job (one at a time per
    page, shared with the redraft); the desk shows it running and pauses other changes."""
    require_org_member(user, body.org_id)
    started: AgentStart = _desk_call(agent.start, body.org_id, build_id, user.id, body)
    return started


@app.get("/builds/{build_id}/agent")
def agent_conversation(
    build_id: UUID, org_id: UUID, user: CurrentUser, thread_id: UUID | None = None
) -> AgentThread:
    """A conversation with Lander about the page: the one named, or the newest."""
    require_org_member(user, org_id)
    conversation: AgentThread = _desk_call(agent.thread, org_id, build_id, thread_id)
    return conversation


@app.post("/builds/{build_id}/agent/restore")
def agent_restore(build_id: UUID, body: AgentRestore, user: CurrentUser) -> DeskState:
    """Restore page to here: the page as it was when one of Lander's requests was sent (one
    undoable change)."""
    require_org_member(user, body.org_id)
    state: DeskState = _desk_call(agent.restore_to, body.org_id, build_id, user.id, body)
    return state


@app.get("/builds/{build_id}/agent/threads")
def agent_threads(build_id: UUID, org_id: UUID, user: CurrentUser) -> AgentThreads:
    """The page's conversations with Lander, newest first (Recents, B3.1e)."""
    require_org_member(user, org_id)
    found: AgentThreads = _desk_call(agent.threads, org_id, build_id)
    return found


@app.post("/builds/{build_id}/agent/feedback")
def agent_feedback(build_id: UUID, body: AgentRate, user: CurrentUser) -> dict[str, bool]:
    """A rating on one of Lander's replies, or taking it back (B3.1e)."""
    require_org_member(user, body.org_id)
    _desk_call(agent.rate, body.org_id, build_id, body)
    return {"saved": True}


@app.post("/builds/{build_id}/agent/stop")
def agent_stop(build_id: UUID, body: AgentStop, user: CurrentUser) -> dict[str, bool]:
    """Stop: Lander keeps what it did by its next step and finishes."""
    require_org_member(user, body.org_id)
    _desk_call(agent.stop, body.org_id, build_id)
    return {"stopping": True}


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


# ── Members and invites (B6.1, D129) ────────────────────────────────────────


def _members_call(fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except members.MembersForbiddenError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only owners and admins can do that."
        ) from exc
    except members.MembersNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That person or invite isn't in this workspace."
        ) from exc
    except members.MembersRefusedError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except share.ShareUnavailableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Invites aren't set up yet: the worker needs LP_SHARE_SECRET.",
        ) from exc


@app.get("/orgs/{org_id}/members")
def get_members(org_id: UUID, user: CurrentUser) -> MembersState:
    """Everyone in the workspace; open invites for owners and admins."""
    require_org_member(user, org_id)
    state: MembersState = _members_call(members.members_state, org_id, user.id)
    return state


@app.post("/orgs/{org_id}/invites")
def invite_member(org_id: UUID, body: InviteRequest, user: CurrentUser) -> MembersState:
    """Invites an email with a role (owners and admins), or refreshes its open invite."""
    require_org_member(user, org_id)
    state: MembersState = _members_call(members.invite, org_id, user.id, body.email, body.role)
    return state


@app.delete("/orgs/{org_id}/invites/{invite_id}")
def revoke_invite(org_id: UUID, invite_id: UUID, user: CurrentUser) -> MembersState:
    require_org_member(user, org_id)
    state: MembersState = _members_call(members.revoke, org_id, user.id, invite_id)
    return state


@app.patch("/orgs/{org_id}/members/{member_id}")
def change_role(
    org_id: UUID, member_id: UUID, body: RoleRequest, user: CurrentUser
) -> MembersState:
    require_org_member(user, org_id)
    state: MembersState = _members_call(members.set_role, org_id, user.id, member_id, body.role)
    return state


@app.delete("/orgs/{org_id}/members/{member_id}")
def remove_member(org_id: UUID, member_id: UUID, user: CurrentUser) -> MembersState | None:
    """Removes someone (owners and admins), or leaves (oneself): then the answer is empty."""
    require_org_member(user, org_id)
    state: MembersState | None = _members_call(members.remove, org_id, user.id, member_id)
    return state


@app.get("/invites/{token}")
def invite_info(token: str) -> InviteInfo:
    """The invite page (no sign-in): the workspace, the email it's for, the role, its state."""
    found: InviteInfo | None = _members_call(members.invite_info, token)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, GONE)
    return found


@app.post("/invites/accept")
def accept_invite(body: AcceptRequest, user: CurrentUser) -> Accepted:
    """Joins the signed-in person (with the invited email) to the workspace and opens it."""
    accepted: Accepted = _members_call(members.accept, body.token, user.id)
    return accepted


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


@app.post("/integrations/shopify/theme-access")
def set_theme_access(body: ThemeAccessRequest, user: CurrentUser) -> IntegrationsState:
    """A store's Theme Access password (B4.2, D121): checked with Shopify, kept in Vault."""
    require_org_member(user, body.org_id)
    _require_role(user.id, body.org_id, {"owner", "admin"}, "owners and admins")
    _publish_call(publishing.set_theme_access, body.org_id, body.brand_id, body.password)
    return publishing.integrations_state(body.org_id, user.id)


@app.delete("/integrations/shopify/theme-access")
def remove_theme_access(org_id: UUID, brand_id: UUID, user: CurrentUser) -> IntegrationsState:
    require_org_member(user, org_id)
    _require_role(user.id, org_id, {"owner", "admin"}, "owners and admins")
    _publish_call(publishing.remove_theme_access, org_id, brand_id)
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


# ── Analytics (B1.6b) ─────────────────────────────────────────────────────────


@app.get("/analytics")
def get_analytics(org_id: UUID, user: CurrentUser, range: AnalyticsRange = "30d") -> AnalyticsState:
    """The workspace's AI spend and pages over 30 days, 90 days or 12 months."""
    require_org_member(user, org_id)
    return analytics.analytics(org_id, range)


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


# ── The clone path (BUILD_SPEC §8.4, B2.1; D4, D33) ───────────────────────────


@app.get("/clone-terms")
def get_clone_terms(org_id: UUID, user: CurrentUser) -> CloneTermsState:
    require_org_member(user, org_id)
    return clones.terms_state(org_id, user.id)


@app.post("/clone-terms")
def accept_clone_terms(body: CloneTermsRequest, user: CurrentUser) -> CloneTermsState:
    """Accepts the clone terms for the workspace (owners and admins, once)."""
    require_org_member(user, body.org_id)
    try:
        return clones.accept_terms(body.org_id, user.id)
    except clones.CloneTermsRoleError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only owners and admins can accept the clone terms."
        ) from exc
    except clones.CloneDisabledError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, CLONE_DISABLED) from exc


CLONE_DISABLED = "Cloning is switched off for this workspace."


class CloneStarted(BaseModel):
    job: Job


@app.post("/templates/clone", status_code=status.HTTP_201_CREATED)
def clone_template(body: CloneRequest, user: CurrentUser) -> CloneStarted:
    """Starts cloning a page by address or pasted HTML, once the terms are accepted."""
    require_org_member(user, body.org_id)
    try:
        return CloneStarted(job=clones.start_clone(body.org_id, user.id, body))
    except clones.CloneDisabledError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, CLONE_DISABLED) from exc
    except clones.CloneTermsError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Accept the clone terms for this workspace first."
        ) from exc


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


class InstructionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    instructions: TemplateInstructions


class AnalyseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID


@app.post("/templates/{template_id}/analyse", status_code=status.HTTP_201_CREATED)
def analyse_template(template_id: UUID, body: AnalyseRequest, user: CurrentUser) -> CloneStarted:
    """Analyse again (B2.2): one Claude call, a few cents."""
    require_org_member(user, body.org_id)
    try:
        return CloneStarted(job=clones.start_analysis(body.org_id, user.id, template_id))
    except clones.NotACloneError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That cloned page isn't in your workspace."
        ) from exc
    except clones.CloneDisabledError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, CLONE_DISABLED) from exc


@app.post("/templates/{template_id}/shopify-check", status_code=status.HTTP_201_CREATED)
def check_template_layout(
    template_id: UUID, body: AnalyseRequest, user: CurrentUser
) -> CloneStarted:
    """Check layout (B4.3, D122): Shopify's render of the template's page compared with the page
    at three widths, as a job (about ten seconds, free)."""
    require_org_member(user, body.org_id)
    try:
        return CloneStarted(job=templates.start_layout_check(body.org_id, user.id, template_id))
    except templates.TemplateNotFoundError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That template isn't in your workspace."
        ) from exc


@app.post("/templates/{template_id}/review")
def confirm_template_review(
    template_id: UUID, body: TemplateEdit, user: CurrentUser
) -> TemplateEditorState:
    """Confirms a clone's analysis, so pages can be built from it (B2.2, D96)."""
    require_org_member(user, body.org_id)
    return _editor_call(
        templates.confirm_review, body.org_id, template_id, user.id, body.base_version
    )


@app.post("/templates/{template_id}/instructions")
def save_template_instructions(
    template_id: UUID, body: InstructionsRequest, user: CurrentUser
) -> TemplateEditorState:
    """Saves the template's rules (the editor's Rules tab)."""
    require_org_member(user, body.org_id)
    return _editor_call(templates.set_instructions, body.org_id, template_id, body.instructions)


@app.post("/templates/{template_id}/restore")
def restore_template_version(
    template_id: UUID, body: RestoreRequest, user: CurrentUser
) -> TemplateEditorState:
    require_org_member(user, body.org_id)
    return _editor_call(
        templates.restore, body.org_id, template_id, user.id, body.base_version, body.version
    )
