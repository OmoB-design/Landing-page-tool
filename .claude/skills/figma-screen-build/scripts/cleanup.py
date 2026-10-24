"""Deletes a throwaway account made by new_account.py: its builds' stored files (pages and exports),
then its org (rows cascade) and the user. Refuses anything but a design-check-…@example.test
account that is alone in its org.

    cd services/worker && PYTHONPATH=. uv run python <this file> OUT
"""

import json
import sys
from pathlib import Path

from app.db import transaction
from app.providers import storage

account_file = Path(sys.argv[1]) / "account.json"
email = json.loads(account_file.read_text())["email"]
assert email.startswith("design-check-") and email.endswith("@example.test"), email

with transaction() as conn:
    users = conn.execute("select id from auth.users where email = %(e)s", {"e": email}).fetchall()
    assert len(users) == 1, users
    uid = users[0]["id"]
    orgs = conn.execute(
        """
        select m.org_id, (select count(*) from org_members x where x.org_id = m.org_id) as members
        from org_members m where m.user_id = %(u)s
        """,
        {"u": uid},
    ).fetchall()
    for org in orgs:
        assert org["members"] == 1, org
        paths = [
            p
            for row in conn.execute(
                "select working_html_path, export_html_path from builds where org_id = %(o)s",
                {"o": org["org_id"]},
            ).fetchall()
            for p in (row["working_html_path"], row["export_html_path"])
            if p
        ]
        if paths:
            storage.remove("builds", paths)
        conn.execute("delete from orgs where id = %(o)s", {"o": org["org_id"]})
        print("deleted org", org["org_id"], "and", len(paths), "stored files")
    conn.execute("delete from auth.users where id = %(u)s", {"u": uid})
    print("deleted user", email)
account_file.unlink()
(account_file.parent / "state.json").unlink(missing_ok=True)
