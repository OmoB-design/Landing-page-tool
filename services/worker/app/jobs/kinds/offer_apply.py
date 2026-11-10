"""`offer_apply` (B7.3a, D147): changes the offer a page sells, as one desk change.

1. The data slots follow the new offer, without the model: the price and the struck-through price,
   the sale badges, the parts a discount needs (shown with one, hidden without), the promo line,
   the options' prices and the buttons' link (engines/offers.apply_to_page).
2. Code, not the model, finds the lines that state the old offer: its prices, percent, code, promo
   line and the details' phrases (engines/offers.facts, mentions). Only those go to Claude, with
   the old and the new offer, to describe the new one instead and change nothing else; lines
   still stating an old fact get one more try with those words named.
3. Every other line must come back exactly as it was, or nothing is saved. The result lists each
   changed line before and after, any old fact still on the page, any percent or price a new line
   states that isn't the new offer's, and the untouched lines that sound like a deal (to look at).
4. Saved as one change ("Changed the offer to Ten off"), with the page's new offer and the
   report's record of it (its checkout warning worked out again); like any change, it takes the
   page back to Needs review.
"""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app import desk
from app.db import transaction
from app.engines import copy_rules as rules
from app.engines import offers
from app.engines import redraft as redraft_engine
from app.engines.fragments import Fragment, dump, reinject
from app.engines.money import format_price
from app.engines.purge import purge_terms
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.template import LengthCap
from app.pipeline import copy_pass
from app.pipeline.nodes.load_inputs import read_inputs
from app.providers.ledger import node_context

TOTAL = 4
MAX_HINTS = 6
NO_OFFER = "No offer: the store's own price, with no discount, code, gift or deadline."


class OfferApplyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    base_version: int = Field(ge=1)
    offer_id: UUID | None = None


def dedupe_key(payload: OfferApplyPayload) -> str:
    return f"redraft:{payload.build_id}"  # one page job at a time (redrafts, Lander)


def _record(
    offer: dict[str, Any] | None, product: dict[str, Any], cta_url: str | None
) -> dict[str, Any] | None:
    """The report's record of the offer as the page now shows it (as finalize writes it)."""
    if not offer:
        return None
    currency = product.get("currency")
    prices = offers.page_prices(product.get("price"), product.get("sale_price"), offer)
    return {
        "name": offer.get("name"),
        "price": format_price(prices.now, currency),
        "regular": format_price(prices.regular, currency),
        "checkout_link": cta_url is not None,
        "checkout_warning": offers.checkout_warning(offer, prices, currency),
    }


def _brief(offer: dict[str, Any] | None, product: dict[str, Any]) -> str:
    if not offer:
        return NO_OFFER
    prices = offers.page_prices(product.get("price"), product.get("sale_price"), offer)
    linked = offers.checkout_url(product.get("url"), offer, source=product.get("pull_source"))
    text = offers.brief(offer, prices, product.get("currency"), linked=linked is not None)
    return text or NO_OFFER


