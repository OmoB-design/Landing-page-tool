"""Postgres connection pool (psycopg 3). The worker connects with full rights, bypassing RLS,
so every query on tenant data must filter by org_id itself (CLAUDE.md §6)."""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

from psycopg import Connection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings


@lru_cache
def get_pool() -> ConnectionPool[Connection[DictRow]]:
    settings = get_settings()
    return ConnectionPool(
        settings.database_url,
        min_size=1,
        max_size=settings.lp_worker_concurrency + 4,
        kwargs={"row_factory": dict_row},
        connection_class=Connection[DictRow],
        # A connection the server closed while it sat in the pool is replaced before use.
        check=ConnectionPool.check_connection,
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
