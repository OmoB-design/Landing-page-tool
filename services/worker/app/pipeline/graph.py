"""The build graph (BUILD_SPEC §10.1, D7). The only difference between owned and cloned builds
is the three conditional edges on `origin`: clone-only nodes are unreachable for owned builds.

Ported from docs/pipeline/graph_sketch.py.
"""

from functools import lru_cache
from typing import Any, Literal

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.pipeline.nodes.apply_section_layout import apply_section_layout
from app.pipeline.nodes.clone_only import (
    purge_foreign_assets,
    residue_scan,
    rewrite_links,
    scrub_scripts,
    scrub_source_brand,
    strip_chrome,
)
from app.pipeline.nodes.compliance_scan import compliance_scan
from app.pipeline.nodes.copy_rewrite import copy_rewrite
from app.pipeline.nodes.finalize_common import finalize_common
from app.pipeline.nodes.image_pass import image_pass
from app.pipeline.nodes.load_inputs import load_inputs
from app.pipeline.nodes.prepare_media_slots import prepare_media_slots
from app.pipeline.nodes.product_fidelity import product_fidelity
from app.pipeline.nodes.purge_terms import purge_terms
from app.pipeline.nodes.recolor import recolor
from app.pipeline.nodes.regenerate_variants import regenerate_variants
from app.pipeline.nodes.swap_logos import swap_logos
from app.pipeline.nodes.write_report import write_report
from app.pipeline.runtime import PipelineContext
from app.pipeline.state import BuildState, Origin

CLONE_ONLY = [
    "strip_chrome", "scrub_source_brand", "scrub_scripts", "rewrite_links",
    "purge_foreign_assets", "residue_scan",
]  # fmt: skip
ORDER: dict[Origin, list[str]] = {
    "owned": [
        "load_inputs", "apply_section_layout", "recolor", "swap_logos", "regenerate_variants",
        "copy_rewrite", "purge_terms", "prepare_media_slots", "image_pass", "finalize_common",
        "product_fidelity", "compliance_scan", "write_report",
    ],
    "cloned": [
        "load_inputs", "apply_section_layout", "recolor", "swap_logos", "regenerate_variants",
        "copy_rewrite", "purge_terms", "strip_chrome", "prepare_media_slots", "image_pass",
        "finalize_common", "scrub_source_brand", "scrub_scripts", "rewrite_links",
        "purge_foreign_assets", "product_fidelity", "residue_scan", "compliance_scan",
        "write_report",
    ],
}  # fmt: skip
NODES = [
    load_inputs, apply_section_layout, recolor, swap_logos, regenerate_variants, copy_rewrite,
    purge_terms, strip_chrome, prepare_media_slots, image_pass, finalize_common,
    scrub_source_brand, scrub_scripts, rewrite_links, purge_foreign_assets, product_fidelity,
    residue_scan, compliance_scan, write_report,
]  # fmt: skip


def route_before_images(state: BuildState) -> Literal["strip_chrome", "prepare_media_slots"]:
    """Fork 1: clones strip chrome before paying for images (D21)."""
    return "strip_chrome" if state["origin"] == "cloned" else "prepare_media_slots"


def route_after_finalize(state: BuildState) -> Literal["scrub_source_brand", "product_fidelity"]:
    """Fork 2: clones run the de-brand block."""
    return "scrub_source_brand" if state["origin"] == "cloned" else "product_fidelity"


def route_after_fidelity(state: BuildState) -> Literal["residue_scan", "compliance_scan"]:
    """Fork 3: clones get a residue score."""
    return "residue_scan" if state["origin"] == "cloned" else "compliance_scan"


def build_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, Any, Any, Any]:
    g = StateGraph(BuildState, context_schema=PipelineContext)
    for fn in NODES:
        g.add_node(fn.__name__, fn)  # type: ignore[call-overload]

    g.add_edge(START, "load_inputs")
    g.add_edge("load_inputs", "apply_section_layout")
    g.add_edge("apply_section_layout", "recolor")
    g.add_edge("recolor", "swap_logos")
    g.add_edge("swap_logos", "regenerate_variants")
    g.add_edge("regenerate_variants", "copy_rewrite")
    g.add_edge("copy_rewrite", "purge_terms")
    g.add_conditional_edges(
        "purge_terms", route_before_images,
        {"strip_chrome": "strip_chrome", "prepare_media_slots": "prepare_media_slots"},
    )  # fmt: skip
    g.add_edge("strip_chrome", "prepare_media_slots")
    g.add_edge("prepare_media_slots", "image_pass")
    g.add_edge("image_pass", "finalize_common")
    g.add_conditional_edges(
        "finalize_common", route_after_finalize,
        {"scrub_source_brand": "scrub_source_brand", "product_fidelity": "product_fidelity"},
    )  # fmt: skip
    g.add_edge("scrub_source_brand", "scrub_scripts")
    g.add_edge("scrub_scripts", "rewrite_links")
    g.add_edge("rewrite_links", "purge_foreign_assets")
    g.add_edge("purge_foreign_assets", "product_fidelity")
    g.add_conditional_edges(
        "product_fidelity", route_after_fidelity,
        {"residue_scan": "residue_scan", "compliance_scan": "compliance_scan"},
    )  # fmt: skip
    g.add_edge("residue_scan", "compliance_scan")
    g.add_edge("compliance_scan", "write_report")
    g.add_edge("write_report", END)
    return g.compile(checkpointer=checkpointer)


@lru_cache
def get_graph() -> CompiledStateGraph[Any, Any, Any, Any]:
    from app.pipeline.checkpoint import get_checkpointer

    return build_graph(get_checkpointer())
