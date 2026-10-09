"""The pipeline's state (BUILD_SPEC §10). Plain JSON-friendly values only: it is checkpointed
to Postgres after every node. The page itself is never in state, only its storage path."""

import operator
from typing import Annotated, Any, Literal, TypedDict

Origin = Literal["owned", "cloned"]


class NodeReport(TypedDict, total=False):
    node: str
    ok: bool
    stats: dict[str, Any]
    warnings: list[str]


class BuildState(TypedDict, total=False):
    # identity (set once by the build job)
    org_id: str
    build_id: str
    origin: Origin
    mock_images: bool

    # inputs (set by load_inputs)
    template: dict[
        str, Any
    ]  # id, slug, name, type, version, source_palette, sections, instructions
    brand: dict[str, Any]  # brand view for the product (brand_for_product)
    product: dict[str, Any]
    wizard: dict[str, Any]
    targeting: dict[str, Any]

    # the working page: a storage path in the `builds` bucket, never the HTML itself
    html_path: str
    html_rev: int
    rev_paths: Annotated[list[str], operator.add]  # removed once the build has finished

    # accumulated results (reducers append)
    node_reports: Annotated[list[NodeReport], operator.add]
    warnings: Annotated[list[str], operator.add]

    # results consumed by write_report and the publish gate
    layout: dict[str, Any]
    brand_stats: dict[str, Any]
    copy: dict[str, Any]
    images: dict[str, Any]
    finalize: dict[str, Any]
    blueprint_stats: dict[str, Any]
    residue: dict[str, Any]
    compliance: dict[str, Any]
    report: dict[str, Any]
