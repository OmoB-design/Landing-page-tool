"""Builds a test page from a library template (template-onboarding skill, step 4) and follows
its progress. The job loop (`pnpm dev`) runs the build; this command creates it and waits.

    uv run python -m app.cli.smoke_build --email you@example.com --brand Graza
    uv run python -m app.cli.smoke_build --email you@example.com --brand Graza \\
        --product drizzle --template advertorial-fixture
"""

import argparse
import sys
import time

from app.builds import create_build
from app.db import transaction
from app.jobs import queue
from app.models.build import BuildWizard

WEB = "http://localhost:3000"
TIMEOUT_SECONDS = 300


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True, help="the account whose org gets the build")
    parser.add_argument("--brand", required=True, help="brand name")
    parser.add_argument("--product", help="product name or handle (default: the newest)")
    parser.add_argument("--template", default="advertorial-fixture", help="library template slug")
    parser.add_argument("--no-ai-images", action="store_true", help="use product photos for scenes")
    args = parser.parse_args()

    with transaction() as conn:
        user = conn.execute(
            """
            select u.id, m.org_id from auth.users u join org_members m on m.user_id = u.id
            where lower(u.email) = lower(%(e)s) order by m.created_at limit 1
            """,
            {"e": args.email},
        ).fetchone()
        if user is None:
            print(f"No account for {args.email}.", file=sys.stderr)
            return 1
        brand = conn.execute(
            """
            select id from brands where org_id = %(o)s and deleted_at is null
              and lower(name) = lower(%(n)s) order by created_at desc limit 1
            """,
            {"o": user["org_id"], "n": args.brand},
        ).fetchone()
        product = (
            conn.execute(
                """
                select id, name from products where brand_id = %(b)s and deleted_at is null
                  and (%(p)s::text is null or lower(name) = lower(%(p)s) or handle = %(p)s)
                order by created_at desc limit 1
                """,
                {"b": brand["id"], "p": args.product},
            ).fetchone()
            if brand
            else None
        )
        template = conn.execute(
            "select id from templates where org_id is null and slug = %(s)s",
            {"s": args.template},
        ).fetchone()
    if brand is None or product is None or template is None:
        print(
            "Brand, product or template not found (seed templates: pnpm seed:library).",
            file=sys.stderr,
        )
        return 1

    build, job = create_build(
        org_id=user["org_id"],
        template_id=template["id"],
        brand_id=brand["id"],
        product_id=product["id"],
        wizard=BuildWizard(ai_images=not args.no_ai_images),
        created_by=user["id"],
    )
    print(f"{build['key']}: {build['title']}")
    seen = 0
    deadline = time.monotonic() + TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        events = queue.events(job.id, job.org_id)
        for event in events[seen:]:
            print(f"  {event.message}")
        seen = len(events)
        current = queue.get(job.id, job.org_id)
        if current and current.status in ("succeeded", "failed", "cancelled"):
            print(f"{current.status}: {WEB}/pages/{build['id']}")
            return 0 if current.status == "succeeded" else 1
        time.sleep(1)
    print("Still waiting after 5 minutes. Is the job loop running (pnpm dev)?", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
