"""Seeds a throwaway account's catalogue: brands BREZ (full palette, fonts, voice), Graza and
Allbirds, three BREZ products, and a briefing on the first. Prints {"brand", "product"}.

    cd services/worker && PYTHONPATH=. uv run python <this file> design-check-…@example.test
"""

import json
import sys
from datetime import UTC, datetime, timedelta

from psycopg.types.json import Jsonb

from app.db import transaction

email = sys.argv[1]
assert email.startswith("design-check-") and email.endswith("@example.test"), email
now = datetime.now(UTC)

with transaction() as conn:
    user = conn.execute("select id from auth.users where email = %(e)s", {"e": email}).fetchone()
    assert user is not None, "sign up first (new_account.py)"
    org = conn.execute(
        "select org_id from org_members where user_id = %(u)s", {"u": user["id"]}
    ).fetchone()["org_id"]

    def brand(name: str, prefix: str, url: str, palette: dict, **kw: object) -> str:
        row = conn.execute(
            """
            insert into brands (org_id, name, prefix, url, tagline, voice, voice_examples, palette,
                                fonts, created_by, updated_at)
            values (%(o)s, %(n)s, %(p)s, %(url)s, %(t)s, %(v)s, %(ve)s, %(pal)s, %(f)s, %(u)s, %(up)s)
            returning id
            """,
            {
                "o": org, "n": name, "p": prefix, "url": url, "t": kw.get("tagline"),
                "v": kw.get("voice"), "ve": kw.get("examples", []), "pal": Jsonb(palette),
                "f": Jsonb(kw.get("fonts", {})), "u": user["id"], "up": now - timedelta(hours=8),
            },
        ).fetchone()  # fmt: skip
        return str(row["id"])

    brez = brand(
        "BREZ", "BRE", "https://www.drinkbrez.com",
        {"primary": "#e3f98a", "dark": "#b3dd0b", "tint": "#f6f8ed", "accent": "#0000ee"},
        tagline="Drink better, feel better",
        voice="Upbeat, confident, casual. Short, benefit-led lines about how the drinks make you feel.",
        examples=["Drink better, feel better", "Pure fun formulated"],
        fonts={"heading": "PP Eiko Regular", "body": "PP Fragment"},
    )  # fmt: skip
    brand("Graza", "GRZ", "https://www.graza.co", {"primary": "#526e0c"})
    brand("Allbirds", "ALL", "https://www.allbirds.com", {"primary": "#216e55"})

    products = []
    for i in range(3):
        row = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, url, currency, price, description,
                                  usps, specs, selling_context, pulled_at, pull_source, updated_at)
            values (%(o)s, %(b)s, %(h)s, 'OG X Black Cherry Lemonade', %(url)s, 'USD', 56, %(d)s,
                    %(usps)s, %(specs)s, %(sc)s, %(pa)s, 'jsonld', %(up)s)
            returning id
            """,
            {
                "o": org, "b": brez, "h": f"og-x-black-cherry-{i}",
                "url": "https://www.drinkbrez.com/products/og-x-black-cherry-lemonade",
                "d": "A fruit-forward black cherry lemonade tonic with THC and CBD.",
                "usps": Jsonb(["Feel-good lift in 5 to 10 minutes", "No hangover"]),
                "specs": Jsonb([{"label": "Size", "value": "12 fl. oz"}]),
                "sc": "Adults 21+ looking for an alcohol alternative.",
                "pa": now - timedelta(hours=13), "up": now - timedelta(hours=12),
            },
        ).fetchone()  # fmt: skip
        products.append(str(row["id"]))

    briefing = {
        "audiences": [
            {"name": "Sober-Curious Social Drinkers", "description": "Adults 21+ cutting back on alcohol who want a drink that still feels like a treat."},
            {"name": "Curious THC Beverage Beginners", "description": "Adults 21+ new to THC drinks who want a gentle start."},
        ],
        "benefits": ["A feel-good lift in about 5 to 10 minutes.", "The ritual of a drink without the hangover."],
        "features": ["10mg THC and 20mg CBD per 12 fl. oz can.", "Made with organic lion's mane extract."],
        "objections": ["Is it legal where I live? It is hemp-derived and legal in most states."],
    }  # fmt: skip
    conn.execute(
        """
        insert into product_strategy (org_id, product_id, kind, data, model)
        values (%(o)s, %(p)s, 'briefing', %(d)s, 'test')
        """,
        {"o": org, "p": products[0], "d": Jsonb(briefing)},
    )
    print(json.dumps({"brand": brez, "product": products[0]}))
