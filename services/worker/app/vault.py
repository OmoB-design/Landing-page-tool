"""Secrets in Supabase Vault (D12, D44): tokens and client secrets are stored encrypted in
`vault.secrets` and read back through `vault.decrypted_secrets`, over the worker's own database
connection (no client library). Tables hold only the secret's id and its last four characters.
"""

import uuid
from typing import Any
from uuid import UUID


def store(conn: Any, secret: str, *, label: str) -> UUID:
    """Saves a secret and returns its id. `label` names what it is (never the secret)."""
    row = conn.execute(
        "select vault.create_secret(%(s)s, %(n)s, %(d)s) as id",
        {"s": secret, "n": f"{label}:{uuid.uuid4()}", "d": label},
    ).fetchone()
    return UUID(str(row["id"]))


def read(conn: Any, secret_id: UUID) -> str | None:
    row = conn.execute(
        "select decrypted_secret from vault.decrypted_secrets where id = %(id)s",
        {"id": secret_id},
    ).fetchone()
    return str(row["decrypted_secret"]) if row else None


def remove(conn: Any, secret_id: UUID) -> None:
    conn.execute("delete from vault.secrets where id = %(id)s", {"id": secret_id})


def last4(secret: str) -> str:
    return secret[-4:]
