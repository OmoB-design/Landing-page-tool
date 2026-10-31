"""The clone path's front door (BUILD_SPEC §3, §8.4; D4, D33): the clone terms, accepted once
per workspace by an owner or admin, and starting a clone. Tenants can't write either
`orgs.settings` or the acceptance themselves (D33), so both go through here."""

import uuid
from typing import Any
from uuid import UUID

from app.db import transaction
from app.jobs import queue
from app.jobs.kinds.template_clone import TemplateClonePayload, folder
from app.jobs.models import Job
from app.models.clone import CloneRequest, CloneTermsState
from app.providers import storage

MANAGERS = {"owner", "admin"}


class CloneDisabledError(Exception):
    pass


class CloneTermsError(Exception):
    pass


class CloneTermsRoleError(Exception):
    pass


class NotACloneError(Exception):
    pass


def _org(conn: Any, org_id: UUID, user_id: UUID) -> dict[str, Any]:
    row = conn.execute(
        """
        select o.settings, o.clone_terms_accepted_at, o.clone_terms_accepted_by,
               coalesce(nullif(p.display_name, ''), u.raw_user_meta_data ->> 'full_name',
                        u.email) as accepted_by_name,
               m.role
        from orgs o
        left join org_members m on m.org_id = o.id and m.user_id = %(u)s
        left join profiles p on p.user_id = o.clone_terms_accepted_by
        left join auth.users u on u.id = o.clone_terms_accepted_by
        where o.id = %(o)s
        """,
        {"o": org_id, "u": user_id},
    ).fetchone()
    assert row is not None  # membership was checked
    return dict(row)


def _state(org: dict[str, Any]) -> CloneTermsState:
    return CloneTermsState(
        clone_enabled=bool((org["settings"] or {}).get("clone_enabled", True)),
        accepted_at=org["clone_terms_accepted_at"],
        accepted_by=org["accepted_by_name"] if org["clone_terms_accepted_at"] else None,
        can_accept=org["role"] in MANAGERS,
    )


def terms_state(org_id: UUID, user_id: UUID) -> CloneTermsState:
    with transaction() as conn:
        return _state(_org(conn, org_id, user_id))


def accept_terms(org_id: UUID, user_id: UUID) -> CloneTermsState:
    """Records the workspace's acceptance (once: a second acceptance keeps the first)."""
    with transaction() as conn:
        org = _org(conn, org_id, user_id)
        if org["role"] not in MANAGERS:
            raise CloneTermsRoleError
        if not _state(org).clone_enabled:
            raise CloneDisabledError
        conn.execute(
            """
            update orgs set clone_terms_accepted_at = now(), clone_terms_accepted_by = %(u)s
            where id = %(o)s and clone_terms_accepted_at is null
            """,
            {"o": org_id, "u": user_id},
        )
        return _state(_org(conn, org_id, user_id))


def start_clone(org_id: UUID, user_id: UUID, request: CloneRequest) -> Job:
    """Queues a `template_clone` job. Pasted HTML is saved first as the new template's
    source.html, so the job's payload stays small."""
    with transaction() as conn:
        state = _state(_org(conn, org_id, user_id))
    if not state.clone_enabled:
        raise CloneDisabledError
    if state.accepted_at is None:
        raise CloneTermsError
    template_id = uuid.uuid4()
    payload = TemplateClonePayload(
        template_id=template_id,
        url=request.url,
        pasted=request.html is not None,
        source_url=request.source_url,
        name=request.name,
        type=request.type,
    )
    if request.html is not None:
        storage.upload(
            "templates", f"{folder(org_id, template_id)}/source.html",
            request.html.encode("utf-8"), "text/html; charset=utf-8", upsert=True,
        )  # fmt: skip
    try:
        job, _ = queue.enqueue(
            org_id=org_id,
            kind="template_clone",
            payload=payload.model_dump(mode="json"),
            created_by=user_id,
            max_attempts=1,
        )
    except Exception:
        if request.html is not None:
            storage.remove("templates", [f"{folder(org_id, template_id)}/source.html"])
        raise
    return job


def start_analysis(org_id: UUID, user_id: UUID, template_id: UUID) -> Job:
    """Analyse again (B2.2): queues `template_analyze` for one of the org's clones. A second
    request while one runs returns that job."""
    with transaction() as conn:
        state = _state(_org(conn, org_id, user_id))
        row = conn.execute(
            """
            select origin from templates
            where id = %(t)s and org_id = %(o)s and deleted_at is null
            """,
            {"t": template_id, "o": org_id},
        ).fetchone()
    if row is None or row["origin"] != "cloned":
        raise NotACloneError
    if not state.clone_enabled:
        raise CloneDisabledError
    job, _ = queue.enqueue(
        org_id=org_id,
        kind="template_analyze",
        payload={"template_id": str(template_id)},
        created_by=user_id,
        dedupe_key=f"template_analyze:{template_id}",
        max_attempts=1,
    )
    return job
