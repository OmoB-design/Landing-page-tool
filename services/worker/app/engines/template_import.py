"""Importing a live page as a library template (template-onboarding skill, "live websites").
Pure: HTML in, HTML plus extracted files and stats out.

Exports from page builders carry everything inline: base64 images and fonts, and a site-wide
stylesheet thousands of rules long. The import:
1. drops bundled `@font-face` fonts (often commercial; the page's Google Fonts link stays) and
   CSS rules that match nothing on the page;
2. moves base64 images into files (`assets/<hash>.<ext>`);
3. drops page-builder and tracking scripts (jQuery, Webflow, analytics), keeping small inline
   scripts that run the page (dates, timers, reading meters);
4. lists external images to download.
Section and slot markup is drafted separately and finished by hand (template-onboarding skill).
"""

import base64
import hashlib
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup
from bs4.element import Tag
from soupsieve import SelectorSyntaxError

from app.engines.html import parse, serialize, style_text

DATA_URI = re.compile(
    r"data:(?P<mime>[a-z]+/[a-z0-9.+-]+)(?:;[a-z-]+=[^;,]+)*;base64,(?P<data>[A-Za-z0-9+/=]+)"
)
COMMENT = re.compile(r"/\*.*?\*/", re.S)
# Pseudo parts soupsieve can't match against a static page: removed before testing a selector.
PSEUDO = re.compile(
    r"::?(?:before|after|first-letter|first-line|placeholder|selection|marker|backdrop|"
    r"hover|focus-visible|focus-within|focus|active|visited|link|target|-webkit-[a-z-]+|"
    r"-moz-[a-z-]+|-ms-[a-z-]+)(?:\([^)]*\))?"
)
DROP_SCRIPT = re.compile(
    r"jQuery v\d|w-mod-|googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook|"
    r"hotjar|clarity\.ms|segment\.com|klaviyo|tiktok|webflow\.js",
    re.I,
)
EXTENSIONS = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
    "image/svg+xml": "svg", "image/avif": "avif", "image/x-icon": "ico",
}  # fmt: skip
# Free families on Google Fonts that page builders often bundle; loaded from Google instead.
GOOGLE_FONTS = {
    "barlow", "inter", "figtree", "eb garamond", "geist", "dm sans", "poppins", "montserrat",
    "lato", "roboto", "open sans", "playfair display", "lora", "raleway", "nunito",
    "nunito sans", "work sans", "manrope", "plus jakarta sans", "source sans 3", "oswald",
    "rubik", "karla", "mulish", "outfit", "sora", "space grotesk", "libre baskerville",
    "cormorant garamond", "fraunces", "archivo", "lexend",
}  # fmt: skip
# Commercial families with a close free stand-in (their licences don't travel with a page).
SUBSTITUTES = {
    "gilroy": "Figtree", "circular std": "DM Sans", "circular standard": "DM Sans",
    "circular": "DM Sans", "interdisplay": "Inter", "intervariable": "Inter",
    "proxima nova": "Montserrat", "gotham": "Montserrat", "avenir": "Nunito Sans",
    "avenir next": "Nunito Sans", "futura pt": "Jost", "graphik": "Inter", "gt walsheim": "DM Sans",
}  # fmt: skip
FONT_FAMILY = re.compile(r"(font-family\s*:\s*|--[\w-]*font[\w-]*\s*:\s*)([^;}]+)", re.I)
KEEP_AT_RULES = ("@keyframes", "@-webkit-keyframes", "@import", "@charset", "@page", "@property")


@dataclass
class ImportResult:
    html: str
    files: dict[str, tuple[bytes, str]] = field(
        default_factory=dict
    )  # assets/<name> -> (bytes, mime)
    external_images: list[str] = field(default_factory=list)
    stats: dict[str, object] = field(default_factory=dict)


# ── CSS ──────────────────────────────────────────────────────────────────────


