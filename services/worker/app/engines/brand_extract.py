"""Static brand signals from a page's HTML (BUILD_SPEC §7.3 step 1): name, tagline, logo and
favicon candidates, theme colour, language, contact email, CSS colours and a text digest for the
AI pass. Pure: HTML in, data out."""

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from app.engines.colors import css_color_counts
from app.engines.html import restore_svg_case

TITLE_SEPARATORS = re.compile(
    "\\s+[|\u2013\u2014\u2022\u00b7:]\\s+|\\s+-\\s+"
)  # pipes, en/em dashes, bullets, middots, colons, and " - "
DIGEST_CHARS = 4000
# Buttons that are site chrome, not calls to action.
NOT_CTA = re.compile(
    r"^(skip|menu|close|search|cart|bag|account|log ?in|sign ?in|sign ?up|open|toggle|"
    r"previous|next|prev|accept|decline|dismiss|subscribe|country|language|currency)\b|"
    r"skip to|\u00d7|\u2715",  # close buttons drawn as x marks
    re.IGNORECASE,
)
CTA_VERBS = re.compile(r"\b(shop|buy|get|order|try|start|add to|discover|explore)\b", re.I)
MAX_SVG_CHARS = 100_000
GENERIC_FONTS = {
    "serif", "sans-serif", "monospace", "cursive", "system-ui", "-apple-system",
    "blinkmacsystemfont", "ui-sans-serif", "ui-serif", "segoe ui", "helvetica", "arial",
    "helvetica neue", "roboto", "inherit", "initial",
}  # fmt: skip


@dataclass
class StaticSignals:
    url: str
    name: str
    title: str | None
    tagline: str | None
    meta_title: str | None
    meta_description: str | None
    logo_urls: list[str] = field(default_factory=list)
    logo_svg: str | None = None
    favicon_urls: list[str] = field(default_factory=list)
    theme_color: str | None = None
    lang: str | None = None
    emails: list[str] = field(default_factory=list)
    cta_texts: list[str] = field(default_factory=list)
    headings: list[str] = field(default_factory=list)
    css_colors: list[tuple[str, float]] = field(default_factory=list)
    text_digest: str = ""


