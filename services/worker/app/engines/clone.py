"""Cloning a competitor's page (BUILD_SPEC §8.4, the deterministic and deliberately light pass).
Pure: HTML in, HTML plus stats out; the job fetches the page and its stylesheets.

1. fingerprint the platform; a store product page with "add to cart" gets `rebuild_native`;
2. inline each stylesheet into a `<style>` block, its `url()`s made absolute;
3. remove known tracker scripts only (functional JavaScript stays);
4. images: `data-src` → `src`, `////host` fixed, every URL absolute, `loading` dropped;
5. videos, video embeds and Lottie players become `div.lp-media-slot` placeholders;
6. identity: the source host from the address, the source name from `og:site_name`;
7. nested `<p>` flattened.
The source brand is not removed here: that runs on every build, for the brand being built (§8.4).
The preview adds a `<base href>` (the stored page has none; its URLs are already absolute).
"""

import re
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from bs4.element import Tag

from app.engines.html import ensure_head, parse, serialize, style_text, text_nodes

Platform = Literal[
    "shopify", "replo", "webflow", "clickfunnels", "funnelish", "wordpress", "framer", "unknown"
]
MIN_BYTES = 5_000  # BUILD_SPEC §8.4: anything smaller is not a landing page
# A bot check's <title>; and markers only challenge pages carry, trusted anywhere on a short page.
WALL_TITLES = (
    "just a moment", "attention required", "access denied", "access to this page has been denied",
    "captcha", "cf-chl", "px-captcha",
)  # fmt: skip
WALL_MARKERS = ("px-captcha", "cf-chl-", "_cf_chl_opt", "captcha-delivery.com")
MAX_STYLESHEETS = 30

# Page builders first: they run on top of Shopify or WordPress, and the builder is what matters.
FINGERPRINTS: list[tuple[Platform, re.Pattern[str]]] = [
    ("replo", re.compile(r"replo\.app|data-replo|class=\"?replo", re.I)),
    ("funnelish", re.compile(r"funnelish\.com|data-funnelish", re.I)),
    ("clickfunnels", re.compile(r"clickfunnels\.com|myclickfunnels|cfAddPolyfill", re.I)),
    ("webflow", re.compile(r"data-wf-page|data-wf-site|website-files\.com|webflow\.js", re.I)),
    ("framer", re.compile(r"framerusercontent\.com|data-framer-|content=\"Framer", re.I)),
    ("wordpress", re.compile(r"/wp-content/|/wp-includes/|content=\"WordPress", re.I)),
    ("shopify", re.compile(r"cdn\.shopify\.com|/cdn/shop/|Shopify\.shop|shopify-section", re.I)),
]
ADD_TO_CART = re.compile(r"\badd\s+to\s+(cart|bag|basket)\b", re.I)
PRODUCT_PATH = re.compile(r"/products?/[^/]+", re.I)

