"""A page as a Shopify page's body (BUILD_SPEC §12.5, D90). Pure.

The page's `<style>` blocks and its body go inside one `div.lp-funnel`; scripts and the pipeline's
markers go. The images it uses (img `src`/`srcset`, CSS `url()`) can be moved to Shopify's file
CDN: `asset_urls` lists them, `rewrite` swaps in the CDN addresses. A full-width template (a bare
layout and a page template) shows the page without the theme's header and footer. Shopify lets an
app write theme files only with an exemption, so the store owner can add the two files by hand
once (`THEME_FILES`, shown in the app with the steps); each publish then finds and uses them.

Without the template the page sits inside the theme's page, so `body(scoped=True)` fits it in:
the page's CSS is scoped to `#lp-funnel` (so it can't restyle the theme, and its ID beats the
theme's class rules), a reset puts everything inside back to the browser's defaults first (so the
theme's styles for links, images and lists don't show through), and `THEME_CHROME_CSS` hides the
theme's header, footer and page title and lifts the padding and width limits around the page.
Best effort: it relies on Shopify's section groups, which current themes use.
"""

import re

from bs4 import BeautifulSoup
from bs4.element import Comment, Tag

from app.engines.css import root_font_px, scope_css
from app.engines.export import CSS_URL
from app.engines.html import parse, style_text

MAX_BODY_BYTES = 512_000
MAX_FILES = 80
TEMPLATE_SUFFIX = "lp-full"
LAYOUT = (
    '<!doctype html>\n<html lang="{{ request.locale.iso_code }}">\n<head>\n'
    '  <meta charset="utf-8">\n'
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
    "  <title>{{ page_title }}</title>\n  {{ content_for_header }}\n</head>\n"
    "<body>\n  {{ content_for_layout }}\n</body>\n</html>\n"
)
THEME_FILES = {
    "layout/lp-full.liquid": LAYOUT,
    f"templates/page.{TEMPLATE_SUFFIX}.liquid": "{% layout 'lp-full' %}\n{{ page.content }}\n",
}
_SRCSET_URL = re.compile(r"(\S+)(\s+\d+[wx])?")
SCOPE = "#lp-funnel"
# The page starts as a fresh document would (`all: initial` on the page, the browser's defaults
# inside), whatever the theme sets; the page's own scoped rules (an ID and more) then apply, and
# the theme's class rules can't reach in. SVG keeps its presentation attributes (fill, stroke,
# size): it's left out of the reset. `all: revert` also drops the sizes HTML attributes give
# (img width/height); `_size_hints` puts them back just above the reset, below the page's rules.
_EVERYTHING = f"{SCOPE} :where(:not(svg, svg *))"
RESET_CSS = (
    f"{_EVERYTHING}, {_EVERYTHING}::before, {_EVERYTHING}::after {{ all: revert; }}\n"
    f"{SCOPE} {{ all: initial; display: block; width: 100%; font-size: 16px; }}"
)
_SIZED = ("img", "video", "iframe", "canvas", "embed", "object")
# The theme around the page: header, footer and overlays (Shopify's section groups), the page
# title, and the padding and width limits of the wrappers the page sits in.
THEME_CHROME_CSS = f"""
body:has({SCOPE}) .shopify-section-group-header-group,
body:has({SCOPE}) .shopify-section-group-footer-group,
body:has({SCOPE}) .shopify-section-group-overlay-group {{ display: none !important; }}
:is(h1, h2, header, .page-title, .main-page-title):has(+ * {SCOPE}, + {SCOPE}) {{
  display: none !important;
}}
body:has({SCOPE}) {{ margin: 0 !important; padding: 0 !important; }}
main:has({SCOPE}), main *:has({SCOPE}) {{
  padding: 0 !important;
  margin: 0 !important;
  max-width: none !important;
  border: 0 !important;
}}
""".strip()


def _length(value: str) -> str | None:
    value = value.strip()
    if re.fullmatch(r"\d+(\.\d+)?", value):
        return f"{value}px"
    if re.fullmatch(r"\d+(\.\d+)?%", value):
        return value
    return None