def run(ctx: JobContext) -> dict[str, Any]:
    # Here, not at the top: offer_change reaches the job registry (through builds), which imports
    # this module.
    from app import offer_change

    payload = OfferApplyPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    changed_elsewhere = UserFacingError(
        "The page changed before the offer was changed, so nothing was saved.",
        code="page_changed",
    )
    try:
        with transaction() as conn:
            build = desk._load(conn, org_id, payload.build_id)
    except desk.DeskNotFoundError as exc:
        raise UserFacingError("That page isn't there any more.", code="build_missing") from exc
    if build["status"] not in desk.EDITABLE or build["page_version"] != payload.base_version:
        raise changed_elsewhere

    inputs, template_html = read_inputs(org_id, payload.build_id)
    template, brand, product = inputs["template"], inputs["brand"], inputs["product"]
    old = inputs.get("offer")
    try:
        with transaction() as conn:
            new = offer_change._offer(conn, org_id, build["brand_id"], payload.offer_id)
    except offer_change.OfferChangeError as exc:
        raise UserFacingError(str(exc), code="offer_missing") from exc

    # 1. The data slots (what they said is part of the old deal: a page built before offers, or
    # under other rules, may show other prices than its recorded offer gives).
    before = desk._page(build)
    page, slots = offers.apply_to_page(before, product, new, brand_url=brand["url"])
    ctx.progress("Changed the prices and the promo line", data={"step": 1, "total": TOTAL})

    # 2. The lines that state the old offer, rewritten for the new one.
    locked = copy_pass.extra_locked(brand, product, new)
    fragments = dump(page, extra_locked=locked)
    by_id = {f.id: f for f in fragments}
    new_facts = offers.facts(new, product)
    old_facts = offers.merged(offers.facts(old, product), offers.page_facts(before))
    targets = [f for f in fragments if not f.locked and offers.mentions(f.text, old_facts)]
    changed: dict[str, str] = {}
    failed = 0
    if targets:
        caps = [
            LengthCap.model_validate(c) for c in template["instructions"].get("length_caps", [])
        ]
        budgets = redraft_engine.budgets(fragments, dump(template_html), targets, caps)
        system = rules.system_prompt(
            copy_pass.brief(template, brand, product, inputs.get("wizard", {}), new)
        )
        old_brief, new_brief = _brief(old, product), _brief(new, product)
        lines = f"{len(targets)} line{'' if len(targets) == 1 else 's'}"
        ctx.progress(f"Rewriting {lines} about the offer", data={"step": 2, "total": TOTAL})

        def ask(chunk_targets: list[Fragment], remove: dict[str, list[str]] | None) -> None:
            nonlocal failed
            with node_context("offer_change"):
                result = copy_pass.run(
                    system,
                    chunk_targets,
                    lambda chunk: rules.offer_prompt(
                        chunk, fragments, budgets, old_brief, new_brief, remove
                    ),
                    budgets,
                    strict=False,
                )
            failed += result.failed
            for key, value in rules.protect(fragments, result.replacements).items():
                if value.strip() and value.strip() != by_id[key].text:
                    changed[key] = value

        ask(targets, None)
        # One more try for a line still stating an old fact, with those words named.
        remove = {
            f.id: left
            for f in targets
            if (left := offers.leftovers(changed.get(f.id, f.text), old_facts, new_facts))
        }
        if remove:
            ask([by_id[k] for k in remove], remove)

    new_page, applied = reinject(
        page, changed, {f.id: f.text for f in fragments}, allow_empty=False
    )
    after = {f.id: f.text for f in dump(new_page, extra_locked=locked)}
    drift = set(applied["drift"])  # type: ignore[call-overload]
    untouched = [f for f in fragments if f.id not in changed or f.id in drift]
    if any(after.get(f.id) != f.text for f in untouched):
        raise UserFacingError(
            "Changing the offer would have changed other lines of the page too, so nothing was "
            "saved. Try again.",
            code="offer_unsafe",
        )
    new_page, _ = purge_terms(new_page, template["instructions"].get("forbidden_terms", []))
    ctx.progress("Checked the page", data={"step": 3, "total": TOTAL})

    # 3. What the change did, for the person who asked.
    labels = desk.section_labels(org_id, payload.build_id)

    def where(fragment: Fragment) -> str | None:
        return labels.get(fragment.section or "") or fragment.section

    written = [k for k in changed if k not in drift]
    final = dump(new_page, extra_locked=locked)
    left_on_page = [
        {"section": where(f), "text": f.text, "old": offers.leftovers(f.text, old_facts, new_facts)}
        for f in final
        if not f.locked and offers.leftovers(f.text, old_facts, new_facts)
    ]
    invented = [
        {"section": where(by_id[k]), "text": changed[k], "found": found}
        for k in written
        if (found := offers.invented(changed[k], by_id[k].text, new_facts))
    ]
    overreach = [
        {"section": where(by_id[k]), "text": changed[k], "dropped": lost}
        for k in written
        if (lost := offers.dropped(by_id[k].text, changed[k], old_facts))
    ]
    target_ids = {f.id for f in targets}
    seen: set[str] = set()
    hints = []
    for f in fragments:
        if f.locked or f.id in target_ids or not offers.deal_hint(f.text):
            continue
        if f.text.lower() in seen:
            continue
        seen.add(f.text.lower())
        hints.append({"section": where(f), "text": f.text})
    hints = hints[:MAX_HINTS]

    # 4. Saved as one change.
    name = (new or {}).get("name")
    reason = f"Changed the offer to {name}" if name else "Removed the offer"
    cta = offers.checkout_url(product.get("url"), new, source=product.get("pull_source"))
    try:
        version = offer_change.save(
            org_id,
            payload.build_id,
            ctx.job.created_by,
            payload.base_version,
            new_page,
            reason,
            new,
            _record(new, product, cta),
        )
    except desk.DeskConflictError as exc:
        raise changed_elsewhere from exc
    ctx.progress("Saved the page", data={"step": 4, "total": TOTAL})
    return {
        "build_id": str(payload.build_id),
        "reason": reason,
        "offer": name,
        "slots": slots,
        "changed": [
            {"section": where(by_id[k]), "before": by_id[k].text, "after": changed[k]}
            for k in written
        ],
        "leftovers": left_on_page,
        "invented": invented,
        "overreach": overreach,
        "hints": hints,
        "failed_chunks": failed,
        "page_version": version,
        "price": format_price(
            offers.page_prices(product.get("price"), product.get("sale_price"), new).now,
            product.get("currency"),
        ),
    }
