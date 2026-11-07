# The worker on Railway (or any container host): one image for both services.
#   worker-api   default command below (FastAPI on Railway's $PORT; health check: /health)
#   worker-jobs  start command `python worker.py` (the job loop; stops cleanly on SIGTERM)
# Settings come from the host's variables (see .env.example); no .env file goes in the image.
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.11.20 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Chromium and its system libraries for brand fetches and page rendering (Playwright).
RUN uv run --no-sync playwright install --with-deps chromium

# Node and Shopify CLI for editable pages' theme files (B4.2, D121): the store's Theme Access
# password writes them through the CLI. Node comes from the official image (24 LTS, as .nvmrc);
# the CLI is pinned.
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install -g @shopify/cli@4.9.4 \
    && npm cache clean --force

COPY app ./app
COPY worker.py ./

ENV PATH="/app/.venv/bin:$PATH"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
