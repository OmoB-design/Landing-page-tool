"""Template import and library tooling (template-onboarding skill): importing a page-builder
export, renumbering, sale-only slots, publishing library assets, and "Use template"."""

import base64
import io
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import templates
from app.cli.seed_library import seed
from app.db import transaction
from app.engines.finalize import FinalizeInputs, finalize_common
from app.engines.html import parse
from app.engines.sections import apply_layout
from app.engines.template_import import apply_template_tokens, fix_fonts, import_page, relink
from app.providers import storage
from tests.conftest import DbUser, needs_db

FIXTURE = Path(__file__).resolve().parents[3] / "templates" / "library" / "advertorial-fixture"


def _png_b64() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (124, 74, 31)).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


EXPORT = f"""<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400&display=swap">
<style>
@font-face {{ font-family: Gilroy; src: url(data:font/woff2;base64,AAAA) format("woff2"); }}
/* a comment */
.used {{ color: #7c4a1f; font-family: Gilroy, Arial, sans-serif; }}
.unused-thing {{ color: red; }}
.used:hover {{ color: #000; }}
.used::before {{ content: ""; }}
h1, .nowhere {{ font-family: Barlow, Arial, sans-serif; }}
@media (max-width: 600px) {{ .unused-too {{ margin: 0; }} .used {{ margin: 1px; }} }}
@keyframes spin {{ to {{ transform: rotate(1turn); }} }}
.button {{ background-color: #7c4a1f; color: #fff; }}
</style>
<script>/*! jQuery v3.5.1 | (c) */ !function(){{}}</script>
<script>!function(o,c){{var n=c.documentElement,t=" w-mod-";}}</script>
<script>(function(){{document.title = document.title;}})()</script>
</head><body>
<h1 class="used">Hello</h1>
<a class="button" href="#">Buy</a>
<img src="data:image/png;base64,{_png_b64()}" alt="">
<img src="https://cdn.example.test/photo.jpg" alt="">
<div style="background-image: url('https://cdn.example.test/bg.png')"></div>
</body></html>"""


def test_import_drops_fonts_unused_css_and_builder_scripts() -> None:
    result = import_page(EXPORT)
    out = result.html
    assert "@font-face" not in out and "data:font" not in out
    assert ".unused-thing" not in out and ".unused-too" not in out
    assert ".used:hover" in out and ".used::before" in out  # pseudo states kept
    assert "@keyframes spin" in out and "@media" in out  # the media query keeps its used rule
    assert "h1{" in out.replace(" ", "") or "h1 {" in out  # ".nowhere" dropped from the list
    assert ".nowhere" not in out
    assert "jQuery" not in out and "w-mod-" not in out and "document.title" in out
    assert result.stats["fonts_dropped"] == 1 and result.stats["scripts_dropped"] == 2


def test_import_moves_base64_images_into_files_and_lists_external_ones() -> None:
    result = import_page(EXPORT)
    [(name, (data, mime))] = list(result.files.items())
    assert name.startswith("assets/") and name.endswith(".png") and mime == "image/png"
    assert name in result.html and "data:image/png" not in result.html
    assert data[:4] == b"\x89PNG"
    assert result.external_images == [
        "https://cdn.example.test/photo.jpg",
        "https://cdn.example.test/bg.png",
    ]
    relinked = relink(result.html, {"https://cdn.example.test/photo.jpg": "assets/p.jpg"})
    assert "assets/p.jpg" in relinked and "cdn.example.test/photo.jpg" not in relinked


def test_commercial_fonts_get_free_stand_ins_loaded_from_google() -> None:
    out = import_page(EXPORT).html
    assert "Gilroy" not in out and "Figtree,Arial" in out.replace(" ", "")
    assert "family=Barlow" in out  # used and free, now loaded from Google Fonts
    assert out.count("family=Figtree") == 1  # already loaded: not added twice
    _, stats = fix_fonts(out)
    assert stats == {"substituted": {}, "google_fonts_added": []}


