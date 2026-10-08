"""Providers: cost table, ledger recording, Anthropic (mock + fake SDK client), fal (mock + fake
client with lock detection), storage and asset dedupe. No live provider is ever called."""

import io
import uuid
from collections.abc import Iterator
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from app.db import transaction
from app.providers import anthropic, cost, fal, ledger, locks, storage
from tests.conftest import DbUser, needs_db


# ── cost table (no database) ──────────────────────────────────────────────────
def test_sonnet_token_cost() -> None:
    # 1M in at $2 + 0.5M out at $10 = $7
    assert cost.token_cost(
        "claude-sonnet-5-5", input_tokens=1_000_000, output_tokens=500_000
    ) == Decimal("7.000000")


def test_cache_tokens_are_priced_separately() -> None:
    value = cost.token_cost(
        "claude-sonnet-5-5",
        input_tokens=0,
        output_tokens=0,
        cache_read_tokens=1_000_000,
        cache_write_tokens=1_000_000,
    )
    assert value == Decimal("2.700000")  # $0.20 read + $2.50 write


def test_haiku_long_prompts_cost_more() -> None:
    short = cost.token_cost("claude-haiku-5-5", input_tokens=100_000, output_tokens=0)
    long = cost.token_cost("claude-haiku-5-5", input_tokens=100_001, output_tokens=0)
    assert short == Decimal("0.010000")
    assert long is not None and short is not None and long >= short * 5  # $0.50 vs $0.10 per M


def test_unknown_models_cost_null() -> None:
    assert cost.token_cost("claude-unknown", input_tokens=10, output_tokens=10) is None
    assert cost.image_cost("fal-ai/unknown") is None
    assert cost.image_cost("fal-ai/nano-banana-pro", 2) == Decimal("0.30")


def test_calls_outside_a_cost_context_are_refused() -> None:
    with pytest.raises(ledger.MissingCostContextError):
        anthropic.generate(role="fast", ledger_kind="other", prompt="hi", mock=True)


def test_mock_reply_matches_a_json_schema() -> None:
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "count": {"type": "integer", "minimum": 1},
            "tags": {"type": "array", "items": {"type": "string"}},
            "kind": {"enum": ["a", "b"]},
            "nested": {
                "type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"],
            },
        },
        "required": ["title", "count", "tags", "kind", "nested"],
    }  # fmt: skip
    assert anthropic.mock_from_schema(schema) == {
        "title": "mock",
        "count": 1,
        "tags": [],
        "kind": "a",
        "nested": {"ok": False},
    }


def test_aspect_ratio_picks_the_closest() -> None:
    assert fal.aspect_ratio(1024, 768) == "4:3"
    assert fal.aspect_ratio(1920, 1080) == "16:9"
    assert fal.aspect_ratio(500, 500) == "1:1"


def test_mock_image_has_the_requested_size() -> None:
    with Image.open(io.BytesIO(fal.mock_image(640, 480))) as image:
        assert image.size == (640, 480) and image.format == "JPEG"


