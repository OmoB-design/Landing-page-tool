"""Worker settings, read from the environment and services/worker/.env (pydantic-settings)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase (D32, D43)
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_secret_key: str = ""
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

    # Providers (paid; D13-D16). Keys come from .env; mock mode is the default (D15, D31).
    anthropic_api_key: str = ""
    fal_key: str = ""
    lp_model_copy: str = "claude-sonnet-5-5"
    lp_model_vision: str = "claude-sonnet-5-5"
    lp_model_analysis: str = "claude-sonnet-5-5"
    lp_model_agent: str = "claude-sonnet-5-5"
    lp_model_fast: str = "claude-haiku-5-5"
    lp_fal_t2i_model: str = "fal-ai/nano-banana-pro"
    lp_fal_edit_model: str = "fal-ai/nano-banana-pro/edit"
    lp_mock_llm: bool = True
    lp_mock_images: bool = True
    lp_provider_lock_minutes: float = 10.0

    # Page fetching. Private and local addresses are always refused (SSRF guard), except in tests.
    lp_allow_private_fetch: bool = False
    lp_fetch_timeout_seconds: float = 20.0
    lp_fetch_max_bytes: int = 6_000_000

    # Job loop (BUILD_SPEC §6.1)
    lp_worker_concurrency: int = 3
    lp_org_concurrency: int = 2
    lp_heartbeat_seconds: float = 10.0
    lp_stale_after_seconds: float = 90.0
    lp_poll_seconds: float = 1.0
    # The queue this worker's jobs go into and come from (D85): 'main' live and on a developer's
    # machine; the tests set their own, so the live worker never runs their jobs.
    lp_job_queue: str = "main"

    log_level: str = "info"

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
