"""
graph_sketch.py — LP Platform build pipeline as a LangGraph StateGraph (SKETCH)

Port into services/worker/app/pipeline/ at B0.6:
    state.py   <- BuildState, Origin, NodeReport
    graph.py   <- build_graph(), route_* functions
    nodes/     <- one module per node; replace the stub bodies with real engine calls

Run this file directly to see the routing for an owned and a cloned build:
    uv run python docs/pipeline/graph_sketch.py

Design rules (see docs/BUILD_SPEC.md §10):
  * The ONLY structural difference between the owned and cloned paths is the
    conditional edges on state["origin"]. Clone-only nodes are unreachable for owned builds.
  * Nodes are thin: load from state, call a pure engine (engines/*.py), store the result,
    emit progress, record cost through providers. No HTML logic inside node functions.
  * HTML is NOT carried in state. State holds storage paths; nodes read/write the working
    HTML through a ctx helper. This keeps Postgres checkpoints small (the reference tool's
    pages were 2 MB+).
  * Nodes must be idempotent so a crashed job can resume from the last checkpoint.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Callable, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

Origin = Literal["owned", "cloned"]


# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────
class NodeReport(TypedDict, total=False):
    node: str
    ok: bool
    stats: dict[str, Any]
    warnings: list[str]


class BuildState(TypedDict, total=False):
    # identity (set once by the job runner)
    org_id: str
    build_id: str
    job_id: str
    origin: Origin

    # inputs (set by load_inputs)
    template_id: str
    brand_id: str
    product_id: str
    wizard: dict[str, Any]            # validated wizard payload
    targeting: dict[str, Any]         # brief_extra, image_prefs, targeting record
    instructions: dict[str, Any]      # copy_rules, length_caps, image_rules, keep/generic images, forbidden_terms
    blueprint: dict[str, Any] | None  # clones only
    mock_images: bool

    # working document: a storage path, never the HTML itself
    working_html_path: str
    html_rev: int                     # bumped by every node that writes the page

    # accumulated results (reducers append rather than overwrite)
    node_reports: Annotated[list[NodeReport], operator.add]
    warnings: Annotated[list[str], operator.add]

    # section results consumed by write_report / publish gate
    copy: dict[str, Any]              # rewritten_ratio, error, warnings, purged_terms, drift_warnings
    images: dict[str, Any]            # plan stats, product_fix, warning
    blueprint_stats: dict[str, Any]   # clones: scripts dropped/vendored, fonts, ctas, widgets
    residue: dict[str, Any]           # clones: score, clean, counts, findings
    compliance: dict[str, Any]        # findings, high_risk_count


# ─────────────────────────────────────────────────────────────────────────────
# Node plumbing
# ─────────────────────────────────────────────────────────────────────────────
NodeFn = Callable[[BuildState], dict[str, Any]]


def node(name: str) -> Callable[[NodeFn], NodeFn]:
    """
    Decorator for every pipeline node. In the real worker this wrapper:
      * emits job_events: "<name> started" / "<name> done" (+ stats) / errors
      * sets the cost context so providers attribute ledger_entries to (build_id, node)
      * converts unexpected exceptions into a node failure with a clear message
      * appends a NodeReport
    Here it just logs and appends the report, so the routing can be demonstrated.
    """

    def wrap(fn: NodeFn) -> NodeFn:
        def run(state: BuildState) -> dict[str, Any]:
            # ctx.progress(state["job_id"], name, "started")
            update = fn(state) or {}
            report: NodeReport = {"node": name, "ok": True, "stats": update.pop("_stats", {})}
            update.setdefault("node_reports", []).append(report)
            print(f"  ✓ {name}")
            return update

        run.__name__ = name
        return run

    return wrap


# ─────────────────────────────────────────────────────────────────────────────
# Shared nodes (both origins)
# Each body is a stub. Comments say what the real node does and which engine it calls.
# ─────────────────────────────────────────────────────────────────────────────
@node("load_inputs")
def load_inputs(state: BuildState) -> dict[str, Any]:
    # Load template (html path, sections, instructions, blueprint for clones), brand view for the
    # product (brand_for_product), wizard -> wizard_targeting(). Copy template HTML to the build's
    # working.html. Reset cost context; clear expired provider_locks for this org.
    return {"html_rev": 0}


@node("apply_section_layout")
def apply_section_layout(state: BuildState) -> dict[str, Any]:
    # engines.sections.apply_layout(html, template_sections): reorder/remove/duplicate
    # [data-lp-section] nodes. No-op when already in order.
    return {}


@node("recolor")
def recolor(state: BuildState) -> dict[str, Any]:
    # engines.recolor: USP icons, native <details> FAQ, spacing fixes; then exact-hex pass and
    # hue-family sweep (palette from blueprint for clones, template.source_palette for library).
    return {}


@node("swap_logos")
def swap_logos(state: BuildState) -> dict[str, Any]:
    # engines.logos.swap: blueprint.logo_srcs (clones) or [data-lp-logo] (library). Count logos_missing.
    return {}


@node("regenerate_variants")
def regenerate_variants(state: BuildState) -> dict[str, Any]:
    # engines.variants: clone one unit per product variant, or collapse the picker to one unit.
    return {}


@node("copy_rewrite")
def copy_rewrite(state: BuildState) -> dict[str, Any]:
    # engines.fragments.dump -> providers.anthropic (40 fragments/call, neighbours as context,
    # 3 attempts @ 2s/6s, JSON salvage) -> length budget + shortening passes -> strict mode
    # re-prompts (always for clones) -> structural protection -> fragments.reinject_checked.
    # A failed chunk keeps source text and sets copy.error (blocks publish, never fails the build).
    strict = state["origin"] == "cloned"
    return {"copy": {"rewritten_ratio": 0.0, "strict": strict, "warnings": []}}


@node("purge_terms")
def purge_terms(state: BuildState) -> dict[str, Any]:
    # engines.purge.purge_terms(html, instructions.forbidden_terms): delete innermost block
    # containing a term; a lone label span loses only the span.
    return {}


@node("prepare_media_slots")
def prepare_media_slots(state: BuildState) -> dict[str, Any]:
    # .lp-media-slot -> <img class="lp-scene-slot"> keeping aspect ratio and radius; foreign src
    # forces the image planner to fill it.
    return {}


@node("image_pass")
def image_pass(state: BuildState) -> dict[str, Any]:
    # engines.images.build_manifest (+ CSS background pseudo-entries from id 10000)
    # -> providers.anthropic vision plan (<=20 thumbs @96px) or heuristic fallback
    # -> deterministic fix-ups in the spec's order (keep_images LAST)
    # -> execute: replace_product | regenerate_person | regenerate_scene | drop | inline_keep
    # Mock mode: providers.fal returns local placeholder images at zero cost.
    return {"images": {"mock": state.get("mock_images", True)}}


@node("finalize_common")
def finalize_common(state: BuildState) -> dict[str, Any]:
    # engines.finalize.common: comments, meta/OG/Twitter, favicon, emails, FAQ, media slots,
    # trust/USP rows, sale labels, viewport.
    return {}


@node("product_fidelity")
def product_fidelity(state: BuildState) -> dict[str, Any]:
    # Gate: ai on, ai images on, not mock, fidelity enabled, product photos exist.
    # Vision plan (fix | ok | no_product) -> up to 10 edit calls -> versioned in image_versions.
    # Never blocks the build.
    if state.get("mock_images", True):
        return {"_stats": {"skipped": "mock_images"}}
    return {}


@node("compliance_scan")
def compliance_scan(state: BuildState) -> dict[str, Any]:
    # engines.compliance.scan(html): phrase rules with severities. High-risk findings block publish.
    return {"compliance": {"findings": [], "high_risk_count": 0}}


@node("write_report")
def write_report(state: BuildState) -> dict[str, Any]:
    # Assemble builds.report from state (copy, images, blueprint_stats, residue, compliance, cost
    # rollup, mock_images). Write review fragments. Set builds.status = 'needs_review'.
    # Notify the job creator.
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Clone-only nodes (unreachable when origin == "owned")
# ─────────────────────────────────────────────────────────────────────────────
@node("strip_chrome")
def strip_chrome(state: BuildState) -> dict[str, Any]:
    # Runs BEFORE image_pass so we never pay for an image inside a header/footer about to be
    # deleted. Removes skip links, store headers, legal footers, chat widgets, fixed overlays,
    # citation blocks, nav links whose #target was removed.
    return {}


@node("scrub_source_brand")
def scrub_source_brand(state: BuildState) -> dict[str, Any]:
    # Source tokens -> brand name in text and alt/aria-label/title/content/data-*; drop JSON-LD;
    # remove foreign logos; drop hydration scripts and <base>; resolve root-relative URLs.
    return {}


@node("scrub_scripts")
def scrub_scripts(state: BuildState) -> dict[str, Any]:
    # Drop foreign scripts (vendor layout libs into assets); drop tracking/checkout inline scripts;
    # vendor stylesheets; embed woff2 into assets; rename source-named fonts/classes/ids.
    return {"blueprint_stats": {}}


@node("rewrite_links")
def rewrite_links(state: BuildState) -> dict[str, Any]:
    # Links into the source site and dead #anchor CTAs -> product/CTA URL; drop foreign noscript,
    # cart drawers, cross-sells; foreign css url() -> none; drop attrs carrying foreign URLs.
    return {}


@node("purge_foreign_assets")
def purge_foreign_assets(state: BuildState) -> dict[str, Any]:
    # Any remaining foreign <img> -> 1x1 transparent; drop foreign <source>/<link>.
    # Postcondition: no foreign URL survives anywhere in the document.
    return {}


@node("residue_scan")
def residue_scan(state: BuildState) -> dict[str, Any]:
    # Report only. score = max(0, 100 - 7 * total_findings). Used by the publish gate.
    return {"residue": {"score": 100, "clean": True, "counts": {}, "findings": []}}


# ─────────────────────────────────────────────────────────────────────────────
# Routing: the fork. Three decision points, all on origin.
# ─────────────────────────────────────────────────────────────────────────────
def route_before_images(state: BuildState) -> Literal["strip_chrome", "prepare_media_slots"]:
    return "strip_chrome" if state["origin"] == "cloned" else "prepare_media_slots"


def route_after_finalize(state: BuildState) -> Literal["scrub_source_brand", "product_fidelity"]:
    return "scrub_source_brand" if state["origin"] == "cloned" else "product_fidelity"


def route_after_fidelity(state: BuildState) -> Literal["residue_scan", "compliance_scan"]:
    return "residue_scan" if state["origin"] == "cloned" else "compliance_scan"


# ─────────────────────────────────────────────────────────────────────────────
# Graph assembly
# ─────────────────────────────────────────────────────────────────────────────
def build_graph(checkpointer: Any | None = None):
    """
    In the worker:
        from langgraph.checkpoint.postgres import PostgresSaver
        with PostgresSaver.from_conn_string(settings.database_url) as saver:
            saver.setup()                       # once, at deploy/migration time
            graph = build_graph(saver)
            graph.invoke(initial_state, config={"configurable": {"thread_id": build_id}})
    Using thread_id = build_id lets a retried job resume from the last completed node.
    """
    g = StateGraph(BuildState)

    nodes: list[NodeFn] = [
        load_inputs, apply_section_layout, recolor, swap_logos, regenerate_variants,
        copy_rewrite, purge_terms, strip_chrome, prepare_media_slots, image_pass,
        finalize_common, scrub_source_brand, scrub_scripts, rewrite_links,
        purge_foreign_assets, product_fidelity, residue_scan, compliance_scan, write_report,
    ]
    for fn in nodes:
        g.add_node(fn.__name__, fn)

    # Shared prefix
    g.add_edge(START, "load_inputs")
    g.add_edge("load_inputs", "apply_section_layout")
    g.add_edge("apply_section_layout", "recolor")
    g.add_edge("recolor", "swap_logos")
    g.add_edge("swap_logos", "regenerate_variants")
    g.add_edge("regenerate_variants", "copy_rewrite")
    g.add_edge("copy_rewrite", "purge_terms")

    # Fork 1: clones strip chrome before paying for images
    g.add_conditional_edges("purge_terms", route_before_images,
                            {"strip_chrome": "strip_chrome", "prepare_media_slots": "prepare_media_slots"})
    g.add_edge("strip_chrome", "prepare_media_slots")

    g.add_edge("prepare_media_slots", "image_pass")
    g.add_edge("image_pass", "finalize_common")

    # Fork 2: clones run the de-brand block
    g.add_conditional_edges("finalize_common", route_after_finalize,
                            {"scrub_source_brand": "scrub_source_brand", "product_fidelity": "product_fidelity"})
    g.add_edge("scrub_source_brand", "scrub_scripts")
    g.add_edge("scrub_scripts", "rewrite_links")
    g.add_edge("rewrite_links", "purge_foreign_assets")
    g.add_edge("purge_foreign_assets", "product_fidelity")

    # Fork 3: clones get a residue score
    g.add_conditional_edges("product_fidelity", route_after_fidelity,
                            {"residue_scan": "residue_scan", "compliance_scan": "compliance_scan"})
    g.add_edge("residue_scan", "compliance_scan")

    g.add_edge("compliance_scan", "write_report")
    g.add_edge("write_report", END)

    return g.compile(checkpointer=checkpointer)


CLONE_ONLY = {"strip_chrome", "scrub_source_brand", "scrub_scripts", "rewrite_links",
              "purge_foreign_assets", "residue_scan"}


if __name__ == "__main__":
    graph = build_graph()
    for origin in ("owned", "cloned"):
        print(f"\n── {origin} build ──")
        out = graph.invoke({"org_id": "org", "build_id": f"demo-{origin}", "job_id": "job",
                            "origin": origin, "mock_images": True, "node_reports": [], "warnings": []})
        ran = [r["node"] for r in out["node_reports"]]
        leaked = CLONE_ONLY.intersection(ran)
        if origin == "owned":
            assert not leaked, f"owned build ran clone-only nodes: {leaked}"
        else:
            assert CLONE_ONLY.issubset(ran), f"cloned build skipped: {CLONE_ONLY - set(ran)}"
            assert ran.index("strip_chrome") < ran.index("image_pass"), "strip_chrome must precede image_pass"
        print(f"  {len(ran)} nodes; routing assertions passed")
