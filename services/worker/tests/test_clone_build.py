"""The clone-only build steps and the residue scan (BUILD_SPEC §10.2, §13.2, B2.3): pure engines
on a made-up store advertorial (`store_advertorial.html`, as a clone of try.resilia.test looks
after analysis), plus the publish rules for clones."""

from pathlib import Path

from bs4 import Tag

from app.engines import clone_build as cb
from app.engines import residue
from app.engines.html import parse
from app.publish import gate

PAGE = (Path(__file__).parent / "fixtures" / "clone" / "store_advertorial.html").read_text()
STORAGE = "https://abc.supabase.test"
SOURCE = cb.Source.build(
    host="try.resilia.test", name="Resilia", brand_tokens=["Resilia", "Resilia Cardio Complex"]
)
HOSTS = cb.Hosts.build(
    storage_url=STORAGE,
    brand_url="https://www.graza.test",
    product_url="https://www.graza.test/products/drizzle",
    exact_urls=["https://cdn.shopify.test/s/files/graza/drizzle.png"],
    source_host="try.resilia.test",
)
TARGET = "https://www.graza.test/products/drizzle"


def n(value: object) -> int:
    """A stats value as a number (stats are typed `object`)."""
    assert isinstance(value, int)
    return value


def text(html: str) -> str:
    return parse(html).get_text(" ", strip=True)


def all_steps(html: str, *, copied: dict[str, str] | None = None) -> str:
    """Every clone step in pipeline order (copies stand in for downloads)."""
    copied = copied or {}
    html, _ = cb.strip_chrome(html)
    html, _ = cb.mark_images(html, keep=[], generic=[], logo_srcs=[])
    html, _ = cb.scrub_source_brand(html, SOURCE, brand_name="Graza", product_name="Drizzle")
    html, _ = cb.scrub_scripts(html, SOURCE, HOSTS, copied=copied)
    html, _ = cb.rewrite_links(html, SOURCE, HOSTS, target_url=TARGET)
    html, _ = cb.purge_foreign_assets(html, HOSTS, target_url=TARGET, copied=copied)
    return html


def test_hosts_tell_the_brand_from_the_source_and_shared_cdns_by_exact_url() -> None:
    assert cb.registrable("try.resilia.test") == "resilia.test"
    assert cb.registrable("shop.brand.co.uk") == "brand.co.uk"
    assert not HOSTS.foreign(f"{STORAGE}/storage/v1/object/public/assets/x.png")
    assert not HOSTS.foreign("https://cdn.graza.test/logo.png")  # the brand's own domain
    assert not HOSTS.foreign("https://cdn.shopify.test/s/files/graza/drizzle.png")
    assert HOSTS.foreign("https://cdn.shopify.test/s/files/resilia/cardio.png")  # same CDN
    assert HOSTS.foreign("https://cdn.resilia.test/img/hero.jpg")
    assert HOSTS.source("https://try.resilia.test/products/x")
    assert not HOSTS.foreign("data:image/png;base64,AAAA") and not HOSTS.foreign("#order")


def test_source_names_skip_common_words_and_longer_names_become_the_product() -> None:
    source = cb.Source.build(
        host="try.resilia.test",
        name="Resilia",
        brand_tokens=["Shop", "Resilia Cardio Complex", "R"],
    )
    assert source.tokens == ("Resilia Cardio Complex", "Resilia")
    new, count = source.replace(
        "Resilia's Resilia Cardio Complex beats resilia-free days.",
        brand="Graza",
        product="Drizzle",
    )
    assert new == "Graza's Drizzle beats resilia-free days." and count == 2


def test_strip_chrome_removes_the_store_around_the_page_and_keeps_the_page() -> None:
    html, stats = cb.strip_chrome(PAGE)
    soup = parse(html)
    assert soup.select_one(".site-header") is None and soup.select_one(".announcement-bar") is None
    assert (
        soup.select_one(".cookie-banner") is None
        and soup.select_one("#gorgias-chat-container") is None
    )
    assert soup.select_one(".site-footer") is None and soup.select_one(".legal-strip") is None
    assert soup.select_one(".skip-link") is None
    assert "References" not in text(html) and "Smith et al." not in text(html)
    # The page's own header (with its headline), its sections and the sticky buy bar stay.
    assert soup.select_one("header.article-header h1") is not None
    assert len(soup.select("[data-lp-section]")) == 3 and soup.select_one(".sticky-cta") is not None
    assert stats["headers"] == 2 and stats["footers"] == 2 and stats["overlays"] == 2
    assert stats["skip_links"] == 1 and stats["citations"] == 1


