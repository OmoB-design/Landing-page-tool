"""Members and invites (B6.1, D129).

Everyone in a workspace can see who's in it. Owners and admins invite people (by email, with a
role), change roles and remove people; anyone can leave. The rules:
  * a workspace always keeps at least one owner;
  * only owners make someone an owner, change an owner's role or remove an owner (admins manage
    admins and members);
  * an invite is for one email, lasts 7 days, and inviting the same email again refreshes it.

An invite's link carries a token: the invite's id with a signature made from the worker's secret
(`LP_SHARE_SECRET`, as client links, D119), so the link can be copied again any time and the
database holds nothing that opens it. Someone new signs up from the link (the sign-up trigger
puts them straight into the workspace, see the members_invites migration); someone with an
account signs in with the invited email and accepts here.

Members and invites are written here only (members' direct writes are revoked).
"""

import hashlib
import hmac
import re
import secrets
from typing import Any
from uuid import UUID

from app.db import transaction
from app.models.members import (
    Accepted,
    Invite,
    InviteInfo,
    Member,
    MembersState,
    Role,
)
from app.share import _b64, _secret, _unb64

MANAGERS = {"owner", "admin"}
ORDER = {"owner": 0, "admin": 1, "member": 2}
_SIGNATURE_BYTES = 18
LAST_OWNER = "A workspace needs at least one owner. Make someone else an owner first."
OWNERS_ONLY = "Only owners can do that to an owner."


class MembersForbiddenError(Exception):
    """The person asking isn't allowed to do this."""


class MembersRefusedError(Exception):
    """Allowed in general, but not like this (the message says why)."""


class MembersNotFoundError(Exception):
    """No such member or invite in this workspace."""


# ── Tokens ───────────────────────────────────────────────────────────────────


def _signature(invite_id: UUID) -> bytes:
    digest = hmac.new(_secret(), b"lp-invite-v1:" + invite_id.bytes, hashlib.sha256).digest()
    return digest[:_SIGNATURE_BYTES]


def token_for(invite_id: UUID) -> str:
    """The invite's token: its id, then its signature (46 URL-safe characters)."""
    return _b64(invite_id.bytes) + _b64(_signature(invite_id))


def invite_id_from(token: str) -> UUID | None:
    """The invite a token belongs to, or None when it isn't one of ours."""
    if len(token) != 46 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        return None
    try:
        invite_id = UUID(bytes=_unb64(token[:22]))
        signature = _unb64(token[22:])
    except ValueError:
        return None
    return invite_id if hmac.compare_digest(signature, _signature(invite_id)) else None


# ── Reading ──────────────────────────────────────────────────────────────────


def _role(conn: Any, org_id: UUID, user_id: UUID, *, lock: bool = False) -> str | None:
    row = conn.execute(
        f"""
        select role::text as role from org_members
        where org_id = %(org)s and user_id = %(user)s {"for update" if lock else ""}
        """,
        {"org": org_id, "user": user_id},
    ).fetchone()
    return row["role"] if row else None


def _owners(conn: Any, org_id: UUID) -> int:
    # Locks the workspace's owner rows, so two changes can't both leave it without one.
    rows = conn.execute(
        "select user_id from org_members where org_id = %(org)s and role = 'owner' for update",
        {"org": org_id},
    ).fetchall()
    return len(rows)


def _state(conn: Any, org_id: UUID, user_id: UUID) -> MembersState:
    your_role = _role(conn, org_id, user_id)
    if your_role is None:
        raise MembersForbiddenError
    rows = conn.execute(
        """
        select m.user_id, m.role::text as role, m.created_at, u.email,
               coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)) as name
        from org_members m
        join auth.users u on u.id = m.user_id
        left join profiles p on p.user_id = m.user_id
        where m.org_id = %(org)s
        """,
        {"org": org_id},
    ).fetchall()
    members = sorted(
        (
            Member(
                user_id=r["user_id"],
                name=r["name"] or "",
                email=r["email"] or "",
                role=r["role"],
                joined_at=r["created_at"],
                you=r["user_id"] == user_id,
            )
            for r in rows
        ),
        key=lambda m: (ORDER[m.role], m.name.lower()),
    )
    invites: list[Invite] = []
    if your_role in MANAGERS:
        for r in conn.execute(
            """
            select i.id, i.email, i.role::text as role, i.created_at, i.expires_at,
                   i.expires_at <= now() as expired,
                   coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)) as invited_by
            from invites i
            left join auth.users u on u.id = i.invited_by
            left join profiles p on p.user_id = i.invited_by
            where i.org_id = %(org)s and i.accepted_at is null and i.revoked_at is null
            order by i.created_at desc
            """,
            {"org": org_id},
        ).fetchall():
            invites.append(
                Invite(
                    id=r["id"],
                    email=r["email"],
                    role=r["role"],
                    invited_by=r["invited_by"],
                    created_at=r["created_at"],
                    expires_at=r["expires_at"],
                    expired=r["expired"],
                    token=token_for(r["id"]),
                )
            )
    return MembersState(your_role=your_role, members=members, invites=invites)  # type: ignore[arg-type]


