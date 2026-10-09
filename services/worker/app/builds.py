"""Creating a build (BUILD_SPEC §9 step 6): the build row with its key and its `build` job, in
one transaction. Used by POST /builds and the smoke-build command."""

from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import transaction
from app.jobs import queue
from app.jobs.models import Job
from app.jobs.registry import KINDS
from app.models.build import BuildWizard


class BuildInputsMissingError(Exception):
    """The template, brand or product isn't available to this org."""


def create_build(
    *,
    org_id: UUID,
    template_id: UUID,
    brand_id: UUID,
    product_id: UUID,
    wizard: BuildWizard,
    created_by: UUID | None,
) -> tuple[dict[str, Any], Job]:
    """The build key (e.g. ALL-3) is allocated here because only the worker may allocate keys
    (D27, D57)."""
    with transaction() as conn:
        template = conn.execute(
            """
            select id, name, origin, version from templates
            where id = %(t)s and (org_id is null or org_id = %(o)s)
              and deleted_at is null and status = 'active'
            """,
            {"t": template_id, "o": org_id},
        ).fetchone()
        product = conn.execute(
            """
            select p.id, p.name from products p join brands b on b.id = p.brand_id
            where p.id = %(p)s and p.brand_id = %(b)s and p.org_id = %(o)s and b.org_id = %(o)s
              and p.deleted_at is null and b.deleted_at is null
            """,
            {"p": product_id, "b": brand_id, "o": org_id},
        ).fetchone()
        if template is None or product is None:
            raise BuildInputsMissingError
        key = conn.execute("select allocate_build_key(%(b)s) as key", {"b": brand_id}).fetchone()
        assert key is not None
        build = conn.execute(
            """
            insert into builds (org_id, brand_id, product_id, template_id, template_version, key,
                                origin, status, title, wizard, mock_images, created_by)
            values (%(o)s, %(b)s, %(p)s, %(t)s, %(v)s, %(key)s, %(origin)s, 'queued', %(title)s,
                    %(wizard)s, %(mock)s, %(user)s)
            returning id, key, status, title
            """,
            {
                "o": org_id, "b": brand_id, "p": product_id, "t": template["id"],
                "v": template["version"], "key": key["key"], "origin": template["origin"],
                "title": f"{template['name']} · {product['name']}",
                "wizard": Jsonb(wizard.model_dump(mode="json")),
                "mock": get_settings().lp_mock_images, "user": created_by,
            },
        ).fetchone()  # fmt: skip
        assert build is not None
        kind = KINDS["build"]
        job, _ = queue.enqueue(
            org_id=org_id,
            kind=kind.name,
            payload={"build_id": str(build["id"])},
            created_by=created_by,
            build_id=build["id"],
            max_attempts=kind.max_attempts,
            conn=conn,
        )
    return dict(build), job