def _blocks(css: str) -> list[tuple[str, str]]:
    """Top-level (prelude, body) pairs of a stylesheet; body is None-equivalent '' for
    statements like @import. Brace matching skips quoted strings."""
    out: list[tuple[str, str]] = []
    i, n, start = 0, len(css), 0
    while i < n:
        ch = css[i]
        if ch in "\"'":
            end = css.find(ch, i + 1)
            i = n if end == -1 else end + 1
            continue
        if ch == ";" and css[start:i].lstrip().startswith("@"):
            out.append((css[start : i + 1].strip(), ""))
            start = i = i + 1
            continue
        if ch == "{":
            depth, j = 1, i + 1
            while j < n and depth:
                if css[j] in "\"'":
                    end = css.find(css[j], j + 1)
                    j = n if end == -1 else end + 1
                    continue
                depth += {"{": 1, "}": -1}.get(css[j], 0)
                j += 1
            out.append((css[start:i].strip(), css[i + 1 : j - 1]))
            start = i = j
            continue
        i += 1
    return [(p, b) for p, b in out if p]


def _selector_used(selector: str, soup: BeautifulSoup, cache: dict[str, bool]) -> bool:
    if selector in cache:
        return cache[selector]
    plain = PSEUDO.sub("", selector).strip()
    used = True
    if plain and plain not in ("*", ":root", "html", "body"):
        try:
            used = soup.select_one(plain) is not None
        except (SelectorSyntaxError, ValueError, NotImplementedError):
            used = True  # unknown syntax: keep the rule
    cache[selector] = used
    return used


def prune_css(css: str, soup: BeautifulSoup, stats: dict[str, int], cache: dict[str, bool]) -> str:
    kept: list[str] = []
    for prelude, body in _blocks(COMMENT.sub("", css)):
        lower = prelude.lower()
        if lower.startswith("@font-face"):
            if "data:" in body or "assets/" in body:
                stats["fonts_dropped"] += 1
                continue
            kept.append(f"{prelude}{{{body}}}")
        elif lower.startswith(("@media", "@supports", "@layer", "@container")):
            inner = prune_css(body, soup, stats, cache)
            if inner.strip():
                kept.append(f"{prelude}{{{inner}}}")
        elif lower.startswith(KEEP_AT_RULES) or lower.startswith("@"):
            kept.append(f"{prelude}{{{body}}}" if body else prelude)
        else:
            selectors = [s for s in prelude.split(",") if _selector_used(s.strip(), soup, cache)]
            if selectors:
                kept.append(f"{', '.join(s.strip() for s in selectors)}{{{body}}}")
                stats["rules_kept"] += 1
            else:
                stats["rules_dropped"] += 1
    return "".join(kept)


# ── the import ───────────────────────────────────────────────────────────────


def asset_name(data: bytes, mime: str) -> str:
    return f"assets/{hashlib.sha256(data).hexdigest()[:16]}.{EXTENSIONS.get(mime, 'bin')}"