def members_state(org_id: UUID, user_id: UUID) -> MembersState:
    with transaction() as conn:
        return _state(conn, org_id, user_id)


# ── Invites ──────────────────────────────────────────────────────────────────


def _manager(conn: Any, org_id: UUID, user_id: UUID) -> str:
    role = _role(conn, org_id, user_id)
    if role not in MANAGERS:
        raise MembersForbiddenError
    assert role is not None
    return role


def invite(org_id: UUID, user_id: UUID, email: str, role: Role) -> MembersState:
    """Invites an email with a role, or refreshes its open invite (a new week, the new role)."""
    _secret()
    email = email.strip().lower()
    with transaction() as conn:
        actor = _manager(conn, org_id, user_id)
        if role == "owner" and actor != "owner":
            raise MembersRefusedError("Only owners can invite an owner.")
        member = conn.execute(
            """
            select 1 from org_members m join auth.users u on u.id = m.user_id
            where m.org_id = %(org)s and lower(u.email) = %(email)s
            """,
            {"org": org_id, "email": email},
        ).fetchone()
        if member:
            raise MembersRefusedError(f"{email} is already in this workspace.")
        existing = conn.execute(
            """
            select id, role::text as role from invites
            where org_id = %(org)s and email = %(email)s
              and accepted_at is null and revoked_at is null
            for update
            """,
            {"org": org_id, "email": email},
        ).fetchone()
        if existing and existing["role"] == "owner" and actor != "owner":
            raise MembersRefusedError(OWNERS_ONLY)
        if existing:
            conn.execute(
                """
                update invites set role = %(role)s, invited_by = %(by)s, created_at = now(),
                       expires_at = now() + interval '7 days'
                where id = %(id)s
                """,
                {"role": role, "by": user_id, "id": existing["id"]},
            )
        else:
            conn.execute(
                """
                insert into invites (org_id, email, role, invited_by)
                values (%(org)s, %(email)s, %(role)s, %(by)s)
                """,
                {"org": org_id, "email": email, "role": role, "by": user_id},
            )
        return _state(conn, org_id, user_id)


def revoke(org_id: UUID, user_id: UUID, invite_id: UUID) -> MembersState:
    """Revokes an open invite: its link stops working at once."""
    with transaction() as conn:
        actor = _manager(conn, org_id, user_id)
        row = conn.execute(
            """
            select role::text as role from invites
            where id = %(id)s and org_id = %(org)s and accepted_at is null and revoked_at is null
            for update
            """,
            {"id": invite_id, "org": org_id},
        ).fetchone()
        if row is None:
            raise MembersNotFoundError
        if row["role"] == "owner" and actor != "owner":
            raise MembersRefusedError(OWNERS_ONLY)
        conn.execute("update invites set revoked_at = now() where id = %(id)s", {"id": invite_id})
        return _state(conn, org_id, user_id)


# ── Members ──────────────────────────────────────────────────────────────────


def set_role(org_id: UUID, user_id: UUID, target_id: UUID, role: Role) -> MembersState:
    """Changes someone's role (owners and admins; owners only where an owner is involved)."""
    with transaction() as conn:
        actor = _manager(conn, org_id, user_id)
        current = _role(conn, org_id, target_id, lock=True)
        if current is None:
            raise MembersNotFoundError
        if current == role:
            return _state(conn, org_id, user_id)
        if (current == "owner" or role == "owner") and actor != "owner":
            raise MembersRefusedError(OWNERS_ONLY)
        if current == "owner" and _owners(conn, org_id) <= 1:
            raise MembersRefusedError(LAST_OWNER)
        conn.execute(
            "update org_members set role = %(role)s where org_id = %(org)s and user_id = %(user)s",
            {"role": role, "org": org_id, "user": target_id},
        )
        return _state(conn, org_id, user_id)


def _rehome(conn: Any, org_id: UUID, user_id: UUID) -> None:
    """After someone leaves a workspace: their profile points at another of theirs, or a new one
    of their own when they have none (as a sign-up gets), so the app always has a workspace."""
    other = conn.execute(
        """
        select org_id from org_members where user_id = %(user)s and org_id <> %(org)s
        order by created_at limit 1
        """,
        {"user": user_id, "org": org_id},
    ).fetchone()
    if other:
        conn.execute(
            """
            update profiles set default_org_id = %(other)s
            where user_id = %(user)s and (default_org_id = %(org)s or default_org_id is null)
            """,
            {"other": other["org_id"], "user": user_id, "org": org_id},
        )
        return
    person = conn.execute(
        """
        select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1), 'My workspace')
               as name
        from auth.users u left join profiles p on p.user_id = u.id
        where u.id = %(user)s
        """,
        {"user": user_id},
    ).fetchone()
    name = person["name"] if person else "My workspace"
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"
    new_org = conn.execute(
        "insert into orgs (name, slug) values (%(name)s, %(slug)s) returning id",
        {"name": name, "slug": f"{slug}-{str(user_id)[:6]}-{secrets.token_hex(3)}"},
    ).fetchone()["id"]
    conn.execute(
        "insert into org_members (org_id, user_id, role) values (%(org)s, %(user)s, 'owner')",
        {"org": new_org, "user": user_id},
    )
    conn.execute(
        "update profiles set default_org_id = %(org)s where user_id = %(user)s",
        {"org": new_org, "user": user_id},
    )


