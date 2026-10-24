# Verifying in the browser

The dev server (`pnpm dev`: web on :3000, worker API on :8000, the job loop) is often already
running — it may be the owner's. Check with `curl -s -o /dev/null -w "%{http_code}" localhost:3000/sign-in`
and `lsof -iTCP:3000 -sTCP:LISTEN`. If nothing answers, start it in the background from the repo
root (`pnpm dev > <scratchpad>/pnpm-dev.log 2>&1`, run in background) and wait for /sign-in to
return 200; the first page compile takes a minute here. Never stop a server you didn't start.
The dev database is the cloud project: everything you seed is real rows, so use throwaway accounts
and delete them.

**Never trigger a real pipeline run to reach a state.** The local worker runs real AI
(`LP_MOCK_LLM=0`), and the local job loop claims any queued `build` job in the shared database.
Seed the state, or intercept the browser's job polling. A test that must create jobs renames the
job kind (`test_build`, see `services/worker/tests/test_api.py`) or cancels them at once.

## The scripts (in this skill's `scripts/`)

Run from `services/worker` (they import `app.*`; `SK` is this skill's folder):

```bash
SK=../../.claude/skills/figma-screen-build/scripts
OUT=<scratchpad>/check                       # any scratch folder
uv run python -I $SK/new_account.py $OUT     # signs up design-check-<time>@example.test, seeds brands and products,
                                             # writes $OUT/account.json and $OUT/state.json (signed-in browser state)
PYTHONPATH=. uv run python $SK/seed_build.py $OUT --state finished   # BRE-1: a page, a report, a finished job with its log
PYTHONPATH=. uv run python $SK/seed_build.py $OUT --state failed     # BRE-2: failed on step 4, with the reason
PYTHONPATH=. uv run python $SK/seed_build.py $OUT --state building   # BRE-3: no page yet; its job is finished, so
                                                                     # no worker touches it — fake progress in the browser
PYTHONPATH=. uv run python $SK/cleanup.py $OUT                       # stored files, then the org and the user
python3 $SK/compare_crops.py figma.png app.png x0,y0,x1,y1 out.png [scale]
```

Each `seed_build.py` run adds the build's ids to `account.json` (`finished`, `failed`, `building`).

## Playwright patterns

Use the worker's venv (`uv run python -I script.py`), a 1512 × 982 viewport (the owner's screen; the
Figma frames are 1512 wide), `device_scale_factor=2` for close-ups, and the saved state:

```python
ctx = browser.new_context(viewport={"width": 1512, "height": 982}, color_scheme="dark",
                          storage_state=f"{OUT}/state.json")
page = ctx.new_page()
page.add_init_script("try{localStorage.setItem('lp-theme','dark')}catch(e){}")  # the app's theme switch
```

- Fake a job's state by intercepting its polling — the page reads `/api/jobs/<id>`:

```python
real = page.request.get(f"{BASE}/api/jobs/{job_id}").json()
def make(status, steps):
    def handle(route):
        j = dict(real, status=status, finished_at=None)
        j["events"] = [{"id": 1, "ts": real["created_at"], "level": "info", "message": "Started", "data": {}}] + [
            {"id": 2 + k, "ts": real["created_at"], "level": "info", "message": f"Step {k + 1}", "data": {"step": k + 1}}
            for k in range(steps)]
        if status == "failed": j["error"] = {"code": "x", "message": "The reason."}   # `code` is required
        route.fulfill(json=j)
    return handle
page.route(f"**/api/jobs/{job_id}", make("running", 3))
```

  (A route handler with default arguments gets the request as its second argument; build it with a
  factory as above.)
- Intercept a mutation instead of running it: `page.route("**/api/builds/<id>/retry", lambda r: r.fulfill(status=409, json={"error": "…"}))`.
  To prove a route reaches the worker without side effects, call it for an id that doesn't exist and
  expect the worker's 404.
- Freeze or reveal: `reduced_motion="reduce"` on the context; 390 × 844 for phone width; a tall
  viewport (1512 × 2029, the frames' height) to see a whole panel without scrolling.
- Measure instead of eyeballing: `getComputedStyle(el).getPropertyValue('--hairline-stroke')`,
  bounding boxes for gaps, `getBBox()` of an svg group for a drawing's extent, a section's height
  across a demo run to prove it doesn't grow.
- Capture console errors and `pageerror`; a server-component error shows as a 500 page — read the
  dev log (`grep -n "Error" <pnpm-dev log> | tail`).
- Elements that only show on hover or behind Next's dev badge: click the label or move the control.

## Comparing with Figma

Screenshot the same state in the app at the frame's size, crop the same regions from both, and look
at them side by side (`compare_crops.py`). Compare: positions (±1 px is rounding), sizes, colours,
stroke weight, text wrap. Differences from Figma's own inconsistencies get a line in the report, not
a fix.

## Checks that run slowly here

The machine is an Intel Mac with 8 GB: Vitest needs `--maxWorkers=2`; long commands go in the
background and you wait for the notification; a Bash call stops at 120 s by default.
