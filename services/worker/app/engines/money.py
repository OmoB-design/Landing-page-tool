"""Prices as pages show them. Pure."""

from decimal import Decimal, InvalidOperation

SYMBOLS = {
    "USD": "$", "CAD": "CA$", "AUD": "A$", "NZD": "NZ$", "GBP": "£", "EUR": "€",
    "JPY": "¥", "INR": "₹", "CHF": "CHF ", "SEK": "kr ", "NOK": "kr ", "DKK": "kr ",
}  # fmt: skip
NO_DECIMALS = {"JPY"}


def format_price(amount: Decimal | float | str | None, currency: str | None) -> str | None:
    """'$21.00', '£19.95', '¥2400'; '21.00 XYZ' for currencies without a known symbol."""
    if amount is None or amount == "":
        return None
    try:
        value = Decimal(str(amount))
    except InvalidOperation:
        return None
    code = (currency or "").upper()
    number = f"{value:,.0f}" if code in NO_DECIMALS else f"{value:,.2f}"
    if code in SYMBOLS:
        return f"{SYMBOLS[code]}{number}"
    return f"{number} {code}".strip() if code else number
