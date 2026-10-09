"""Finishing a page for the brand (BUILD_SPEC §10.2 `finalize_common`, both paths). Pure.

Meta and share tags, favicon, emails, FAQ markup, empty media slots, selling-point rows, sale
labels and prices, brand and product names, CTA links, language and viewport.
"""

import copy
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Comment, Tag

from app.engines.html import ensure_head, parse, serialize, set_text, text_nodes
from app.engines.images import PLACEHOLDER

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
MAX_USPS = 6
DESCRIPTION_CHARS = 155


@dataclass
class FinalizeInputs:
    brand_name: str
    product_name: str
    language: str = "en"
    meta_title: str | None = None
    meta_description: str | None = None
    og_image_url: str | None = None
    favicon_url: str | None = None
    support_email: str | None = None
    brand_url: str | None = None
    product_url: str | None = None
    price: str | None = None  # what the customer pays now, formatted
    compare_price: str | None = None  # the regular price, only when on sale
    usps: list[str] = field(default_factory=list)
    sale_percent: int | None = None
    promo_text: str | None = None
    product_image_urls: list[str] = field(default_factory=list)


def _set_meta(soup: BeautifulSoup, head: Tag, key: str, name: str, content: str | None) -> None:
    for tag in soup.find_all("meta", attrs={key: name}):
        tag.decompose()
    if content:
        head.append(soup.new_tag("meta", attrs={key: name, "content": content}))


def _domain(url: str | None) -> str | None:
    match = re.match(r"^https?://(?:www\.)?([^/:?#]+)", url or "")
    return match.group(1).lower() if match else None


def finalize_common(html: str, inputs: FinalizeInputs) -> tuple[str, dict[str, object]]:
    soup = parse(html)
    head = ensure_head(soup)
    stats: dict[str, object] = {}

    # 1. Comments
    comments = [c for c in soup.find_all(string=lambda s: isinstance(s, Comment))]
    for comment in comments:
        comment.extract()
    stats["comments_dropped"] = len(comments)

    # 2. Title, description, Open Graph and Twitter tags
    title = inputs.meta_title or f"{inputs.product_name} | {inputs.brand_name}"
    description = (inputs.meta_description or "").strip()[:DESCRIPTION_CHARS] or None
    title_tag = soup.find("title")
    if not isinstance(title_tag, Tag):
        title_tag = soup.new_tag("title")
        head.insert(0, title_tag)
    set_text(title_tag, title)
    _set_meta(soup, head, "name", "description", description)
    for tag in soup.find_all("meta"):
        if not isinstance(tag, Tag):
            continue
        key = str(tag.get("property") or tag.get("name") or "")
        if key.startswith(("og:", "twitter:")):
            tag.decompose()
    for prop, value in (
        ("og:type", "website"), ("og:title", title), ("og:description", description),
        ("og:site_name", inputs.brand_name), ("og:image", inputs.og_image_url),
    ):  # fmt: skip
        _set_meta(soup, head, "property", prop, value)
    for name, value in (
        ("twitter:card", "summary_large_image" if inputs.og_image_url else "summary"),
        ("twitter:title", title), ("twitter:description", description),
        ("twitter:image", inputs.og_image_url),
    ):  # fmt: skip
        _set_meta(soup, head, "name", name, value)

    # 3. Favicon
    for link in soup.find_all("link"):
        if isinstance(link, Tag) and "icon" in " ".join(link.get("rel") or []).lower():
            link.decompose()
    if inputs.favicon_url:
        head.append(soup.new_tag("link", attrs={"rel": "icon", "href": inputs.favicon_url}))
    stats["favicon"] = bool(inputs.favicon_url)

    # 4. Emails
    domain = _domain(inputs.brand_url)
    email = inputs.support_email or (f"support@{domain}" if domain else None)
    emails = 0
    if email:
        for link in soup.find_all("a", href=True):
            if isinstance(link, Tag) and str(link["href"]).lower().startswith("mailto:"):
                link["href"] = f"mailto:{email}"
                emails += 1
        for node in list(text_nodes(soup)):
            if EMAIL.search(str(node)):
                node.replace_with(EMAIL.sub(email, str(node)))
                emails += 1
    stats["emails"] = emails

    # 5. FAQ: script accordions become native <details>
    stats["faq_fixed"] = _fix_faq(soup)

    # 6. Media slots the image pass left empty get product photos, or go
    leftover = [
        t for t in soup.find_all("img", class_="lp-scene-slot")
        if isinstance(t, Tag) and str(t.get("src", "")) == PLACEHOLDER
    ]  # fmt: skip
    for index, slot in enumerate(leftover):
        if inputs.product_image_urls:
            slot["src"] = inputs.product_image_urls[index % len(inputs.product_image_urls)]
            slot["alt"] = inputs.product_name
        else:
            slot.decompose()
    stats["empty_slots_filled"] = len(leftover)

    # 7. Selling-point rows
    stats["usp_rows"] = _fill_usps(soup, inputs.usps)

    # 8. Sale labels, promo text and prices
    stats["promo_removed"] = _drop_sale_promos(soup, inputs)
    sale_tags = [t for t in soup.select("[data-lp-sale-percent]") if isinstance(t, Tag)]
    for tag in sale_tags:
        if inputs.sale_percent:
            original = tag.get_text()
            set_text(
                tag,
                re.sub(r"\d+\s*%", f"{inputs.sale_percent}%", original)
                if "%" in original
                else f"{inputs.sale_percent}%",
            )
        else:
            tag.decompose()  # never show a discount the brand doesn't offer
    for tag in soup.select("[data-lp-promo]"):
        if isinstance(tag, Tag) and inputs.promo_text:
            set_text(tag, inputs.promo_text)
    prices = 0
    for attr in ("data-lp-price", "data-lp-sale-price"):
        for tag in soup.select(f"[{attr}]"):
            if isinstance(tag, Tag) and inputs.price:
                set_text(tag, inputs.price)
                prices += 1
    for tag in soup.select("[data-lp-compare-price]"):
        if not isinstance(tag, Tag):
            continue
        if inputs.compare_price:
            set_text(tag, inputs.compare_price)
        else:
            tag.decompose()
    stats["prices"] = prices
    stats["sale_labels"] = len(sale_tags) if inputs.sale_percent else 0

    # Brand and product names, CTA links
    for attr, value in (
        ("data-lp-brand", inputs.brand_name),
        ("data-lp-product-name", inputs.product_name),
    ):
        for tag in soup.select(f"[{attr}]"):
            if isinstance(tag, Tag):
                set_text(tag, value)
    cta_url = inputs.product_url or inputs.brand_url
    ctas = 0
    if cta_url:
        for tag in soup.select("[data-lp-cta]"):
            if isinstance(tag, Tag):
                if tag.name == "a":
                    tag["href"] = cta_url
                else:
                    anchor = tag.find("a")
                    if isinstance(anchor, Tag):
                        anchor["href"] = cta_url
                ctas += 1
    stats["ctas"] = ctas

    # 9. Language and viewport
    root = soup.find("html")
    if isinstance(root, Tag):
        root["lang"] = inputs.language or "en"
    if not soup.find("meta", attrs={"name": "viewport"}):
        head.insert(
            1,
            soup.new_tag(
                "meta", attrs={"name": "viewport", "content": "width=device-width, initial-scale=1"}
            ),
        )
    if not soup.find("meta", attrs={"charset": True}):
        head.insert(0, soup.new_tag("meta", attrs={"charset": "utf-8"}))
    return serialize(soup), stats


