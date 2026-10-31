"""Clone-only nodes (BUILD_SPEC §10.2, B2.3, D100), reached only when origin is `cloned`: owned
builds never run them. The page work is in `engines/clone_build.py` and `engines/residue.py`;
these nodes add the brand's hosts, the source's names, and the downloads that copy kept fonts,
layout libraries and images into the org's assets."""

from typing import Any
from uuid import UUID

from app.config import get_settings
from app.engines import clone_build, residue
from app.fetch.copy_in import Budget, copy_in
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


def source_of(state: BuildState) -> clone_build.Source:
    template = state["template"]
    source = template.get("source") or {}
    return clone_build.Source.build(
        host=str(source.get("host") or ""),
        name=source.get("name"),
        brand_tokens=list(template.get("blueprint", {}).get("brand_tokens", [])),
    )


def hosts_of(state: BuildState) -> clone_build.Hosts:
    brand, product = state["brand"], state["product"]
    exact = [
        brand.get("logo_url") or "",
        brand.get("favicon_url") or "",
        *product.get("images", []),
        *[v.get("image_url") or "" for v in product.get("variants", [])],
    ]
    return clone_build.Hosts.build(
        storage_url=get_settings().supabase_url,
        brand_url=brand.get("url"),
        product_url=product.get("url"),
        exact_urls=exact,
        source_host=str((state["template"].get("source") or {}).get("host") or ""),
    )


def target_of(state: BuildState) -> str:
    """Where the page's buttons lead: the product page, else the brand's site."""
    return state["product"].get("url") or state["brand"].get("url") or "#"


@node("strip_chrome", "Stripped store chrome")
def strip_chrome(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    html, stats = clone_build.strip_chrome(read_page(state))
    return {
        **write_page(state, "strip_chrome", html),
        "blueprint_stats": {**state.get("blueprint_stats", {}), "chrome": stats},
        "_stats": stats,
    }


@node("scrub_source_brand", "Removed the source brand")
def scrub_source_brand(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    html, stats = clone_build.scrub_source_brand(
        read_page(state),
        source_of(state),
        brand_name=state["brand"]["name"],
        product_name=state["product"]["name"],
    )
    return {
        **write_page(state, "scrub_source_brand", html),
        "blueprint_stats": {**state.get("blueprint_stats", {}), "brand": stats},
        "_stats": stats,
    }


@node("scrub_scripts", "Cleaned up scripts")
def scrub_scripts(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    page = read_page(state)
    hosts = hosts_of(state)
    plan = clone_build.plan_scripts(page, hosts)
    budget = Budget()
    org = UUID(state["org_id"])
    copied = {
        **copy_in(org, plan.scripts, kind="script", budget=budget),
        **copy_in(org, plan.fonts, kind="font", budget=budget),
    }
    html, stats = clone_build.scrub_scripts(page, source_of(state), hosts, copied=copied)
    stats = {**stats, "copy_budget_left": budget.remaining}
    warnings: list[str] = []
    missing = len(plan.fonts) - int(stats["fonts_copied"])  # type: ignore[call-overload]
    if plan.fonts and missing > 0:
        warnings.append(
            "Some of the source's fonts couldn't be copied, so the page falls back to the "
            "brand's fonts there."
        )
    return {
        **write_page(state, "scrub_scripts", html),
        "blueprint_stats": {**state.get("blueprint_stats", {}), "scripts": stats},
        "_stats": stats,
        "_warnings": warnings,
    }


@node("rewrite_links", "Rewrote links")
def rewrite_links(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    html, stats = clone_build.rewrite_links(
        read_page(state), source_of(state), hosts_of(state), target_url=target_of(state)
    )
    return {
        **write_page(state, "rewrite_links", html),
        "blueprint_stats": {**state.get("blueprint_stats", {}), "links": stats},
        "_stats": stats,
    }


@node("purge_foreign_assets", "Removed foreign assets")
def purge_foreign_assets(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    page = read_page(state)
    hosts = hosts_of(state)
    kept = clone_build.keep_image_urls(page, hosts)
    copied = copy_in(UUID(state["org_id"]), kept, kind="image", budget=Budget())
    html, stats = clone_build.purge_foreign_assets(
        page, hosts, target_url=target_of(state), copied=copied
    )
    return {
        **write_page(state, "purge_foreign_assets", html),
        "blueprint_stats": {**state.get("blueprint_stats", {}), "assets": stats},
        "_stats": stats,
    }


@node("residue_scan", "Scored source residue")
def residue_scan(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    found = residue.scan(read_page(state), source_of(state), hosts_of(state))
    warnings: list[str] = []
    if not found["clean"]:
        warnings.append(
            f"Source leaks: score {found['score']}. Check the Source leaks card before publishing."
        )
    counts: dict[str, Any] = dict(found["counts"])  # type: ignore[call-overload]
    return {
        "residue": found,
        "_stats": {"score": found["score"], **counts},
        "_warnings": warnings,
    }
