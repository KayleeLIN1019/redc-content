import httpx
from fastapi import HTTPException

from app.constants import DEFAULT_LLM_MODEL
from app.services.http_client import httpx_request_options

LLM_TIMEOUT_SECONDS = 60.0
LLM_TEST_TIMEOUT_SECONDS = 20.0


def chat_completions_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="未配置 API Base URL")
    if "/v1" not in base:
        return f"{base}/v1/chat/completions"
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def complete_chat(
    *,
    api_key: str,
    api_base_url: str,
    model: str,
    system_prompt: str,
    user_content: str,
    timeout: float = LLM_TIMEOUT_SECONDS,
    max_tokens: int | None = None,
) -> str:
    url = chat_completions_url(api_base_url)
    payload: dict = {
        "model": model or DEFAULT_LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    request_options = httpx_request_options()
    try:
        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
            **request_options,
        )
        if response.status_code == 403 and request_options.get("proxy"):
            response = httpx.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
                trust_env=False,
                proxy=None,
            )
        response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=400, detail="LLM 调用超时，请稍后重试") from exc
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "")[:200]
        raise HTTPException(
            status_code=400,
            detail=f"LLM 调用失败: {exc.response.status_code} {body}".strip(),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"LLM 调用失败: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"LLM 调用失败: {exc}") from exc

    try:
        data = response.json()
        choice = (data.get("choices") or [None])[0] or {}
        message = choice.get("message") if isinstance(choice, dict) else None
        content = None
        if isinstance(message, dict):
            content = message.get("content")
        elif isinstance(choice, dict):
            content = choice.get("content")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="LLM 返回格式无效") from exc

    text = (content or "").strip() if isinstance(content, str) else ""
    if not text and isinstance(message, dict):
        reasoning = message.get("reasoning_content")
        if isinstance(reasoning, str) and reasoning.strip():
            text = reasoning.strip()
    if not text:
        raise HTTPException(status_code=400, detail="LLM 返回空内容")
    return text
