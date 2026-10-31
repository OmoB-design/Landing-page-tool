"""`template_analyze` end to end against the database and storage (the model mocked, or
replaced by a scripted answer): sections marked as a new version, the blueprint and rules, the
review that unlocks building, analysing again, nothing saved when the answer is empty (D24),
the API, and the publish rule for clones whose leaks aren't scored yet (D96)."""

import json
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import builds, templates
from app.config import Settings
from app.db import transaction
from app.engines import clone
from app.engines.html import parse
from app.jobs import queue
from app.jobs.kinds import template_analyze
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.models.build import BuildWizard
from app.models.template import TemplateInstructions
from app.providers import anthropic, storage
from app.publish import gate
from tests.conftest import DbUser, job_row, needs_db

FIXTURES = Path(__file__).parent / "fixtures" / "clone"
FLAT = (FIXTURES / "funnelish_flat.html").read_text()
KINDS = {
    "template_analyze": JobKind(
        "template_analyze", "Page analysis", template_analyze.run,
        template_analyze.TemplateAnalyzePayload, max_attempts=1,
    ),
}  # fmt: skip


@pytest.fixture
def cloned(user: DbUser) -> Iterator[uuid.UUID]:
    """A cloned template as B2.1 leaves it: version 1, no sections, no blueprint."""
    template_id = uuid.uuid4()
    base = f"{user.org_id}/{template_id}"
    html = clone.clone_page(FLAT, "https://try.vitalis.test/cardio").html
    storage.upload("templates", f"{base}/v1.html", html.encode(), "text/html", upsert=True)
    with transaction() as conn:
        conn.execute(
            """
            insert into templates (id, org_id, origin, slug, name, type, html_path, source_url,
                                   source_host, source_name, platform, version, created_by)
            values (%(id)s, %(o)s, 'cloned', %(slug)s, 'Cardio report', 'advertorial',
                    %(path)s, 'https://try.vitalis.test/cardio', 'try.vitalis.test', 'Vitalis',
                    'funnelish', 1, %(u)s)
            """,
            {"id": template_id, "o": user.org_id, "slug": f"cardio-{template_id.hex[:6]}",
             "path": f"{base}/v1.html", "u": user.id},
        )  # fmt: skip
        conn.execute(
            "insert into template_versions (template_id, version, html_path, sections, reason) "
            "values (%(t)s, 1, %(p)s, '[]', 'Cloned from try.vitalis.test')",
            {"t": template_id, "p": f"{base}/v1.html"},
        )
    yield template_id
    storage.remove_folder("templates", base)


def analyse(user: DbUser, settings: Settings, template_id: uuid.UUID) -> dict[str, Any]:
    job, _ = queue.enqueue(
        org_id=user.org_id, kind="template_analyze",
        payload={"template_id": str(template_id)}, created_by=user.id, max_attempts=1,
    )  # fmt: skip
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 2, ["template_analyze"])
    assert claimed is not None and claimed.id == job.id
    runner.execute(claimed)
    return job_row(job.id)


def row(template_id: uuid.UUID) -> dict[str, Any]:
    with transaction() as conn:
        found = conn.execute(
            "select * from templates where id = %(t)s", {"t": template_id}
        ).fetchone()
    assert found is not None
    return dict(found)


def page_of(template_id: uuid.UUID) -> str:
    return storage.download("templates", row(template_id)["html_path"]).decode()


def product(user: DbUser) -> tuple[uuid.UUID, uuid.UUID]:
    with transaction() as conn:
        brand = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Lume', 'LUM') returning id",
            {"o": user.org_id},
        ).fetchone()
        assert brand is not None
        item = conn.execute(
            "insert into products (org_id, brand_id, handle, name) values "
            "(%(o)s, %(b)s, 'serum', 'Serum') returning id",
            {"o": user.org_id, "b": brand["id"]},
        ).fetchone()
        assert item is not None
    return brand["id"], item["id"]


