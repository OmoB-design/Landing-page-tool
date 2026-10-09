"""Section editor (BUILD_SPEC §8.3, B1.1b): outline, checks and look engines; edit, undo, redo,
restore and version history against the local database; the editor API."""

import json
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import templates
from app.cli.seed_library import LIBRARY
from app.db import transaction
from app.engines.html import parse
from app.engines.sections import duplicate_section, section_order
from app.engines.template_outline import checks, look, outline, read_minutes
from app.models.template import (
    DuplicateAction,
    RemoveAction,
    RenameAction,
    ReorderAction,
)
from app.providers import storage
from tests.conftest import DbUser, needs_db
from tests.test_template_import import library_copy  # noqa: F401 (fixture)

LISTICLE = (
    "<html><head><style>:root{--lp-primary:#287e61;--lp-tint:#e2f2ec;"
    "--lp-heading-font:'Figtree', sans-serif;--lp-body-font:var(--x)}</style></head><body>"
    '<div class="bar" data-lp-fixed><p>Reading progress</p></div>'
    '<main data-lp-alternate="flip">'
    '<section data-lp-section="r1" id="r1"><h2><span data-lp-number>1</span> Flat strap</h2>'
    "<h2 class=mobile><span data-lp-number>1</span> Flat strap</h2>"
    '<p>It sits flat. <a data-lp-cta href="#">Shop now</a></p>'
    '<img data-lp-scene src="a.jpg"></section>'
    '<section data-lp-section="r2"><h2><span data-lp-number>2</span> Soft leather</h2></section>'
    "</main>"
    '<footer data-lp-section="footer"><p>Made by Molether. Questions?</p></footer>'
    "</body></html>"
)


# ── engines ───────────────────────────────────────────────────────────────────


def test_duplicate_section_inserts_a_numbered_copy_after_the_original() -> None:
    out = duplicate_section(LISTICLE, "r1", "r1-2")
    assert section_order(out) == ["r1", "r1-2", "r2", "footer"]
    soup = parse(out)
    copy = soup.select_one('[data-lp-section="r1-2"]')
    assert copy is not None and copy["id"] == "r1-2"
    numbers = [s.select_one("[data-lp-number]") for s in soup.select("main > section")]
    assert [n.get_text() for n in numbers if n] == ["1", "2", "3"]
    assert "flip" in soup.select("main > section")[1].get_attribute_list("class")
    with pytest.raises(KeyError):
        duplicate_section(LISTICLE, "nope", "nope-2")


def test_outline_reads_numbers_titles_fields_and_containers() -> None:
    first, second, footer = outline(LISTICLE)
    assert (first.key, first.number, first.title) == ("r1", "1", "Flat strap")
    # The phone copy of the heading counts once; the link inside the paragraph isn't separate.
    assert [(f.label, f.text) for f in first.fields] == [
        ("Headline", "Flat strap"),
        ("Text", "It sits flat. Shop now"),
    ]
    assert first.images == 1 and first.words == 8  # the number counts once
    assert first.group == second.group != footer.group
    assert footer.number is None and footer.title == "Made by Molether. Questions?"
    assert read_minutes(0) == 1 and read_minutes(231) == 2


def test_checks_flag_blocks_outside_sections_and_missing_slots() -> None:
    html = LISTICLE.replace("</main>", '</main><div class="note"><p>Loose text</p></div>')
    html = html.replace('src="a.jpg"', 'src="https://cdn.other.example/a.jpg"')
    html = html.replace("</body>", '<a href="https://elsewhere.example/x">x</a><script>1</script>')
    issues = checks(
        html,
        ["r1", "r2", "gone"],
        forbidden_terms=["Molether", "MOLETHER"],
        asset_origins=("https://storage.example/",),
    )
    messages = [(i.severity, i.message, i.section) for i in issues]
    assert messages[0] == ("error", "Section “gone” is listed but isn't in the page.", "gone")
    text = "\n".join(m for _, m, _ in messages)
    assert "“footer” is in the page but not listed" in text
    assert "div.note, “Loose text”" in text and "Reading progress" not in text  # fixed frame
    assert "No product photo slot" in text and "cdn.other.example" in text
    assert "Links go to other sites: elsewhere.example." in text
    assert "1 script: it runs in exports" in text
    assert "Mentions Molether; builds remove these words." in text
    assert [s for s, _, _ in messages] == sorted(
        (s for s, _, _ in messages), key=["error", "warning", "info"].index
    )


