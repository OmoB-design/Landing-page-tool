"""The clone-only build steps (BUILD_SPEC §10.2, B2.3, D100). Pure: HTML in, HTML and stats out.

A build from a cloned page has to come out as the brand's page with nothing of the competitor
left. In pipeline order: `strip_chrome` (the store's header, footer, chat and overlays, before any
image is placed), `mark_images` (sort the source's images into slots, since clones carry no
`data-lp-*` markers), then after finalize `scrub_source_brand`, `scrub_scripts`, `rewrite_links`
and `purge_foreign_assets`. `Hosts` decides what is the brand's and what is foreign; `Source`
holds the competitor's names.
"""

import re
import zlib
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag
from bs4.element import NavigableString

from app.engines.clone import CSS_IMPORT, CSS_URL, TRACKERS
from app.engines.html import parse, serialize, style_text, text_nodes

PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
ICON_MAX = 48  # px: an image this small (by its attributes) is an icon
# Second-level labels under country codes, so `shop.brand.co.uk` belongs to `brand.co.uk`.
SECOND_LEVEL = {"co", "com", "org", "net", "ac", "gov", "edu", "ne", "or"}
# Words that never count as a source name on their own.
COMMON_WORDS = {
    "the", "and", "shop", "store", "official", "health", "home", "try", "get", "buy", "www",
    "news", "daily", "report", "review", "reviews", "best", "top", "offer", "special",
}  # fmt: skip


def registrable(host: str) -> str:
    """`try.resilia.shop` → `resilia.shop`; `shop.brand.co.uk` → `brand.co.uk`."""
    labels = host.lower().strip(".").split(".")
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in SECOND_LEVEL:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def url_host(url: str) -> str | None:
    """The host of an http(s) or protocol-relative URL; None for data, mail, anchors and paths."""
    value = url.strip()
    if value.startswith("//"):
        value = "https:" + value
    if not re.match(r"^https?://", value, re.I):
        return None
    host = urlsplit(value).hostname
    return host.lower() if host else None


@dataclass(frozen=True)
class Hosts:
    """What a clone build may keep. The brand's own domains (its site, its product page, our
    storage) are allowed whole; on shared CDNs (one Shopify CDN serves every store) only the exact
    URLs of the brand's logo and product photos are."""

    brand_domains: frozenset[str]
    brand_urls: frozenset[str]
    source_domains: frozenset[str]

    @classmethod
    def build(
        cls,
        *,
        storage_url: str,
        brand_url: str | None,
        product_url: str | None,
        exact_urls: list[str],
        source_host: str,
    ) -> "Hosts":
        domains = {registrable(h) for h in (url_host(storage_url),) if h}
        for url in (brand_url, product_url):
            host = url_host(url or "")
            if host:
                domains.add(registrable(host))
        return cls(
            brand_domains=frozenset(domains),
            brand_urls=frozenset(u.strip() for u in exact_urls if u),
            source_domains=frozenset({registrable(source_host)}),
        )

    def foreign(self, url: str) -> bool:
        """An http(s) URL that isn't the brand's. Data URIs, anchors, mail and paths aren't."""
        host = url_host(url)
        if host is None:
            return False
        if url.strip() in self.brand_urls:
            return False
        return registrable(host) not in self.brand_domains

    def source(self, url: str) -> bool:
        host = url_host(url)
        return host is not None and registrable(host) in self.source_domains


def _label(host: str) -> str:
    """The name part of a host: `try.resilia.shop` → `resilia`."""
    return registrable(host).split(".")[0]


@dataclass(frozen=True)
class Source:
    """The competitor's names. Longest first, so `Resilia Cardio` is replaced before `Resilia`."""

    host: str
    name: str | None
    tokens: tuple[str, ...]
    core: str
    _pattern: re.Pattern[str] | None = field(default=None, compare=False, repr=False)

    @classmethod
    def build(cls, *, host: str, name: str | None, brand_tokens: list[str]) -> "Source":
        label = _label(host)
        seen: dict[str, str] = {}
        for token in [*brand_tokens, name or "", label]:
            value = re.sub(r"\s+", " ", token).strip(" .,:;!?\"'")
            if not (3 <= len(value) <= 40) or len(value.split()) > 4:
                continue
            if value.lower() in COMMON_WORDS:
                continue
            seen.setdefault(value.lower(), value)
        tokens = tuple(sorted(seen.values(), key=len, reverse=True))
        pattern = (
            re.compile(
                r"(?<![\w-])(" + "|".join(re.escape(t) for t in tokens) + r")(?![\w-])", re.I
            )
            if tokens
            else None
        )
        core = (name or label).strip() or label
        return cls(host=host, name=name, tokens=tokens, core=core, _pattern=pattern)

    def find(self, text: str) -> list[str]:
        return [m.group(0) for m in self._pattern.finditer(text)] if self._pattern else []

    def replace(self, text: str, *, brand: str, product: str) -> tuple[str, int]:
        """Each source name becomes the brand's name; a longer name that contains the source's
        own (`Vitalis Heart Complex`) becomes the product's."""
        if not self._pattern:
            return text, 0
        core = self.core.lower()

        def swap(match: re.Match[str]) -> str:
            found = match.group(0)
            lower = found.lower()
            if lower != core and core in lower and len(found.split()) > 1:
                return product
            return brand

        return self._pattern.subn(swap, text)

    def in_text(self, text: str) -> bool:
        return bool(self._pattern and self._pattern.search(text))