def test_clone_images_are_sorted_into_slots() -> None:
    html, counts = cb.mark_images(
        PAGE, keep=["tick.png"], generic=[], logo_srcs=["resilia-logo.png"]
    )
    soup = parse(html)
    assert soup.select_one("img.header-logo").has_attr("data-lp-logo")  # type: ignore[union-attr]
    assert soup.select_one("img.tick-icon").has_attr("data-lp-keep")  # type: ignore[union-attr]
    assert soup.select_one('img[src$="star.svg"]').has_attr("data-lp-keep")  # type: ignore[union-attr]
    assert soup.select_one("img.author-avatar").has_attr("data-lp-person")  # type: ignore[union-attr]
    assert soup.select_one('img[src$="kitchen.jpg"]').has_attr("data-lp-scene")  # type: ignore[union-attr]
    assert counts == {"keep": 2, "logo": 1, "person": 1, "scene": 1}  # not the noscript pixel


def test_scrub_source_brand_renames_the_source_and_removes_its_traces() -> None:
    html, stats = cb.scrub_source_brand(PAGE, SOURCE, brand_name="Graza", product_name="Drizzle")
    soup = parse(html)
    assert "When I found Graza, I was sceptical. Drizzle is the one I kept." in text(html)
    assert "Resilia" not in text(html) and soup.title.get_text() == "Graza | The heart report"  # type: ignore[union-attr]
    assert soup.find("script", type="application/ld+json") is None
    assert soup.find("script", id="shopify-features") is None and soup.find("base") is None
    assert "Shopify.routes" not in html and soup.select_one("img.header-logo") is None
    assert soup.select_one('form[action="https://try.resilia.test/cart/add"]') is not None
    assert stats["json_ld"] == 1 and stats["logos_removed"] == 1 and n(stats["replaced"]) >= 4


def test_scrub_scripts_keeps_copied_libraries_and_fonts_and_drops_the_rest() -> None:
    plan = cb.plan_scripts(PAGE, HOSTS)
    assert plan.scripts == ["https://cdn.jsdelivr.test/npm/jquery@3.7.1/dist/jquery.min.js"]
    assert plan.fonts == ["https://cdn.resilia.test/fonts/resilia-sans.woff2"]
    copied = {
        plan.scripts[0]: f"{STORAGE}/assets/jquery.js",
        plan.fonts[0]: f"{STORAGE}/assets/font.woff2",
    }
    html, stats = cb.scrub_scripts(PAGE, SOURCE, HOSTS, copied=copied)
    soup = parse(html)
    sources = [str(s.get("src")) for s in soup.find_all("script", src=True)]
    assert sources == [f"{STORAGE}/assets/jquery.js"]  # theme.js went
    assert "Shopify.routes" not in html and "faq-q" in html  # the FAQ toggle stays
    assert soup.find("link", rel="preload") is None and soup.find("link", rel="stylesheet") is None
    assert f'url("{STORAGE}/assets/font.woff2") format("woff2")' in html
    assert 'resilia-sans.woff"' not in html and '"Resilia Sans"' not in html
    assert 'font-family: "BrandFont"' in html
    assert soup.select_one(".brand-hero") is not None and ".brand-hero" in html  # renamed
    assert stats["scripts_copied"] == 1 and stats["scripts_dropped"] == 1
    assert stats["fonts_copied"] == 1 and stats["renamed"] == 1


def test_rewrite_links_sends_the_source_and_dead_buttons_to_the_product() -> None:
    page, _ = cb.scrub_source_brand(PAGE, SOURCE, brand_name="Graza", product_name="Drizzle")
    html, stats = cb.rewrite_links(page, SOURCE, HOSTS, target_url=TARGET)
    soup = parse(html)
    shop = soup.find("a", string="Shop now")
    assert isinstance(shop, Tag) and shop["href"] == TARGET
    claim = soup.find("a", string="Claim my discount")
    assert isinstance(claim, Tag) and claim["href"] == TARGET  # #order doesn't exist
    assert soup.find("form") is None
    atc = soup.select_one("button.atc")
    assert atc is not None and atc.parent is not None and atc.parent.get("href") == TARGET
    assert (
        soup.select_one(".cart-drawer") is None
        and soup.select_one(".product-recommendations") is None
    )
    assert soup.find("noscript") is None
    assert soup.select_one(".lazy-box").get("data-src") is None  # type: ignore[union-attr]
    assert "band.jpg" not in html and "hero-bg.jpg" not in html
    assert soup.find("meta", property="og:url") is None
    assert stats["forms"] == 1 and n(stats["links"]) >= 1 and n(stats["anchors"]) >= 2


