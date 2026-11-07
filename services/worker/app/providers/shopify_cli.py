"""Theme files through a store's Theme Access password (B4.2, D121), with Shopify CLI.

Shopify refuses `themeFilesUpsert` to apps without an exemption (D90), so editable pages' theme
files go up the way Shopify documents for CI/CD: Shopify's free Theme Access app gives the store's
owner a password scoped to writing themes, and Shopify CLI uses it (`SHOPIFY_CLI_THEME_TOKEN`).
Every push names its files (`--only`) and deletes nothing (`--nodelete`): only LP's own `lp-…`
files are added or replaced; the theme's other files are never touched. The CLI is pinned in the
worker's image (`LP_SHOPIFY_CLI`, default `shopify`; 4.9.4 in the Dockerfile). Its JSON comes
mixed with progress and diagnostic lines, so the answer is picked out by its shape.

Tests replace `run` with a fake: no test calls Shopify.
"""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.config import get_settings

TIMEOUT = 300  # seconds for one push


class ThemeAccessError(RuntimeError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def run(args: list[str], password: str, cwd: str) -> str:
    """Runs the CLI with the store's password in its environment (never on its command line);
    returns what it printed. Raises ThemeAccessError when it can't run or fails."""
    binary = get_settings().lp_shopify_cli
    if shutil.which(binary) is None:
        raise ThemeAccessError("Shopify CLI isn't installed on the worker.")
    env = {
        **os.environ,
        "SHOPIFY_CLI_THEME_TOKEN": password,
        "SHOPIFY_CLI_NO_ANALYTICS": "1",
        "CI": "1",
    }
    try:
        done = subprocess.run(
            [binary, *args],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ThemeAccessError("Shopify took too long to take the theme files.") from exc
    output = (done.stdout or "") + "\n" + (done.stderr or "")
    if done.returncode != 0:
        raise ThemeAccessError(_failure(output))
    return output


def _failure(output: str) -> str:
    text = output.lower()
    if ("invalid" in text and ("password" in text or "token" in text)) or "401" in text:
        return (
            "Shopify didn't accept the Theme Access password. Make a new one in the Theme Access "
            "app and save it again."
        )
    if "403" in text or "forbidden" in text:
        return "The Theme Access password can't change this store's themes."
    return "Shopify CLI couldn't finish: " + " ".join(output.split())[-300:]


def _json_values(output: str) -> list[Any]:
    """Every JSON value the CLI printed, in order (one a line, or one spread over several lines);
    progress and diagnostic lines come mixed with the answer."""
    lines = output.splitlines()
    values: list[Any] = []
    index = 0
    while index < len(lines):
        if not lines[index].lstrip().startswith(("{", "[")):
            index += 1
            continue
        for stop in range(index + 1, len(lines) + 1):
            try:
                values.append(json.loads("\n".join(lines[index:stop])))
            except ValueError:
                continue
            index = stop
            break
        else:
            index += 1
    return values


def _themes(output: str) -> list[dict[str, Any]]:
    for value in reversed(_json_values(output)):
        if isinstance(value, list):
            return [v for v in value if isinstance(v, dict)]
    return []


def _push_result(output: str) -> dict[str, Any]:
    for value in reversed(_json_values(output)):
        if isinstance(value, dict) and isinstance(value.get("theme"), dict):
            theme: dict[str, Any] = value["theme"]
            return theme
    return {}


def live_theme(shop: str, password: str) -> dict[str, Any]:
    """The store's live theme ({id, name}); also checks the password works."""
    with tempfile.TemporaryDirectory(prefix="lp-theme-") as folder:
        output = run(["theme", "list", "--store", shop, "--json", "--no-color"], password, folder)
    for theme in _themes(output):
        if isinstance(theme, dict) and theme.get("role") == "live":
            return {"id": int(theme["id"]), "name": str(theme.get("name") or "")}
    raise ThemeAccessError("The store has no live theme to add the page's files to.")


def push(shop: str, password: str, theme_id: int, steps: list[dict[str, str]]) -> list[str]:
    """Writes each step's files to the theme, step by step (block types first), adding or replacing
    only those files. Returns Shopify's complaints, file by file; an empty list when all went in."""
    problems: list[str] = []
    with tempfile.TemporaryDirectory(prefix="lp-theme-") as folder:
        root = Path(folder)
        for files in steps:
            if not files:
                continue
            for path, content in files.items():
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            only = [arg for path in files for arg in ("--only", path)]
            output = run(
                [
                    "theme", "push", "--path", folder, "--store", shop, "--theme", str(theme_id),
                    *only, "--nodelete", "--allow-live", "--json", "--no-color",
                ],
                password,
                folder,
            )  # fmt: skip
            errors = _push_result(output).get("errors") or {}
            for path, messages in errors.items():
                for message in messages if isinstance(messages, list) else [messages]:
                    problems.append(f"{path}: {' '.join(str(message).split())[:300]}")
            if problems:
                break  # later steps depend on this one
    return problems
