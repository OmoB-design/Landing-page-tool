"""A throwaway account for checking screens in the browser.

Signs up design-check-<time>@example.test on the running dev server, seeds its catalogue
(seed_catalog.py), and writes OUT/account.json (email, brand and product ids) and OUT/state.json
(the signed-in browser state for Playwright). Delete it afterwards with cleanup.py.

    cd services/worker && uv run python -I <this file> OUT [--base http://localhost:3000]
"""

import argparse
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
WORKER = HERE.parents[3] / "services" / "worker"

parser = argparse.ArgumentParser()
parser.add_argument("out")
parser.add_argument("--base", default="http://localhost:3000")
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)

try:
    urllib.request.urlopen(f"{args.base}/sign-in", timeout=120)
except OSError as exc:
    raise SystemExit(
        f"The dev server isn't answering at {args.base} ({exc}). Start it in the background from the "
        "repo root with `pnpm dev`, wait for /sign-in to return 200, then run this again."
    ) from exc

email = f"design-check-{int(time.time())}@example.test"
password = "correct-horse-battery-9"
(out / "account.json").write_text(json.dumps({"email": email}))  # so cleanup finds it if a later step fails

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1512, "height": 982})
    page = ctx.new_page()
    page.set_default_timeout(300_000)  # the first compile of a page can be slow here
    page.goto(f"{args.base}/sign-up", wait_until="networkidle")
    page.fill("#fullName", "Design Check")
    page.fill("#email", email)
    page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_url(lambda url: "/sign-up" not in url)
    ctx.storage_state(path=str(out / "state.json"))
    browser.close()

seeded = subprocess.check_output(
    ["uv", "run", "python", str(HERE / "seed_catalog.py"), email],
    cwd=WORKER,
    env={**os.environ, "PYTHONPATH": "."},
).decode().strip().splitlines()[-1]
(out / "account.json").write_text(json.dumps({"email": email, **json.loads(seeded)}))
print(json.dumps({"email": email, **json.loads(seeded)}))
