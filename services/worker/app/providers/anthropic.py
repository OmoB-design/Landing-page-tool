"""Claude calls through the official Anthropic SDK (D16). Model names come from settings (D14).

- Mock mode (LP_MOCK_LLM=1, the default; D31) returns a canned reply and records a $0 ledger
  row, so nothing paid runs unless mock mode is explicitly off.
- Retries: the SDK retries connection errors, 408/409/429 and 5xx with backoff (2 retries).
- Refusals: models that support it get the server-side `fallbacks: "default"` option (D45);
  each attempt is priced at the rates of the model that ran it. A refusal from the whole
  chain raises LLMRefusalError after the cost is recorded.
"""

import json
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Any, Literal

import anthropic
from pydantic import BaseModel

from app.config import get_settings
from app.providers import cost, ledger

ModelRole = Literal["copy", "vision", "analysis", "agent", "fast"]
Effort = Literal["low", "medium", "high", "xhigh", "max"]

# Models that accept the server-side fallback option ("default" form, Claude API only).
FALLBACK_MODELS = frozenset(
    {"claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5"}
)
FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str  # the model that produced the reply (a fallback model if one served it)
    requested_model: str
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal | None
    stop_reason: str | None
    fell_back: bool
    mock: bool

    def json(self) -> Any:
        return json.loads(self.text)


class LLMRefusalError(Exception):
    """The model (and any fallback) declined. Callers decide what to do (e.g. the copy pass
    keeps the source text, D23)."""

    def __init__(self, category: str | None, explanation: str | None) -> None:
        super().__init__(f"The model declined the request ({category or 'no category'}).")
        self.category = category
        self.explanation = explanation


class LLMNotConfiguredError(RuntimeError):
    pass


def model_for(role: ModelRole) -> str:
    settings = get_settings()
    return {
        "copy": settings.lp_model_copy,
        "vision": settings.lp_model_vision,
        "analysis": settings.lp_model_analysis,
        "agent": settings.lp_model_agent,
        "fast": settings.lp_model_fast,
    }[role]


@lru_cache
def _client() -> anthropic.Anthropic:
    key = get_settings().anthropic_api_key
    if not key:
        raise LLMNotConfiguredError("ANTHROPIC_API_KEY is not set in services/worker/.env.")
    return anthropic.Anthropic(api_key=key, max_retries=2)


def generate(
    *,
    role: ModelRole,
    ledger_kind: ledger.LedgerKind,
    prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    system: str | None = None,
    max_tokens: int = 16000,
    effort: Effort | None = None,
    json_schema: dict[str, Any] | None = None,
    mock: bool | None = None,
    mock_text: str | None = None,
) -> LLMResult:
    """One Messages API call. Give `prompt` (a single user turn) or `messages`. With
    `json_schema`, the reply is constrained to JSON matching it (structured outputs)."""
    model = model_for(role)
    turns: list[dict[str, Any]] = messages or [{"role": "user", "content": prompt or ""}]
    use_mock = get_settings().lp_mock_llm if mock is None else mock
    if use_mock:
        return _mock_reply(model, turns, system, json_schema, mock_text, ledger_kind)

    output_config: dict[str, Any] = {}
    if effort:
        output_config["effort"] = effort
    if json_schema:
        output_config["format"] = {"type": "json_schema", "schema": json_schema}
    # Request params are TypedDicts in the SDK; built as a plain dict here and passed through.
    params: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": turns}
    if system:
        params["system"] = system
    if output_config:
        params["output_config"] = output_config

    client = _client()
    response: Any  # Message or BetaMessage; both expose the fields read below
    if model in FALLBACK_MODELS:
        response = client.beta.messages.create(**params, betas=[FALLBACK_BETA], fallbacks="default")
    else:
        response = client.messages.create(**params)

    total_cost, input_tokens, output_tokens, fell_back = _price(response, model)
    ledger.record(
        kind=ledger_kind,
        provider="anthropic",
        model=response.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=total_cost,
    )
    if response.stop_reason == "refusal":
        details = getattr(response, "stop_details", None)
        raise LLMRefusalError(
            getattr(details, "category", None), getattr(details, "explanation", None)
        )
    text = "".join(block.text for block in response.content if block.type == "text")
    return LLMResult(
        text=text,
        model=response.model,
        requested_model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=total_cost,
        stop_reason=response.stop_reason,
        fell_back=fell_back,
        mock=False,
    )