def test_look_reads_the_template_tokens() -> None:
    result = look(LISTICLE)
    assert [(c.name, c.value) for c in result.colours] == [
        ("Primary", "#287e61"),
        ("Tint", "#e2f2ec"),
    ]
    assert result.heading_font == "Figtree" and result.body_font is None


@pytest.mark.parametrize("slug", ["advertorial-wear-test", "listicle-10-reasons"])
def test_library_templates_have_no_template_issues(slug: str) -> None:
    folder = LIBRARY / slug
    manifest = json.loads((folder / "template.json").read_text())
    instructions = json.loads((folder / "instructions.json").read_text())
    issues = checks(
        (folder / "index.html").read_text(),
        [s["key"] for s in manifest["sections"]],
        forbidden_terms=instructions["forbidden_terms"],
    )
    assert [i.message for i in issues if i.severity != "info"] == []


# ── edits and history (database) ──────────────────────────────────────────────


@pytest.fixture
def org_copy(user: DbUser, library_copy: Any) -> Iterator[tuple[uuid.UUID, uuid.UUID]]:  # noqa: F811
    _, library_id = library_copy
    row = templates.use_library_template(user.org_id, library_id, user.id)
    yield user.org_id, row["id"]
    storage.remove("templates", [f"{user.org_id}/{row['id']}/v{n}.html" for n in range(1, 30)])


def keys(state: Any) -> list[str]:
    return [s.key for s in state.sections]


def page_order(org_id: uuid.UUID, template_id: uuid.UUID) -> list[str]:
    with transaction() as conn:
        row = conn.execute(
            "select html_path from templates where id = %(t)s", {"t": template_id}
        ).fetchone()
    assert row is not None
    return section_order(storage.download("templates", row["html_path"]).decode())


def swap(order: list[str], a: str, b: str) -> list[str]:
    i, j = order.index(a), order.index(b)
    result = list(order)
    result[i], result[j] = result[j], result[i]
    return result


@needs_db
def test_editor_state_describes_the_template(org_copy: tuple[uuid.UUID, uuid.UUID]) -> None:
    org_id, template_id = org_copy
    state = templates.editor_state(org_id, template_id)
    assert keys(state)[:3] == ["promo-bar", "masthead", "hero"]
    assert state.template.version == 1 and state.template.parent_name
    assert [(v.version, v.reason, v.current) for v in state.versions] == [
        (1, "Copied from the library", True)
    ]
    assert not state.can_undo and not state.can_redo
    assert state.words > 0 and state.read_minutes >= 1
    assert state.look.colours and state.sections[2].title


@needs_db
def test_reorder_undo_redo_and_a_new_edit_discards_redo(
    org_copy: tuple[uuid.UUID, uuid.UUID],
) -> None:
    org_id, template_id = org_copy
    start = templates.editor_state(org_id, template_id)
    moved = swap(keys(start), "problem", "mechanism")
    state = templates.edit_layout(
        org_id, template_id, None, 1, ReorderAction(type="reorder", keys=moved)
    )
    assert keys(state) == moved and page_order(org_id, template_id) == moved
    assert state.template.version == 2 and state.versions[0].reason == "Moved The problem down"
    assert state.can_undo and not state.can_redo

    state = templates.step(org_id, template_id, 2, "undo")
    assert state.template.version == 1 and keys(state) == keys(start)
    assert page_order(org_id, template_id) == keys(start) and state.can_redo
    state = templates.step(org_id, template_id, 1, "redo")
    assert state.template.version == 2 and page_order(org_id, template_id) == moved
    state = templates.step(org_id, template_id, 2, "undo")

    action = RenameAction(type="rename", key="hero", label="  Opening   story ")
    state = templates.edit_layout(org_id, template_id, None, 1, action)
    # Version numbers are never reused: the undone version 2 is gone and this one is 3.
    assert [v.version for v in state.versions] == [3, 1] and not state.can_redo
    assert state.versions[0].reason == "Renamed Headline and byline to Opening story"
    assert state.sections[2].label == "Opening story"
    with pytest.raises(templates.TemplateEditError, match="Nothing to redo"):
        templates.step(org_id, template_id, 3, "redo")


