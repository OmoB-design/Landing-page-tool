"""Export (BUILD_SPEC §12.2): the working page as one self-contained file. Pure apart from the
`resolve` callback that fetches an asset.

Images, icons and CSS `url()`s become data URIs; linked stylesheets are inlined into `<style>`;
the pipeline's `data-lp-*` markers are stripped. Share-image metas keep their absolute URLs
(social networks fetch them by URL).
"""

import base64
import re
from collections.abc import Callable

from bs4.element import Tag

from app.engines.html import parse, serialize, style_text

Resolver = Callable[[str], tuple[bytes, str] | None]  # url -> (bytes, mime) or None
CSS_URL = re.compile(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)")


class _Inliner:
    def __init__(self, resolve: Resolver) -> None:
        self.resolve = resolve
        self.cache: dict[str, str | None] = {}
        self.inlined = 0
        self.failed: list[str] = []

    def uri(self, url: str) -> str | None:
        url = url.strip()
        if not url or url.startswith(("data:", "#")):
            return None
        if url not in self.cache:
            found = self.resolve(url)
            if found is None:
                self.cache[url] = None
                self.failed.append(url)
            else:
                data, mime = found
                self.cache[url] = f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
                self.inlined += 1
        return self.cache[url]

    def css(self, text: str) -> str:
        def replace(match: re.Match[str]) -> str:
            inline = self.uri(match.group(2))
            return f'url("{inline}")' if inline else match.group(0)

        return CSS_URL.sub(replace, text)


def export_page(html: str, resolve: Resolver) -> tuple[str, dict[str, object]]:
    soup = parse(html)
    inliner = _Inliner(resolve)
    stylesheets = 0
    for link in soup.find_all("link"):
        if not isinstance(link, Tag):
            continue
        rel = " ".join(link.get_attribute_list("rel")).lower()
        href = str(link.get("href") or "")
        if "stylesheet" in rel and href:
            found = resolve(href)
            if found is not None:
                style = soup.new_tag("style")
                style.string = inliner.css(found[0].decode("utf-8", errors="replace"))
                link.replace_with(style)
                stylesheets += 1
            else:
                inliner.failed.append(href)
        elif "icon" in rel and href and (inline := inliner.uri(href)):
            link["href"] = inline
    for tag in soup.find_all(["img", "source"]):
        if not isinstance(tag, Tag):
            continue
        if tag.has_attr("srcset"):
            del tag["srcset"]  # one inlined image is enough for a static page
        src = str(tag.get("src") or "")
        if src and (inline := inliner.uri(src)):
            tag["src"] = inline
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            style.string = inliner.css(style_text(style))
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        if tag.has_attr("style"):
            tag["style"] = inliner.css(str(tag["style"]))
        for attr in [a for a in tag.attrs if a.startswith("data-lp-")]:
            del tag[attr]
    out = serialize(soup)
    return out, {
        "inlined": inliner.inlined,
        "stylesheets": stylesheets,
        "failed": sorted(set(inliner.failed)),
        "bytes": len(out.encode("utf-8")),
    }