def test_template_tokens_wire_colours_fonts_and_readable_text() -> None:
    html, stats = apply_template_tokens(
        import_page(EXPORT).html,
        palette={"primary": "#7c4a1f", "dark": "#2b1d10"},
        heading_fonts=["Barlow"],
        body_fonts=["Figtree"],
    )
    soup = parse(html)
    tokens = soup.find("style", id="lp-template-tokens")
    assert tokens is not None and "--lp-primary: #7c4a1f" in tokens.get_text()
    assert "--lp-heading-font: Barlow, serif" in tokens.get_text()
    assert "var(--lp-heading-font)" in html and "var(--lp-body-font)" in html
    assert "color:var(--lp-on-primary,#fff)" in html.replace(" ", "")  # the button
    assert stats["on_colours"] == 1


def test_numbered_items_renumber_and_re_alternate_after_a_reorder() -> None:
    html = (
        '<main data-lp-alternate="flip">'
        + "".join(
            f'<section data-lp-section="r{n}" class="item{" flip" if n % 2 == 0 else ""}">'
            f"<span data-lp-number>{n}</span><span data-lp-number>{n}</span></section>"
            for n in (1, 2, 3)
        )
        + '<div data-lp-section="offer"><p>Offer</p></div></main>'
    )
    out, _ = apply_layout(html, ["r3", "r1", "offer", "r2", "r2-2"])
    soup = parse(out)
    sections = soup.select("main > [data-lp-section]")
    numbers = [[n.get_text() for n in s.select("[data-lp-number]")] for s in sections]
    assert numbers == [["1", "1"], ["2", "2"], [], ["3", "3"], ["4", "4"]]
    flips = [
        "flip" in s.get_attribute_list("class") for s in sections if s.select("[data-lp-number]")
    ]
    assert flips == [False, True, False, True]


def test_zero_padded_numbers_stay_padded() -> None:
    html = (
        '<main><section data-lp-section="a"><b data-lp-number>01</b></section>'
        '<section data-lp-section="b"><b data-lp-number>02</b></section></main>'
    )
    out, _ = apply_layout(html, ["b", "a"])
    assert [b.get_text() for b in parse(out).select("[data-lp-number]")] == ["01", "02"]


def test_sale_only_elements_need_a_sale() -> None:
    html = (
        '<header data-lp-section="bar" data-lp-sale-only><p>50% off ends tonight</p></header>'
        "<p>Body</p>"
    )
    out, stats = finalize_common(html, FinalizeInputs(brand_name="B", product_name="P"))
    assert "ends tonight" not in out and stats["sale_only_removed"] == 1
    out, _ = finalize_common(
        html, FinalizeInputs(brand_name="B", product_name="P", sale_percent=20)
    )
    assert "ends tonight" in out


def test_the_two_imported_templates_are_onboarded() -> None:
    from app.cli.seed_library import LIBRARY, load_folder

    for slug, sections in (("advertorial-wear-test", 12), ("listicle-10-reasons", 16)):
        manifest, instructions, html = load_folder(LIBRARY / slug)
        assert len(manifest.sections) == sections and manifest.status == "active"
        soup = parse(html)
        assert "portlandleathergoods" not in html
        assert ";base64," not in html  # images are files now (small inline SVG badges may stay)
        assert not [
            i for i in soup.find_all("img") if not any(a.startswith("data-lp-") for a in i.attrs)
        ]
        assert soup.select("[data-lp-cta]") and soup.select("[data-lp-logo]")
        assert "Molether" in instructions.forbidden_terms


# ── database and storage ─────────────────────────────────────────────────────


