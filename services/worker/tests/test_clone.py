"""The clone engine (BUILD_SPEC §8.4) on three made-up pages: a Shopify product page, a Replo
advertorial and a Webflow listicle. Pure: no network, no database."""

from pathlib import Path

import pytest

from app.engines import clone
from app.engines.html import parse

FIXTURES = Path(__file__).parent / "fixtures" / "clone"
SHOPIFY = (FIXTURES / "shopify_product.html").read_text()
REPLO = (FIXTURES / "replo_advertorial.html").read_text()
WEBFLOW = (FIXTURES / "webflow_listicle.html").read_text()
SHOPIFY_URL = "https://lumora.test/products/glow-serum"
REPLO_URL = "https://vitalis.test/pages/why-women-switched"
WEBFLOW_URL = "https://www.pawsome.test/blog/7-reasons"


def test_fingerprints_the_platform_and_flags_store_product_pages() -> None:
    shopify = clone.clone_page(SHOPIFY, SHOPIFY_URL)
    replo = clone.clone_page(REPLO, REPLO_URL)
    webflow = clone.clone_page(WEBFLOW, WEBFLOW_URL)
    assert (shopify.platform, shopify.verdict) == ("shopify", "rebuild_native")
    assert (replo.platform, replo.verdict) == ("replo", None)
    assert (webflow.platform, webflow.verdict) == ("webflow", None)
    # "Add to cart" on a landing page (not a product page) is not a store page.
    landing = clone.clone_page(SHOPIFY.replace('content="product"', 'content="website"'),
                               "https://lumora.test/pages/glow")  # fmt: skip
    assert landing.verdict is None


def test_identity_comes_from_the_address_and_og_site_name() -> None:
    result = clone.clone_page(WEBFLOW, WEBFLOW_URL)
    assert result.source_host == "pawsome.test"  # www. dropped
    assert result.source_name is None  # no og:site_name
    assert result.title == "7 reasons dogs love Pawsome"
    shopify = clone.clone_page(SHOPIFY, SHOPIFY_URL)
    assert (shopify.source_host, shopify.source_name) == ("lumora.test", "Lumora")
    assert clone.page_address(SHOPIFY) == "https://lumora.test/products/glow-serum"
    assert clone.page_address("<html><body>no address</body></html>") is None


def test_lists_stylesheets_including_the_async_patterns() -> None:
    assert clone.stylesheet_urls(SHOPIFY, SHOPIFY_URL) == [
        "https://lumora.test/cdn/shop/t/9/assets/base.css?v=1",  # once, though linked twice
        "https://cdn.shopify.com/extensions/kaching/bundles.css",  # media=print onload=all
    ]
    assert clone.stylesheet_urls(REPLO, REPLO_URL) == ["https://cdn.replo.app/styles/page.css"]


def test_inlines_stylesheets_with_absolute_urls() -> None:
    sheets = {
        "https://lumora.test/cdn/shop/t/9/assets/base.css?v=1": (
            "@import 'fonts.css';\n.hero{background:url(../files/bg.png)}"
            ".icon{background:url('data:image/png;base64,AAA=')}"
        ),
        "https://cdn.shopify.com/extensions/kaching/bundles.css": ".bundle{color:red}",
    }
    result = clone.clone_page(SHOPIFY, SHOPIFY_URL, sheets)
    soup = parse(result.html)
    styles = soup.select("style[data-lp-source]")
    assert len(styles) == 2 and not soup.select("link[rel=stylesheet]")
    base_css = styles[0].get_text()
    assert '@import "https://lumora.test/cdn/shop/t/9/assets/fonts.css"' in base_css
    assert 'url("https://lumora.test/cdn/shop/t/9/files/bg.png")' in base_css
    assert 'url("data:image/png;base64,AAA=")' in base_css  # data URIs untouched
    # The async media="print" trick isn't kept as print styles.
    assert not styles[1].get("media")
    assert result.stats["stylesheets_inlined"] == 2


def test_a_stylesheet_that_did_not_download_still_links_to_the_source() -> None:
    result = clone.clone_page(REPLO, REPLO_URL, {})
    link = parse(result.html).select_one("link[as=style]")
    assert link is not None and link["href"] == "https://cdn.replo.app/styles/page.css"
    assert result.stats["stylesheets_missing"] == 1


