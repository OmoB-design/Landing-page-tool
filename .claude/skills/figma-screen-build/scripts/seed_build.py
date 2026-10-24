"""Seeds a build in a throwaway account, in one of three states, without running the pipeline (no
AI, no cost, and no job a worker would pick up):

- finished: a page in storage (hero, reviews, faq sections), a report (facts, three copy changes,
  claims: Fix, Check and the expert note) and a finished job with its 13-step log;
- failed:   a job that failed on step 4 ("Swap in the logo") with its reason and log;
- building: no page yet, and a finished job, so the browser's job polling can be faked.

Adds the build and job ids to OUT/account.json under the state's name.

    cd services/worker && PYTHONPATH=. uv run python <this file> OUT --state finished
"""

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from psycopg.types.json import Jsonb

from app.db import transaction
from app.providers import storage

parser = argparse.ArgumentParser()
parser.add_argument("out")
parser.add_argument("--state", choices=["finished", "failed", "building"], default="finished")
args = parser.parse_args()
account_file = Path(args.out) / "account.json"
account = json.loads(account_file.read_text())
email = account["email"]
assert email.startswith("design-check-") and email.endswith("@example.test"), email
now = datetime.now(UTC)

LOG = [
    "Started (attempt 1 of 3)",
    "Loaded Advertorial: 30-day wear test for OG X Black Cherry Lemonade",
    "Arranged the sections",
    "Applied the brand colours and fonts",
    "Swapped in the logo",
    "Built the product options",
    "Rewrote 132 of 150 lines",
    "Removed forbidden terms",
    "Prepared the image slots",
    "Placed 4 product photos and 10 placeholder images",
    "Finished the page",
    "Skipped product matching (arrives with real images)",
    "Checked the claims: 1 high, 1 medium, 1 low",
    "Wrote the report",
]
PAGE = (
    "<!doctype html><html><head><meta charset=utf-8><style>body{margin:0;font:16px/1.5 Georgia,serif;"
    "color:#222}section{padding:120px 48px;border-bottom:1px solid #eee}h1{font-size:44px;margin:0 0 12px}"
    "</style></head><body>"
    '<section data-lp-section="hero"><h1>Hero</h1><p>Clinically proven to calm redness in 7 days</p></section>'
    '<section data-lp-section="reviews"><h1>Reviews</h1><p>The #1 serum my clients ask for</p></section>'
    '<section data-lp-section="faq"><h1>Faq</h1><p>Questions and answers.</p></section>'
    "</body></html>"
)


def report(template_id: str) -> dict:
    return {
        "mode": "owned",
        "template": {"id": template_id, "slug": "advertorial-wear-test", "name": "Advertorial: 30-day wear test", "version": 1},
        "layout": {"removed": [], "duplicated": []},
        "brand": {"recolor": {"exact": 23, "hue_shifted": 12, "fonts": ["PP Eiko Regular", "PP Fragment"]}, "logos": {"slots": 1, "logos_missing": 0}},
        "copy": {
            "rewritten_ratio": 0.88, "rewritten": 132, "eligible": 150, "failed_chunks": 0, "mock": False, "warnings": [], "purged_terms": [],
            "review": [
                {"original": "Verified Lowest Price of the Year. Shop Now!", "replacement": "OG X Black Cherry Lemonade by BRĒZ. Experience now", "where": "hero"},
                {"original": "I Went From Settling for Fast-Fashion Bags to Carrying One That Gets Better Every Year", "replacement": "I Swapped My Evening Cocktail for a Black Cherry Lemonade With No Regrets", "where": "hero"},
                {"original": "I expected finding a bag worth keeping to mean spending hundreds on a designer name.", "replacement": "I figured a fun night meant a big bar tab and a slow morning.", "where": "story"},
            ],
        },
        "images": {"plan_stats": {}, "product_photos": 4, "mock_images": 10},
        "compliance": {
            "findings": [
                {"rule": "clinically_proven", "category": "evidence", "severity": "high", "text": "Clinically proven to calm redness in 7 days", "location": "hero > p", "reason": 'Says "clinically proven" without a cited study.'},
                {"rule": "number_one", "category": "superlative", "severity": "medium", "text": "The #1 serum my clients ask for", "location": "reviews > p", "reason": '"#1" needs a source.'},
                {"rule": "expert_author", "category": "credentials", "severity": "low", "text": "Author: expert", "location": "page", "reason": "The byline is a fictional expert's voice: check the page never claims real credentials."},
            ],
            "high_risk_count": 1, "clean": False,
        },
        "cost": {"total_usd": 0.21},
        "mock_images": False,
        "warnings": [],
    }  # fmt: skip


