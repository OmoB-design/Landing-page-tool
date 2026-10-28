"""The pool tests a connection before use only when it has sat idle (D91): no database needed."""

import time
from typing import Any, cast

import pytest
from psycopg_pool import ConnectionPool

from app import db


class FakeConnection:
    """Stands in for a pooled connection: check_connection only needs a weak reference to it."""


@pytest.fixture
def tested(monkeypatch: pytest.MonkeyPatch) -> list[object]:
    calls: list[object] = []
    monkeypatch.setattr(ConnectionPool, "check_connection", staticmethod(calls.append))
    return calls


def test_a_new_connection_is_tested(tested: list[object]) -> None:
    conn = cast(Any, FakeConnection())
    db.check_connection(conn)
    assert tested == [conn]


def test_a_connection_used_moments_ago_is_not_tested(tested: list[object]) -> None:
    conn = cast(Any, FakeConnection())
    db.note_returned(conn)
    db.check_connection(conn)
    assert tested == []


def test_a_connection_idle_for_a_while_is_tested(
    tested: list[object], monkeypatch: pytest.MonkeyPatch
) -> None:
    conn = cast(Any, FakeConnection())
    db.note_returned(conn)
    later = time.monotonic() + db.RECHECK_AFTER_SECONDS + 1
    monkeypatch.setattr(time, "monotonic", lambda: later)
    db.check_connection(conn)
    assert tested == [conn]