def _classes(tag: Tag) -> list[str]:
    value = tag.get("class")
    if not value:
        return []
    return [value] if isinstance(value, str) else [str(c) for c in value]


def _hint(tag: Tag) -> str:
    """A tag's class, id, role and aria-label, for recognising chrome."""
    classes = _classes(tag)
    return " ".join(
        [*classes, str(tag.get("id") or ""), str(tag.get("role") or ""),
         str(tag.get("aria-label") or "")]
    )  # fmt: skip


def _style(tag: Tag) -> str:
    return re.sub(r"\s+", "", str(tag.get("style") or "")).lower()


def _in_section(tag: Tag) -> bool:
    return (
        tag.has_attr("data-lp-section")
        or tag.find_parent(attrs={"data-lp-section": True}) is not None
    )


def _holds_section(tag: Tag) -> bool:
    return tag.select_one("[data-lp-section]") is not None


def _rel(tag: Tag) -> list[str]:
    value = tag.get("rel")
    if not value:
        return []
    return [value] if isinstance(value, str) else [str(r) for r in value]


def _alive(tag: Tag) -> bool:
    """Not already removed with an ancestor during this pass."""
    return tag.parent is not None and not getattr(tag, "decomposed", False)


# ── strip_chrome ─────────────────────────────────────────────────────────────────────────────

HEADER_HINT = re.compile(
    r"(^|[\s_-])(site-?header|header|navbar|nav-?bar|top-?bar|main-?nav|masthead|"
    r"announcement(-?bar)?|shopify-section-header|header-group)([\s_-]|$)",
    re.I,
)
FOOTER_HINT = re.compile(
    r"(^|[\s_-])(site-?footer|footer|page-?footer|shopify-section-footer|footer-group)([\s_-]|$)",
    re.I,
)
CHAT_HINT = re.compile(
    r"gorgias|tidio|intercom|zendesk|zopim|livechat|tawk|chat-?widget|helpscout|reamaze|"
    r"re-amaze|chatra|olark|freshchat|crisp-client|drift-(widget|frame)|fb-customerchat",
    re.I,
)
OVERLAY_HINT = re.compile(
    r"(^|[\s_-])(modal|popup|pop-up|overlay|newsletter-?popup|cookie|consent|klaviyo-form|"
    r"exit-?intent|age-?gate|lightbox|cookiebanner)([\s_-]|$)",
    re.I,
)
STORE_LINK = re.compile(r"/(cart|account|login|search)(\b|/|\?|$)", re.I)
POLICY = re.compile(
    r"privacy|terms (of|&|and)|terms of service|refund|return policy|shipping policy|"
    r"contact us|cookie policy|accessibility|copyright|©|all rights reserved",
    re.I,
)
CITATIONS = re.compile(
    r"^\s*(references|sources|citations|studies( cited)?|bibliography|scientific references|"
    r"research)\s*:?\s*$",
    re.I,
)
SKIP_TEXT = re.compile(r"skip to (main )?content|skip to (the )?main|skip navigation", re.I)


def _store_header(tag: Tag) -> bool:
    """A header with the store's links (cart, account, search, or a menu of 3+ links), and no
    long heading of the page's own."""
    if not (tag.name == "header" or HEADER_HINT.search(_hint(tag))):
        return False
    if _in_section(tag) or _holds_section(tag):
        return False
    for heading in tag.find_all(["h1", "h2"]):
        if isinstance(heading, Tag) and len(heading.get_text(" ", strip=True)) > 24:
            return False
    if "announcement" in _hint(tag).lower():
        return True
    links = [a for a in tag.find_all("a") if isinstance(a, Tag)]
    if any(STORE_LINK.search(str(a.get("href") or "")) for a in links):
        return True
    if any(re.search(r"cart|account|search|menu", _hint(a), re.I) for a in links):
        return True
    return len(links) >= 3


def _footer(tag: Tag) -> bool:
    if _in_section(tag) or _holds_section(tag):
        return False
    return tag.name == "footer" or bool(FOOTER_HINT.search(_hint(tag)))


