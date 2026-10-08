"""The one pricing table (D13). Prices in USD; token prices per million tokens.

Anthropic prices checked at B0.4 (2026-10-06 model table, DECISIONS.md D42). fal prices are from
the reference tool; re-check them at B1.3 before real images are switched on. A model missing
from the table records a null cost and logs a warning; it never crashes a job.
"""

from dataclasses import dataclass
from decimal import Decimal

import structlog

log = structlog.get_logger()

MILLION = Decimal(1_000_000)


@dataclass(frozen=True)
class TokenPrice:
    input: Decimal
    output: Decimal
    cache_read: Decimal
    cache_write: Decimal  # 5-minute cache writes: 1.25x the input price
    # Some models charge more once a prompt exceeds a size (Haiku 5.5: above 100K tokens).
    long_threshold: int | None = None
    long_input: Decimal | None = None
    long_output: Decimal | None = None


def _p(inp: str, out: str, cache_read: str, cache_write: str) -> TokenPrice:
    return TokenPrice(Decimal(inp), Decimal(out), Decimal(cache_read), Decimal(cache_write))


TOKEN_PRICES: dict[str, TokenPrice] = {
    "claude-sonnet-5-5": _p("2.00", "10.00", "0.20", "2.50"),
    "claude-sonnet-5": _p("2.00", "10.00", "0.20", "2.50"),  # Sonnet 5.5's fallback model
    "claude-opus-5-5": _p("4.00", "20.00", "0.20", "5.00"),
    "claude-opus-5": _p("5.00", "25.00", "0.50", "6.25"),
    "claude-opus-4-8": _p("5.00", "25.00", "0.50", "6.25"),
    "claude-sonnet-4-6": _p("3.00", "15.00", "0.30", "3.75"),
    "claude-haiku-4-5": _p("1.00", "5.00", "0.10", "1.25"),
    "claude-haiku-5-5": TokenPrice(
        input=Decimal("0.10"),
        output=Decimal("0.50"),
        cache_read=Decimal("0.01"),
        cache_write=Decimal("0.125"),
        long_threshold=100_000,
        long_input=Decimal("0.50"),
        long_output=Decimal("2.50"),
    ),
}

# Price per generated or edited image.
IMAGE_PRICES: dict[str, Decimal] = {
    "fal-ai/nano-banana-pro": Decimal("0.15"),
    "fal-ai/nano-banana-pro/edit": Decimal("0.15"),
}


def token_cost(
    model: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> Decimal | None:
    price = TOKEN_PRICES.get(model)
    if price is None:
        log.warning("no price for model; cost recorded as null", model=model)
        return None
    prompt = input_tokens + cache_read_tokens + cache_write_tokens
    long = price.long_threshold is not None and prompt > price.long_threshold
    input_price = price.long_input if long and price.long_input else price.input
    output_price = price.long_output if long and price.long_output else price.output
    total = (
        input_tokens * input_price
        + output_tokens * output_price
        + cache_read_tokens * price.cache_read
        + cache_write_tokens * price.cache_write
    ) / MILLION
    return total.quantize(Decimal("0.000001"))


def image_cost(model: str, count: int = 1) -> Decimal | None:
    price = IMAGE_PRICES.get(model)
    if price is None:
        log.warning("no price for image model; cost recorded as null", model=model)
        return None
    return price * count