# Known trackers only (§8.4): GTM, GA, Facebook pixel, Clarity, Hotjar, Segment, Klaviyo, Heap,
# FullStory, Mixpanel, Amplitude and the TikTok pixel. Each has the address its snippet loads
# from, and the calls the snippet makes. A script's src, or a short inline script, may match
# either; a long inline script only the loader, so working code that merely calls a tracker
# (`if (window.fbq) fbq(...)`) is kept.
TRACKERS: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    ("Google Tag Manager", re.compile(r"googletagmanager\.com", re.I),
     re.compile(r"\bGTM-[A-Z0-9]{4,}\b|dataLayer\.push\s*\(\s*\{\s*['\"]gtm\.", re.I)),
    ("Google Analytics", re.compile(r"google-analytics\.com", re.I),
     re.compile(r"\bgtag\s*\(", re.I)),
    ("Facebook pixel", re.compile(r"connect\.facebook\.net|facebook\.com/tr", re.I),
     re.compile(r"\bfbq\s*\(", re.I)),
    ("Clarity", re.compile(r"clarity\.ms", re.I), re.compile(r"\bclarity\s*\(", re.I)),
    ("Hotjar", re.compile(r"hotjar\.com", re.I), re.compile(r"\bhj\s*\(\s*['\"]", re.I)),
    ("Segment", re.compile(r"cdn\.segment\.(com|io)", re.I),
     re.compile(r"analytics\.load\s*\(", re.I)),
    ("Klaviyo", re.compile(r"klaviyo\.com", re.I),
     re.compile(r"\b_learnq\b|_klOnsite|window\.klaviyo\s*=", re.I)),
    ("Heap", re.compile(r"heapanalytics\.com", re.I), re.compile(r"\bheap\.load\s*\(", re.I)),
    ("FullStory", re.compile(r"fullstory\.com", re.I), re.compile(r"_fs_namespace", re.I)),
    ("Mixpanel", re.compile(r"mxpnl\.com|mixpanel\.com/", re.I),
     re.compile(r"mixpanel\.init\s*\(", re.I)),
    ("Amplitude", re.compile(r"amplitude\.com", re.I),
     re.compile(r"amplitude\.(getInstance|init)\s*\(", re.I)),
    ("TikTok pixel", re.compile(r"analytics\.tiktok\.com", re.I),
     re.compile(r"\bttq\.(load|page|track)\s*\(", re.I)),
]  # fmt: skip
SHORT_SCRIPT = 3_000  # characters: a tracker's inline snippet is shorter than this
VIDEO_EMBED = re.compile(
    r"youtube(-nocookie)?\.com/embed|player\.vimeo\.com|fast\.wistia\.(net|com)|"
    r"play\.vidyard\.com|loom\.com/embed",
    re.I,
)
LOTTIE_TAGS = ("lottie-player", "dotlottie-player", "dotlottie-wc")
LOTTIE_ATTRS = ("data-animation-path", "data-lottie", "data-anim-path", "data-lottie-src")
CSS_URL = re.compile(r"url\(\s*(['\"]?)(?P<url>[^'\")]+)\1\s*\)", re.I)
CSS_IMPORT = re.compile(r"@import\s+(['\"])(?P<url>[^'\"]+)\1", re.I)
URL_ATTRS: dict[str, tuple[str, ...]] = {
    "a": ("href",), "area": ("href",), "link": ("href",), "script": ("src",),
    "img": ("src",), "source": ("src",), "iframe": ("src",), "form": ("action",),
    "input": ("src",), "embed": ("src",), "object": ("data",), "track": ("src",),
    "audio": ("src",),
}  # fmt: skip
SKIP_SCHEMES = ("data:", "blob:", "mailto:", "tel:", "sms:", "javascript:", "about:", "#")
SLOT_STYLE = (
    "display:block;width:100%;max-width:100%;aspect-ratio:{aspect};"
    "border-radius:{radius};background:#e5e7eb"
)


@dataclass
class CloneResult:
    html: str
    platform: Platform
    verdict: str | None  # "rebuild_native" for a store product page
    source_host: str
    source_name: str | None
    title: str | None
    stats: dict[str, object] = field(default_factory=dict)


class CloneRejectedError(ValueError):
    """The HTML isn't a page we can clone; the message is shown to the user."""


# ── validation and identity ───────────────────────────────────────────────────


def validate(html: str) -> None:
    """Rejects bot-wall or captcha pages and anything under 5,000 bytes (§8.4). The general
    markers ("captcha", "access denied") are trusted in the <title> only: store themes mention
    captcha in their scripts."""
    if len(html.encode("utf-8")) < MIN_BYTES:
        raise CloneRejectedError(
            "That page is too small to be a landing page (under 5 KB). Check the address, or "
            "paste the page's full HTML."
        )
    lower = html.lower()
    title = lower.split("<title", 1)[1].split("</title>", 1)[0] if "<title" in lower else ""
    if any(marker in title for marker in WALL_TITLES) or (
        len(html) < 60_000 and any(marker in lower for marker in WALL_MARKERS)
    ):
        raise CloneRejectedError(
            "We got the site's bot check instead of the page. Open the page in your browser, "
            "save it (File → Save Page As, HTML only) and paste its HTML instead."
        )


def source_host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    return host.removeprefix("www.")


def _meta(
    soup: BeautifulSoup, *, property: str | None = None, name: str | None = None
) -> str | None:
    tag = soup.find("meta", attrs={"property": property} if property else {"name": name or ""})
    value = str(tag.get("content") or "").strip() if isinstance(tag, Tag) else ""
    return " ".join(value.split()) or None