def _legal_block(tag: Tag, position: float) -> bool:
    """A short block near the end of the page full of policy links: a legal footer that isn't
    marked as one."""
    if position < 0.75 or _in_section(tag) or _holds_section(tag):
        return False
    text = tag.get_text(" ", strip=True)
    if not text or len(text) > 600:
        return False
    return len({m.group(0).lower() for m in POLICY.finditer(text)}) >= 2


def _overlay(tag: Tag) -> bool:
    """A chat widget, or a full-screen fixed layer (a popup, cookie wall or newsletter form).
    A sticky bar at the bottom of the page is content and stays."""
    hint = _hint(tag)
    if CHAT_HINT.search(hint) or CHAT_HINT.search(str(tag.get("src") or "")):
        return True
    style = _style(tag)
    fixed = "position:fixed" in style
    full = ("inset:0" in style) or (
        ("top:0" in style and "bottom:0" in style)
        or ("height:100%" in style or "height:100vh" in style)
    )
    if fixed and full:
        return True
    return bool(OVERLAY_HINT.search(hint)) and not _in_section(tag)


def strip_chrome(html: str) -> tuple[str, dict[str, object]]:
    """Removes skip links, store headers, the site footer and legal footers, chat widgets and
    full-screen overlays, citation lists, and menu links whose target went with them."""
    soup = parse(html)
    body = soup.body or soup
    stats = {"skip_links": 0, "headers": 0, "footers": 0, "overlays": 0, "citations": 0,
             "nav_links": 0}  # fmt: skip
    ids_before = {str(t["id"]) for t in soup.find_all(id=True) if isinstance(t, Tag)}

    for link in soup.find_all("a"):
        if isinstance(link, Tag) and _alive(link):
            href = str(link.get("href") or "")
            if href.startswith("#") and SKIP_TEXT.search(link.get_text(" ", strip=True)):
                link.decompose()
                stats["skip_links"] += 1

    candidates = [t for t in body.find_all(True) if isinstance(t, Tag)]
    total = max(1, len(candidates))
    for index, tag in enumerate(candidates):
        if not _alive(tag) or tag.name in ("html", "body", "head"):
            continue
        if _overlay(tag):
            tag.decompose()
            stats["overlays"] += 1
        elif _store_header(tag):
            tag.decompose()
            stats["headers"] += 1
        elif _footer(tag) or _legal_block(tag, index / total):
            tag.decompose()
            stats["footers"] += 1

    for heading in soup.find_all(["h2", "h3", "h4", "h5", "h6", "p", "strong", "b"]):
        if not isinstance(heading, Tag) or not _alive(heading):
            continue
        if not CITATIONS.match(heading.get_text(" ", strip=True)):
            continue
        # The heading and the list (or paragraphs) that follow it.
        for sibling in list(heading.find_next_siblings()):
            if isinstance(sibling, Tag) and sibling.name in ("ol", "ul", "p", "div", "small"):
                if sibling.find(["h1", "h2", "h3"]) is not None:
                    break
                sibling.decompose()
            else:
                break
        heading.decompose()
        stats["citations"] += 1

    ids_after = {str(t["id"]) for t in soup.find_all(id=True) if isinstance(t, Tag)}
    gone = ids_before - ids_after
    for link in soup.find_all("a"):
        if not isinstance(link, Tag) or not _alive(link):
            continue
        href = str(link.get("href") or "")
        if href.startswith("#") and href[1:] in gone and link.find_parent(["nav", "ul", "ol"]):
            link.decompose()
            stats["nav_links"] += 1
    return serialize(soup), stats  # type: ignore[return-value]


# ── image slots for clones ───────────────────────────────────────────────────────────────────

AVATAR_HINT = re.compile(r"avatar|author|profile|headshot|reviewer|customer-photo", re.I)
ICON_HINT = re.compile(
    r"(^|[\s_-])(icon|star|stars|rating|check|tick|badge|seal|flag)([\s_-]|$)", re.I
)


def _size(tag: Tag) -> tuple[int, int]:
    def number(value: object) -> int:
        match = re.match(r"^\s*(\d+)", str(value or ""))
        return int(match.group(1)) if match else 0

    style = _style(tag)
    width = number(tag.get("width")) or number(
        (re.search(r"(?:^|;)width:(\d+)px", style) or [None, ""])[1]
    )
    height = number(tag.get("height")) or number(
        (re.search(r"(?:^|;)height:(\d+)px", style) or [None, ""])[1]
    )
    return width, height


def _matches(img: Tag, soup: BeautifulSoup, needles: list[str]) -> bool:
    """A keep or generic rule: a src substring, or a CSS selector."""
    src = str(img.get("src") or "")
    for needle in needles:
        value = needle.strip()
        if not value:
            continue
        if value in src:
            return True
        if re.match(r"^[.#\[a-zA-Z]", value) and not value.startswith(("http", "/")):
            try:
                if img in soup.select(value):
                    return True
            except (ValueError, NotImplementedError):  # not a selector after all
                continue
    return False


