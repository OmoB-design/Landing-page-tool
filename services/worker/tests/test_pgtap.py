"""The pgTAP files in supabase/tests/database, run through the worker's Postgres connection.

`supabase test db` runs pg_prove in Docker even for a linked project; this runs the same files
without it (D73). Each file wraps itself in begin ... rollback, so nothing is kept."""

from pathlib import Path

import psycopg
import pytest

from app.config import get_settings
from tests.conftest import needs_db

pytestmark = needs_db

SQL_DIR = Path(__file__).resolve().parents[3] / "supabase" / "tests" / "database"


def tap_output(sql: str) -> list[str]:
    """Every line pgTAP returns. Without parameters psycopg sends the file as one simple query,
    and each statement's result is a separate result set."""
    lines: list[str] = []
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        cur = conn.execute(sql)
        while True:
            if cur.description is not None:
                for row in cur.fetchall():
                    lines.extend(str(row[0]).splitlines())
            if not cur.nextset():
                break
    return lines


@pytest.mark.parametrize("path", sorted(SQL_DIR.glob("*.test.sql")), ids=lambda p: p.name)
def test_pgtap_file(path: Path) -> None:
    lines = tap_output(path.read_text())
    plans = [line for line in lines if line.startswith("1..")]
    assert plans, "no plan in the TAP output"
    planned = int(plans[0].removeprefix("1.."))
    failed = [line for line in lines if line.startswith("not ok")]
    passed = [line for line in lines if line.startswith("ok ")]
    assert not failed, "\n".join(lines)
    assert len(passed) == planned, "\n".join(lines)