def import_page(html: str) -> ImportResult:
    soup = parse(html)
    stats: dict[str, int] = {
        "fonts_dropped": 0,
        "rules_kept": 0,
        "rules_dropped": 0,
        "scripts_dropped": 0,
    }

    # 3. Scripts first, so selectors are tested against the page people see.
    for script in soup.find_all("script"):
        if not isinstance(script, Tag):
            continue
        src = str(script.get("src") or "")
        if DROP_SCRIPT.search(src) or DROP_SCRIPT.search(script.get_text()[:4000]):
            script.decompose()
            stats["scripts_dropped"] += 1
    for tag in soup.find_all(["base", "noscript"]):
        tag.decompose()

    # 1. Fonts and unused rules.
    probe = parse(serialize(soup))
    for tag in probe.find_all(["script", "style"]):
        tag.decompose()
    cache: dict[str, bool] = {}
    before = 0
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            css = style_text(style)
            before += len(css)
            pruned = prune_css(css, probe, stats, cache)
            if pruned.strip():
                style.string = pruned
            else:
                style.decompose()
    out, font_stats = fix_fonts(serialize(soup))

    # 2. Base64 images into files.
    files: dict[str, tuple[bytes, str]] = {}

    def extract(match: re.Match[str]) -> str:
        mime = match.group("mime")
        if not mime.startswith("image/"):
            return match.group(0)
        try:
            data = base64.b64decode(match.group("data"))
        except ValueError:
            return match.group(0)
        name = asset_name(data, mime)
        files[name] = (data, mime)
        return name

    out = DATA_URI.sub(extract, out)

    # 4. External images to download.
    final = parse(out)
    external: list[str] = []
    for img in final.find_all(["img", "source"]):
        if isinstance(img, Tag):
            src = str(img.get("src") or "")
            if src.startswith(("http://", "https://")) and src not in external:
                external.append(src)
    for match in re.finditer(
        r"url\(\s*['\"]?(https?://[^'\")]+\.(?:png|jpe?g|webp|gif|svg|avif)[^'\")]*)", out, re.I
    ):
        if match.group(1) not in external:
            external.append(match.group(1))
    return ImportResult(
        html=out,
        files=files,
        external_images=external,
        stats={
            **stats,
            **font_stats,
            "css_bytes_before": before,
            "bytes_after": len(out.encode()),
        },
    )


def _families(stack: str) -> list[str]:
    return [f.strip().strip("'\"") for f in stack.split(",") if f.strip()]


def fix_fonts(html: str) -> tuple[str, dict[str, object]]:
    """Commercial fonts become their free stand-ins, and every free family the page uses is
    loaded from Google Fonts (bundled copies were dropped)."""
    substituted: dict[str, str] = {}
    used: set[str] = set()

    def rewrite(match: re.Match[str]) -> str:
        names = []
        for family in _families(match.group(2)):
            stand_in = SUBSTITUTES.get(family.lower())
            if stand_in:
                substituted[family] = stand_in
                family = stand_in
            if family.lower() in GOOGLE_FONTS:
                used.add(family)
            names.append(f'"{family}"' if " " in family else family)
        return match.group(1) + ",".join(dict.fromkeys(names))

    soup = parse(html)
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            style.string = FONT_FAMILY.sub(rewrite, style_text(style))
    for tag in soup.find_all(style=True):
        if isinstance(tag, Tag):
            tag["style"] = FONT_FAMILY.sub(rewrite, str(tag["style"]))
    loaded = " ".join(
        str(link.get("href") or "") for link in soup.find_all("link") if isinstance(link, Tag)
    ).lower()
    missing = sorted(f for f in used if f"family={f.lower().replace(' ', '+')}" not in loaded)
    if missing:
        families = "&".join(
            f"family={f.replace(' ', '+')}:wght@300;400;500;600;700" for f in missing
        )
        head = soup.find("head")
        if isinstance(head, Tag):
            head.append(
                soup.new_tag(
                    "link",
                    attrs={
                        "rel": "stylesheet",
                        "href": f"https://fonts.googleapis.com/css2?{families}&display=swap",
                    },
                )
            )
    return serialize(soup), {"substituted": substituted, "google_fonts_added": missing}


def relink(html: str, mapping: dict[str, str]) -> str:
    """Points every use of an external URL (src, srcset, CSS url()) at its downloaded file."""
    for url, name in sorted(mapping.items(), key=lambda kv: -len(kv[0])):
        html = html.replace(url, name).replace(url.replace("&", "&amp;"), name)
    return html


ON_VARS = {"primary": "--lp-on-primary", "dark": "--lp-on-dark", "accent": "--lp-on-accent"}
ON_COLOUR = re.compile(r"(?<![-\w])color\s*:\s*[^;]+")
WHITE = {"#fff", "#ffffff", "white", "rgb(255,255,255)", "#fffffff", "#ffff"}
_DECL = re.compile(r"(?P<prop>[\w-]+)\s*:\s*(?P<value>[^;]+)")