# ── fakes ─────────────────────────────────────────────────────────────────────
def usage(**fields: Any) -> SimpleNamespace:
    base = {"input_tokens": 1000, "output_tokens": 200, "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0, "iterations": None}  # fmt: skip
    return SimpleNamespace(**{**base, **fields})


def message(model: str, *, text: str = "Hello", stop_reason: str = "end_turn", **extra: Any) -> Any:
    return SimpleNamespace(
        model=model,
        content=[SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason,
        stop_details=extra.pop("stop_details", None),
        usage=extra.pop("usage", usage()),
    )


class FakeMessages:
    def __init__(self, response: Any) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.response


class FakeAnthropic:
    def __init__(self, response: Any) -> None:
        self.messages = FakeMessages(response)
        self.beta = SimpleNamespace(messages=FakeMessages(response))


@pytest.fixture
def fake_anthropic(monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    holder: dict[str, FakeAnthropic] = {}

    def install(response: Any) -> FakeAnthropic:
        holder["client"] = FakeAnthropic(response)
        monkeypatch.setattr(anthropic, "_client", lambda: holder["client"])
        return holder["client"]

    yield install


def ledger_rows(org_id: uuid.UUID) -> list[dict[str, Any]]:
    with transaction() as conn:
        rows = conn.execute(
            "select * from ledger_entries where org_id = %(org)s order by id", {"org": org_id}
        ).fetchall()
    return [dict(row) for row in rows]


# ── Anthropic ─────────────────────────────────────────────────────────────────
@needs_db
def test_mock_llm_records_a_zero_cost_row(user: DbUser) -> None:
    with ledger.cost_context(user.org_id, node="unit"):
        result = anthropic.generate(role="fast", ledger_kind="other", prompt="hi", mock=True)
    assert result.mock and result.text == "Mock reply from claude-haiku-5-5."
    [row] = ledger_rows(user.org_id)
    assert row["model"] == "mock/claude-haiku-5-5" and row["cost_usd"] == Decimal(0)
    assert row["node"] == "unit" and row["provider"] == "anthropic"


@needs_db
def test_sonnet_requests_use_the_server_side_fallback(user: DbUser, fake_anthropic: Any) -> None:
    client = fake_anthropic(message("claude-sonnet-5-5"))
    with ledger.cost_context(user.org_id):
        result = anthropic.generate(
            role="copy",
            ledger_kind="copy",
            prompt="Rewrite this",
            effort="medium",
            json_schema={"type": "object", "properties": {}, "required": []},
            mock=False,
        )
    [call] = client.beta.messages.calls
    assert client.messages.calls == []
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["output_config"] == {
        "effort": "medium",
        "format": {
            "type": "json_schema", "schema": {"type": "object", "properties": {}, "required": []},
        },
    }  # fmt: skip
    # 1000 in at $2 + 200 out at $10 per million = $0.004
    assert result.cost_usd == Decimal("0.004000") and not result.fell_back
    [row] = ledger_rows(user.org_id)
    assert row["model"] == "claude-sonnet-5-5" and row["kind"] == "copy"
    assert row["input_tokens"] == 1000 and row["output_tokens"] == 200
    assert row["cost_usd"] == Decimal("0.0040")


@needs_db
def test_sub_cent_costs_are_kept(user: DbUser, fake_anthropic: Any) -> None:
    fake_anthropic(message("claude-haiku-5-5", usage=usage(input_tokens=25, output_tokens=11)))
    with ledger.cost_context(user.org_id):
        anthropic.generate(role="fast", ledger_kind="other", prompt="hi", mock=False)
    [row] = ledger_rows(user.org_id)
    assert row["cost_usd"] == Decimal("0.000008")  # not rounded to $0.0000


@needs_db
def test_haiku_requests_have_no_fallback(user: DbUser, fake_anthropic: Any) -> None:
    client = fake_anthropic(message("claude-haiku-5-5"))
    with ledger.cost_context(user.org_id):
        anthropic.generate(role="fast", ledger_kind="other", prompt="hi", mock=False)
    [call] = client.messages.calls
    assert "fallbacks" not in call and client.beta.messages.calls == []


@needs_db
def test_fallback_attempts_are_priced_per_model(user: DbUser, fake_anthropic: Any) -> None:
    iterations = [
        SimpleNamespace(type="message", model=None, input_tokens=1000, output_tokens=0,
                        cache_read_input_tokens=0, cache_creation_input_tokens=0),
        SimpleNamespace(type="fallback_message", model="claude-sonnet-5", input_tokens=1000,
                        output_tokens=500, cache_read_input_tokens=0,
                        cache_creation_input_tokens=0),
    ]  # fmt: skip
    fake_anthropic(message("claude-sonnet-5", usage=usage(iterations=iterations)))
    with ledger.cost_context(user.org_id):
        result = anthropic.generate(role="copy", ledger_kind="copy", prompt="x", mock=False)
    assert result.fell_back and result.model == "claude-sonnet-5"
    # declined attempt: 1000 in on Sonnet 5.5 ($0.002); fallback: 1000 in + 500 out on Sonnet 5
    assert result.cost_usd == Decimal("0.009000")
    assert result.input_tokens == 2000 and result.output_tokens == 500


@needs_db
def test_a_refusal_is_recorded_then_raised(user: DbUser, fake_anthropic: Any) -> None:
    details = SimpleNamespace(category="general_harms", explanation="declined")
    fake_anthropic(
        message("claude-sonnet-5-5", text="", stop_reason="refusal", stop_details=details)
    )
    with ledger.cost_context(user.org_id), pytest.raises(anthropic.LLMRefusalError) as caught:
        anthropic.generate(role="copy", ledger_kind="copy", prompt="x", mock=False)
    assert caught.value.category == "general_harms"
    assert len(ledger_rows(user.org_id)) == 1


# ── fal ───────────────────────────────────────────────────────────────────────
@needs_db
def test_mock_image_records_a_zero_cost_row(user: DbUser) -> None:
    with ledger.cost_context(user.org_id):
        result = fal.generate_image(prompt="scene", width=320, height=240, mock=True)
    assert result.mock and (result.width, result.height) == (320, 240)
    [row] = ledger_rows(user.org_id)
    assert row["model"] == "mock/fal-ai/nano-banana-pro" and row["units"] == Decimal(1)
    assert row["kind"] == "image" and row["cost_usd"] == Decimal(0)


@needs_db
def test_a_locked_fal_account_sets_an_org_lock_and_fails_fast(
    user: DbUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = []

    class LockedClient:
        def subscribe(self, model: str, arguments: dict[str, Any]) -> Any:
            calls.append(model)
            raise RuntimeError("User is locked. Reason: Exhausted balance. Top up your balance.")

    monkeypatch.setattr(fal, "_client", lambda: LockedClient())
    with ledger.cost_context(user.org_id):
        with pytest.raises(locks.ProviderLockedError) as first:
            fal.generate_image(prompt="scene", mock=False)
        with pytest.raises(locks.ProviderLockedError):
            fal.generate_image(prompt="scene", mock=False)
    assert "paused for this workspace" in first.value.message
    assert calls == ["fal-ai/nano-banana-pro"]  # the second call never reached fal
    assert locks.active_until(user.org_id, "fal") is not None
    assert ledger_rows(user.org_id) == []  # nothing was charged


@needs_db
def test_expired_locks_are_cleared(user: DbUser) -> None:
    locks.lock(user.org_id, "fal", "test", minutes=-1)
    assert locks.active_until(user.org_id, "fal") is None
    locks.clear_expired(user.org_id)
    with transaction() as conn:
        row = conn.execute(
            "select count(*) as n from provider_locks where org_id = %(org)s", {"org": user.org_id}
        ).fetchone()
    assert row is not None and row["n"] == 0


# ── storage ───────────────────────────────────────────────────────────────────
@needs_db
def test_store_asset_uploads_once_per_content(user: DbUser) -> None:
    data = fal.mock_image(200, 100, label=f"T{uuid.uuid4().hex[:6]}")
    first = storage.store_asset(user.org_id, data, "image/jpeg")
    try:
        again = storage.store_asset(user.org_id, data, "image/jpeg")
        assert again.id == first.id
        assert (first.width, first.height, first.bytes) == (200, 100, len(data))
        assert first.path.startswith(f"{user.org_id}/") and first.path.endswith(".jpg")
        assert storage.download("assets", first.path) == data
        assert first.url.endswith(f"/storage/v1/object/public/assets/{first.path}")
    finally:
        storage.remove("assets", [first.path])