@needs_db
def test_remove_and_duplicate_follow_the_section_rules(
    org_copy: tuple[uuid.UUID, uuid.UUID],
) -> None:
    org_id, template_id = org_copy
    with pytest.raises(templates.TemplateEditError, match="can't be removed"):
        templates.edit_layout(
            org_id, template_id, None, 1, RemoveAction(type="remove", key="masthead")
        )
    with pytest.raises(templates.TemplateEditError, match="can't be duplicated"):
        templates.edit_layout(
            org_id, template_id, None, 1, DuplicateAction(type="duplicate", key="faq")
        )

    state = templates.edit_layout(
        org_id, template_id, None, 1, RemoveAction(type="remove", key="faq")
    )
    assert "faq" not in keys(state) and "faq" not in page_order(org_id, template_id)
    assert state.versions[0].reason == "Removed Questions"

    state = templates.edit_layout(
        org_id, template_id, None, 2, DuplicateAction(type="duplicate", key="testimonials")
    )
    order = keys(state)
    assert order[order.index("testimonials") + 1] == "testimonials-2"
    assert page_order(org_id, template_id) == order
    copy = state.sections[order.index("testimonials-2")]
    assert copy.label == "Reader reviews (copy)" and copy.removable and copy.duplicable
    state = templates.edit_layout(
        org_id, template_id, None, 3, DuplicateAction(type="duplicate", key="testimonials-2")
    )
    assert "testimonials-3" in keys(state)


@needs_db
def test_sections_only_move_within_their_container(
    org_copy: tuple[uuid.UUID, uuid.UUID],
) -> None:
    org_id, template_id = org_copy
    order = keys(templates.editor_state(org_id, template_id))
    across = [k for k in order if k != "footer"]
    across.insert(across.index("problem"), "footer")
    with pytest.raises(templates.TemplateEditError, match="different part of the page"):
        templates.edit_layout(
            org_id, template_id, None, 1, ReorderAction(type="reorder", keys=across)
        )
    up = swap(order, "promo-bar", "masthead")
    state = templates.edit_layout(
        org_id, template_id, None, 1, ReorderAction(type="reorder", keys=up, moved="masthead")
    )
    # Two neighbours swapping reads as either moving; the editor says which one was moved.
    assert keys(state) == up and state.versions[0].reason == "Moved Masthead up"


@needs_db
def test_a_stale_editor_is_refused(org_copy: tuple[uuid.UUID, uuid.UUID]) -> None:
    org_id, template_id = org_copy
    rename = RenameAction(type="rename", key="faq", label="FAQ")
    templates.edit_layout(org_id, template_id, None, 1, rename)
    with pytest.raises(templates.TemplateConflictError):
        templates.edit_layout(org_id, template_id, None, 1, rename)
    with pytest.raises(templates.TemplateConflictError):
        templates.step(org_id, template_id, 1, "undo")


@needs_db
def test_history_keeps_twelve_versions_and_deletes_unused_files(
    org_copy: tuple[uuid.UUID, uuid.UUID],
) -> None:
    org_id, template_id = org_copy
    order = keys(templates.editor_state(org_id, template_id))
    version = 1
    for _ in range(13):
        order = swap(order, "problem", "mechanism")
        state = templates.edit_layout(
            org_id, template_id, None, version, ReorderAction(type="reorder", keys=order)
        )
        version = state.template.version
    assert [v.version for v in state.versions] == list(range(14, 2, -1))
    with pytest.raises(Exception):  # noqa: B017 (storage raises its own HTTP error)
        storage.download("templates", f"{org_id}/{template_id}/v1.html")
    assert storage.download("templates", f"{org_id}/{template_id}/v3.html")