def _same_colour(value: str, hexes: dict[str, str]) -> str | None:
    from app.engines.colors import parse_color

    for token in re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", value):
        rgb = parse_color(token)
        for role, hex_value in hexes.items():
            if rgb is not None and rgb == parse_color(hex_value):
                return role
    return None


def _tokenize_css(css: str, palette: dict[str, str], stats: dict[str, int]) -> str:
    out: list[str] = []
    for prelude, body in _blocks(css):
        if not body:
            out.append(prelude)
            continue
        if prelude.lower().startswith(("@media", "@supports", "@layer", "@container")):
            out.append(f"{prelude}{{{_tokenize_css(body, palette, stats)}}}")
            continue
        if prelude.startswith("@"):
            out.append(f"{prelude}{{{body}}}")
            continue
        decls = dict(
            (m.group("prop").lower(), m.group("value").strip()) for m in _DECL.finditer(body)
        )
        background = decls.get("background-color") or decls.get("background") or ""
        role = _same_colour(background, palette)
        colour = decls.get("color", "").replace(" ", "").lower()
        if role and colour in WHITE:
            var = {
                "primary": "--lp-on-primary",
                "dark": "--lp-on-dark",
                "accent": "--lp-on-accent",
            }.get(role)
            if var:
                body = re.sub(
                    r"(?<![-\w])color\s*:\s*[^;]+", f"color:var({var},#fff)", body, count=1
                )
                stats["on_colours"] += 1
        out.append(f"{prelude}{{{body}}}")
    return "".join(out)


def _stack(families: list[str], generic: str) -> str:
    return ", ".join([*(f'"{f}"' if " " in f else f for f in families), generic])


def apply_template_tokens(
    html: str, *, palette: dict[str, str], heading_fonts: list[str], body_fonts: list[str]
) -> tuple[str, dict[str, int]]:
    """Wires an imported page to the brand tokens the build pipeline sets (D58): declares the
    `--lp-*` colour and font variables, points heading and body font stacks at
    `--lp-heading-font` / `--lp-body-font`, and makes white text on a palette background use the
    readable `--lp-on-*` colour. The exact-colour and hue passes recolour the rest."""
    stats = {"on_colours": 0, "fonts": 0}
    soup = parse(html)

    def font_stack(match: re.Match[str]) -> str:
        families = [f.lower() for f in _families(match.group(2))]
        for var, wanted in (("--lp-heading-font", heading_fonts), ("--lp-body-font", body_fonts)):
            if families and families[0] in {w.lower() for w in wanted}:
                stats["fonts"] += 1
                return f"{match.group(1)}var({var})"
        return match.group(0)

    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            css = FONT_FAMILY.sub(font_stack, style_text(style))
            style.string = _tokenize_css(css, palette, stats)
    head = soup.find("head")
    tokens = {
        "--lp-primary": palette["primary"],
        "--lp-primary-dark": palette.get("dark", palette["primary"]),
        "--lp-tint": palette.get("tint", "#f5f5f5"),
        "--lp-accent": palette.get("accent", palette["primary"]),
        "--lp-on-primary": "#ffffff",
        "--lp-on-dark": "#ffffff",
        "--lp-on-accent": "#ffffff",
        "--lp-heading-font": ", ".join(f'"{f}"' if " " in f else f for f in heading_fonts)
        + ", serif",
        "--lp-body-font": ", ".join(f'"{f}"' if " " in f else f for f in body_fonts)
        + ", sans-serif",
    }
    block = soup.new_tag("style", id="lp-template-tokens")
    block.string = ":root { " + " ".join(f"{k}: {v};" for k, v in tokens.items()) + " }"
    if isinstance(head, Tag):
        head.insert(0, block)
    return serialize(soup), stats