def mark_logos(html: str, logo_srcs: list[str]) -> tuple[str, int]:
    """The source's logo images (from its analysis) become logo slots, for the logo swap."""
    if not logo_srcs:
        return html, 0
    soup = parse(html)
    count = 0
    for img in soup.find_all("img"):
        if not isinstance(img, Tag) or img.has_attr("data-lp-logo"):
            continue
        src = str(img.get("src") or "")
        if src and any(s and (s == src or s in src or src in s) for s in logo_srcs):
            img["data-lp-logo"] = ""
            count += 1
    return (serialize(soup), count) if count else (html, 0)


def mark_images(
    html: str, *, keep: list[str], generic: list[str], logo_srcs: list[str]
) -> tuple[str, dict[str, object]]:
    """Sorts a clone's images into slots for the image pass (no image vision yet, D100): the
    rules' keep list, icons and SVGs are kept (and copied in later); the source's logos become
    logo slots; small round photos by a name become person slots; every other content image
    becomes a scene. Images already marked are left alone."""
    soup = parse(html)
    counts = {"keep": 0, "logo": 0, "person": 0, "scene": 0}
    marks = ("data-lp-keep", "data-lp-logo", "data-lp-product", "data-lp-person", "data-lp-scene")
    for img in soup.find_all("img"):
        if not isinstance(img, Tag) or any(img.has_attr(m) for m in marks):
            continue
        if img.find_parent("noscript"):  # a tracking pixel; the link rewrite drops it
            continue
        src = str(img.get("src") or "")
        width, height = _size(img)
        hint = _hint(img) + " " + str(img.get("alt") or "")
        if src and any(s and (s == src or s in src) for s in logo_srcs):
            img["data-lp-logo"] = ""
            counts["logo"] += 1
        elif _matches(img, soup, keep):
            img["data-lp-keep"] = ""
            counts["keep"] += 1
        elif _matches(img, soup, generic):
            img["data-lp-scene"] = ""
            counts["scene"] += 1
        elif (
            src.lower().split("?")[0].endswith(".svg")
            or src.startswith("data:")
            or (0 < max(width, height) <= ICON_MAX)
            or ICON_HINT.search(hint)
        ):
            img["data-lp-keep"] = ""
            counts["keep"] += 1
        elif AVATAR_HINT.search(hint) or (
            0 < max(width, height) <= 160 and "border-radius:50%" in _style(img)
        ):
            img["data-lp-person"] = ""
            counts["person"] += 1
        else:
            img["data-lp-scene"] = ""
            counts["scene"] += 1
    return serialize(soup), counts  # type: ignore[return-value]


# ── scrub_source_brand ───────────────────────────────────────────────────────────────────────

TEXT_ATTRS = ("alt", "aria-label", "title", "placeholder", "content", "value")
LOOKS_LIKE_ADDRESS = re.compile(
    r"://|^\s*/|^[\w.-]+\.[a-z]{2,}(/|$)|\.(png|jpe?g|webp|gif|svg|js|css)\b", re.I
)
HYDRATION = re.compile(
    r"window\.Shopify|ShopifyAnalytics|Shopify\.(theme|shop|routes|currency)|"
    r"\bAlpine\.(start|data|store)|__st\s*=|meta\.product",
    re.I,
)


def _resolve_root_relative(soup: BeautifulSoup, origin: str) -> int:
    count = 0
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        for attr in ("href", "src", "action", "poster"):
            value = tag.get(attr)
            if isinstance(value, str) and value.startswith("/") and not value.startswith("//"):
                tag[attr] = urljoin(origin, value)
                count += 1
    return count


