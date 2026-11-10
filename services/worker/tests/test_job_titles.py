"""The jobs tray's names for jobs (B7.1a): the web reads them from
apps/web/lib/jobs/job-titles.json, which must match this registry's titles exactly. If this fails
after adding or renaming a job kind, regenerate the file (the command is below) rather than
editing it by hand."""

import json
from pathlib import Path

import pytest

from app.jobs.registry import KINDS

TITLES = Path(__file__).resolve().parents[3] / "apps" / "web" / "lib" / "jobs" / "job-titles.json"


@pytest.mark.skipif(not TITLES.exists(), reason="the web app isn't beside the worker here")
def test_the_web_names_every_job_as_the_registry_does() -> None:
    # Regenerate: uv run python -c "import json; from app.jobs.registry import KINDS;
    # print(json.dumps({k: v.title for k, v in sorted(KINDS.items())}, indent=2))"
    # > ../../apps/web/lib/jobs/job-titles.json
    assert json.loads(TITLES.read_text()) == {k: v.title for k, v in sorted(KINDS.items())}
