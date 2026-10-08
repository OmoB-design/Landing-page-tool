"""Worker internal API. B0.1 exposes only /health; JWT-verified routes arrive in B0.4."""

from fastapi import FastAPI

app = FastAPI(title="LP Platform worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
