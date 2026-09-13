import json
import re
from html import unescape
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.services.http_client import httpx_request_options

FETCH_TIMEOUT_SECONDS = 20.0
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
}

XHS_HOSTS = {"xiaohongshu.com", "www.xiaohongshu.com", "xhslink.com", "www.xhslink.com"}
LOGIN_MARKERS = ("登录后查看", "打开小红书", "点击下载", "请登录", "访问频次异常")


def strip_html(html: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def is_xiaohongshu_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in XHS_HOSTS or host.endswith(".xiaohongshu.com")


def _meta_content(html: str, *keys: str) -> str:
    for key in keys:
        match = re.search(
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            flags=re.I,
        )
        if not match:
            match = re.search(
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(key)}["\']',
                html,
                flags=re.I,
            )
        if match:
            value = unescape(match.group(1)).strip()
            if value:
                return value
    return ""


def _extract_json_object(html: str, marker: str) -> dict | None:
    idx = html.find(marker)
    if idx < 0:
        return None
    start = html.find("{", idx)
    if start < 0:
        return None
    depth = 0
    in_str = False
    escape = False
    for pos in range(start, len(html)):
        char = html[pos]
        if in_str:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_str = False
            continue
        if char == '"':
            in_str = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                raw = html[start : pos + 1].replace("undefined", "null")
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    return None
                return data if isinstance(data, dict) else None
    return None


def _note_from_map(detail_map: object) -> str:
    if not isinstance(detail_map, dict):
        return ""
    for value in detail_map.values():
        inner = value.get("note") if isinstance(value, dict) else None
        if not isinstance(inner, dict):
            inner = value if isinstance(value, dict) else None
        if not isinstance(inner, dict):
            continue
        title = str(inner.get("title") or "").strip()
        desc = str(inner.get("desc") or inner.get("description") or "").strip()
        parts = [item for item in (title, desc) if item]
        if parts:
            return "\n\n".join(parts)
    return ""


def parse_xiaohongshu_html(html: str) -> str:
    state = _extract_json_object(html, "window.__INITIAL_STATE__") or _extract_json_object(
        html, "__INITIAL_STATE__"
    )
    if isinstance(state, dict):
        note = state.get("note")
        if isinstance(note, dict):
            text = _note_from_map(note.get("noteDetailMap"))
            if text:
                return text
        text = _note_from_map(state.get("noteDetailMap"))
        if text:
            return text

    title = _meta_content(html, "og:title", "twitter:title")
    desc = _meta_content(html, "og:description", "description", "twitter:description")
    if title.lower().startswith("小红书"):
        title = ""
    parts = [item for item in (title, desc) if item and item not in LOGIN_MARKERS]
    if parts:
        return "\n\n".join(parts)
    return ""


def _looks_like_wall(text: str) -> bool:
    if not text:
        return True
    return any(marker in text for marker in LOGIN_MARKERS)


def fetch_page_text(url: str) -> str:
    cleaned = (url or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="请提供竞品链接")
    try:
        response = httpx.get(
            cleaned,
            timeout=FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers=BROWSER_HEADERS,
            **httpx_request_options(),
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail="无法打开该链接，请检查链接或粘贴正文后再改写",
        ) from exc

    html = response.text or ""
    parsed = parse_xiaohongshu_html(html) if is_xiaohongshu_url(str(response.url) or cleaned) else ""
    if parsed and not _looks_like_wall(parsed):
        return parsed

    fallback = strip_html(html)
    if fallback and not _looks_like_wall(fallback):
        return fallback

    if is_xiaohongshu_url(cleaned):
        raise HTTPException(
            status_code=400,
            detail="小红书链接未能解析出正文（页面需登录或风控拦截）。请打开笔记复制全文后再改写",
        )
    raise HTTPException(
        status_code=400,
        detail="无法抓取链接内容，请粘贴正文后再改写",
    )
