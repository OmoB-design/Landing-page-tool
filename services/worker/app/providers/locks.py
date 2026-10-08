"""Org-scoped provider circuit breaker (BUILD_SPEC §6.4): when fal reports the account locked
or out of credit, image calls for that org fail fast for a while instead of each paying a
failed request. Stored in `provider_locks`, never in memory (D9)."""

import math
from datetime import UTC, datetime
from uuid import UUID

from app.db import transaction
from app.jobs.errors import UserFacingError


class ProviderLockedError(UserFacingError):
    pass


def lock(org_id: UUID, provider: str, reason: str, minutes: float) -> None:
    with transaction() as conn:
        conn.execute(
            """
            insert into provider_locks (org_id, provider, reason, until)
            values (%(org)s, %(provider)s, %(reason)s, now() + make_interval(secs => %(seconds)s))
            on conflict (org_id, provider)
            do update set reason = excluded.reason, until = excluded.until, created_at = now()
            """,
            {"org": org_id, "provider": provider, "reason": reason, "seconds": minutes * 60},
        )


def active_until(org_id: UUID, provider: str) -> datetime | None:
    with transaction() as conn:
        row = conn.execute(
            """
            select until from provider_locks
            where org_id = %(org)s and provider = %(provider)s and until > now()
            """,
            {"org": org_id, "provider": provider},
        ).fetchone()
    return row["until"] if row else None


def clear_expired(org_id: UUID) -> None:
    with transaction() as conn:
        conn.execute(
            "delete from provider_locks where org_id = %(org)s and until <= now()",
            {"org": org_id},
        )


def ensure_unlocked(org_id: UUID, provider: str, what: str) -> None:
    until = active_until(org_id, provider)
    if until is None:
        return
    minutes = max(1, math.ceil((until - datetime.now(UTC)).total_seconds() / 60))
    raise ProviderLockedError(
        f"{what} is paused for this workspace: the {provider} account needs attention "
        f"(locked or out of credit). Try again in about {minutes} minutes.",
        code="provider_locked",
    )
