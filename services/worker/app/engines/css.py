"""Stylesheets, as text (pure): split into top-level blocks, and scope a page's CSS to one element
so it can sit inside another site's page (a Shopify theme, D90) without leaking out or letting
the site's styles in."""

import re

COMMENT = re.compile(r"/\*.*?\*/", re.S)
# At-rules whose blocks hold rules (scoped inside); every other at-rule is kept as it is
# (@keyframes, @font-face, @page, @property, @counter-style, @import, @charset, ...).
GROUPING = ("@media", "@supports", "@container", "@layer", "@document")
# A length in rem (not inside a word).
_REM = re.compile(r"(?<![\w.-])(-?\d*\.?\d+)rem\b")
_ROOT_FONT = re.compile(
    r"(?:^|[},\s])(?::root|html)\s*\{[^}]*?font-size\s*:\s*(\d*\.?\d+)(px|%)", re.I
)
# Selectors that mean the page itself: they become the scope element.
_ROOT = re.compile(r"^(?:(?::root|html|body)(?![\w-])[^\s>+~,]*\s*([>+~]?)\s*)+", re.I)


def blocks(css: str) -> list[tuple[str, str]]:
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


def _split_selectors(prelude: str) -> list[str]:
    """A selector list split on its top-level commas (not inside (), [] or quotes)."""
    parts: list[str] = []
    depth, quote, start = 0, "", 0
    for i, ch in enumerate(prelude):
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(prelude[start:i])
            start = i + 1
    parts.append(prelude[start:])
    return [p.strip() for p in parts if p.strip()]


def _scope_selector(selector: str, scope: str) -> list[str]:
    if selector == "*":
        return [scope, f"{scope} *"]
    root = _ROOT.match(selector)
    if root and "::" not in root.group(0):
        rest = selector[root.end() :].strip()
        combinator = root.group(1)
        if not rest:
            return [scope]
        return [f"{scope} {combinator} {rest}" if combinator else f"{scope} {rest}"]
    return [f"{scope} {selector}"]


def root_font_px(css: str) -> float:
    """The page's root font size in px (what its rem means): from `html` / `:root`, else 16."""
    match = _ROOT_FONT.search(COMMENT.sub("", css))
    if not match:
        return 16.0
    value = float(match.group(1))
    return value if match.group(2) == "px" else 16.0 * value / 100


def _rem_to_px(declarations: str, rem_px: float) -> str:
    return _REM.sub(lambda m: f"{round(float(m.group(1)) * rem_px, 3):g}px", declarations)


def scope_css(css: str, scope: str, rem_px: float | None = None) -> str:
    """The stylesheet with every rule limited to `scope` (`#id`): `html`, `body` and `:root`
    become the scope element itself, other selectors its descendants; grouping at-rules are
    scoped inside, other at-rules are kept. `rem_px`: lengths in rem become px at that root size
    (the host page's root font size would change them otherwise; media queries keep their rem,
    which never follows the page)."""
    out: list[str] = []
    for prelude, body in blocks(COMMENT.sub("", css)):
        lower = prelude.lower()
        if lower.startswith(GROUPING):
            out.append(f"{prelude}{{{scope_css(body, scope, rem_px)}}}")
        elif lower.startswith("@"):
            out.append(f"{prelude}{{{body}}}" if body else prelude)
        else:
            selectors = list(
                dict.fromkeys(
                    scoped
                    for selector in _split_selectors(prelude)
                    for scoped in _scope_selector(selector, scope)
                )
            )
            if rem_px is not None:
                body = _rem_to_px(body, rem_px)
            out.append(f"{', '.join(selectors)}{{{body}}}")
    return "\n".join(out)
