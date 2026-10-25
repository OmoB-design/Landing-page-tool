"""Vercel (BUILD_SPEC §12.3, D87): the org's own account, through its token. Free calls, so no
ledger rows (D13 is about paid calls).

A publish uploads each file to `/v2/files` (by SHA-1), creates a production deployment of the
brand's project (`/v13/deployments`, no framework), then polls it until Vercel says it is READY and
has assigned its production alias. Each brand's project is created on first publish, with Vercel
Authentication switched off so visitors can open the pages.
"""

import hashlib
import time
from dataclasses import dataclass
from typing import Any

import httpx

API = "https://api.vercel.com"
TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class VercelError(RuntimeError):
    """A failure to show the user as is."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class Upload:
    path: str
    sha: str
    size: int


def _explain(response: httpx.Response, action: str) -> VercelError:
    try:
        body = response.json()
        detail = (body.get("error") or {}).get("message") or ""
    except ValueError:
        detail = ""
    if response.status_code in (401, 403):
        message = "Vercel didn't accept the token (it may have expired or lack access to the team)."
    elif response.status_code == 402:
        message = "Vercel refused the deployment on the account's plan."
    elif response.status_code == 429:
        message = "Vercel is rate limiting this account. Try again in a minute."
    else:
        message = f"Vercel couldn't {action}."
    if detail and response.status_code not in (401, 403):
        message = f"{message} ({detail})"
    return VercelError(message, response.status_code)


class VercelClient:
    def __init__(
        self,
        token: str,
        team_id: str | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._params = {"teamId": team_id} if team_id else {}
        self._http = httpx.Client(
            base_url=API,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def _call(self, method: str, path: str, action: str, **kwargs: Any) -> httpx.Response:
        params = {**self._params, **kwargs.pop("params", {})}
        try:
            response = self._http.request(method, path, params=params, **kwargs)
        except httpx.HTTPError as exc:
            raise VercelError(f"Couldn't reach Vercel to {action}.") from exc
        return response

    def account(self) -> tuple[str, str | None]:
        """Checks the token and returns the account's name and the team id to publish under.

        A token made for a team (newer accounts keep their projects in a team, e.g.
        "name's projects") can't read the user, so the token's teams decide: the team asked for
        (by id or slug), else its only team. A personal token without a team publishes to the
        user's own account."""
        asked = self._params.get("teamId")
        self._params = {}
        user = self._call("GET", "/v2/user", "check the token")
        if user.status_code == 200 and not asked:
            info = user.json().get("user") or {}
            return str(info.get("username") or info.get("email") or ""), None
        teams = self._call("GET", "/v2/teams", "list the token's teams")
        if teams.status_code != 200:
            raise _explain(user if user.status_code != 200 else teams, "check the token")
        found = [t for t in teams.json().get("teams") or [] if t.get("id")]
        if asked:
            team = next((t for t in found if asked in (t.get("id"), t.get("slug"))), None)
            if team is None:
                raise VercelError(f"This token can't reach the team {asked}.")
        elif len(found) == 1:
            team = found[0]
        elif user.status_code == 200:
            info = user.json().get("user") or {}
            return str(info.get("username") or info.get("email") or ""), None
        elif found:
            names = ", ".join(str(t.get("slug") or t.get("id")) for t in found)
            raise VercelError(f"This token reaches several teams ({names}); enter the team's id.")
        else:
            raise VercelError("This token doesn't reach any Vercel account or team.")
        self._params = {"teamId": str(team["id"])}
        return str(team.get("slug") or team.get("name") or team["id"]), str(team["id"])

    def project(self, name: str) -> dict[str, Any] | None:
        response = self._call("GET", f"/v9/projects/{name}", "look up the project")
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise _explain(response, "look up the project")
        project: dict[str, Any] = response.json()
        return project

    def create_project(self, name: str) -> dict[str, Any]:
        response = self._call(
            "POST", "/v10/projects", "create the project", json={"name": name, "framework": None}
        )
        if response.status_code not in (200, 201):
            raise _explain(response, "create the project")
        project: dict[str, Any] = response.json()
        return project

    def make_public(self, project_id: str) -> None:
        """Switches off Vercel Authentication, so anyone can open the pages."""
        response = self._call(
            "PATCH",
            f"/v9/projects/{project_id}",
            "make the project public",
            json={"ssoProtection": None},
        )
        if response.status_code != 200:
            raise _explain(response, "make the project public")

    def upload(self, path: str, data: bytes) -> Upload:
        sha = hashlib.sha1(data).hexdigest()
        response = self._call(
            "POST",
            "/v2/files",
            "upload the page",
            content=data,
            headers={
                "Content-Type": "application/octet-stream",
                "x-vercel-digest": sha,
                "Content-Length": str(len(data)),
            },
        )
        if response.status_code != 200:
            raise _explain(response, "upload the page")
        return Upload(path=path, sha=sha, size=len(data))

    def deploy(self, project_name: str, files: list[Upload]) -> dict[str, Any]:
        response = self._call(
            "POST",
            "/v13/deployments",
            "start the deployment",
            params={"skipAutoDetectionConfirmation": "1"},
            json={
                "name": project_name,
                "project": project_name,
                "target": "production",
                "files": [{"file": f.path, "sha": f.sha, "size": f.size} for f in files],
                "projectSettings": {"framework": None},
            },
        )
        if response.status_code not in (200, 201):
            raise _explain(response, "start the deployment")
        deployment: dict[str, Any] = response.json()
        return deployment

    def deployment(self, deployment_id: str) -> dict[str, Any]:
        response = self._call("GET", f"/v13/deployments/{deployment_id}", "check the deployment")
        if response.status_code != 200:
            raise _explain(response, "check the deployment")
        deployment: dict[str, Any] = response.json()
        return deployment

    def wait_ready(
        self,
        deployment_id: str,
        *,
        timeout: float = 300.0,
        every: float = 3.0,
        sleep: Any = time.sleep,
    ) -> dict[str, Any]:
        """Polls until the deployment is READY with its alias assigned; raises on ERROR,
        CANCELED, an alias error or the timeout."""
        waited = 0.0
        while True:
            deployment = self.deployment(deployment_id)
            state = deployment.get("readyState") or deployment.get("status")
            if state in ("ERROR", "CANCELED"):
                reason = (deployment.get("errorMessage") or "").strip()
                raise VercelError(f"Vercel's deployment failed{f': {reason}' if reason else ''}.")
            if deployment.get("aliasError"):
                error = deployment["aliasError"]
                raise VercelError(f"Vercel couldn't assign the address ({error.get('message')}).")
            if state == "READY" and deployment.get("aliasAssigned"):
                return deployment
            if waited >= timeout:
                raise VercelError("Vercel didn't finish the deployment in five minutes.")
            sleep(every)
            waited += every


def production_host(deployment: dict[str, Any], project_name: str) -> str:
    """The project's own address: the alias named after the project when there is one (e.g.
    lp-bre.vercel.app), else the first alias, else the deployment's unique URL."""
    aliases = [str(a) for a in deployment.get("alias") or []]
    preferred = next((a for a in aliases if a.startswith(f"{project_name}.")), None)
    host = preferred or (aliases[0] if aliases else str(deployment.get("url") or ""))
    return host.removeprefix("https://")