def _meta(soup: BeautifulSoup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if isinstance(tag, Tag):
            content = tag.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def _attr(tag: Tag, name: str) -> str:
    value = tag.get(name)
    if isinstance(value, list):
        return " ".join(value)
    return value or ""


def brand_name(title: str | None, site_name: str | None, url: str) -> str:
    """og:site_name if present; otherwise the part of the <title> that matches the domain, or its
    shortest part; otherwise the domain's main label."""
    if site_name:
        return site_name.strip()
    host = (urlsplit(url).hostname or "").removeprefix("www.")
    label = host.split(".")[0] if host else ""
    if title:
        parts = [p.strip() for p in TITLE_SEPARATORS.split(title) if p.strip()]
        for part in parts:
            if label and label.replace("-", "") in part.lower().replace(" ", ""):
                return part
        if parts:
            return min(parts, key=len)
    return label.replace("-", " ").title() or "Untitled brand"


def suggest_prefix(name: str) -> str:
    """2 to 4 uppercase letters for build keys (D27): initials of a multi-word name, else the first
    three letters ('Allbirds' → 'ALL', 'Lumé Skin Care' → 'LSC')."""
    words = [w for w in re.split(r"[^A-Za-z]+", _ascii(name)) if w]
    if len(words) >= 2:
        prefix = "".join(w[0] for w in words[:4])
    else:
        prefix = words[0][:3] if words else "BR"
    prefix = prefix.upper()
    return prefix if len(prefix) >= 2 else (prefix + "X")[:2]


def _ascii(text: str) -> str:
    import unicodedata

    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def _is_logo(tag: Tag) -> bool:
    haystack = " ".join(
        _attr(tag, name) for name in ("src", "class", "id", "alt", "aria-label", "data-src")
    ).lower()
    return "logo" in haystack


def extract_static(html: str, url: str) -> StaticSignals:
    soup = BeautifulSoup(html, "lxml")
    title_tag = soup.find("title")
    title = title_tag.get_text(" ", strip=True) if title_tag else None
    site_name = _meta(soup, "og:site_name", "application-name", "apple-mobile-web-app-title")
    description = _meta(soup, "description", "og:description", "twitter:description")

    # Logos: <img> marked as a logo (header first), then inline <svg> logos, then og:image.
    logo_urls: list[str] = []
    header = soup.find("header") or soup
    for scope in (header, soup):
        for img in scope.find_all("img"):
            if isinstance(img, Tag) and _is_logo(img):
                src = _attr(img, "src") or _attr(img, "data-src")
                if src and not src.startswith("data:"):
                    absolute = urljoin(url, src)
                    if absolute not in logo_urls:
                        logo_urls.append(absolute)
    logo_svg = None
    for scope in (header, soup):
        for svg in scope.find_all("svg"):
            parent = svg.parent if isinstance(svg.parent, Tag) else None
            if isinstance(svg, Tag) and (
                _is_logo(svg) or (parent is not None and _is_logo(parent))
            ):
                markup = svg_markup(svg)
                if len(markup) <= MAX_SVG_CHARS:
                    logo_svg = markup
                    break
        if logo_svg:
            break
    if not logo_urls and not logo_svg:
        logo_urls, logo_svg = _home_link_logo(header, url)
    og_image = _meta(soup, "og:image", "twitter:image")
    if og_image:
        logo_urls.append(urljoin(url, og_image))

    favicons: list[tuple[int, str]] = []
    for link in soup.find_all("link"):
        if not isinstance(link, Tag):
            continue
        rel = _attr(link, "rel").lower()
        href = _attr(link, "href")
        if "icon" in rel and href:
            sizes = _attr(link, "sizes")
            size = max((int(n) for n in re.findall(r"(\d+)x\d+", sizes)), default=0)
            score = size + (500 if "apple-touch" in rel else 0)
            favicons.append((score, urljoin(url, href)))
    favicon_urls = [href for _, href in sorted(favicons, reverse=True)]

    html_tag = soup.find("html")
    lang = normalise_lang(_attr(html_tag, "lang")) if isinstance(html_tag, Tag) else None

    emails = sorted(
        {
            _attr(a, "href")[7:].split("?")[0].strip().lower()
            for a in soup.find_all("a")
            if isinstance(a, Tag) and _attr(a, "href").lower().startswith("mailto:")
        }
    )

    cta_texts: list[str] = []
    for el in soup.select("button, a[class*=btn], a[class*=button], [type=submit]"):
        text = el.get_text(" ", strip=True)
        if 2 <= len(text) <= 40 and text not in cta_texts and not NOT_CTA.search(text):
            cta_texts.append(text)
    # Buying words first ("Shop now", "Buy", "Try it"), then the rest in page order.
    cta_texts.sort(key=lambda text: 0 if CTA_VERBS.search(text) else 1)

    css_text = " ".join(style.get_text() for style in soup.find_all("style"))
    css_text += " " + " ".join(
        _attr(el, "style") for el in soup.find_all(style=True) if isinstance(el, Tag)
    )

    for junk in soup(["script", "style", "noscript", "template", "svg", "iframe"]):
        junk.decompose()
    headings = [h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2", "h3"])][:30]
    blocks = [
        el.get_text(" ", strip=True)
        for el in soup.find_all(["h1", "h2", "h3", "p", "li"])
        if el.get_text(strip=True)
    ]
    digest = re.sub(r"\s+", " ", " · ".join(blocks))[:DIGEST_CHARS]

    return StaticSignals(
        url=url,
        name=brand_name(title, site_name, url),
        title=title,
        tagline=description,
        meta_title=title,
        meta_description=description,
        logo_urls=logo_urls[:5],
        logo_svg=logo_svg,
        favicon_urls=favicon_urls[:3],
        theme_color=_meta(soup, "theme-color"),
        lang=lang,
        emails=emails[:5],
        cta_texts=cta_texts[:12],
        headings=headings,
        css_colors=css_color_counts(css_text),
        text_digest=digest,
    )


def svg_markup(svg: Tag) -> str:
    """An inline <svg> as markup with its camelCase names restored (viewbox → viewBox)."""
    return restore_svg_case(str(svg))


def _home_link_logo(scope: BeautifulSoup | Tag, url: str) -> tuple[list[str], str | None]:
    """Fallback when nothing is marked "logo": the image or inline SVG inside the header's link
    to the home page (e.g. `<a aria-label="Topicals homepage" href="/"><svg>…`)."""
    origin = "{0.scheme}://{0.netloc}".format(urlsplit(url))
    for link in scope.find_all("a"):
        if not isinstance(link, Tag):
            continue
        href = _attr(link, "href").rstrip("/")
        if href not in ("", origin) and _attr(link, "href") != "/":
            continue
        img = link.find("img")
        src = (_attr(img, "src") or _attr(img, "data-src")) if isinstance(img, Tag) else ""
        if src and not src.startswith("data:"):
            return [urljoin(url, src)], None
        svg = link.find("svg")
        if isinstance(svg, Tag) and len(markup := svg_markup(svg)) <= MAX_SVG_CHARS:
            return [], markup
    return [], None


def normalise_lang(value: str | None) -> str | None:
    """BCP-47 casing: 'EN' → 'en', 'en-us' → 'en-US'."""
    parts = (value or "").strip().replace("_", "-").split("-")
    if not parts[0]:
        return None
    return "-".join([parts[0].lower()] + [p.upper() if len(p) == 2 else p for p in parts[1:]])


def first_font(family: str | None) -> str | None:
    """'"Geograph", "Helvetica Neue", sans-serif' → 'Geograph' (None for generic system fonts)."""
    if not family:
        return None
    for part in family.split(","):
        name = part.strip().strip("'\"")
        if name and name.lower() not in GENERIC_FONTS:
            return name
    return None
