"""Postgres connection pool (psycopg 3). The worker connects with full rights, bypassing RLS,
so every query on tenant data must filter by org_id itself (CLAUDE.md §6)."""

import time
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any
from weakref import WeakKeyDictionary

from psycopg import Connection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings

# A connection used this recently is handed out without a test: the pooler drops idle connections
# only after minutes, and the test is a round trip to the database on every use (about 20 ms from
# Railway's Amsterdam to Supabase's Ireland, D91).
RECHECK_AFTER_SECONDS = 30.0
_returned_at: WeakKeyDictionary[Connection[DictRow], float] = WeakKeyDictionary()


def check_connection(conn: Connection[DictRow]) -> None:
    """Before a pooled connection is used: make sure the server still has it (one round trip),
    unless it was in use within the last RECHECK_AFTER_SECONDS. A dead one raises, and the pool
    replaces it."""
    returned = _returned_at.get(conn)
    if returned is not None and time.monotonic() - returned < RECHECK_AFTER_SECONDS:
        return
    ConnectionPool.check_connection(conn)


def note_returned(conn: Connection[DictRow]) -> None:
    """When a connection goes back to the pool: remember when, for check_connection."""
    _returned_at[conn] = time.monotonic()


@lru_cache
def get_pool() -> ConnectionPool[Connection[DictRow]]:
    settings = get_settings()
    return ConnectionPool(
        settings.database_url,
        # Two kept open, so the web app's calls made together (the build page's desk and
        # publishing) don't wait for a new connection.
        min_size=2,
        max_size=settings.lp_worker_concurrency + 4,
        kwargs={"row_factory": dict_row},
        connection_class=Connection[DictRow],
        # A connection the server closed while it sat in the pool is replaced before use.
        check=check_connection,
        reset=note_returned,
        open=True,
    )


@contextmanager
def transaction() -> Iterator[Connection[DictRow]]:
    """A pooled connection inside one transaction: committed on exit, rolled back on error."""
    with get_pool().connection() as conn, conn.transaction():
        yield conn


def fetch_one(sql: str, params: dict[str, Any] | None = None) -> DictRow | None:
    with transaction() as conn:
        return conn.execute(sql, params).fetchone()
