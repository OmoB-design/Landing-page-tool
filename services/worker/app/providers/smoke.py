"""One real Claude call to check the API key works (B0.4b live check). Costs well under $0.01
with Claude Haiku 5.5. Run only with the owner's go:

    uv run python -m app.providers.smoke --org <org uuid>

The call is recorded in that org's ledger (node "smoke")."""

import argparse
from uuid import UUID

from app.providers import anthropic
from app.providers.ledger import cost_context


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", type=UUID, required=True, help="org to record the cost against")
    args = parser.parse_args()
    with cost_context(args.org, node="smoke"):
        result = anthropic.generate(
            role="fast",
            ledger_kind="other",
            prompt="Reply with exactly: LP Platform key check OK",
            max_tokens=30,
            mock=False,
        )
    print(f"model:   {result.model}")
    print(f"reply:   {result.text}")
    print(f"tokens:  {result.input_tokens} in / {result.output_tokens} out")
    print(f"cost:    ${result.cost_usd}")


if __name__ == "__main__":
    main()