def test_removes_known_trackers_and_keeps_working_scripts() -> None:
    shopify = clone.clone_page(SHOPIFY, SHOPIFY_URL)
    out = shopify.html
    for gone in ("googletagmanager", "fbq(", "facebook.com/tr", "klaviyo", "clarity.ms"):
        assert gone not in out, gone
    assert "global.js" in out and "className+=' js'" in out  # functional scripts stay
    assert '"@type":"Product"' in out  # structured data isn't a tracker (scrubbed per build)
    assert set(shopify.stats["trackers"]) == {  # type: ignore[call-overload]
        "Google Tag Manager", "Google Analytics", "Facebook pixel", "Klaviyo", "Clarity",
    }  # fmt: skip

    replo = clone.clone_page(REPLO, REPLO_URL)
    assert "cdn.segment.com" not in replo.html and "runtime.js" in replo.html
    # A long working script that only calls a tracker stays.
    assert "window.carousel" in replo.html

    webflow = clone.clone_page(WEBFLOW, WEBFLOW_URL)
    for gone in ("hotjar", "hj(", "heap.load", "amplitude", "ttq", "_fs_namespace", "mixpanel"):
        assert gone not in webflow.html, gone
    assert "webflow.js" in webflow.html


def test_fixes_lazy_broken_and_relative_image_urls() -> None:
    soup = parse(clone.clone_page(SHOPIFY, SHOPIFY_URL).html)
    hero = soup.select_one("img.hero")
    assert hero is not None
    assert hero["src"] == "https://lumora.test/cdn/shop/files/serum_1200x.jpg"
    assert not hero.has_attr("data-src") and not hero.has_attr("loading")
    ticks = soup.select_one("img[alt=ticks]")
    assert ticks is not None and ticks["src"] == "https://cdn.shopify.com/s/files/1/ticks.png"
    badge = soup.select_one("img[alt=badge]")
    assert badge is not None
    assert badge["srcset"] == (
        "https://lumora.test/cdn/shop/files/badge.png 1x, "
        "https://lumora.test/cdn/shop/files/badge@2x.png 2x"
    )


def test_relative_urls_resolve_against_the_pages_base() -> None:
    soup = parse(clone.clone_page(WEBFLOW, WEBFLOW_URL).html)
    assert soup.find("base") is None  # the stored page has none; the preview adds it
    dog = soup.select_one("img[alt=dog]")
    assert dog is not None and dog["src"] == "https://pawsome.test/blog/images/dog-1.webp"
    texture = soup.select_one("div[style*=texture]")
    assert texture is not None
    assert 'url("https://pawsome.test/blog/images/texture.png")' in str(texture["style"])
    source = soup.select_one("source")
    assert source is not None and source["srcset"] == (
        "https://pawsome.test/blog/images/dog-2.avif 800w, "
        "https://pawsome.test/blog/images/dog-2-big.avif 1600w"
    )
    # Commas inside a URL (image CDNs) survive.
    cdn = soup.select_one("img[alt='dog three']")
    assert cdn is not None and "w_800,h_600/dog.jpg 800w" in str(cdn["srcset"])


def test_links_become_absolute_but_anchors_and_mail_stay() -> None:
    soup = parse(clone.clone_page(SHOPIFY, SHOPIFY_URL).html)
    hrefs = [a["href"] for a in soup.find_all("a")]
    assert "https://lumora.test/collections/all" in hrefs
    assert "#reviews" in hrefs and "mailto:hello@lumora.test" in hrefs


def test_videos_embeds_and_lottie_become_media_slots() -> None:
    shopify = parse(clone.clone_page(SHOPIFY, SHOPIFY_URL).html)
    slot = shopify.select_one(".lp-media-slot")
    assert slot is not None and shopify.find("video") is None
    assert (slot["data-aspect"], slot["data-radius"]) == ("640/360", "12px")

    replo = clone.clone_page(REPLO, REPLO_URL)
    soup = parse(replo.html)
    aspects = [s["data-aspect"] for s in soup.select(".lp-media-slot")]
    assert aspects == ["200/200", "48/48", "560/315"]  # in page order
    assert soup.find("lottie-player") is None
    assert soup.select_one("iframe[src*=maps]") is not None  # not a video
    assert (replo.stats["videos"], replo.stats["lottie"]) == (1, 2)


def test_nested_paragraphs_are_flattened() -> None:
    soup = parse(clone.clone_page(REPLO, REPLO_URL).html)
    assert not [p for p in soup.find_all("p") if p.find("p")]


def test_rejects_bot_walls_and_fragments() -> None:
    clone.validate(SHOPIFY)  # a real page passes, captcha in its scripts or not
    clone.validate(SHOPIFY.replace("</body>", "<script>var nocaptcha=1;</script></body>"))
    with pytest.raises(clone.CloneRejectedError, match="too small"):
        clone.validate("<html><body><h1>Hi</h1></body></html>")
    wall = "<html><head><title>Just a moment...</title></head><body>" + "x" * 6000
    with pytest.raises(clone.CloneRejectedError, match="bot check"):
        clone.validate(wall)
    px = "<html><body><div id='px-captcha'></div>" + "y" * 6000 + "</body></html>"
    with pytest.raises(clone.CloneRejectedError, match="bot check"):
        clone.validate(px)


def test_the_preview_gets_a_base_href() -> None:
    html = clone.with_base("<html><head><title>x</title></head><body></body></html>", REPLO_URL)
    base = parse(html).find("base")
    assert base is not None and base["href"] == REPLO_URL