def scrub_source_brand(
    html: str, source: Source, *, brand_name: str, product_name: str
) -> tuple[str, dict[str, object]]:
    """The source's names become the brand's (or the product's) in visible text and in alt,
    aria-label, title, content and data-* attributes; JSON-LD, other sites' logos, the store's
    hydration scripts and `<base>` go; root-relative URLs resolve against the source site."""
    soup = parse(html)
    replaced = 0
    for node in list(text_nodes(soup)):
        new, count = source.replace(str(node), brand=brand_name, product=product_name)
        if count:
            node.replace_with(NavigableString(new))
            replaced += count
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        for attr, value in list(tag.attrs.items()):
            if not isinstance(value, str) or not (attr in TEXT_ATTRS or attr.startswith("data-")):
                continue
            if attr.startswith("data-lp") or LOOKS_LIKE_ADDRESS.search(value):
                # Never inside an address: `cdn.resilia.test` must not become `cdn.Graza.test`.
                continue
            new, count = source.replace(value, brand=brand_name, product=product_name)
            if count:
                tag[attr] = new
                replaced += count
    title = soup.find("title")
    if isinstance(title, Tag):
        new, count = source.replace(title.get_text(), brand=brand_name, product=product_name)
        if count:
            title.string = new
            replaced += count

    json_ld = 0
    for script in soup.find_all("script"):
        if not isinstance(script, Tag):
            continue
        kind = str(script.get("type") or "").lower()
        if kind == "application/ld+json":
            script.decompose()
            json_ld += 1
        elif kind == "application/json" or HYDRATION.search(script.get_text() or ""):
            script.decompose()

    logos = 0
    for img in soup.find_all("img"):
        if not isinstance(img, Tag) or img.has_attr("data-lp-logo"):
            continue
        text = " ".join(str(img.get(a) or "") for a in ("alt", "src", "class", "id"))
        if "logo" in text.lower():
            img.decompose()
            logos += 1
    for svg in soup.find_all("svg"):
        if not isinstance(svg, Tag) or svg.find_parent(attrs={"data-lp-logo": True}):
            continue
        text = _hint(svg) + " " + (svg.find("title").get_text() if svg.find("title") else "")  # type: ignore[union-attr]
        if re.search(r"logo", text, re.I) or source.in_text(text):
            svg.decompose()
            logos += 1

    for base in soup.find_all("base"):
        if isinstance(base, Tag):
            base.decompose()
    resolved = _resolve_root_relative(soup, f"https://{source.host}/")
    return serialize(soup), {
        "replaced": replaced, "json_ld": json_ld, "logos_removed": logos,
        "resolved_urls": resolved,
    }  # fmt: skip


# ── scrub_scripts ────────────────────────────────────────────────────────────────────────────

LAYOUT_LIBRARY = re.compile(
    r"(jquery|slick|swiper|splide|flickity|gsap|scrolltrigger|aos|glide|owl\.carousel|"
    r"lightgallery|lazysizes|alpinejs)(\.min)?(\.[\w-]+)?\.js",
    re.I,
)
CHECKOUT = re.compile(
    r"/cart(/add|\.js)?\b|checkout|add[-_]?to[-_]?cart|Shopify\.|shopify_pay|klaviyo|"
    r"\bfbq\b|\bgtag\b|\bttq\b|dataLayer|analytics|pixel|_learnq|rebuy|recharge|stamped|"
    r"judge\.me|yotpo|okendo|loox",
    re.I,
)
# Store, analytics and ad code that loads nothing by address, so a host check misses it (seen on
# the live check: Shopify's module and Trekkie stubs, Microsoft UET, Blotout EdgeTag, Elevar,
# UpPromote, Kaching bundles, Funnelish's page globals).
STORE_CODE = re.compile(
    r"\bShopify\b|trekkie|edgetag|blotout|elevar|uppromote|kaching|getDocumentContext|"
    r"web-?pixels?|window\._template\b|__productId|shop_id|\bti\s*:\s*[\"']\d+|uetq|"
    r"bat\.bing|snaptr|pintrk|\btwq\s*\(|\brdt\s*\(|attentive|postscript|triplewhale|"
    r"TriplePixel|northbeam|littledata|googletag|adsbygoogle|criteo|taboola|outbrain|_tfa\b|"
    r"obApi|window\.(FUNNEL|PRODUCTS|UNIFIED_PRODUCTS|LAZY_CODES)\b|\breturn\s+\w+\.q\s*=",
    re.I,
)
FONT_FACE = re.compile(r"@font-face\s*\{[^}]*\}", re.I)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
FONT_FAMILY_DECL = re.compile(r"font-family\s*:\s*(['\"]?)([^;'\"}]+)\1", re.I)


@dataclass
class ScriptPlan:
    """What `scrub_scripts` wants copied in: layout libraries and woff2 fonts, by URL."""

    scripts: list[str] = field(default_factory=list)
    fonts: list[str] = field(default_factory=list)


def plan_scripts(html: str, hosts: Hosts) -> ScriptPlan:
    """The foreign layout libraries and woff2 fonts worth copying in (the rest is dropped)."""
    soup = parse(html)
    plan = ScriptPlan()
    for script in soup.find_all("script", src=True):
        if isinstance(script, Tag):
            src = str(script["src"])
            if hosts.foreign(src) and LAYOUT_LIBRARY.search(src) and src not in plan.scripts:
                plan.scripts.append(src)
    for style in soup.find_all("style"):
        if not isinstance(style, Tag):
            continue
        for face in FONT_FACE.findall(style_text(style)):
            for match in CSS_URL.finditer(face):
                url = match.group("url")
                if (
                    hosts.foreign(url)
                    and ".woff2" in url.lower().split("?")[0]
                    and url not in plan.fonts
                ):
                    plan.fonts.append(url)
    return plan


