"""`shopify_layout_check` (B4.3, D122): the template editor's Check layout. The template's page is
made into the theme files an editable Shopify page would get, Shopify's render of them is worked out
locally and compared with the page in a browser at desktop, tablet and phone, and the split into
Shopify sections is fixed until they match (`publish/parity.py`). The outcome is kept with the
template's editor map for its Shopify editing card. Free: no Shopify, no AI."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app import templates
from app.engines import shopify_theme
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.providers import storage
from app.publish import parity

TOTAL = 2


class ShopifyLayoutCheckPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: UUID


def dedupe_key(payload: ShopifyLayoutCheckPayload) -> str:
    return f"shopify_layout_check:{payload.template_id}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = ShopifyLayoutCheckPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        html, current, slug, version = templates.layout_inputs(org_id, payload.template_id)
    except templates.TemplateNotFoundError as exc:
        raise UserFacingError("That template isn't in your workspace any more.") from exc
    except storage.StorageError as exc:
        raise UserFacingError("Couldn't read the template's page. Try again.") from exc
    ctx.progress(
        "Comparing the Shopify page with yours at desktop, tablet and phone",
        data={"step": 1, "total": TOTAL},
    )
    try:
        result = parity.check(html, current, slug=slug, version=1)
    except shopify_theme.ThemeTooBigError as exc:
        raise UserFacingError(str(exc), code="too_big") from exc
    check = parity.summary(result, version=version)
    templates.save_layout(org_id, payload.template_id, check)
    ctx.progress(
        (
            f"The layout matches in {check.sections} Shopify sections"
            if check.matched
            else "The layout still differs: " + (check.differences[0] if check.differences else "")
        ),
        data={"step": 2, "total": TOTAL},
    )
    return check.model_dump(mode="json")
