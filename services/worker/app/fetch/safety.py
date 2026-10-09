"""SSRF guard: user-supplied URLs may only reach the public internet. Checked for the first
request, every redirect hop, every request the browser makes, and every image download."""

import ipaddress
import socket
from functools import lru_cache
from urllib.parse import urlsplit

from app.config import get_settings
from app.jobs.errors import UserFacingError


class UnsafeUrlError(UserFacingError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="unsafe_url")


@lru_cache(maxsize=512)
def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    addresses = {str(info[4][0]) for info in infos}
    return bool(addresses) and all(_ip_is_public(address) for address in addresses)


def _ip_is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    return ip.is_global and not ip.is_multicast


def is_public_url(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return False
    if parts.port not in (None, 80, 443):
        return False
    if get_settings().lp_allow_private_fetch:  # tests only
        return True
    host = parts.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        return False
    try:
        return _ip_is_public(host)
    except ValueError:
        return _host_is_public(host)


def check_public_url(url: str) -> str:
    """Returns the URL if it may be fetched, or raises a user-facing error."""
    if not is_public_url(url):
        raise UnsafeUrlError(
            "That address can't be fetched. Use a public website address (https://…)."
        )
    return url