def _font_faces(css: str, copied: dict[str, str], source: Source) -> tuple[str, int, int]:
    """In each @font-face: woff2 URLs become their copies; other formats and uncopied URLs go
    (a face left with no source goes too). Families named after the source become BrandFont."""
    kept = dropped = 0

    def face(block: re.Match[str]) -> str:
        nonlocal kept, dropped
        text = block.group(0)
        src = re.search(r"src\s*:\s*([^;}]+)", text, re.I)
        if src:
            entries = [e.strip() for e in re.split(r",(?![^(]*\))", src.group(1)) if e.strip()]
            good: list[str] = []
            for entry in entries:
                url_match = CSS_URL.search(entry)
                if not url_match:
                    if entry.lower().startswith("local("):
                        good.append(entry)
                    continue
                url = url_match.group("url")
                if url in copied:
                    good.append(f'url("{copied[url]}") format("woff2")')
                elif not url_host(url):  # a data URI or a relative path stays
                    good.append(entry)
            if not good:
                dropped += 1
                return ""
            kept += 1
            text = text.replace(src.group(0), "src: " + ", ".join(good))
        if source.in_text(text):
            text = FONT_FAMILY_DECL.sub(
                lambda m: 'font-family: "BrandFont"' if source.in_text(m.group(2)) else m.group(0),
                text,
            )
        return text

    return FONT_FACE.sub(face, css), kept, dropped


def _rename_identifiers(soup: BeautifulSoup, source: Source) -> int:
    """Classes and ids carrying a source name are renamed (in the markup and the CSS)."""
    if not source.tokens:
        return 0
    renames: dict[str, str] = {}
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        names = _classes(tag)
        if tag.get("id"):
            names.append(str(tag["id"]))
        for name in names:
            if name not in renames and source.in_text(name.replace("-", " ").replace("_", " ")):
                renames[name] = re.sub(
                    "|".join(re.escape(t.replace(" ", "-")) for t in source.tokens),
                    "brand",
                    name,
                    flags=re.I,
                )
                if renames[name] == name:
                    renames[name] = f"lp-{zlib.crc32(name.encode()) % 100000}"
    if not renames:
        return 0
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        classes = _classes(tag)
        if classes:
            tag["class"] = " ".join(renames.get(c, c) for c in classes)
        if tag.get("id") and str(tag["id"]) in renames:
            tag["id"] = renames[str(tag["id"])]
    for style in soup.find_all("style"):
        if not isinstance(style, Tag):
            continue
        css = style_text(style)
        for old, new in renames.items():
            css = re.sub(r"(?<=[.#])" + re.escape(old) + r"(?![\w-])", new, css)
        style.string = css
    return len(renames)


def scrub_scripts(
    html: str, source: Source, hosts: Hosts, *, copied: dict[str, str]
) -> tuple[str, dict[str, object]]:
    """Foreign scripts go unless they're a layout library that was copied in (`copied` maps a
    source URL to its copy); inline scripts with checkout or tracking code, a foreign address or
    a source name go; foreign stylesheet links and preload hints go; fonts are switched to their
    copies; families and classes named after the source are renamed."""
    soup = parse(html)
    stats = {"scripts_dropped": 0, "scripts_copied": 0, "inline_dropped": 0, "links_dropped": 0,
             "fonts_copied": 0, "fonts_dropped": 0, "renamed": 0}  # fmt: skip
    for script in soup.find_all("script"):
        if not isinstance(script, Tag):
            continue
        src = script.get("src")
        if isinstance(src, str) and src:
            if src in copied:
                script["src"] = copied[src]
                stats["scripts_copied"] += 1
            elif hosts.foreign(src):
                script.decompose()
                stats["scripts_dropped"] += 1
            continue
        code = script.get_text() or ""
        foreign_url = any(hosts.foreign(u) for u in re.findall(r"https?://[^\s'\"<>)]+", code))
        tracker = any(loader.search(code) or calls.search(code) for _, loader, calls in TRACKERS)
        store_code = bool(CHECKOUT.search(code) or STORE_CODE.search(code))
        if not code.strip() or store_code or foreign_url or tracker or source.in_text(code):
            script.decompose()
            stats["inline_dropped"] += 1
    for link in soup.find_all("link"):
        if not isinstance(link, Tag):
            continue
        rel = " ".join(_rel(link)).lower()
        href = str(link.get("href") or "")
        if any(
            r in rel for r in ("preload", "prefetch", "preconnect", "dns-prefetch", "modulepreload")
        ) or (hosts.foreign(href) and "stylesheet" in rel):
            link.decompose()
            stats["links_dropped"] += 1
    for style in soup.find_all("style"):
        if not isinstance(style, Tag):
            continue
        css, kept, dropped = _font_faces(style_text(style), copied, source)
        css = CSS_IMPORT.sub(lambda m: "" if hosts.foreign(m.group("url")) else m.group(0), css)
        if source.tokens:
            css = FONT_FAMILY_DECL.sub(
                lambda m: (
                    'font-family: "BrandFont"'
                    if source.in_text(m.group(2).split(",")[0])
                    else m.group(0)
                ),
                css,
            )
        style.string = css
        stats["fonts_copied"] += kept
        stats["fonts_dropped"] += dropped
    stats["renamed"] = _rename_identifiers(soup, source)
    return serialize(soup), stats  # type: ignore[return-value]


