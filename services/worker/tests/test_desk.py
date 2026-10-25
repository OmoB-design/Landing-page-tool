"""Review desk (BUILD_SPEC §11.1, B1.4a, D84): the proof marks and claim locations; copy edits,
approval, snapshots, undo and restore against the database and storage, through the API."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import transaction
from app.engines import compliance, fragments, paragraphs, proof
from app.engines.html import parse
from app.providers import storage
from tests.conftest import DESK_PAGE, DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)

PAGE = DESK_PAGE


# ── engines ───────────────────────────────────────────────────────────────────


def test_proof_marks_each_sentence_with_the_fragment_id() -> None:
    marked = parse(proof.mark(PAGE))
    spans = marked.select("[data-lp-frag]")
    ids = {f.id: f for f in fragments.dump(PAGE)}
    # Every fragment but the textarea's is marked, with the same id and text.
    assert [s["data-lp-frag"] for s in spans] == [i for i in ids if ids[i].text != "Leave a note"]
    assert all(s.get_text().strip() == ids[str(s["data-lp-frag"])].text for s in spans)
    locked = marked.select("[data-lp-frag-locked]")
    assert [s.get_text() for s in locked] == ["$29"]
    textarea = marked.select_one("textarea")
    assert textarea is not None and textarea.get_text() == "Leave a note"


def test_claims_carry_the_sentence_they_sit_in() -> None:
    ids = {f.text: f.id for f in fragments.dump(PAGE)}
    finding = next(
        f
        for f in compliance.scan(PAGE)["findings"]  # type: ignore[attr-defined]
        if f["rule"] == "clinically_proven"
    )
    assert finding["fragment"] == ids["Clinically proven to calm redness."]
    split = '<section data-lp-section="hero"><p>Clinically <b>proven</b> results</p></section>'
    block = compliance.scan(split)["findings"][0]  # type: ignore[index]
    assert block["fragment"] == "f0001"


# ── the desk, through the API ─────────────────────────────────────────────────


def desk(client: TestClient, user: DbUser, build: dict[str, Any]) -> dict[str, Any]:
    response = client.get(
        f"/builds/{build['id']}/desk", params={"org_id": build["org_id"]}, headers=bearer(user)
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def fragment(state: dict[str, Any], text: str) -> dict[str, Any]:
    found: dict[str, Any] = next(p for p in state["paragraphs"] if p["text"] == text)
    return found


def edit(
    client: TestClient,
    user: DbUser,
    build: dict[str, Any],
    state: dict[str, Any],
    original: str,
    text: str,
) -> Any:
    target = fragment(state, original)
    return client.post(
        f"/builds/{build['id']}/copy",
        json={
            "org_id": build["org_id"],
            "base_version": state["build"]["page_version"],
            "edits": [{"block": target["number"], "original": original, "text": text}],
        },
        headers=bearer(user),
    )


def post(client: TestClient, user: DbUser, build: dict[str, Any], action: str, **body: Any) -> Any:
    return client.post(
        f"/builds/{build['id']}/{action}",
        json={"org_id": build["org_id"], **body},
        headers=bearer(user),
    )


def build_row(build: dict[str, Any]) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute(
            "select status, export_html_path, report, working_html_path from builds "
            "where id = %(b)s",
            {"b": build["id"]},
        ).fetchone()
    assert row is not None
    return dict(row)


@needs_db
def test_the_desk_lists_every_sentence(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    assert state["build"]["status"] == "needs_review" and state["build"]["page_version"] == 1
    assert state["snapshots"] == []
    texts = [(f["text"], f["section"], f["locked"]) for f in state["fragments"]]
    assert ("$29", "hero", True) in texts
    paras = [(p["text"], p["section"], p["kind"], p["locked_parts"]) for p in state["paragraphs"]]
    assert ("Glow in 7 days", "hero", "Headline", []) in paras
    assert ("Only $29 today", "hero", "Paragraph", ["$29"]) in paras
    assert ("Is it gentle?", "faq", "Paragraph", []) in paras

    proof_page = client.get(
        f"/builds/{finished['id']}/proof",
        params={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert proof_page.status_code == 200 and proof_page.headers["x-page-version"] == "1"
    assert 'data-lp-frag="f0001"' in proof_page.text


@needs_db
def test_an_edit_snapshots_the_page_rechecks_claims_and_outdates_the_export(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    response = edit(
        client, user, finished, state, "Clinically proven to calm redness.", "Calms redness."
    )
    assert response.status_code == 200, response.text
    after = response.json()
    assert after["build"]["page_version"] == 2
    assert fragment(after, "Calms redness.")["edited"] is True
    assert [s["reason"] for s in after["snapshots"]] == ["Edited a line in hero"]
    row = build_row(finished)
    assert row["export_html_path"] is None
    assert row["working_html_path"].endswith("/pages/v2.html")
    assert row["report"]["compliance"]["clean"] is True
    assert "Calms redness." in storage.download("builds", row["working_html_path"]).decode()


@needs_db
def test_stale_versions_changed_lines_locked_and_empty_lines_are_refused(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    assert edit(client, user, finished, state, "Is it gentle?", "Is it kind?").status_code == 200
    # The same tab again, on the version it loaded: someone changed the page since.
    stale = edit(client, user, finished, state, "Yes, for every skin.", "Yes.")
    assert stale.status_code == 409 and "another tab" in stale.json()["detail"]

    current = desk(client, user, finished)
    target = fragment(current, "Yes, for every skin.")
    changed = post(
        client, user, finished, "copy", base_version=current["build"]["page_version"],
        edits=[{"block": target["number"], "original": "Something else", "text": "Yes."}],
    )  # fmt: skip
    assert changed.status_code == 409
    locked = edit(client, user, finished, current, "Only $29 today", "Only $19 today")
    assert (
        locked.status_code == 422 and "filled from the brand or product" in locked.json()["detail"]
    )
    kept = edit(client, user, finished, current, "Only $29 today", "Only $29 this week")
    assert kept.status_code == 200, kept.text
    current = kept.json()
    assert edit(client, user, finished, current, "Glow in 7 days", " 42 ").status_code == 422
    assert (
        edit(client, user, finished, current, "Glow in 7 days", "Glow in 7 days").status_code == 422
    )


@needs_db
def test_approve_and_back_to_review(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    approved = post(client, user, finished, "status", base_version=1, status="approved")
    assert approved.status_code == 200, approved.text
    build = approved.json()["build"]
    assert build["status"] == "approved" and build["approved_by"] == str(user.id)
    again = post(client, user, finished, "status", base_version=1, status="approved")
    assert again.status_code == 422

    # Any change sends an approved page back to review.
    state = desk(client, user, finished)
    assert edit(client, user, finished, state, "Is it gentle?", "Is it mild?").status_code == 200
    assert build_row(finished)["status"] == "needs_review"

    post(client, user, finished, "status", base_version=2, status="approved")
    back = post(client, user, finished, "status", base_version=2, status="needs_review")
    assert back.status_code == 200 and back.json()["build"]["approved_at"] is None
    assert (
        post(client, user, finished, "status", base_version=1, status="approved").status_code == 409
    )


@needs_db
def test_undo_puts_back_the_page_before_and_restore_can_be_undone(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    state = edit(client, user, finished, state, "Is it gentle?", "First.").json()
    state = edit(client, user, finished, state, "First.", "Second.").json()
    assert len(state["snapshots"]) == 2

    undone = post(client, user, finished, "undo", base_version=3).json()
    assert undone["build"]["page_version"] == 4
    assert fragment(undone, "First.") and len(undone["snapshots"]) == 1

    original = undone["snapshots"][0]["seq"]
    restored = post(client, user, finished, "restore", base_version=4, seq=original).json()
    assert fragment(restored, "Is it gentle?")
    assert restored["snapshots"][0]["reason"].startswith("Restored the page from before")
    back = post(client, user, finished, "undo", base_version=5).json()
    assert fragment(back, "First.")
    assert post(client, user, finished, "restore", base_version=6, seq=99).status_code == 422


@needs_db
def test_only_the_newest_twelve_snapshots_are_kept(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    text = "Is it gentle?"
    for n in range(13):
        new = f"Version {n}."
        state = edit(client, user, finished, state, text, new).json()
        text = new
    assert len(state["snapshots"]) == 12
    with transaction() as conn:
        paths = {
            r["html_path"]
            for r in conn.execute(
                "select html_path from build_snapshots where build_id = %(b)s",
                {"b": finished["id"]},
            ).fetchall()
        }
    # The first page (working.html) was the oldest snapshot and is gone, rows and file.
    assert not any(p.endswith("/working.html") for p in paths)
    with pytest.raises(Exception):  # noqa: B017 (storage raises its own HTTP error)
        storage.download("builds", f"{finished['org_id']}/{finished['id']}/working.html")


@needs_db
def test_building_pages_other_orgs_and_unknown_pages_are_refused(
    client: TestClient, user: DbUser, other_org: uuid.UUID, finished: dict[str, Any]
) -> None:
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'building' where id = %(b)s", {"b": finished["id"]}
        )
    state = desk(client, user, finished)
    assert edit(client, user, finished, state, "Is it gentle?", "Hm?").status_code == 422
    foreign = client.get(
        f"/builds/{finished['id']}/desk", params={"org_id": str(other_org)}, headers=bearer(user)
    )
    assert foreign.status_code == 403
    unknown = client.get(
        f"/builds/{uuid.uuid4()}/desk", params={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert unknown.status_code == 404


def test_lines_know_their_paragraph() -> None:
    page = (
        '<section data-lp-section="hero"><h1>Glow in 7 days</h1>'
        '<p>Only <b>one</b> serum, <a href="#">see why</a>.</p>'
        '<ul><li>Calm</li><li>Clear</li></ul><a data-lp-cta href="#">Shop now</a></section>'
    )
    texts = [f.text for f in fragments.dump(page)]
    numbers = paragraphs.numbers(page)
    kinds = {p.number: p.kind for p in paragraphs.paragraphs(page)}
    assert [
        (t, numbers[f"f{i:04d}"], kinds[numbers[f"f{i:04d}"]]) for i, t in enumerate(texts, 1)
    ] == [
        ("Glow in 7 days", 1, "Headline"),
        ("Only", 2, "Paragraph"),
        ("one", 2, "Paragraph"),
        ("serum,", 2, "Paragraph"),
        ("see why", 2, "Paragraph"),
        ("Calm", 3, "List item"),
        ("Clear", 4, "List item"),
        ("Shop now", 5, "Button"),
    ]
    assert paragraphs.paragraphs(page)[1].text == "Only one serum, see why."


# ── paragraphs ───────────────────────────────────────────────────────────────

PARA = (
    '<section data-lp-section="hero"><h1>Glow   in 7 days</h1>'
    "<p>What caught my eye wasn't the flavor, but the <b>real black cherry</b>. Truly.</p>"
    "<p>Only <span data-lp-price>$29</span> today</p></section>"
)


def test_paragraphs_read_as_one_text_with_their_parts() -> None:
    first, second, third = paragraphs.paragraphs(PARA)
    assert (first.text, first.kind, first.section) == ("Glow in 7 days", "Headline", "hero")
    assert second.text == "What caught my eye wasn't the flavor, but the real black cherry. Truly."
    assert second.fragment_ids == ("f0002", "f0003", "f0004")
    assert (third.text, third.locked, third.locked_parts) == ("Only $29 today", False, ("$29",))
    assert paragraphs.numbers(PARA)["f0003"] == 2


def test_rewriting_a_paragraph_keeps_its_bold_words() -> None:
    old = "What caught my eye wasn't the flavor, but the real black cherry. Truly."
    out = paragraphs.rewrite(
        PARA, 2, old, "What really caught my eye was the real black cherry. Truly."
    )
    p = parse(out).select("p")[0]
    assert p.get_text() == "What really caught my eye was the real black cherry. Truly."
    assert p.b is not None and p.b.get_text() == "real black cherry"
    # A change inside the bold words stays bold.
    out = paragraphs.rewrite(
        out, 2, p.get_text(), "What really caught my eye was the ripe black cherry. Truly."
    )
    bold = parse(out).select("p")[0].b
    assert bold is not None and bold.get_text() == "ripe black cherry"


def test_locked_parts_stay_and_drift_is_refused() -> None:
    out = paragraphs.rewrite(PARA, 3, "Only $29 today", "Only $29 this week")
    p = parse(out).select("p")[1]
    price = p.select_one("[data-lp-price]")
    assert p.get_text() == "Only $29 this week"
    assert price is not None and price.get_text() == "$29"
    with pytest.raises(paragraphs.ParagraphEditError, match="filled from the brand or product"):
        paragraphs.rewrite(PARA, 3, "Only $29 today", "Only $19 today")
    with pytest.raises(paragraphs.ParagraphDriftError):
        paragraphs.rewrite(PARA, 2, "Something else", "Anything")
    with pytest.raises(paragraphs.ParagraphEditError, match="Nothing changed"):
        paragraphs.rewrite(PARA, 1, "Glow in 7 days", "  Glow in 7   days ")


def test_the_proof_marks_paragraphs() -> None:
    marked = parse(proof.mark(PARA))
    assert [el.get("data-lp-block") for el in marked.select("[data-lp-block]")] == ["1", "2", "3"]