def test_purge_leaves_nothing_foreign_and_keeps_copied_images() -> None:
    page, _ = cb.mark_images(PAGE, keep=[], generic=[], logo_srcs=[])
    star = "https://cdn.resilia.test/icons/star.svg"
    assert star in cb.keep_image_urls(page, HOSTS)
    html, stats = cb.purge_foreign_assets(
        page, HOSTS, target_url=TARGET, copied={star: f"{STORAGE}/assets/star.svg"}
    )
    soup = parse(html)
    assert soup.select_one('img[src$="/assets/star.svg"]') is not None
    kitchen = soup.find("img", alt="")
    assert kitchen is not None
    blanked = [i for i in soup.find_all("img") if str(i.get("src")).startswith("data:image/gif")]
    hidden = [i for i in blanked if "display: none" in str(i.get("style"))]
    assert blanked and len(hidden) == len(blanked)  # none of them is icon-sized
    assert soup.find("iframe") is None
    amazon = soup.find("a", string="Buy on Amazon")
    assert isinstance(amazon, Tag) and amazon["href"] == TARGET  # reads like a button
    assert soup.find("a", string="study on aged garlic") is None  # unwrapped, text kept
    assert "study on aged garlic" in text(html)
    assert stats["images_copied"] == 1 and n(stats["images_blanked"]) >= 3


def test_after_every_step_only_inherited_claims_remain() -> None:
    raw = residue.scan(PAGE, SOURCE, HOSTS)
    assert raw["score"] == 0 and raw["clean"] is False
    html = all_steps(PAGE)
    found = residue.scan(html, SOURCE, HOSTS)
    counts = found["counts"]
    assert counts == {"brand": 0, "images": 0, "links": 0, "claims": 2}, found["findings"]
    assert found["score"] == 100 - 7 * 2
    assert {f["kind"] for f in found["findings"]} == {"claims"}  # type: ignore[attr-defined]
    assert "clinically proven" in found["findings"][0]["text"]  # type: ignore[index]


def test_the_scan_is_clean_once_the_claims_go_too() -> None:
    html = all_steps(
        PAGE.replace("clinically proven and made in an FDA registered facility", "made with care")
    )
    assert residue.scan(html, SOURCE, HOSTS) == {
        "score": 100, "clean": True, "counts": {"brand": 0, "images": 0, "links": 0, "claims": 0},
        "findings": [],
    }  # fmt: skip


def test_a_clone_is_blocked_by_a_low_score_or_any_source_brand_mention() -> None:
    def codes(score: int, brand: int) -> list[tuple[str, bool]]:
        report = {"residue": {"score": score, "counts": {"brand": brand}}}
        found = gate.blockers(report, mock_images=False, origin="cloned", allow_placeholders=False)
        return [(b.code, b.overridable) for b in found]

    assert codes(100, 0) == []
    assert codes(93, 1) == [("source_brand", True)]
    assert codes(79, 0) == [("residue", True)]
    assert codes(72, 4) == [("source_brand", True), ("residue", True)]
    owned = gate.blockers({}, mock_images=False, origin="owned", allow_placeholders=False)
    assert owned == []


def test_store_and_tracker_code_goes_and_component_code_stays() -> None:
    """Snippets from the live check (2026-10-31) that load nothing by address."""
    snippets = [
        "!function(o){(o.Shopify=o.Shopify||{}).modules=!0}(window);",
        '(function(w,d,t,r,u){var o={ti:"187230414"};w[u]=w[u]||[];})(window,document);',
        "window.edgetag = window.edgetag || function() {};",
        'const configUrl = "/a/elevar/static/configs/1/config.js";',
        "window.__TREKKIE_SHIM_QUEUE = window.__TREKKIE_SHIM_QUEUE || [];",
        'window.FUNNEL = {"currency_code": "USD", "id": 1158840};',
        "!function(o){function n(){var o=[];function n(){o.push(1)}return n.q=o,n}}(window);",
        "",
    ]
    keep = "document.querySelectorAll('.faq-q').forEach(function (q) { q.hidden = false; });"
    page = (
        "<html><head>"
        + "".join(f"<script>{c}</script>" for c in [*snippets, keep])
        + "</head></html>"
    )
    html, stats = cb.scrub_scripts(page, SOURCE, HOSTS, copied={})
    assert stats["inline_dropped"] == len(snippets)
    assert html.count("<script>") == 1 and "faq-q" in html


def test_css_comments_with_a_foreign_address_go() -> None:
    page = (
        "<html><head><style>/* Swiper 11 https://swiperjs.example */ .a{color:red}"
        "/* plain note */</style></head><body></body></html>"
    )
    html, _ = cb.purge_foreign_assets(page, HOSTS, target_url=TARGET, copied={})
    assert "swiperjs" not in html and "plain note" in html and ".a{color:red}" in html