def _price(response: Any, requested_model: str) -> tuple[Decimal | None, int, int, bool]:
    """Cost and token totals across every attempt (usage.iterations is the per-attempt source
    of truth when a fallback ran); each attempt is priced at its own model's rates."""
    usage = response.usage
    iterations = getattr(usage, "iterations", None) or []
    attempts = iterations or [usage]
    fell_back = any(getattr(entry, "type", None) == "fallback_message" for entry in iterations)
    total: Decimal | None = Decimal(0)
    input_tokens = output_tokens = 0
    for entry in attempts:
        model = getattr(entry, "model", None) or (
            response.model if entry is usage else requested_model
        )
        entry_in = entry.input_tokens or 0
        entry_out = entry.output_tokens or 0
        input_tokens += entry_in
        output_tokens += entry_out
        entry_cost = cost.token_cost(
            model,
            input_tokens=entry_in,
            output_tokens=entry_out,
            cache_read_tokens=getattr(entry, "cache_read_input_tokens", None) or 0,
            cache_write_tokens=getattr(entry, "cache_creation_input_tokens", None) or 0,
        )
        total = None if total is None or entry_cost is None else total + entry_cost
    return total, input_tokens, output_tokens, fell_back


def _mock_reply(
    model: str,
    turns: list[dict[str, Any]],
    system: str | None,
    json_schema: dict[str, Any] | None,
    mock_text: str | None,
    ledger_kind: ledger.LedgerKind,
) -> LLMResult:
    if mock_text is not None:
        text = mock_text
    elif json_schema is not None:
        text = json.dumps(mock_from_schema(json_schema))
    else:
        text = f"Mock reply from {model}."
    prompt_chars = len(system or "") + len(json.dumps(turns))
    input_tokens, output_tokens = prompt_chars // 4, len(text) // 4
    ledger.record(
        kind=ledger_kind,
        provider="anthropic",
        model=f"mock/{model}",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=Decimal(0),
    )
    return LLMResult(
        text=text,
        model=f"mock/{model}",
        requested_model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=Decimal(0),
        stop_reason="end_turn",
        fell_back=False,
        mock=True,
    )


_SCHEMA_DROP = ("title", "default", "minItems", "maxItems", "minLength", "maxLength")


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """A Pydantic model's JSON schema in the shape structured outputs accept: every object
    closed (additionalProperties false), references inlined, titles and length limits dropped
    (callers trim lists themselves)."""
    schema = model.model_json_schema()
    defs: dict[str, Any] = schema.pop("$defs", {})

    def clean(node: Any) -> Any:
        if isinstance(node, list):
            return [clean(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return clean(defs[str(node["$ref"]).rsplit("/", 1)[-1]])
        out = {
            key: clean(value)
            for key, value in node.items()
            if not (key in _SCHEMA_DROP and not isinstance(value, dict))
        }
        if out.get("type") == "object":
            out["additionalProperties"] = False
        return out

    result: dict[str, Any] = clean(schema)
    return result


def mock_from_schema(schema: dict[str, Any]) -> Any:
    """A minimal value matching a JSON schema, for mock replies to structured-output calls."""
    if "enum" in schema:
        return schema["enum"][0]
    if "const" in schema:
        return schema["const"]
    kind = schema.get("type")
    if isinstance(kind, list):
        kind = next((k for k in kind if k != "null"), "null")
    if kind == "object":
        props: dict[str, Any] = schema.get("properties", {})
        return {name: mock_from_schema(props[name]) for name in schema.get("required", [])}
    if kind == "array":
        return []
    if kind == "string":
        return "mock"
    if kind in ("integer", "number"):
        return schema.get("minimum", 0)
    if kind == "boolean":
        return False
    return None
