"""The review desk's proof frame (BUILD_SPEC §11.1, D84). Pure.

Marks every fragment of a page so the desk's preview can tell which sentence was clicked: each
fragment's text node is wrapped in `<span data-lp-frag="f0001">`, with `data-lp-frag-locked` on
text the pipeline fills from data, and each paragraph's element gets `data-lp-block="<n>"` so the
desk can outline the paragraph being edited. Ids are the fragments engine's, so they match what a
save is checked against. The marked page is for the preview only; it is never stored.
"""

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

from app.engines.fragments import _locked, _nodes
from app.engines.html import parse, serialize, serialize_contents
from app.engines.paragraphs import mark_blocks

# Elements whose content is plain text to the browser: a span inside would show as text (a
# textarea) or be dropped (an option). Their fragments keep their ids but aren't marked.
PLAIN_TEXT = {"textarea", "option", "optgroup", "select"}


def mark(html: str) -> str:
    """The page with each fragment wrapped in a span carrying its id, and each paragraph's element
    carrying its number (`data-lp-block`)."""
    soup = parse(html)
    _mark(soup)
    return serialize(soup)


def lines(html: str, blocks: set[int]) -> dict[int, str]:
    """What's inside these paragraphs' elements on the marked page, by number: the editor swaps
    them into the page it shows after a formatting change, without loading the page again."""
    soup = parse(html)
    _mark(soup)
    out: dict[int, str] = {}
    for number in sorted(blocks):
        element = soup.select_one(f'[data-lp-block="{number}"]')
        if isinstance(element, Tag):
            out[number] = serialize_contents(element)
    return out


def _mark(soup: BeautifulSoup) -> None:
    mark_blocks(soup)
    for index, node in enumerate(_nodes(soup), start=1):
        if any(isinstance(p, Tag) and p.name in PLAIN_TEXT for p in node.parents):
            continue
        locked = _locked(node, ())
        span = soup.new_tag("span", attrs={"data-lp-frag": f"f{index:04d}"})
        if locked:
            span["data-lp-frag-locked"] = ""
        node.replace_with(span)
        span.append(NavigableString(str(node)))