def page_address(html: str) -> str | None:
    """Where a pasted page came from: its canonical link or og:url, if it has one."""
    soup = parse(html)
    link = soup.find("link", rel="canonical")
    href = str(link.get("href") or "").strip() if isinstance(link, Tag) else ""
    for candidate in (href, _meta(soup, property="og:url") or ""):
        if candidate.lower().startswith(("http://", "https://")):
            return candidate
    return None


# ── fingerprint ───────────────────────────────────────────────────────────────


def fingerprint(soup: BeautifulSoup, html: str, url: str) -> tuple[Platform, str | None]:
    platform: Platform = next((name for name, rule in FINGERPRINTS if rule.search(html)), "unknown")
    buttons = soup.find_all(["button", "a", "input"])
    sells = any(
        ADD_TO_CART.search(b.get_text(" ") if b.name != "input" else str(b.get("value") or ""))
        for b in buttons
        if isinstance(b, Tag)
    )
    product = bool(PRODUCT_PATH.search(urlsplit(url).path)) or (
        (_meta(soup, property="og:type") or "").lower() == "product"
    )
    return platform, ("rebuild_native" if sells and product else None)


# ── URLs ──────────────────────────────────────────────────────────────────────


def absolute(url: str, base: str) -> str:
    """A URL as the browser would load it from `base`: `////host` and `//host` get https, and
    relative paths resolve. Data, anchors, mail and script links are left alone."""
    value = url.strip()
    if not value or value.lower().startswith(SKIP_SCHEMES) or "{{" in value:
        return url
    if re.match(r"^/{3,}[^/]", value):  # a broken "////cdn.example.com/x.png"
        value = "https://" + value.lstrip("/")
    elif value.startswith("//"):
        value = "https:" + value
    return urljoin(base, value)


def absolute_srcset(srcset: str, base: str) -> str:
    """Each candidate's URL made absolute. URLs may contain commas (image CDNs), so a candidate
    is a URL (no spaces) and an optional descriptor, as the HTML spec splits them."""
    out: list[str] = []
    rest = srcset.strip()
    while rest:
        match = re.match(r"\s*(\S+)", rest)
        if not match:
            break
        url = match.group(1)
        rest = rest[match.end() :]
        if url.endswith(","):
            out.append(absolute(url.rstrip(","), base))
            continue
        descriptor, _, rest = rest.partition(",")
        out.append(f"{absolute(url, base)} {descriptor.strip()}".strip())
    return ", ".join(out)


def absolute_css(css: str, base: str) -> str:
    def url(match: re.Match[str]) -> str:
        return f'url("{absolute(match.group("url"), base)}")'

    def imported(match: re.Match[str]) -> str:
        return f'@import "{absolute(match.group("url"), base)}"'

    return CSS_IMPORT.sub(imported, CSS_URL.sub(url, css))


# ── stylesheets ───────────────────────────────────────────────────────────────


def _stylesheet_links(soup: BeautifulSoup) -> list[Tag]:
    """`<link rel=stylesheet>`, and the async pattern `<link rel=preload as=style
    onload="this.rel='stylesheet'">`."""
    links = []
    for link in soup.find_all("link", href=True):
        if not isinstance(link, Tag):
            continue
        rel = " ".join(link.get_attribute_list("rel") or []).lower()
        onload = str(link.get("onload") or "")
        if "stylesheet" in rel.split() or (
            "preload" in rel.split() and link.get("as") == "style" and "stylesheet" in onload
        ):
            links.append(link)
    return links


def stylesheet_urls(html: str, base_url: str) -> list[str]:
    """The stylesheets to download for `clone_page`, in page order (at most 30)."""
    urls = [absolute(str(link["href"]), base_url) for link in _stylesheet_links(parse(html))]
    return [u for u in dict.fromkeys(urls) if u.startswith(("http://", "https://"))][
        :MAX_STYLESHEETS
    ]


