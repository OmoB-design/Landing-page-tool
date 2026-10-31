"""`template_analyze` (BUILD_SPEC §8.4 "Analyze", B2.2): one Claude call reads a cloned page
and the result is applied to it. Steps:
1. read the page (marks from an earlier analysis are taken off first);
2. ask the model about its digest (`engines/analysis.py`): the source's colours, brand words,
   logos, buy links and variant pickers, its sections, and draft rules;
3. mark the sections, budget the headings and buttons, map sections for M4;
4. save it all as the template's next version, to be reviewed before building.
Nothing is saved unless the call succeeded (D24). Queued by `template_clone` when a clone is
saved, and by Analyse again (POST /templates/{id}/analyse)."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, ValidationError

from app import templates
from app.db import transaction
from app.engines import analysis
from app.engines.colors import parse_color, to_hex
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.blueprint import AnalysisReply, Blueprint, BlueprintPalette
from app.models.template import TemplateInstructions
from app.providers import anthropic, storage
from app.providers.ledger import node_context

TOTAL = 4
MAX_TOKENS = 12
MAX_TERMS = 30

SYSTEM = """You analyse a landing page that a marketer cloned from a competitor, so a tool can \
rebuild it for the marketer's own brand. You get a digest of the page: its colours, its \
candidate blocks in page order, its images, links and headings, and its opening text. Answer \
with JSON only.