# ── rewrite_links ────────────────────────────────────────────────────────────────────────────

CART_DRAWER = re.compile(
    r"cart-?drawer|mini-?cart|side-?cart|cart-?notification|cart-?popup|ajax-?cart|cart-?flyout",
    re.I,
)
CROSS_SELL = re.compile(
    r"upsell|cross-?sell|product-?recommendations|rebuy|also-?like|frequently-?bought|"
    r"complementary|you-?may-?also",
    re.I,
)
URL_IN_TEXT = re.compile(r"https?://[^\s'\"<>()]+", re.I)


def _css_without_foreign(css: str, hosts: Hosts) -> tuple[str, int]:
    """Foreign `url()`s become `none`, except inside @font-face (handled with the fonts)."""
    count = 0

    def outside_faces(chunk: str) -> str:
        nonlocal count

        def swap(match: re.Match[str]) -> str:
            nonlocal count
            if hosts.foreign(match.group("url")):
                count += 1
                return "none"
            return match.group(0)

        return CSS_URL.sub(swap, chunk)

    parts: list[str] = []
    last = 0
    for face in FONT_FACE.finditer(css):
        parts.append(outside_faces(css[last : face.start()]))
        parts.append(face.group(0))
        last = face.end()
    parts.append(outside_faces(css[last:]))
    return "".join(parts), count


def dead_anchor(href: str, ids: set[str]) -> bool:
    """An in-page link to nothing (its target was removed or never existed), or a script link."""
    if href.lower().startswith("javascript:"):
        return True
    return href.startswith("#") and len(href) > 1 and href[1:] not in ids


def rewrite_links(
    html: str, source: Source, hosts: Hosts, *, target_url: str
) -> tuple[str, dict[str, object]]:
    """Links into the source site and dead in-page button links go to `target_url` (the product
    page, or the wizard's link); a store form becomes plain markup whose buttons lead there too.
    Foreign `<noscript>` blocks, cart drawers and cross-sell widgets go; foreign CSS `url()`s
    become `none`; other attributes carrying a foreign URL go; the source's social metas go."""
    soup = parse(html)
    stats = {"links": 0, "anchors": 0, "forms": 0, "removed": 0, "css_urls": 0, "attributes": 0,
             "metas": 0}  # fmt: skip
    ids = {str(t["id"]) for t in soup.find_all(id=True) if isinstance(t, Tag)}
    for link in soup.find_all("a"):
        if not isinstance(link, Tag):
            continue
        href = str(link.get("href") or "").strip()
        if hosts.source(href):
            link["href"] = target_url
            stats["links"] += 1
        elif dead_anchor(href, ids):
            link["href"] = target_url
            stats["anchors"] += 1
    for form in soup.find_all("form"):
        if not isinstance(form, Tag):
            continue
        action = str(form.get("action") or "")
        if action and not (hosts.foreign(action) or hosts.source(action) or action.startswith("/")):
            continue
        for button in form.find_all(["button", "input"]):
            if not isinstance(button, Tag):
                continue
            kind = str(button.get("type") or ("submit" if button.name == "button" else "")).lower()
            if kind != "submit":
                continue
            wrapper = soup.new_tag("a", attrs={"href": target_url, "style": "display: contents"})
            button.wrap(wrapper)
            button["type"] = "button"
        form.name = "div"
        for attr in ("action", "method", "enctype", "novalidate", "accept-charset"):
            if attr in form.attrs:
                del form[attr]
        stats["forms"] += 1
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag) or not _alive(tag):
            continue
        hint = _hint(tag)
        foreign_noscript = tag.name == "noscript" and bool(URL_IN_TEXT.search(str(tag)))
        cross_sell = bool(CROSS_SELL.search(hint)) and not _holds_section(tag)
        if foreign_noscript or CART_DRAWER.search(hint) or cross_sell:
            tag.decompose()
            stats["removed"] += 1
    for meta in soup.find_all("meta"):
        if not isinstance(meta, Tag):
            continue
        key = str(meta.get("property") or meta.get("name") or "")
        content = str(meta.get("content") or "")
        if key.startswith(("og:", "twitter:", "fb:", "al:")) and (
            any(hosts.foreign(u) for u in URL_IN_TEXT.findall(content)) or source.in_text(content)
        ):
            meta.decompose()
            stats["metas"] += 1
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        for attr, value in list(tag.attrs.items()):
            if attr in ("src", "href", "srcset") or not isinstance(value, str):
                continue
            if attr == "style":
                new, count = _css_without_foreign(value, hosts)
                if count:
                    tag["style"] = new
                    stats["css_urls"] += count
            elif any(hosts.foreign(u) for u in URL_IN_TEXT.findall(value)):
                del tag[attr]
                stats["attributes"] += 1
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            css, count = _css_without_foreign(style_text(style), hosts)
            if count:
                style.string = css
                stats["css_urls"] += count
    return serialize(soup), stats  # type: ignore[return-value]


