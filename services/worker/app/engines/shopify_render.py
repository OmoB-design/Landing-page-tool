"""Shopify's render of an editable page, worked out locally (B4.3, D122). Pure.

The layout check compares the page as built with the page as Shopify would serve it from the theme
files `shopify_theme.build` makes, without asking Shopify: the bare layout with the page's CSS,
each section in Shopify's section wrapper (`div.shopify-section`, with the schema's class), and
every static block drawn from its settings the way its block file draws it, group blocks with the
blocks nested in them. Shopify's selection marker (`block.shopify_attributes`) only exists in the
theme editor, so it draws as nothing. Only LP's own Liquid is handled (the files are ours).
"""

import html as html_lib
import json
import re
from collections.abc import Callable
from typing import Any

from app.engines.shopify_theme import ThemeFiles

_CALL = re.compile(r'\{% content_for "block", type: "([^"]+)", id: "([^"]+)"(.*?)%\}', re.S)
_PARAM = re.compile(r'(\w+): "([^"]*)"')
_SELECT = "{{ block.shopify_attributes }}"


def _liquid_body(source: str) -> str:
    body = source.partition("{% schema %}")[0]
    return body.replace("{% raw %}", "").replace("{% endraw %}", "").replace(_SELECT, "")


def _block(files: ThemeFiles, kind: str, block: dict[str, Any], params: str) -> str:
    settings: dict[str, str] = block.get("settings") or {}
    passed = {k: html_lib.unescape(v) for k, v in _PARAM.findall(params)}
    attrs = passed.get("attrs", "")
    group = files.blocks.get(f"blocks/{kind}.liquid")
    if group is not None and kind.startswith(files.suffix):
        return _calls(files, _liquid_body(group), block.get("blocks") or {}).strip()
    if kind.startswith("lp-img-"):
        # In Shopify a chosen picture comes from its image picker; here the address it was made
        # from stands in (the same picture, so the same size).
        source = passed.get("fallback", "")
        alt = html_lib.escape(settings.get("alt", ""), quote=True)
        return f'<img src="{source}" alt="{alt}" {attrs}>' if source else ""
    if kind.startswith("lp-button"):
        return f'<a href="{settings.get("link") or "#"}" {attrs}>{settings.get("label", "")}</a>'
    if kind in ("lp-video", "lp-embed", "lp-audio"):
        tag = {"lp-video": "video", "lp-embed": "iframe", "lp-audio": "audio"}[kind]
        return f'<{tag} src="{settings.get("src", "")}" {attrs}></{tag}>'
    if kind.endswith("-html"):
        words = settings.get("html", "")
    elif kind.endswith("-rich"):
        words = settings.get("text", "")
    else:
        words = html_lib.escape(settings.get("text", ""), quote=False)
    words = passed.get("lead", "") + words + passed.get("trail", "")
    tag = passed.get("tag", "")
    return f"<{tag} {attrs}>{words}</{tag}>" if tag else words


def _calls(files: ThemeFiles, body: str, blocks: dict[str, Any]) -> str:
    def draw(match: re.Match[str]) -> str:
        return _block(files, match.group(1), blocks[match.group(2)], match.group(3))

    drawer: Callable[[re.Match[str]], str] = draw
    return _CALL.sub(drawer, body)


def render(files: ThemeFiles) -> str:
    """The page as Shopify would serve it (the page's CSS inline, for loading from a file)."""
    template = json.loads(files.files[f"templates/page.{files.suffix}.json"])
    css = files.files[f"assets/{files.suffix}.css"]
    parts: list[str] = []
    for key in template["order"]:
        entry = template["sections"][key]
        liquid = files.files[f"sections/{entry['type']}.liquid"]
        schema = liquid.partition("{% schema %}")[2].split("{% endschema %}")[0]
        css_class = json.loads(schema or "{}").get("class", "")
        body = _calls(files, _liquid_body(liquid), entry["blocks"])
        wrapper_class = f"shopify-section {css_class}".strip()
        parts.append(
            f'<div id="shopify-section-template--1__{key}" class="{wrapper_class}">'
            f"{body.strip()}</div>"
        )
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<style>{css}</style>\n</head>\n<body>\n" + "\n".join(parts) + "\n</body>\n</html>\n"
    )