def remove(org_id: UUID, user_id: UUID, target_id: UUID) -> MembersState | None:
    """Removes someone, or lets someone leave (themselves). None when the asker left."""
    with transaction() as conn:
        leaving = target_id == user_id
        actor = _role(conn, org_id, user_id)
        if actor is None or (not leaving and actor not in MANAGERS):
            raise MembersForbiddenError
        current = _role(conn, org_id, target_id, lock=True)
        if current is None:
            raise MembersNotFoundError
        if current == "owner" and not leaving and actor != "owner":
            raise MembersRefusedError(OWNERS_ONLY)
        if current == "owner" and _owners(conn, org_id) <= 1:
            raise MembersRefusedError(LAST_OWNER)
        conn.execute(
            "delete from org_members where org_id = %(org)s and user_id = %(user)s",
            {"org": org_id, "user": target_id},
        )
        _rehome(conn, org_id, target_id)
        return None if leaving else _state(conn, org_id, user_id)


# ── Accepting ────────────────────────────────────────────────────────────────


def _invite_row(conn: Any, invite_id: UUID, *, lock: bool = False) -> dict[str, Any] | None:
    row: dict[str, Any] | None = conn.execute(
        f"""
        select i.id, i.org_id, i.email, i.role::text as role, i.accepted_at, i.revoked_at,
               i.expires_at <= now() as expired, o.name as workspace,
               coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)) as invited_by
        from invites i
        join orgs o on o.id = i.org_id
        left join auth.users u on u.id = i.invited_by
        left join profiles p on p.user_id = i.invited_by
        where i.id = %(id)s
        {"for update of i" if lock else ""}
        """,
        {"id": invite_id},
    ).fetchone()
    return row


def _status(row: dict[str, Any]) -> str:
    if row["accepted_at"] is not None:
        return "accepted"
    if row["revoked_at"] is not None:
        return "revoked"
    return "expired" if row["expired"] else "open"


def invite_info(token: str) -> InviteInfo | None:
    """The invite page's facts (no sign-in), or None when the token isn't one of ours."""
    invite_id = invite_id_from(token)
    if invite_id is None:
        return None
    with transaction() as conn:
        row = _invite_row(conn, invite_id)
    if row is None:
        return None
    return InviteInfo(
        status=_status(row),  # type: ignore[arg-type]
        invite_id=row["id"],
        workspace=row["workspace"],
        email=row["email"],
        role=row["role"],
        invited_by=row["invited_by"],
    )


REFUSED = {
    "accepted": "This invite has already been used.",
    "revoked": "This invite was turned off. Ask whoever invited you for a new one.",
    "expired": "This invite has expired. Ask whoever invited you for a new one.",
}


def accept(token: str, user_id: UUID) -> Accepted:
    """Joins the signed-in person to the invite's workspace, with its role, and opens it."""
    invite_id = invite_id_from(token)
    if invite_id is None:
        raise MembersNotFoundError
    with transaction() as conn:
        row = _invite_row(conn, invite_id, lock=True)
        if row is None:
            raise MembersNotFoundError
        status = _status(row)
        if status != "open":
            raise MembersRefusedError(REFUSED[status])
        person = conn.execute(
            "select lower(email) as email from auth.users where id = %(user)s", {"user": user_id}
        ).fetchone()
        if person is None or person["email"] != row["email"]:
            raise MembersRefusedError(
                f"This invite is for {row['email']}. Sign in with that email to accept it."
            )
        joined = conn.execute(
            """
            insert into org_members (org_id, user_id, role) values (%(org)s, %(user)s, %(role)s)
            on conflict (org_id, user_id) do nothing
            returning user_id
            """,
            {"org": row["org_id"], "user": user_id, "role": row["role"]},
        ).fetchone()
        conn.execute(
            "update invites set accepted_at = now(), accepted_by = %(user)s where id = %(id)s",
            {"user": user_id, "id": invite_id},
        )
        conn.execute(
            "update profiles set default_org_id = %(org)s where user_id = %(user)s",
            {"org": row["org_id"], "user": user_id},
        )
        return Accepted(
            org_id=row["org_id"], workspace=row["workspace"], already_member=joined is None
        )