def _inline_stylesheets(
    soup: BeautifulSoup, base_url: str, sheets: dict[str, str], stats: dict[str, int]
) -> None:
    inlined: set[str] = set()
    for link in _stylesheet_links(soup):
        url = absolute(str(link["href"]), base_url)
        if url in inlined:  # store themes link a section's stylesheet once per section
            link.decompose()
            continue
        css = sheets.get(url)
        if css is None:
            link["href"] = url  # couldn't download it: at least it still loads from the source
            stats["stylesheets_missing"] += 1
            continue
        style = soup.new_tag("style")
        style["data-lp-source"] = url
        media = str(link.get("media") or "").strip()
        # media="print" onload="this.media='all'" is the async-loading trick, not print styles.
        if media and media.lower() != "all" and "media" not in str(link.get("onload") or ""):
            style["media"] = media
        style.string = absolute_css(css, url)
        link.replace_with(style)
        inlined.add(url)
        stats["stylesheets_inlined"] += 1


# ── trackers ──────────────────────────────────────────────────────────────────


def _tracker(text: str, *, calls: bool = True) -> str | None:
    return next(
        (
            name
            for name, loader, call in TRACKERS
            if loader.search(text) or (calls and call.search(text))
        ),
        None,
    )


def _remove_trackers(soup: BeautifulSoup, stats: dict[str, int]) -> list[str]:
    found: list[str] = []
    for script in soup.find_all("script"):
        if not isinstance(script, Tag):
            continue
        kind = str(script.get("type") or "").lower()
        if kind in ("application/ld+json", "application/json", "text/template"):
            continue
        text = script.get_text()
        name = _tracker(str(script.get("src") or "")) or _tracker(
            text, calls=len(text) <= SHORT_SCRIPT
        )
        if name:
            script.decompose()
            stats["trackers_removed"] += 1
            found.append(name)
    # Their no-JavaScript fallbacks: GTM's iframe, the pixels' 1x1 images.
    for tag in soup.find_all(["noscript", "img", "iframe"]):
        if not isinstance(tag, Tag) or tag.decomposed:
            continue
        markup = str(tag) if tag.name == "noscript" else str(tag.get("src") or "")
        name = _tracker(markup, calls=False)
        if name:
            tag.decompose()
            stats["trackers_removed"] += 1
            found.append(name)
    return sorted(set(found))


# ── images and URLs ───────────────────────────────────────────────────────────


def _fix_urls(soup: BeautifulSoup, base_url: str, stats: dict[str, int]) -> None:
    for img in soup.find_all(["img", "source"]):
        if not isinstance(img, Tag):
            continue
        for lazy, real in (("data-src", "src"), ("data-srcset", "srcset")):
            value = str(img.get(lazy) or "").strip()
            if value and not value.startswith("data:"):
                img[real] = value.replace("{width}", "1200")  # Shopify themes' width placeholder
                del img[lazy]
                stats["lazy_images"] += 1
        if img.has_attr("loading"):
            del img["loading"]
        if img.has_attr("srcset"):
            img["srcset"] = absolute_srcset(str(img["srcset"]), base_url)
    for name, attrs in URL_ATTRS.items():
        for tag in soup.find_all(name):
            if not isinstance(tag, Tag):
                continue
            for attr in attrs:
                if tag.has_attr(attr):
                    value = str(tag[attr])
                    fixed = absolute(value, base_url)
                    if fixed != value:
                        tag[attr] = fixed
                        stats["urls_absolute"] += 1
    for tag in soup.find_all(style=True):
        if isinstance(tag, Tag) and "url(" in str(tag["style"]):
            tag["style"] = absolute_css(str(tag["style"]), base_url)
    for style in soup.find_all("style"):
        if isinstance(style, Tag) and not style.has_attr("data-lp-source"):
            css = style_text(style)
            if "url(" in css or "@import" in css:
                style.string = absolute_css(css, base_url)


# ── media slots ───────────────────────────────────────────────────────────────


def _number(value: object) -> float | None:
    match = re.match(r"\s*(\d+(?:\.\d+)?)\s*(px)?\s*$", str(value or ""))
    return float(match.group(1)) if match else None


def _style_value(style: str, prop: str) -> str | None:
    match = re.search(rf"(?:^|;)\s*{prop}\s*:\s*([^;]+)", style, re.I)
    return match.group(1).strip() if match else None