def _size_hints(soup: BeautifulSoup | Tag) -> str:
    """Rules for the sizes the page's media get from their width/height attributes, at the
    reset's strength (`:where`), so they beat the reset and lose to every rule of the page."""
    rules: dict[str, str] = {}
    for tag in soup.find_all(list(_SIZED)):
        if not isinstance(tag, Tag):
            continue
        width, height = _length(str(tag.get("width", ""))), _length(str(tag.get("height", "")))
        if width:
            rules[f'{tag.name}[width="{tag["width"]}"]'] = f"width: {width};"
        if height:
            rules[f'{tag.name}[height="{tag["height"]}"]'] = f"height: {height};"
        if width and height and width.endswith("px") and height.endswith("px"):
            key = f'{tag.name}[width="{tag["width"]}"][height="{tag["height"]}"]'
            rules[key] = f"aspect-ratio: auto {width[:-2]} / {height[:-2]};"
    return "\n".join(f"{SCOPE} :where({sel}) {{ {decl} }}" for sel, decl in rules.items())


def body(html: str, *, scoped: bool = False) -> str:
    """The page's styles and body inside `div.lp-funnel`, without scripts or `data-lp-*`.
    `scoped`: fitted into the theme's own page (no full-width template; see the module notes)."""
    soup = parse(html)
    # Stylesheet links (the page's web fonts) live in <head>, which Shopify doesn't keep: they
    # come along as @import, first, as @import must be.
    links = [
        str(link["href"])
        for link in soup.find_all("link", href=True)
        if isinstance(link, Tag) and "stylesheet" in (link.get("rel") or [])
    ]
    imports = "\n".join(f'@import url("{href}");' for href in links)
    css = [style_text(s) for s in soup.find_all("style") if isinstance(s, Tag)]
    if scoped:
        rem_px = root_font_px("\n".join(css))
        page_css = [scope_css(c, SCOPE, rem_px) for c in css]
        css = [RESET_CSS, _size_hints(soup), *page_css, THEME_CHROME_CSS]
    if imports:
        css.insert(0, imports)
    styles = "\n".join(f"<style>{c}</style>" for c in css)
    page = soup.body if isinstance(soup.body, Tag) else soup
    for tag in page.find_all(["script", "noscript", "style"]):
        if isinstance(tag, Tag):
            tag.decompose()
    for node in page.find_all(string=lambda text: isinstance(text, Comment)):
        node.extract()
    for tag in page.find_all(True):
        if isinstance(tag, Tag):
            for attr in [a for a in tag.attrs if a.startswith("data-lp-")]:
                del tag[attr]
    inner = "".join(str(child) for child in page.children)
    root = f'<div class="lp-funnel" id="{SCOPE[1:]}">' if scoped else '<div class="lp-funnel">'
    return f"{root}\n{styles}\n{inner}\n</div>"


def asset_urls(page_body: str) -> list[str]:
    """The distinct web addresses of the page's images, in order, at most MAX_FILES."""
    soup = BeautifulSoup(page_body, "html.parser")
    found: list[str] = []

    def add(url: str) -> None:
        url = url.strip()
        if url.startswith(("http://", "https://")) and url not in found:
            found.append(url)

    for img in soup.find_all(["img", "source"]):
        if not isinstance(img, Tag):
            continue
        if img.get("src"):
            add(str(img["src"]))
        for part in str(img.get("srcset") or "").split(","):
            match = _SRCSET_URL.match(part.strip())
            if match:
                add(match.group(1))
    for match in CSS_URL.finditer(page_body):
        url = match.group(2)
        if re.search(r"\.(png|jpe?g|gif|webp|avif|svg)(\?|$)", url, re.I):
            add(url)
    return found[:MAX_FILES]


def rewrite(page_body: str, cdn: dict[str, str]) -> str:
    """The body with each moved address replaced by its CDN address."""
    for old in sorted(cdn, key=len, reverse=True):
        page_body = page_body.replace(old, cdn[old])
    return page_body


def without_styles(page_body: str) -> tuple[str, str]:
    """(the body without its `<style>` blocks, their CSS): for a body over Shopify's size, the CSS
    moves to a file and the body links it."""
    css: list[str] = []

    def take(match: re.Match[str]) -> str:
        css.append(match.group(1))
        return ""

    stripped = re.sub(r"<style>(.*?)</style>", take, page_body, flags=re.S)
    return stripped, "\n".join(css)


def handle(build_key: str) -> str:
    """The page's address in the store: `BRE-12` → `bre-12`."""
    return re.sub(r"[^a-z0-9-]+", "-", build_key.lower()).strip("-")
