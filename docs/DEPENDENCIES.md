# DEPENDENCIES.md — Packages, services and environment

**Versions:** install the latest stable release of each package at B0.1 and pin through the lockfiles (`pnpm-lock.yaml`, `uv.lock`). Record the major versions you installed in the B0.1 Build Report. Do not add a dependency that is not listed here without proposing it in the build plan (name, why, alternatives, size/maintenance).

---

## 1. Tooling (owner installs locally)

| Tool | Purpose |
|---|---|
| Node.js LTS | web app |
| pnpm | package manager and workspaces |
| Python 3.12 | worker |
| uv | Python package and venv manager |
| Docker Desktop | local Supabase stack |
| Supabase CLI | local stack, migrations, type generation |
| Git | version control |
| Playwright browsers | installed by `uv run playwright install chromium` in the worker |
| Claude Code + Figma MCP | build and design handoff |

---

## 2. Web app (`apps/web`)

| Package | Purpose |
|---|---|
| `next`, `react`, `react-dom` | App Router framework |
| `typescript` | strict mode |
| `tailwindcss` (v4), `@tailwindcss/postcss` | styling with `@theme` tokens |
| shadcn CLI (`shadcn`) + generated components | starter UI primitives |
| Radix primitives (pulled in by shadcn) | accessible behaviour |
| `class-variance-authority`, `cn` | component variants and class merging (shadcn). B0.3: shadcn 4.x ships `cn` (by shadcn, one package replacing `clsx` + `tailwind-merge`); configured with our tokens in `lib/utils.ts` |
| `shadcn` (runtime), `tw-animate-css` | base CSS (`shadcn/tailwind.css`: keyframes, `data-*` variants) and animation utilities imported by `globals.css` (B0.3) |
| `lucide-react` | icons (only icon set) |
| `motion` (import from `motion/react`) | animation; **never** `framer-motion` |
| `@tanstack/react-query` | server state, polling |
| `zod` | validation |
| `react-hook-form`, `@hookform/resolvers` | forms |
| `date-fns` | dates |
| `@dnd-kit/core`, `@dnd-kit/sortable` | section reorder |
| `sonner` | toasts |
| `cmdk` (via shadcn Command) | command palette |
| `recharts` | analytics charts |
| `@supabase/supabase-js`, `@supabase/ssr` | auth and data |
| `nuqs` (optional) | URL state for the wizard; propose before adding |
| Dev: `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@testing-library/react`, `@playwright/test` | quality and tests |
| Dev: `@testing-library/dom`, `jsdom` | B0.3b: required peer of `@testing-library/react`, and the DOM environment for component tests (`// @vitest-environment jsdom`) |

---

## 3. Worker (`services/worker`)

| Package | Purpose |
|---|---|
| `fastapi`, `uvicorn[standard]` | internal API |
| `pydantic` (v2), `pydantic-settings` | models and config |
| `psycopg[binary,pool]` (v3) | Postgres |
| `langgraph`, `langgraph-checkpoint-postgres` | pipeline graph + checkpoints |
| `anthropic` | Claude SDK |
| `fal-client` | fal.ai SDK |
| `httpx` | HTTP (Vercel, Shopify, fetch ladder) |
| `beautifulsoup4`, `lxml` | HTML parsing and transforms |
| `tinycss2` | CSS parsing for recolour and url() rewriting |
| `playwright` | rendering, screenshots, fetch fallback, parity |
| `Pillow` | thumbnails, mock images, resizing |
| `python-jose[cryptography]` or `pyjwt` | verify Supabase JWTs |
| `supabase` (python) or direct storage REST via httpx | storage and vault RPCs; choose one at B0.4 |
| `tenacity` | retry policies |
| `structlog` | structured logging |
| Dev: `pytest`, `pytest-asyncio`, `ruff`, `mypy`, `respx` (httpx mocking) | quality and tests |

---

## 4. External services and accounts

| Service | Used for | Needed by | Owner creates |
|---|---|---|---|
| Supabase | Postgres, Auth, Storage, Vault | B0.2 | project (or local only at first) |
| Anthropic API | copy, vision, analysis, agent | B0.4 / B0.6 | API key |
| fal.ai | image generation and edits | B1.3 (mock before) | API key |
| Vercel | static publish | B1.5 | access token (+ team id if a team) |
| Shopify | product pull (Admin), draft page, editable publish | B1.5 | development store + custom app |
| Worker host | runs worker + Chromium | when deploying | decide (O6): must support Playwright Chromium |
| Web host | Next.js | when deploying | Vercel is natural |
| Residential proxy | clone fetch fallback | M2, optional, off by default | only if the owner decides to use it |
| Figma (+ MCP) | design source | Phase 2 | files and frame links |

---

## 5. Environment variables

### `apps/web/.env.local`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key (RLS-limited); replaces the legacy anon key (D32, B0.2) |
| `WORKER_API_URL` | internal worker API base URL (server-side only) |
| `NEXT_PUBLIC_APP_URL` | public URL of the web app (OAuth redirects, links) |

Never expose the secret (service-role) key to the web app.

### `services/worker/.env`

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | — | Supabase URL |
| `SUPABASE_SECRET_KEY` | — | secret key, service-role access (worker only); replaces the legacy service_role key (D32, B0.2) |
| `SUPABASE_JWT_SECRET` | — | verify user JWTs; may be replaced by JWKS verification at B0.4 |
| `DATABASE_URL` | — | direct Postgres connection (queue, checkpoints) |
| `ANTHROPIC_API_KEY` | — | Claude |
| `FAL_KEY` | — | fal.ai |
| `LP_MODEL_COPY` | `claude-sonnet-5-5` | copy rewrite |
| `LP_MODEL_VISION` | `claude-sonnet-5-5` | image plan, product fidelity, mobile AI |
| `LP_MODEL_ANALYSIS` | `claude-sonnet-5-5` | blueprint, autofetch, enrichment, briefing, angles |
| `LP_MODEL_AGENT` | `claude-sonnet-5-5` | edit agent |
| `LP_MODEL_FAST` | `claude-haiku-4-5-20251001` | persona and small helper calls |
| `LP_FAL_T2I_MODEL` | `fal-ai/nano-banana-pro` | text-to-image |
| `LP_FAL_EDIT_MODEL` | `fal-ai/nano-banana-pro/edit` | edits and compositing |
| `LP_MOCK_IMAGES` | `1` | mock images (set `0` explicitly for real) |
| `LP_MOCK_LLM` | `0` | optional fake LLM for UI work |
| `LP_FETCH_PROXY` | empty | residential proxy URL (M2, flag-gated) |
| `LP_RESIDUE_MIN_SCORE` | `85` | publish gate threshold |
| `LP_WORKER_CONCURRENCY` | `3` | jobs per worker process |
| `LP_ORG_CONCURRENCY` | `2` | concurrent jobs per org |
| `SHOPIFY_API_VERSION` | current stable at implementation time | Admin GraphQL version |
| `APP_URL` | — | for OAuth redirect URIs |
| `LOG_LEVEL` | `info` | logging |

Per-org secrets (Vercel tokens, Shopify client secrets and access tokens) are **not** environment variables. They are stored in Supabase Vault and referenced by id from `integrations` / `store_connections`.

---

## 6. Cost reference (from the reference tool; verify current pricing)

| Item | Approximate cost |
|---|---|
| One full build with real images | $1–3 |
| One build with mock images (copy only) | cents |
| fal text-to-image / edit call | ~$0.15 each |
| Product fidelity check | ~$0.02 + $0.15 per fix |
