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
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.xiaohongshu.com/",
    "sec-ch-ua": '"Chromium";v="128", "Google Chrome";v="128", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

XHS_HOSTS = {"xiaohongshu.com", "www.xiaohongshu.com", "xhslink.com", "www.xhslink.com"}
LOGIN_MARKERS = ("登录后查看", "打开小红书", "点击下载", "请登录", "访问频次异常")
SHELL_MARKERS = (
    "你的生活兴趣社区",
    "你访问的页面不见了",
    "网页版",
    "创作中心",
    "业务合作",
)


def strip_html(html: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def strip_html_slim(html: str) -> str:
    text = re.sub(r"<!--[\s\S]*?-->", " ", html)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def is_xiaohongshu_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in XHS_HOSTS or host.endswith(".xiaohongshu.com")


def _extract_note_id(url: str) -> str:
    match = re.search(r"/(?:explore|discovery/item)/([0-9a-zA-Z]+)", url)
    return match.group(1) if match else ""


def _tag_list_names(value: object) -> list[str]:
    names: list[str] = []
    if not isinstance(value, list):
        return names
    for item in value:
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if name:
                names.append(name.lstrip("#"))
    return names


def _note_body(inner: dict) -> str:
    title = str(inner.get("title") or "").strip()
    desc = str(inner.get("desc") or inner.get("description") or "").strip()
    topics = _tag_list_names(inner.get("tagList"))
    parts = [f"标题：{title}" if title else "", f"正文：{desc}" if desc else ""]
    if topics:
        parts.append("话题：" + " ".join(f"#{name}" for name in topics))
    return "\n\n".join(part for part in parts if part)


def _shell_title_desc(html: str) -> str:
    match = re.search(r"<title[^>]*>([^<]*)</title>", html, flags=re.I)
    title = unescape(match.group(1)).strip() if match else ""
    title = re.sub(r"\s*-\s*小红书\s*$", "", title).strip()
    if not title or title in SHELL_MARKERS:
        return ""
    desc = _meta_content(html, "og:description", "description", "twitter:description")
    parts = [f"标题：{title}"]
    if desc and desc not in SHELL_MARKERS:
        parts.append(f"正文：{desc}")
    return "\n\n".join(parts)


def _looks_like_shell(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return True
    if any(marker in stripped for marker in SHELL_MARKERS):
        return True
    compact = re.sub(r"\s+", "", stripped)
    return compact in {"小红书", "小红书-你的生活兴趣社区"}


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
        body = _note_body(inner)
        if body:
            return body
    return ""


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


def _walk_note_detail(obj: object, depth: int = 0) -> str:
    if depth > 8 or obj is None:
        return ""
    if isinstance(obj, dict):
        mapped = obj.get("noteDetailMap")
        if mapped is not None:
            text = _note_from_map(mapped)
            if text:
                return text
        for value in obj.values():
            text = _walk_note_detail(value, depth + 1)
            if text:
                return text
    elif isinstance(obj, list):
        for item in obj[:40]:
            text = _walk_note_detail(item, depth + 1)
            if text:
                return text
    return ""


def _extract_json_parse_assignment(html: str) -> dict | None:
    match = re.search(
        r'__INITIAL_STATE__\s*=\s*JSON\.parse\s*\(\s*"((?:\\.|[^"\\])*)"\s*\)',
        html,
    )
    if not match:
        return None
    raw = match.group(1).encode("utf-8").decode("unicode_escape")
    raw = raw.replace("undefined", "null")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def parse_xiaohongshu_html(html: str) -> str:
    state = (
        _extract_json_parse_assignment(html)
        or _extract_json_object(html, "window.__INITIAL_STATE__")
        or _extract_json_object(html, "__INITIAL_STATE__")
    )
    if isinstance(state, dict):
        text = _walk_note_detail(state)
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
    request_opts = httpx_request_options()
    try:
        response = httpx.get(
            cleaned,
            timeout=FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers=BROWSER_HEADERS,
            **request_opts,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail="无法打开该链接，请检查链接或粘贴正文后再改写",
        ) from exc

    html = response.text or ""
    parsed = parse_xiaohongshu_html(html) if is_xiaohongshu_url(str(response.url) or cleaned) else ""
    fallback = strip_html(html)
    xhs = is_xiaohongshu_url(cleaned) or is_xiaohongshu_url(str(response.url) or "")
    if parsed and not _looks_like_shell(parsed):
        source = "parsed"
    elif fallback and not _looks_like_shell(fallback) and (not xhs or len(fallback) > 80):
        source = "strip_html"
    else:
        source = "none"
    if source == "parsed":
        return parsed
    if source == "strip_html":
        return fallback

    if xhs:
        raise HTTPException(
            status_code=400,
            detail="小红书链接未能解析出正文。请从浏览器地址栏复制完整链接（需包含 xsec_token），或打开笔记复制全文后再改写",
        )
    raise HTTPException(
        status_code=400,
        detail="无法抓取链接内容，请粘贴正文后再改写",
    )