# ── purge_foreign_assets ─────────────────────────────────────────────────────────────────────

CTA_WORDS = re.compile(
    r"\b(buy|shop|order|get|claim|check|try|add to|see|learn more|discover|grab|start)\b", re.I
)


def keep_image_urls(html: str, hosts: Hosts) -> list[str]:
    """The foreign images marked keep (stars, ticks, badges, icons), to copy in before the purge."""
    soup = parse(html)
    urls: list[str] = []
    for img in soup.select("img[data-lp-keep]"):
        src = str(img.get("src") or "")
        if hosts.foreign(src) and src not in urls:
            urls.append(src)
    return urls


def purge_foreign_assets(
    html: str, hosts: Hosts, *, target_url: str, copied: dict[str, str]
) -> tuple[str, dict[str, object]]:
    """Nothing foreign survives: kept images switch to their copies; other foreign images
    become a transparent pixel (hidden unless icon-sized); foreign `<source>`, `<link>`, media
    and frames go; a leftover foreign link goes to `target_url` when it reads like a button,
    else loses its link; any other foreign URL in an attribute or CSS goes."""
    soup = parse(html)
    stats = {"images_copied": 0, "images_blanked": 0, "removed": 0, "links": 0, "attributes": 0,
             "css_urls": 0}  # fmt: skip
    for img in soup.find_all("img"):
        if not isinstance(img, Tag):
            continue
        src = str(img.get("src") or "")
        if src in copied:
            img["src"] = copied[src]
            stats["images_copied"] += 1
        elif hosts.foreign(src):
            width, height = _size(img)
            img["src"] = PIXEL
            img["alt"] = ""
            if not (0 < max(width, height) <= ICON_MAX):
                img["style"] = (str(img.get("style") or "") + "; display: none").lstrip("; ")
            stats["images_blanked"] += 1
        for attr in ("srcset", "sizes", "data-src", "data-srcset"):
            value = img.get(attr)
            if isinstance(value, str) and any(hosts.foreign(u) for u in URL_IN_TEXT.findall(value)):
                del img[attr]
    for tag in soup.find_all(["source", "link", "video", "audio", "iframe", "embed", "object"]):
        if not isinstance(tag, Tag) or not _alive(tag):
            continue
        urls = [str(tag.get(a) or "") for a in ("src", "srcset", "href", "data", "poster")]
        if any(hosts.foreign(u) for value in urls for u in URL_IN_TEXT.findall(value) or [value]):
            tag.decompose()
            stats["removed"] += 1
    for link in soup.find_all("a"):
        if not isinstance(link, Tag):
            continue
        href = str(link.get("href") or "")
        if not hosts.foreign(href):
            continue
        hint = _hint(link)
        if CTA_WORDS.search(link.get_text(" ", strip=True)) or re.search(
            r"btn|button|cta", hint, re.I
        ):
            link["href"] = target_url
        else:
            link.unwrap()
        stats["links"] += 1
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        for attr, value in list(tag.attrs.items()):
            if not isinstance(value, str) or attr in ("href",):
                continue
            if attr == "style":
                new, count = _css_without_foreign(value, hosts)
                if count:
                    tag["style"] = new
                    stats["css_urls"] += count
            elif attr != "src" and any(hosts.foreign(u) for u in URL_IN_TEXT.findall(value)):
                del tag[attr]
                stats["attributes"] += 1
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            css, count = _css_without_foreign(style_text(style), hosts)
            css = FONT_FACE.sub(
                lambda m: (
                    ""
                    if any(hosts.foreign(u.group("url")) for u in CSS_URL.finditer(m.group(0)))
                    else m.group(0)
                ),
                css,
            )
            css = CSS_COMMENT.sub(
                lambda m: (
                    ""
                    if any(hosts.foreign(u) for u in URL_IN_TEXT.findall(m.group(0)))
                    else m.group(0)
                ),
                css,
            )
            style.string = css
            stats["css_urls"] += count
    return serialize(soup), stats  # type: ignore[return-value]