@pytest.fixture
def library_copy(tmp_path: Path) -> Any:
    """A throwaway library template with an asset, seeded and removed afterwards."""
    slug = f"test-import-{uuid.uuid4().hex[:8]}"
    folder = tmp_path / slug
    shutil.copytree(FIXTURE, folder)
    manifest = json.loads((folder / "template.json").read_text())
    manifest.update({"slug": slug, "status": "active"})
    (folder / "template.json").write_text(json.dumps(manifest))
    (folder / "assets").mkdir()
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), (1, 2, 3)).save(buffer, format="PNG")
    (folder / "assets" / "dot.png").write_bytes(buffer.getvalue())
    html = (folder / "index.html").read_text()
    (folder / "index.html").write_text(
        html.replace("</footer>", '<img data-lp-keep src="assets/dot.png" alt=""></footer>')
    )
    seed(folder, thumbnails=False)
    with transaction() as conn:
        row = conn.execute(
            "select id from templates where slug = %(s)s and org_id is null", {"s": slug}
        ).fetchone()
    assert row is not None
    yield slug, uuid.UUID(str(row["id"]))
    with transaction() as conn:
        conn.execute("delete from templates where parent_template_id = %(t)s", {"t": row["id"]})
        conn.execute("delete from templates where id = %(t)s", {"t": row["id"]})
    storage.remove("library", [f"{slug}/index.html"])
    storage.remove("library-assets", [f"{slug}/dot.png"])


@needs_db
def test_seeding_publishes_assets_and_points_the_page_at_them(library_copy: Any) -> None:
    slug, _ = library_copy
    html = storage.download("library", f"{slug}/index.html").decode()
    url = storage.public_url("library-assets", f"{slug}/dot.png")
    assert url in html and '"assets/' not in html
    assert storage.download("library-assets", f"{slug}/dot.png")[:4] == b"\x89PNG"


@needs_db
def test_use_template_copies_the_library_template_into_the_org(
    user: DbUser, library_copy: Any
) -> None:
    slug, library_id = library_copy
    first = templates.use_library_template(user.org_id, library_id, user.id)
    second = templates.use_library_template(user.org_id, library_id, user.id)
    assert first["slug"] == slug and second["slug"] == f"{slug}-2" and first["version"] == 1
    with transaction() as conn:
        row = conn.execute(
            "select * from templates where id = %(t)s", {"t": first["id"]}
        ).fetchone()
        sections = conn.execute(
            "select key from template_sections where template_id = %(t)s order by position",
            {"t": first["id"]},
        ).fetchall()
        versions = conn.execute(
            "select version, reason from template_versions where template_id = %(t)s",
            {"t": first["id"]},
        ).fetchall()
    assert (
        row is not None and row["org_id"] == user.org_id and row["parent_template_id"] == library_id
    )
    assert row["origin"] == "owned" and row["html_path"] == f"{user.org_id}/{first['id']}/v1.html"
    assert [s["key"] for s in sections][:2] == ["promo-bar", "masthead"]
    assert [(v["version"], v["reason"]) for v in versions] == [(1, "Copied from the library")]
    assert storage.download("templates", row["html_path"]) == storage.download(
        "library", f"{slug}/index.html"
    )
    storage.remove("templates", [row["html_path"], f"{user.org_id}/{second['id']}/v1.html"])


@needs_db
def test_use_template_refuses_retired_and_org_templates(user: DbUser, library_copy: Any) -> None:
    _, library_id = library_copy
    with transaction() as conn:
        conn.execute("update templates set status = 'retired' where id = %(t)s", {"t": library_id})
    with pytest.raises(templates.TemplateNotFoundError):
        templates.use_library_template(user.org_id, library_id, user.id)


@needs_db
def test_the_use_endpoint_checks_membership(
    user: DbUser, other_org: uuid.UUID, library_copy: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import auth
    from app.main import app
    from tests.test_api import FakeJwksClient, bearer

    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient())
    _, library_id = library_copy
    with TestClient(app) as client:
        refused = client.post(
            "/templates/use",
            json={"org_id": str(other_org), "template_id": str(library_id)},
            headers=bearer(user),
        )
        created = client.post(
            "/templates/use",
            json={"org_id": str(user.org_id), "template_id": str(library_id)},
            headers=bearer(user),
        )
    assert refused.status_code == 403
    assert created.status_code == 201 and created.json()["version"] == 1
    with transaction() as conn:
        row = conn.execute(
            "select html_path from templates where id = %(t)s", {"t": created.json()["id"]}
        ).fetchone()
    assert row is not None
    storage.remove("templates", [row["html_path"]])