@needs_db
def test_analysis_marks_sections_and_building_waits_for_the_review(
    user: DbUser, cloned: uuid.UUID, fast_settings: Settings
) -> None:
    job = analyse(user, fast_settings, cloned)
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["ai"] == "mock"
    saved = row(cloned)
    assert saved["version"] == 2 and saved["reviewed_at"] is None
    blueprint = saved["blueprint"]
    assert blueprint["palette"]["primary"] == "#a82420"
    assert "Vitalis" in blueprint["brand_tokens"]
    assert any(h.endswith("/checkout") for h in blueprint["cta_hrefs"])
    rules = TemplateInstructions.model_validate(saved["instructions"])
    assert "Vitalis" in rules.forbidden_terms
    assert {c.match for c in rules.length_caps} >= {"h1@", "h2@"}
    assert len(saved["editor_map"]["sections"]) == job["result"]["sections"]

    state = templates.editor_state(user.org_id, cloned)
    labels = [s.label for s in state.sections]
    assert "What actually works" in labels and state.template.ready is False
    assert state.template.analysis is not None and state.template.analysis.ai == "mock"
    assert state.template.source is not None and state.template.source.platform == "funnelish"
    assert state.versions[0].reason == f"Analysed: {len(labels)} sections"
    assert parse(page_of(cloned)).select_one('[data-lp-section="what-actually-works"]')

    brand_id, product_id = product(user)
    with pytest.raises(builds.TemplateNotReadyError):
        builds.create_build(
            org_id=user.org_id, template_id=cloned, brand_id=brand_id, product_id=product_id,
            wizard=BuildWizard(), created_by=user.id,
        )  # fmt: skip

    confirmed = templates.confirm_review(user.org_id, cloned, user.id, 2)
    assert confirmed.template.ready is True
    assert confirmed.template.analysis and confirmed.template.analysis.reviewed_by == "Worker Test"
    _, build_job = builds.create_build(
        org_id=user.org_id, template_id=cloned, brand_id=brand_id, product_id=product_id,
        wizard=BuildWizard(), created_by=user.id,
    )  # fmt: skip
    with transaction() as conn:
        conn.execute("update jobs set status = 'cancelled' where id = %(j)s", {"j": build_job.id})

    # Analysed again: the marks are redone (not nested), and it needs a fresh review.
    again = analyse(user, fast_settings, cloned)
    assert again["status"] == "succeeded", again["error"]
    saved = row(cloned)
    assert saved["version"] == 3 and saved["reviewed_at"] is None
    page = parse(page_of(cloned))
    assert not page.select("[data-lp-wrap] [data-lp-wrap]")
    assert len(page.select("[data-lp-section]")) == again["result"]["sections"]