- palette: the source brand's colours, as hex values from the colour list. primary: its main \
brand colour (buttons, highlights, bars). dark: a dark brand colour (deep backgrounds, \
headings in the brand colour), else its darkest text colour. tint: a light background tinted \
with the brand colour, else its lightest background. accent: a second highlight colour, else \
primary again.
- brand_tokens: the source's brand and product names as they are written on the page (for \
example "Resilia", "Resilia Aged Garlic"). At most four words each. No generic words, no claims.
- logo_images: ids of images that are the source's logo or wordmark.
- cta_links: ids of links and buttons that send the visitor to buy or to the offer.
- variant_blocks: ids of blocks that hold a variant, bundle or quantity picker (usually none).
- sections: the page's sections in page order, made of blocks. A section is one block, or \
several consecutive blocks that belong together (a heading with the paragraphs under it). \
Leave out site chrome: skip links, the store's header and navigation, announcement and cookie \
bars, the store's footer, newsletter sign-ups, pop-ups and empty blocks. role: the closest of \
the allowed roles. label: a short name a marketer would use, two to four words ("Hero", "The \
problem", "Doctor's story", "How it works", "Comparison", "Reviews", "Offer", "FAQ").
- keep_images: ids of interface graphics to keep exactly as they are: stars, ticks, rating \
bars, badges, trust and payment icons, arrows.
- generic_images: ids of photos that do not show the product (people, places, scenes).
- forbidden_terms: words that must never appear in the rebuilt page: the source's brand and \
product names, trademarks, the names of its people (doctors, founders, reviewers named as \
experts) and claims that belong to it (its awards, its studies, its customer counts). Terms, \
not sentences.
- copy_rules: one to three short rules about this page's writing (voice, person, structure), \
or "".
- image_rules: one or two short rules about its images, or "".
- notes: one or two sentences about anything unusual on the page."""


class TemplateAnalyzePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: UUID


def dedupe_key(payload: TemplateAnalyzePayload) -> str:
    return f"template_analyze:{payload.template_id}"


def _template(org_id: UUID, template_id: UUID) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute(
            """
            select id, org_id, origin, name, html_path, version, source_host, source_name
            from templates
            where id = %(t)s and org_id = %(o)s and deleted_at is null
            """,
            {"t": template_id, "o": org_id},
        ).fetchone()
    if row is None:
        raise UserFacingError("That template isn't in your workspace any more.", code="not_found")
    if row["origin"] != "cloned":
        raise UserFacingError("Only cloned pages are analysed.", code="not_cloned")
    return dict(row)


def _hex(value: str, fallback: str | None) -> str | None:
    rgb = parse_color(value)
    return to_hex(rgb) if rgb is not None else fallback


def _short(values: list[str], *, limit: int, words: int, chars: int) -> list[str]:
    out: dict[str, str] = {}
    for value in values:
        text = " ".join(str(value).split())
        if text and len(text) <= chars and len(text.split()) <= words:
            out.setdefault(text.lower(), text)
    return list(out.values())[:limit]


def run(ctx: JobContext) -> dict[str, Any]:
    payload = TemplateAnalyzePayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    template = _template(org_id, payload.template_id)

    # 1. The page, without an earlier analysis's marks.
    html = analysis.untag(storage.download("templates", template["html_path"]).decode("utf-8"))
    page, blocks, soup = analysis.digest(
        html,
        source_host=template["source_host"],
        source_name=template["source_name"],
        title=template["name"],
    )
    if not blocks:
        raise UserFacingError("This page has no content to analyse.", code="analysis_empty")
    ctx.progress(
        f"Read the page: {len(blocks)} blocks, {len(page.images)} images",
        data={"step": 1, "total": TOTAL},
    )

    # 2. The model's reading of it.
    with node_context("template_analyze"):
        try:
            result = anthropic.generate(
                role="analysis",
                ledger_kind="analysis",
                system=SYSTEM,
                prompt="Page digest (JSON):\n" + json.dumps(page.for_model(), ensure_ascii=False),
                max_tokens=6000,
                effort="medium",
                json_schema=anthropic.strict_schema(AnalysisReply),
                mock_text=json.dumps(analysis.heuristic(page)),
            )
            reply = AnalysisReply.model_validate(result.json())
        except (ValidationError, json.JSONDecodeError) as exc:
            raise UserFacingError(
                "The analysis came back incomplete, so nothing was saved. Try again.",
                code="analysis_failed",
            ) from exc
        except anthropic.LLMRefusalError as exc:
            raise UserFacingError(
                "Claude declined to analyse this page, so nothing was saved.",
                code="analysis_refused",
            ) from exc
    ctx.progress(
        "Claude found the colours, brand words and sections"
        + (" (mock mode)" if result.mock else ""),
        data={"step": 2, "total": TOTAL},
    )

    # 3. Applied to the page.
    images = {i["id"]: i["src"] for i in page.images}
    links = {link["id"]: link["href"] for link in page.links}
    chosen = [
        analysis.ChosenSection(
            blocks=s.blocks,
            role=s.role,
            label=" ".join(s.label.split())[:40] or f"Section {n + 1}",
        )
        for n, s in enumerate(reply.sections)
    ]
    new_html, rows, stats = analysis.apply(soup, blocks, chosen)
    if not rows:
        raise UserFacingError(
            "The analysis found no sections on this page, so nothing was saved. Try again.",
            code="analysis_empty",
        )
    primary = _hex(reply.palette.primary, None) or (
        next((c["hex"] for c in page.colours if not c["neutral"]), "#000000")
    )

    def srcs(ids: list[int]) -> list[str]:
        # The same image or link often appears several times on a page: one entry each.
        return list(dict.fromkeys(images[i] for i in ids if i in images))

    keep = srcs(reply.keep_images)
    tokens = _short(
        [*reply.brand_tokens, *([template["source_name"]] if template["source_name"] else [])],
        limit=MAX_TOKENS, words=4, chars=40,
    )  # fmt: skip
    blueprint = Blueprint(
        ai="mock" if result.mock else "claude",
        model=result.model,
        analysed_at=datetime.now(UTC),
        palette=BlueprintPalette(
            primary=primary,
            dark=_hex(reply.palette.dark, None),
            tint=_hex(reply.palette.tint, None),
            accent=_hex(reply.palette.accent, None),
        ),
        brand_tokens=tokens,
        logo_srcs=srcs(reply.logo_images),
        cta_hrefs=list(
            dict.fromkeys(
                links[i]
                for i in reply.cta_links
                if i in links and links[i].startswith(("http://", "https://"))
            )
        ),
        variant_sections=[r["key"] for r in rows if set(r["blocks"]) & set(reply.variant_blocks)],
        notes=" ".join(reply.notes.split())[:500],
    )
    instructions = TemplateInstructions(
        copy_rules=reply.copy_rules.strip()[:1000],
        length_caps=analysis.length_caps(new_html),  # type: ignore[arg-type]
        image_rules=reply.image_rules.strip()[:600],
        generic_images=[src for src in srcs(reply.generic_images) if src not in keep],
        keep_images=keep,
        forbidden_terms=_short(reply.forbidden_terms, limit=MAX_TERMS, words=8, chars=60),
        notes=f"Drafted by analysis ({blueprint.ai}, {blueprint.model}) on "
        f"{blueprint.analysed_at:%Y-%m-%d}. Review before building.",
    )
    editor_map = {
        "version": 1,
        "ai": blueprint.ai,
        "model": blueprint.model,
        "sections": [
            {"match": f'[data-lp-section="{r["key"]}"]', "name": r["label"]} for r in rows
        ],
        "roles": [{"match": f'[data-lp-section="{r["key"]}"]', "role": r["role"]} for r in rows],
    }
    ctx.progress(
        f"Marked {len(rows)} sections"
        + (f" ({stats['wrapped']} grouped)" if stats["wrapped"] else ""),
        data={"step": 3, "total": TOTAL},
    )

    # 4. Saved as the next version; it needs a review before pages are built from it.
    with transaction() as conn:
        current = templates.load_for_update(conn, org_id, payload.template_id)
        stale = templates.new_version(
            conn, current, rows, f"Analysed: {len(rows)} sections", ctx.job.created_by,
            html=new_html,
        )  # fmt: skip
        conn.execute(
            """
            update templates
            set blueprint = %(b)s, instructions = %(i)s, editor_map = %(e)s,
                reviewed_at = null, reviewed_by = null
            where id = %(t)s and org_id = %(o)s
            """,
            {
                "b": Jsonb(blueprint.model_dump(mode="json")),
                "i": Jsonb(instructions.model_dump(mode="json")),
                "e": Jsonb(editor_map), "t": payload.template_id, "o": org_id,
            },
        )  # fmt: skip
    templates.remove_files(stale)
    ctx.progress(f"Saved: {len(rows)} sections to review", data={"step": 4, "total": TOTAL})
    return {
        "template_id": str(payload.template_id),
        "sections": len(rows),
        "ai": blueprint.ai,
        "model": blueprint.model,
        "brand_tokens": tokens,
        "forbidden_terms": len(instructions.forbidden_terms),
    }
