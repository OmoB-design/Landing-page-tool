"""Shopify (BUILD_SPEC §12.4 and §12.5, D90): a brand's store, through the store owner's own Dev
Dashboard app. Free calls, so no ledger rows (D13 is about paid calls).

Since January 2026 a store's admin can't hand out a custom app's token. The store owner creates an
app in the Dev Dashboard (in the store's own organisation) and gives us its client id and secret;
each job swaps them for a token that lasts 24 hours (the client credentials grant) and keeps
nothing but the secret. Calls go to the Admin GraphQL API; a throttled call waits and tries again.
"""

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

TIMEOUT = httpx.Timeout(30.0, connect=10.0)
# What publishing a draft page needs: pages, files, and theme files for the full-width template.
REQUIRED_SCOPES = ("write_content", "write_files", "write_themes")
# Scopes that grant the same (Shopify: a broader write scope covers the narrower one).
SCOPE_ALTERNATIVES = {
    "write_content": ("write_content", "write_online_store_pages"),
    "write_files": ("write_files", "write_images", "write_themes"),
    "write_themes": ("write_themes",),
}
SHOP = re.compile(r"^[a-z0-9][a-z0-9-]*\.myshopify\.com$")
THROTTLE_TRIES = 4


class ShopifyError(RuntimeError):
    """A failure to show the user as is."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def shop_domain(value: str) -> str:
    """`https://FourU.myshopify.com/` or `fouru` → `fouru.myshopify.com`; raises if it isn't a
    myshopify address (the admin address, not the store's own domain)."""
    text = value.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
    if text and "." not in text:
        text = f"{text}.myshopify.com"
    if not SHOP.match(text):
        raise ShopifyError(
            "Use the store's myshopify address, like fouru.myshopify.com "
            "(Shopify admin → Settings → Domains)."
        )
    return text


def missing_scopes(granted: str) -> list[str]:
    have = {s.strip() for s in granted.split(",") if s.strip()}
    return [
        scope
        for scope in REQUIRED_SCOPES
        if not any(alt in have for alt in SCOPE_ALTERNATIVES[scope])
    ]


@dataclass(frozen=True)
class Token:
    access_token: str
    scope: str


def get_token(
    shop: str,
    client_id: str,
    client_secret: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> Token:
    """The client credentials grant: a 24-hour token for the store owner's own app."""
    try:
        with httpx.Client(timeout=TIMEOUT, transport=transport) as http:
            response = http.post(
                f"https://{shop}/admin/oauth/access_token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
    except httpx.HTTPError as exc:
        raise ShopifyError(f"Couldn't reach {shop}.") from exc
    if response.status_code == 404:
        raise ShopifyError(f"There's no Shopify store at {shop}.", 404)
    if response.status_code in (400, 401, 403):
        raise ShopifyError(
            "Shopify didn't accept the client id and secret. Check they're the app's (Dev "
            "Dashboard → the app → Settings) and that the app is installed on this store.",
            response.status_code,
        )
    if response.status_code != 200:
        raise ShopifyError(f"Shopify couldn't give access ({response.status_code}).")
    body = response.json()
    token = str(body.get("access_token") or "")
    if not token:
        raise ShopifyError("Shopify gave no access token.")
    return Token(access_token=token, scope=str(body.get("scope") or ""))


class ShopifyClient:
    def __init__(
        self,
        shop: str,
        access_token: str,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Any = time.sleep,
    ) -> None:
        version = get_settings().shopify_api_version
        self._sleep = sleep
        self._http = httpx.Client(
            base_url=f"https://{shop}/admin/api/{version}",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=TIMEOUT,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """The query's `data`; waits and retries while Shopify throttles; raises on errors."""
        for attempt in range(THROTTLE_TRIES):
            try:
                response = self._http.post(
                    "/graphql.json", json={"query": query, "variables": variables or {}}
                )
            except httpx.HTTPError as exc:
                raise ShopifyError("Couldn't reach Shopify.") from exc
            if response.status_code == 429 or (
                response.status_code == 200 and _throttled(response.json())
            ):
                self._sleep(1.0 + attempt)
                continue
            if response.status_code in (401, 403):
                raise ShopifyError(
                    "Shopify refused the call: the app may lack a scope, or was uninstalled.",
                    response.status_code,
                )
            if response.status_code != 200:
                raise ShopifyError(f"Shopify answered {response.status_code}.")
            body = response.json()
            if body.get("errors"):
                message = str(body["errors"][0].get("message") or "an error")
                raise ShopifyError(f"Shopify returned {message}.")
            data: dict[str, Any] = body.get("data") or {}
            return data
        raise ShopifyError("Shopify is busy (rate limited). Try again in a minute.")

    def shop_name(self) -> str:
        data = self.graphql("{ shop { name } }")
        return str((data.get("shop") or {}).get("name") or "")

    def main_theme(self) -> str | None:
        data = self.graphql("{ themes(roles: [MAIN], first: 1) { nodes { id name } } }")
        nodes = (data.get("themes") or {}).get("nodes") or []
        return str(nodes[0]["id"]) if nodes else None

    def theme_files(self, theme_id: str, filenames: list[str]) -> set[str]:
        """Which of these files the theme has (reading needs no exemption, unlike writing)."""
        data = self.graphql(
            """
            query Files($theme: ID!, $names: [String!]) {
              theme(id: $theme) { files(filenames: $names, first: 10) { nodes { filename } } }
            }
            """,
            {"theme": theme_id, "names": filenames},
        )
        nodes = ((data.get("theme") or {}).get("files") or {}).get("nodes") or []
        return {str(n["filename"]) for n in nodes if n and n.get("filename")}

    def upsert_theme_files(self, theme_id: str, files: dict[str, str]) -> list[str]:
        """Writes theme files; returns Shopify's user errors (empty when they were written)."""
        data = self.graphql(
            """
            mutation Upsert($theme: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
              themeFilesUpsert(themeId: $theme, files: $files) {
                upsertedThemeFiles { filename }
                userErrors { field message }
              }
            }
            """,
            {
                "theme": theme_id,
                "files": [
                    {"filename": name, "body": {"type": "TEXT", "value": body}}
                    for name, body in files.items()
                ],
            },
        )
        result = data.get("themeFilesUpsert") or {}
        return [str(e.get("message")) for e in result.get("userErrors") or []]

    def create_files(self, urls: list[tuple[str, str]]) -> dict[str, str]:
        """Files from web addresses (`[(url, IMAGE|FILE)]`): Shopify fetches each itself. Returns
        url → Shopify file id for the ones it accepted."""
        if not urls:
            return {}
        data = self.graphql(
            """
            mutation Files($files: [FileCreateInput!]!) {
              fileCreate(files: $files) { files { id } userErrors { field message } }
            }
            """,
            {"files": [{"originalSource": url, "contentType": kind} for url, kind in urls]},
        )
        files = (data.get("fileCreate") or {}).get("files") or []
        return {url: str(f["id"]) for (url, _), f in zip(urls, files, strict=False) if f}

    def file_urls(self, ids: list[str]) -> dict[str, str | None]:
        """id → its CDN address once READY (None while processing; missing when it failed)."""
        data = self.graphql(
            """
            query Files($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on MediaImage { id fileStatus image { url } }
                ... on GenericFile { id fileStatus url }
              }
            }
            """,
            {"ids": ids},
        )
        out: dict[str, str | None] = {}
        for node in data.get("nodes") or []:
            if not node:
                continue
            status = node.get("fileStatus")
            if status == "FAILED":
                continue
            url = (node.get("image") or {}).get("url") or node.get("url")
            out[str(node["id"])] = str(url) if status == "READY" and url else None
        return out

    def save_page(
        self,
        *,
        page_id: str | None,
        title: str,
        handle: str,
        body: str,
        template_suffix: str | None,
    ) -> dict[str, Any]:
        """Creates an unpublished page, or updates the one made before; returns {id, handle}."""
        fields: dict[str, Any] = {"title": title, "body": body, "templateSuffix": template_suffix}
        if page_id:
            data = self.graphql(
                """
                mutation Update($id: ID!, $page: PageUpdateInput!) {
                  pageUpdate(id: $id, page: $page) {
                    page { id handle } userErrors { code field message }
                  }
                }
                """,
                {"id": page_id, "page": fields},
            )
            result = data.get("pageUpdate") or {}
        else:
            data = self.graphql(
                """
                mutation Create($page: PageCreateInput!) {
                  pageCreate(page: $page) {
                    page { id handle } userErrors { code field message }
                  }
                }
                """,
                {"page": {**fields, "handle": handle, "isPublished": False}},
            )
            result = data.get("pageCreate") or {}
        errors = result.get("userErrors") or []
        if errors:
            raise ShopifyError(f"Shopify refused the page: {errors[0].get('message')}.")
        page: dict[str, Any] = result.get("page") or {}
        if not page.get("id"):
            raise ShopifyError("Shopify didn't return the page.")
        return page


def _throttled(body: dict[str, Any]) -> bool:
    return any(
        (e.get("extensions") or {}).get("code") == "THROTTLED" for e in body.get("errors") or []
    )


def admin_page_url(shop: str, page_id: str) -> str:
    """The page in the store's admin (`gid://shopify/Page/123` → …/pages/123)."""
    store = shop.removesuffix(".myshopify.com")
    return f"https://admin.shopify.com/store/{store}/pages/{page_id.rsplit('/', 1)[-1]}"