@needs_db
def test_the_answer_maps_ids_to_the_page_and_an_empty_one_saves_nothing(
    user: DbUser, cloned: uuid.UUID, fast_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    answers: list[dict[str, Any]] = []

    def scripted(**_: Any) -> anthropic.LLMResult:
        return anthropic.LLMResult(
            text=json.dumps(answers.pop(0)), model="claude-sonnet-5-5",
            requested_model="claude-sonnet-5-5", input_tokens=900, output_tokens=300,
            cost_usd=None, stop_reason="end_turn", fell_back=False, mock=False,
        )  # fmt: skip

    monkeypatch.setattr(anthropic, "generate", scripted)
    answer = {
        "palette": {"primary": "#A82420", "dark": "not a colour", "tint": "#e6f4f1",
                    "accent": "#a82420"},
        "brand_tokens": ["Vitalis", "Vitalis Aged Garlic Complex With CoQ10 Daily", "Vitalis"],
        # Images 0 and 1 are the same picture (the page repeats it): one logo, not two.
        "logo_images": [0, 1, 999], "cta_links": [999], "variant_blocks": ["b4"],
        "sections": [
            {"blocks": ["b2"], "role": "hero", "label": "Hero"},
            {"blocks": ["b3", "b4"], "role": "mechanism", "label": "How it works"},
            {"blocks": ["b7"], "role": "footer_cta", "label": "Footer"},
        ],
        "keep_images": [0], "generic_images": [0], "forbidden_terms": ["Vitalis", "Dr. Reyes"],
        "copy_rules": "First person, like a diary.", "image_rules": "", "notes": "Flat page.",
    }  # fmt: skip
    answers.append(answer)
    job = analyse(user, fast_settings, cloned)
    assert job["status"] == "succeeded", job["error"]
    saved = row(cloned)
    blueprint = saved["blueprint"]
    assert blueprint["ai"] == "claude"
    assert blueprint["palette"] == {
        "primary": "#a82420", "dark": None, "tint": "#e6f4f1", "accent": "#a82420",
    }  # fmt: skip
    assert blueprint["brand_tokens"] == ["Vitalis"]  # the long phrase is never a token
    assert blueprint["logo_srcs"] == ["https://img.funnelish.test/p.webp"]
    assert blueprint["cta_hrefs"] == []  # 999 isn't on the page
    assert blueprint["variant_sections"] == ["how-it-works"]
    rules = saved["instructions"]
    assert rules["keep_images"] == ["https://img.funnelish.test/p.webp"]
    assert rules["generic_images"] == []  # kept images win
    assert rules["forbidden_terms"] == ["Vitalis", "Dr. Reyes"]
    assert rules["copy_rules"] == "First person, like a diary."

    # An answer with no usable sections changes nothing (D24).
    answers.append({**answer, "sections": [{"blocks": ["b99"], "role": "other", "label": "X"}]})
    failed = analyse(user, fast_settings, cloned)
    assert failed["status"] == "failed"
    assert "found no sections" in failed["error"]["message"]
    assert row(cloned)["version"] == 2 and row(cloned)["blueprint"] == blueprint


@needs_db
def test_the_analysis_api(
    user: DbUser,
    cloned: uuid.UUID,
    fast_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import auth
    from app.main import app
    from tests.test_api import FakeJwksClient, bearer

    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient())
    body = {"org_id": str(user.org_id)}
    with TestClient(app) as client:
        first = client.post(f"/templates/{cloned}/analyse", json=body, headers=bearer(user))
        second = client.post(f"/templates/{cloned}/analyse", json=body, headers=bearer(user))
        assert first.status_code == 201
        assert first.json()["job"]["id"] == second.json()["job"]["id"]  # one at a time
        missing = client.post(f"/templates/{uuid.uuid4()}/analyse", json=body, headers=bearer(user))
        assert missing.status_code == 404

        runner = Runner(fast_settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
        claimed = queue.claim(runner.worker_id, 2, ["template_analyze"])
        assert claimed is not None
        runner.execute(claimed)

        stale = client.post(
            f"/templates/{cloned}/review", json={**body, "base_version": 1}, headers=bearer(user)
        )
        assert stale.status_code == 409
        review = client.post(
            f"/templates/{cloned}/review", json={**body, "base_version": 2}, headers=bearer(user)
        )
        assert review.status_code == 200 and review.json()["template"]["ready"] is True

        rules = client.post(
            f"/templates/{cloned}/instructions",
            json={**body, "instructions": {
                "forbidden_terms": ["Vitalis", "  Vitalis ", "", "Dr.  Reyes"],
                "copy_rules": "  Keep it plain.  ",
            }},
            headers=bearer(user),
        )  # fmt: skip
        assert rules.status_code == 200
        assert rules.json()["instructions"]["forbidden_terms"] == ["Vitalis", "Dr. Reyes"]
        assert rules.json()["instructions"]["copy_rules"] == "Keep it plain."
        unknown = client.post(
            f"/templates/{cloned}/instructions",
            json={**body, "instructions": {"forbiden_terms": ["x"]}},
            headers=bearer(user),
        )
        assert unknown.status_code == 422  # a typo never silently does nothing


def test_a_clone_build_is_not_published_until_its_leaks_are_scored() -> None:
    unscored = gate.blockers({}, mock_images=False, origin="cloned", allow_placeholders=False)
    assert [(b.code, b.overridable) for b in unscored] == [("residue_unscored", False)]
    assert not gate.can_publish(unscored, override=True)
    scored = gate.blockers(
        {"residue": {"score": 97}}, mock_images=False, origin="cloned", allow_placeholders=False
    )
    assert scored == []
    owned = gate.blockers({}, mock_images=False, origin="owned", allow_placeholders=False)
    assert owned == []
