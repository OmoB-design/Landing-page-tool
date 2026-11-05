"""The page's share image (BUILD_SPEC §11.1, B3.3a, D111). Pure: HTML in, HTML out.

When someone shares a page's link, apps show a preview card with a picture: the page's
`og:image` (and `twitter:image`). QA renders the top of the page as that picture; exports and
publishes write it into the page with these tags, so the working page itself never changes.
"""

from bs4 import Tag

from app.engines.html import parse, serialize

WIDTH, HEIGHT = 1200, 630


def _meta(soup: Tag, head: Tag, attr: str, key: str, content: str) -> None:
    tag = head.find("meta", attrs={attr: key})
    if not isinstance(tag, Tag):
        tag = soup.new_tag("meta", attrs={attr: key})
        head.append(tag)
    tag["content"] = content


def with_share_image(html: str, url: str | None) -> str:
    """The page with `url` as its share image (og:image, its size, and a large Twitter card); the
    page as it is when there's none."""
    if not url or not url.startswith("https://"):
        return html
    soup = parse(html)
    head = soup.find("head")
    if not isinstance(head, Tag):
        return html
    _meta(soup, head, "property", "og:image", url)
    _meta(soup, head, "property", "og:image:width", str(WIDTH))
    _meta(soup, head, "property", "og:image:height", str(HEIGHT))
    _meta(soup, head, "name", "twitter:card", "summary_large_image")
    _meta(soup, head, "name", "twitter:image", url)
    return serialize(soup)


def link_preview(html: str) -> tuple[str | None, str | None]:
    """The title and description a link preview shows: the page's og: tags, else its <title> and
    meta description."""
    soup = parse(html)

    def content(attr: str, key: str) -> str | None:
        tag = soup.find("meta", attrs={attr: key})
        value = tag.get("content") if isinstance(tag, Tag) else None
        return " ".join(str(value).split()) or None if value else None

    title = content("property", "og:title")
    if not title and soup.title and soup.title.string:
        title = " ".join(soup.title.string.split()) or None
    description = content("property", "og:description") or content("name", "description")
    return title, description
