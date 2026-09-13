import os
from urllib.parse import urlparse

SOCKS_SCHEMES = {"socks", "socks4", "socks5", "socks5h"}
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
# Clash / V2Ray / Surge 常见本地端口；排除 Cursor 等注入的高位临时端口。
LOCAL_PROXY_PORTS = {
    7890,
    7891,
    7892,
    7893,
    7897,
    1080,
    1087,
    10808,
    10809,
    8118,
    8888,
    20171,
    6152,
    6153,
}


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _first_env(*names: str) -> str | None:
    for name in names:
        value = _env(name)
        if value:
            return value
    return None


def _is_socks(url: str) -> bool:
    return urlparse(url).scheme.lower() in SOCKS_SCHEMES


def _is_injected_loopback_proxy(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host not in LOOPBACK_HOSTS:
        return False
    port = parsed.port
    if port is None:
        return True
    return port not in LOCAL_PROXY_PORTS


def resolve_http_proxy() -> str | None:
    """Pick an HTTP(S) proxy from the process environment.

    Clash / V2Ray typically export ALL_PROXY=socks5h://... together with
    HTTP(S)_PROXY=http://127.0.0.1:7890. httpx prefers ALL_PROXY, then crashes
    without socksio. Cursor also injects HTTP_PROXY=http://127.0.0.1:<ephemeral>,
    which often returns 403 for api.deepseek.com. Keep known local proxy ports
    and skip SOCKS plus injected loopback proxies.
    """
    candidates = (
        _first_env("HTTPS_PROXY", "https_proxy"),
        _first_env("HTTP_PROXY", "http_proxy"),
        _first_env("ALL_PROXY", "all_proxy"),
    )
    for candidate in candidates:
        if not candidate or _is_socks(candidate):
            continue
        if _is_injected_loopback_proxy(candidate):
            continue
        return candidate
    return None


def httpx_request_options() -> dict:
    return {"trust_env": False, "proxy": resolve_http_proxy()}