def fill_names(html: str, *, brand_name: str, product_name: str) -> str:
    """`data-lp-brand` and `data-lp-product-name` slots get the real names (also done in
    finalize; the copy pass runs this first so the model reads the sentence as it will be)."""
    soup = parse(html)
    for attr, value in (("data-lp-brand", brand_name), ("data-lp-product-name", product_name)):
        for tag in soup.select(f"[{attr}]"):
            set_text(tag, value)
    return serialize(soup)


def _drop_sale_promos(soup: BeautifulSoup, inputs: FinalizeInputs) -> int:
    """A promo line built around a discount (`[data-lp-promo]` holding a `[data-lp-sale-percent]`)
    can't stand without one: with no sale, the brand's own promo text replaces it, or it goes,
    and a section left with no text (an empty promo bar) goes with it."""
    if inputs.sale_percent:
        return 0
    removed = 0
    for promo in soup.select("[data-lp-promo]"):
        if not promo.select_one("[data-lp-sale-percent]"):
            continue
        if inputs.promo_text:
            set_text(promo, inputs.promo_text)
            continue
        section = (
            promo
            if promo.has_attr("data-lp-section")
            else promo.find_parent(attrs={"data-lp-section": True})
        )
        promo.decompose()
        removed += 1
        if (
            isinstance(section, Tag)
            and not section.get_text(strip=True)
            and not section.find("img")
        ):
            section.decompose()
    return removed


def _fill_usps(soup: BeautifulSoup, usps: list[str]) -> int:
    rows = 0
    wanted = [u.strip() for u in usps if u.strip()][:MAX_USPS]
    if not wanted:
        return 0
    for container in soup.select("[data-lp-usps]"):
        if not isinstance(container, Tag):
            continue
        items = [c for c in container.children if isinstance(c, Tag)]
        if not items:
            continue
        model = items[0]
        for item in items:
            item.extract()
        for usp in wanted:
            item = copy.copy(model)
            target = item.select_one("[data-lp-usp-text]")
            if isinstance(target, Tag):
                set_text(target, usp)
            else:
                for node in list(text_nodes(item)):
                    node.extract()
                item.append(usp)
            container.append(item)
        rows += 1
    return rows


def _fix_faq(soup: BeautifulSoup) -> int:
    """Accordions built from a question element and an answer element inside something whose
    class mentions "faq" (and that used scripts to open) become `<details><summary>`."""
    fixed = 0
    for item in soup.find_all(class_=re.compile(r"faq[-_]?item|accordion[-_]?item", re.I)):
        if not isinstance(item, Tag) or item.name == "details" or item.find("details"):
            continue
        question = item.find(class_=re.compile(r"question|title|header|toggle", re.I)) or item.find(
            ["button", "h3", "h4", "dt"]
        )
        if not isinstance(question, Tag):
            continue
        answer = question.find_next_sibling()
        if not isinstance(answer, Tag):
            continue
        details = soup.new_tag(
            "details", attrs={"class": " ".join(item.get_attribute_list("class"))}
        )
        summary = soup.new_tag("summary")
        summary.string = question.get_text(" ", strip=True)
        answer.extract()
        if answer.has_attr("style"):
            del answer["style"]  # scripts hid closed answers inline
        answer.attrs.pop("hidden", None)
        details.append(summary)
        details.append(answer)
        item.replace_with(details)
        fixed += 1
    return fixed