with transaction() as conn:
    user = conn.execute("select id from auth.users where email = %(e)s", {"e": email}).fetchone()
    org = conn.execute("select org_id from org_members where user_id = %(u)s", {"u": user["id"]}).fetchone()["org_id"]
    brand = conn.execute("select id from brands where org_id = %(o)s and name = 'BREZ'", {"o": org}).fetchone()["id"]
    product = conn.execute(
        "select id from products where org_id = %(o)s and brand_id = %(b)s order by created_at limit 1",
        {"o": org, "b": brand},
    ).fetchone()["id"]
    template = conn.execute(
        "select id, version from templates where org_id is null and slug = 'advertorial-wear-test'"
    ).fetchone()
    count = conn.execute("select count(*) as n from builds where brand_id = %(b)s", {"b": brand}).fetchone()["n"]
    status = {"finished": "needs_review", "failed": "queued", "building": "building"}[args.state]
    build = conn.execute(
        """
        insert into builds (org_id, brand_id, product_id, template_id, template_version, key, origin,
                            status, title, wizard, created_by)
        values (%(o)s, %(b)s, %(p)s, %(t)s, %(v)s, %(key)s, 'owned', %(s)s,
                'Advertorial: 30-day wear test · OG X Black Cherry Lemonade', '{}', %(u)s)
        returning id
        """,
        {"o": org, "b": brand, "p": product, "t": template["id"], "v": template["version"],
         "key": f"BRE-{count + 1}", "s": status, "u": user["id"]},
    ).fetchone()["id"]  # fmt: skip

    # Jobs are created finished (or failed), so no worker ever claims them.
    failed = args.state == "failed"
    job = conn.execute(
        """
        insert into jobs (org_id, kind, status, payload, build_id, attempts, error, created_by,
                          created_at, started_at, finished_at)
        values (%(o)s, 'build', %(s)s, %(pl)s, %(b)s, 1, %(err)s, %(u)s, %(t0)s, %(t0)s, %(now)s)
        returning id
        """,
        {"o": org, "s": "failed" if failed else "succeeded", "pl": Jsonb({"build_id": str(build)}),
         "b": build, "u": user["id"], "t0": now - timedelta(minutes=3), "now": now,
         "err": Jsonb({"code": "logo_failed", "message": "The brand’s logo couldn’t be downloaded."}) if failed else None},
    ).fetchone()["id"]  # fmt: skip

    log = {"finished": LOG, "failed": LOG[:4], "building": []}[args.state]
    for i, message in enumerate(log):
        conn.execute(
            """
            insert into job_events (job_id, org_id, ts, level, message, data)
            values (%(j)s, %(o)s, %(ts)s, 'info', %(m)s, %(d)s)
            """,
            {"j": job, "o": org, "ts": now - timedelta(minutes=3) + timedelta(seconds=10 * i),
             "m": message, "d": Jsonb({"step": i} if i else {})},
        )  # fmt: skip

    if args.state == "finished":
        path = f"{org}/{build}/working.html"
        storage.upload("builds", path, PAGE.encode(), "text/html", upsert=True)
        conn.execute(
            "update builds set working_html_path = %(p)s, report = %(r)s, cost_usd = 0.21 where id = %(b)s",
            {"p": path, "r": Jsonb(report(str(template["id"]))), "b": build},
        )
    if failed:
        # The database marks a build failed when its job fails; seeded rows set it directly.
        conn.execute("update builds set status = 'failed' where id = %(b)s", {"b": build})

account[args.state] = {"build": str(build), "job": str(job)}
account_file.write_text(json.dumps(account))
print(json.dumps(account[args.state]))
