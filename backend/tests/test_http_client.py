import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.services.http_client import httpx_request_options, resolve_http_proxy
from app.services.llm import complete_chat
from tests.test_notes import _configure_settings, _llm_response


def test_resolve_http_proxy_skips_socks_all_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("all_proxy", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("https_proxy", "http://127.0.0.1:7890")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:7890")
    assert resolve_http_proxy() == "http://127.0.0.1:7890"
    options = httpx_request_options()
    assert options["trust_env"] is False
    assert options["proxy"] == "http://127.0.0.1:7890"


def test_resolve_http_proxy_direct_when_only_socks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in (
        "ALL_PROXY",
        "all_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:1080")
    assert resolve_http_proxy() is None
    assert httpx_request_options() == {"trust_env": False, "proxy": None}


def test_resolve_http_proxy_skips_cursor_loopback_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in (
        "ALL_PROXY",
        "all_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ):
        monkeypatch.setenv(key, "http://127.0.0.1:57228")
    assert resolve_http_proxy() is None
    assert httpx_request_options()["proxy"] is None


def test_complete_chat_retries_direct_after_proxy_403(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    calls: list[str | None] = []

    def fake_post(url: str, **kwargs):
        calls.append(kwargs.get("proxy"))
        if kwargs.get("proxy"):
            request = httpx.Request("POST", url)
            return httpx.Response(403, text="Forbidden", request=request)
        return _llm_response("OK")

    monkeypatch.setattr(httpx, "post", fake_post)
    text = complete_chat(
        api_key="sk-test",
        api_base_url="https://api.deepseek.com",
        model="deepseek-flash",
        system_prompt="probe",
        user_content="ping",
    )
    assert text == "OK"
    assert calls[0] == "http://127.0.0.1:7890"
    assert calls[1] is None


def test_complete_chat_does_not_pass_socks_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("all_proxy", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")

    def fake_post(url: str, **kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["proxy"] == "http://127.0.0.1:7890"
        assert "socks" not in str(kwargs.get("proxy") or "").lower()
        return _llm_response("OK")

    monkeypatch.setattr(httpx, "post", fake_post)
    text = complete_chat(
        api_key="sk-test",
        api_base_url="https://api.deepseek.com",
        model="deepseek-chat",
        system_prompt="probe",
        user_content="ping",
    )
    assert text == "OK"


def test_httpx_client_with_socks_all_proxy_does_not_need_socksio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("all_proxy", "socks5h://127.0.0.1:1080")
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("https_proxy", raising=False)
    monkeypatch.delenv("HTTP_PROXY", raising=False)
    monkeypatch.delenv("http_proxy", raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "OK"}}]},
            request=request,
        )

    with httpx.Client(
        transport=httpx.MockTransport(handler),
        **httpx_request_options(),
    ) as client:
        response = client.post("https://api.deepseek.com/v1/chat/completions", json={})
    assert response.status_code == 200


def test_test_llm_with_socks_env_still_succeeds(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:1080")
    monkeypatch.setenv("all_proxy", "socks5h://127.0.0.1:1080")
    test_client, _ = client
    _configure_settings(test_client)

    def fake_post(url: str, **kwargs):
        assert kwargs["trust_env"] is False
        return _llm_response("OK")

    monkeypatch.setattr(httpx, "post", fake_post)
    response = test_client.post(
        "/api/settings/test-llm",
        json={
            "api_key": "",
            "api_base_url": "https://api.deepseek.com",
            "llm_model": "deepseek-chat",
        },
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True