@needs_db
def test_restore_brings_back_an_earlier_version_as_a_new_one(
    org_copy: tuple[uuid.UUID, uuid.UUID],
) -> None:
    org_id, template_id = org_copy
    start = keys(templates.editor_state(org_id, template_id))
    templates.edit_layout(org_id, template_id, None, 1, RemoveAction(type="remove", key="faq"))
    state = templates.restore(org_id, template_id, None, 2, 1)
    assert state.template.version == 3 and keys(state) == start
    assert state.versions[0].reason == "Restored version 1"
    assert page_order(org_id, template_id) == start
    with pytest.raises(templates.TemplateEditError, match="current version"):
        templates.restore(org_id, template_id, None, 3, 3)


@needs_db
def test_library_and_other_orgs_templates_are_not_editable(
    user: DbUser,
    other_org: uuid.UUID,
    org_copy: tuple[uuid.UUID, uuid.UUID],
    library_copy: Any,  # noqa: F811
) -> None:
    _, template_id = org_copy
    _, library_id = library_copy
    with pytest.raises(templates.TemplateNotFoundError):
        templates.editor_state(user.org_id, library_id)
    with pytest.raises(templates.TemplateNotFoundError):
        templates.editor_state(other_org, template_id)


@needs_db
def test_the_editor_api(
    user: DbUser,
    other_org: uuid.UUID,
    org_copy: tuple[uuid.UUID, uuid.UUID],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import auth
    from app.main import app
    from tests.test_api import FakeJwksClient, bearer

    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient())
    org_id, template_id = org_copy
    base = f"/templates/{template_id}"
    with TestClient(app) as client:
        assert (
            client.get(
                f"{base}/editor", params={"org_id": str(other_org)}, headers=bearer(user)
            ).status_code
            == 403
        )
        missing = client.get(
            f"/templates/{uuid.uuid4()}/editor",
            params={"org_id": str(org_id)},
            headers=bearer(user),
        )
        assert missing.status_code == 404
        state = client.get(f"{base}/editor", params={"org_id": str(org_id)}, headers=bearer(user))
        assert state.status_code == 200 and state.json()["template"]["version"] == 1

        edit = {
            "org_id": str(org_id),
            "base_version": 1,
            "action": {"type": "remove", "key": "faq"},
        }
        done = client.post(f"{base}/layout", json=edit, headers=bearer(user))
        assert done.status_code == 200 and done.json()["template"]["version"] == 2
        stale = client.post(f"{base}/layout", json=edit, headers=bearer(user))
        assert stale.status_code == 409 and "Reload" in stale.json()["detail"]
        refused = client.post(
            f"{base}/layout",
            json={**edit, "base_version": 2, "action": {"type": "remove", "key": "masthead"}},
            headers=bearer(user),
        )
        assert refused.status_code == 422 and "can't be removed" in refused.json()["detail"]
        bad = client.post(
            f"{base}/layout",
            json={**edit, "base_version": 2, "action": {"type": "explode", "key": "faq"}},
            headers=bearer(user),
        )
        assert bad.status_code == 422
        undone = client.post(
            f"{base}/undo", json={"org_id": str(org_id), "base_version": 2}, headers=bearer(user)
        )
        assert undone.status_code == 200 and undone.json()["can_redo"] is True
        redone = client.post(
            f"{base}/redo", json={"org_id": str(org_id), "base_version": 1}, headers=bearer(user)
        )
        assert redone.json()["template"]["version"] == 2
        restored = client.post(
            f"{base}/restore",
            json={"org_id": str(org_id), "base_version": 2, "version": 1},
            headers=bearer(user),
        )
        assert (
            restored.status_code == 200
            and restored.json()["versions"][0]["reason"] == "Restored version 1"
        )