def _aspect(tag: Tag, default: str) -> str:
    style = str(tag.get("style") or "")
    ratio = _style_value(style, "aspect-ratio")
    if ratio and re.fullmatch(r"\d+(\.\d+)?\s*(/\s*\d+(\.\d+)?)?", ratio):
        return ratio.replace(" ", "")
    width = _number(tag.get("width")) or _number(_style_value(style, "width"))
    height = _number(tag.get("height")) or _number(_style_value(style, "height"))
    if width and height:
        return f"{width:g}/{height:g}"
    return default


def _slot(soup: BeautifulSoup, tag: Tag, default_aspect: str) -> Tag:
    aspect = _aspect(tag, default_aspect)
    radius = _style_value(str(tag.get("style") or ""), "border-radius") or "0"
    slot = soup.new_tag("div")
    classes = [c for c in tag.get_attribute_list("class") or [] if c]
    slot["class"] = " ".join(["lp-media-slot", *classes])
    if tag.get("id"):
        slot["id"] = str(tag["id"])
    slot["data-aspect"] = aspect
    slot["data-radius"] = radius
    slot["style"] = SLOT_STYLE.format(aspect=aspect, radius=radius)
    return slot


def _media_slots(soup: BeautifulSoup, stats: dict[str, int]) -> None:
    for video in soup.find_all("video"):
        if isinstance(video, Tag) and not video.decomposed:
            video.replace_with(_slot(soup, video, "16/9"))
            stats["videos"] += 1
    for frame in soup.find_all("iframe", src=VIDEO_EMBED):
        if isinstance(frame, Tag) and not frame.decomposed:
            frame.replace_with(_slot(soup, frame, "16/9"))
            stats["videos"] += 1
    lottie = [t for t in soup.find_all(LOTTIE_TAGS) if isinstance(t, Tag)]
    lottie += [
        t
        for t in soup.find_all(True)
        if isinstance(t, Tag) and t not in lottie and any(t.has_attr(a) for a in LOTTIE_ATTRS)
    ]
    for player in lottie:
        if not player.decomposed:
            player.replace_with(_slot(soup, player, "1/1"))
            stats["lottie"] += 1


# ── the clone ─────────────────────────────────────────────────────────────────


def _flatten_paragraphs(soup: BeautifulSoup, stats: dict[str, int]) -> None:
    """A `<p>` holding another `<p>` (which browsers split apart) becomes a `<div>`."""
    for p in soup.find_all("p"):
        if isinstance(p, Tag) and p.find("p") is not None:
            p.name = "div"
            stats["nested_paragraphs"] += 1


def clone_page(html: str, url: str, stylesheets: dict[str, str] | None = None) -> CloneResult:
    """The cloned page. `url` is the page's address (after redirects) that relative URLs resolve
    against; `stylesheets` maps each URL from `stylesheet_urls` to its downloaded CSS."""
    soup = parse(html)
    stats: dict[str, int] = {
        "stylesheets_inlined": 0, "stylesheets_missing": 0, "trackers_removed": 0,
        "lazy_images": 0, "urls_absolute": 0, "videos": 0, "lottie": 0, "nested_paragraphs": 0,
    }  # fmt: skip
    platform, verdict = fingerprint(soup, html, url)
    title = soup.title.get_text(" ", strip=True) if soup.title else None
    name = _meta(soup, property="og:site_name") or _meta(soup, name="application-name")
    for base in soup.find_all("base"):
        if isinstance(base, Tag):
            url = absolute(str(base.get("href") or ""), url) if base.get("href") else url
            base.decompose()
    trackers = _remove_trackers(soup, stats)
    _inline_stylesheets(soup, url, stylesheets or {}, stats)
    _fix_urls(soup, url, stats)
    _media_slots(soup, stats)
    _flatten_paragraphs(soup, stats)
    ensure_head(soup)
    words = sum(len(str(node).split()) for node in text_nodes(soup))
    return CloneResult(
        html=serialize(soup),
        platform=platform,
        verdict=verdict,
        source_host=source_host(url),
        source_name=name,
        title=" ".join(title.split())[:200] if title else None,
        stats={**stats, "trackers": trackers, "words": words},
    )


def with_base(html: str, url: str) -> str:
    """The page for preview only, with `<base href>` so anything its scripts build from a
    relative path still loads from the source (§8.4)."""
    soup = parse(html)
    head = ensure_head(soup)
    base = soup.new_tag("base", href=url)
    head.insert(0, base)
    return serialize(soup)
