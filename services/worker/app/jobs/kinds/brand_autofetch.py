"""`brand_autofetch` (BUILD_SPEC §7.3): a brand draft from its website. Steps:
1. load the page (plain request, else a real browser);
2. read it (name, tagline, logo, favicon, theme colour, language, text);
3. look at the rendered page (computed colours and fonts; skipped with a warning if it fails);
4. pick colours and fonts;
5. write the brand profile with one AI call (mock by default; D31).
Nothing is saved: the draft goes back to the form for the user to review."""

import json
from typing import Any

import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.engines import brand_extract
from app.engines.colors import choose_palette, parse_color, to_hex
from app.fetch import browser, ladder
from app.fetch.browser import RenderedSignals
from app.jobs.context import JobContext
from app.models.brand import BrandDraft, BrandProfile, Fonts, Palette, PaletteCandidate
from app.providers import anthropic
from app.providers.ledger import node_context

log = structlog.get_logger()
TOTAL = 5

SYSTEM = (
    "You write short, factual brand profiles for a landing-page tool. Use only what the page "
    "shows; never invent claims, awards, prices or medical benefits. Plain words, no em dashes. "
    "Keep each field brief: positioning, audience and brand_context in one or two sentences, "
    "voice as a few adjectives plus one sentence, up to three voice_examples quoted or closely "
    "paraphrased from the page, a CTA of at most four words, the page language as a BCP-47 code, "
    "and primary_color as a #rrggbb hex only if the page clearly shows one, otherwise null."
)


class BrandAutofetchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=4, max_length=2000)


def _normalise(url: str) -> str:
    url = url.strip()
    return url if url.lower().startswith(("http://", "https://")) else f"https://{url}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = BrandAutofetchPayload.model_validate(ctx.job.payload)
    url = _normalise(payload.url)
    warnings: list[str] = []

    page = ladder.fetch_page(url)
    ctx.progress(
        f"Loaded {page.url}" + (" with a browser" if page.via == "browser" else ""),
        data={"step": 1, "total": TOTAL},
    )

    signals = brand_extract.extract_static(page.html, page.url)
    ctx.progress(f"Read the page: {signals.name}", data={"step": 2, "total": TOTAL})

    try:
        rendered = browser.render_signals(page.url)
    except Exception as exc:  # the static signals still make a usable draft
        log.warning("rendered pass failed", url=page.url, error=str(exc))
        rendered = RenderedSignals()
        warnings.append("Couldn't read the rendered page, so colours and fonts may be missing.")
    ctx.progress("Looked at the rendered page", data={"step": 3, "total": TOTAL})

    def samples(colors: list[browser.ColorSample]) -> list[tuple[str, float]]:
        return [(sample.color, sample.weight) for sample in colors]

    palette = choose_palette(
        brand_surface_colors=samples(rendered.brand_surface_colors),
        button_colors=samples(rendered.button_colors),
        theme_color=signals.theme_color,
        css_colors=signals.css_colors,
    )
    fonts = Fonts(
        heading=brand_extract.first_font(rendered.heading_font),
        body=brand_extract.first_font(rendered.body_font),
    )
    warnings.extend(palette.notes)
    ctx.progress(
        f"Picked colours ({palette.primary or 'none found'}) and fonts",
        data={"step": 4, "total": TOTAL},
    )

    profile = _ai_profile(signals, palette.primary, fonts)
    ai_color = parse_color(profile.primary_color) if profile.primary_color else None
    if ai_color and not palette.primary:
        palette = choose_palette(
            brand_surface_colors=[], button_colors=[], theme_color=None, css_colors=[],
            ai_color=to_hex(ai_color),
        )  # fmt: skip
    ctx.progress("Wrote the brand profile", data={"step": 5, "total": TOTAL})

    draft = BrandDraft(
        url=page.url,
        name=profile.name or signals.name,
        prefix=brand_extract.suggest_prefix(profile.name or signals.name),
        tagline=profile.tagline or signals.tagline,
        positioning=profile.positioning,
        audience=profile.audience,
        brand_context=profile.brand_context,
        voice=profile.voice,
        voice_examples=profile.voice_examples[:3],
        language=(
            brand_extract.normalise_lang(profile.language or signals.lang or rendered.lang) or "en"
        )[:12],
        cta_text=profile.cta_text,
        meta_title=signals.meta_title,
        meta_description=signals.meta_description,
        support_email=signals.emails[0] if signals.emails else None,
        palette=Palette(
            primary=palette.primary,
            dark=palette.dark,
            tint=palette.tint,
            accent=palette.accent,
            source_hue=palette.source_hue,
        ),
        palette_candidates=[
            PaletteCandidate(hex=c.hex, label=c.label, reason=c.reason, signal=c.signal)
            for c in palette.candidates
        ],
        fonts=fonts,
        logo_url=signals.logo_urls[0] if signals.logo_urls else None,
        logo_svg=signals.logo_svg if not signals.logo_urls else None,
        favicon_url=signals.favicon_urls[0] if signals.favicon_urls else None,
        fetched_via=page.via,
        ai="mock" if anthropic_mocked() else "live",
        warnings=warnings,
    )
    return {"draft": draft.model_dump(mode="json")}


def anthropic_mocked() -> bool:
    from app.config import get_settings

    return get_settings().lp_mock_llm


def _ai_profile(
    signals: brand_extract.StaticSignals, primary: str | None, fonts: Fonts
) -> BrandProfile:
    digest = {
        "url": signals.url,
        "title": signals.title,
        "detected_name": signals.name,
        "meta_description": signals.tagline,
        "headings": signals.headings[:15],
        "buttons": signals.cta_texts,
        "detected_primary_color": primary,
        "fonts": fonts.model_dump(),
        "language_attribute": signals.lang,
        "page_text": signals.text_digest,
    }
    with node_context("brand_profile"):
        result = anthropic.generate(
            role="analysis",
            ledger_kind="analysis",
            system=SYSTEM,
            prompt="Brand page digest (JSON):\n" + json.dumps(digest, ensure_ascii=False),
            max_tokens=2000,
            effort="medium",
            json_schema=_schema(),
            mock_text=json.dumps(_mock_profile(signals, primary)),
        )
    return BrandProfile.model_validate(result.json())


def _schema() -> dict[str, Any]:
    schema = BrandProfile.model_json_schema()
    schema["additionalProperties"] = False
    schema.pop("title", None)
    for prop in schema["properties"].values():
        prop.pop("title", None)
    return schema


def _mock_profile(signals: brand_extract.StaticSignals, primary: str | None) -> dict[str, Any]:
    """Mock mode: a plausible profile from what the page says, clearly marked, at no cost."""
    return {
        "name": signals.name,
        "tagline": signals.tagline or "",
        "positioning": "(mock) Written by the AI pass when mock mode is off.",
        "audience": "(mock) Written by the AI pass when mock mode is off.",
        "brand_context": "(mock) Written by the AI pass when mock mode is off.",
        "voice": "(mock) Friendly, clear and confident.",
        "voice_examples": [h for h in signals.headings[:2]],
        "cta_text": signals.cta_texts[0] if signals.cta_texts else "Shop now",
        "language": (signals.lang or "en")[:12],
        "primary_color": primary,
    }
