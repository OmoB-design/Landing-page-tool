"""The review desk's proof frame (BUILD_SPEC §11.1, D84). Pure.

Marks every fragment of a page so the desk's preview can tell which sentence was clicked: each
fragment's text node is wrapped in `<span data-lp-frag="f0001">`, with `data-lp-frag-locked` on
text the pipeline fills from data, and each paragraph's element gets `data-lp-block="<n>"` so the
desk can outline the paragraph being edited. Ids are the fragments engine's, so they match what a
save is checked against. The marked page is for the preview only; it is never stored.
"""

from bs4.element import NavigableString, Tag

from app.engines.fragments import _locked, _nodes
from app.engines.html import parse, serialize
from app.engines.paragraphs import mark_blocks

# Elements whose content is plain text to the browser: a span inside would show as text (a
# textarea) or be dropped (an option). Their fragments keep their ids but aren't marked.
PLAIN_TEXT = {"textarea", "option", "optgroup", "select"}


def mark(html: str) -> str:
    """The page with each fragment wrapped in a span carrying its id, and each paragraph's element
    carrying its number (`data-lp-block`)."""
    soup = parse(html)
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
    return serialize(soup)
