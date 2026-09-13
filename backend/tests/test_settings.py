from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models import SystemSetting


def _put_settings(client: TestClient, **overrides):
    payload = {
        "api_key": "sk-secret-key-1234",
        "api_base_url": "https://api.deepseek.com",
        "llm_model": "deepseek-chat",
        "prompt_skills": {"桃子": "按桃子口吻改写"},
        "primary_price": 10.5,
        "secondary_price": 2,
    }
    payload.update(overrides)
    return client.put("/api/settings", json=payload)


def test_settings_get_defaults_without_key(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, _ = client
    response = test_client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["has_api_key"] is False
    assert body["api_key_masked"] == ""
    assert body["llm_model"] == "deepseek-chat"
    assert body["max_concurrency"] == 8
    assert body["prompt_skills"] == {}
    assert "api_key" not in body


def test_settings_put_get_masks_key(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, SessionLocal = client
    response = _put_settings(test_client)
    assert response.status_code == 200
    body = response.json()
    assert body["has_api_key"] is True
    assert body["api_key_masked"] == "1234"
    assert body["api_base_url"] == "https://api.deepseek.com"
    assert body["llm_model"] == "deepseek-chat"
    assert body["max_concurrency"] == 8
    assert body["prompt_skills"] == {"桃子": "按桃子口吻改写"}
    assert body["primary_price"] == 10.5
    assert body["secondary_price"] == 2
    assert "api_key" not in body
    assert "sk-secret" not in response.text

    listed = test_client.get("/api/settings")
    assert listed.json()["api_key_masked"] == "1234"
    assert "sk-secret" not in listed.text

    db = SessionLocal()
    stored = db.get(SystemSetting, 1)
    assert stored is not None
    assert stored.api_key == "sk-secret-key-1234"
    db.close()


def test_settings_empty_api_key_keeps_stored(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, SessionLocal = client
    _put_settings(test_client)

    response = _put_settings(
        test_client,
        api_key="",
        api_base_url="https://api.deepseek.com/v1",
        llm_model="deepseek-reasoner",
        max_concurrency=4,
        prompt_skills={"桃子": "新规则"},
        primary_price=1,
        secondary_price=3,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["has_api_key"] is True
    assert body["api_key_masked"] == "1234"
    assert body["api_base_url"] == "https://api.deepseek.com/v1"
    assert body["llm_model"] == "deepseek-reasoner"
    assert body["max_concurrency"] == 4
    assert body["prompt_skills"] == {"桃子": "新规则"}

    db = SessionLocal()
    stored = db.get(SystemSetting, 1)
    assert stored is not None
    assert stored.api_key == "sk-secret-key-1234"
    assert stored.max_concurrency == 4
    db.close()


def test_settings_rejects_concurrency_over_limit(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, _ = client
    response = _put_settings(test_client, max_concurrency=9)
    assert response.status_code == 422


def test_llm_connection_uses_saved_key(
    client: tuple[TestClient, sessionmaker],
    monkeypatch,
) -> None:
    import httpx

    test_client, _ = client
    _put_settings(test_client)

    def fake_post(url: str, **kwargs):
        assert url == "https://api.deepseek.com/v1/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer sk-secret-key-1234"
        assert kwargs["json"]["model"] == "deepseek-chat"
        assert "max_tokens" not in kwargs["json"]
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "OK"}}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    response = test_client.post(
        "/api/settings/test-llm",
        json={"api_key": "", "api_base_url": "https://api.deepseek.com", "llm_model": "deepseek-chat"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["model"] == "deepseek-chat"
    assert body["reply"] == "OK"
    assert body["latency_ms"] >= 0


def test_llm_connection_requires_key(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    response = test_client.post(
        "/api/settings/test-llm",
        json={"api_key": "", "api_base_url": "https://api.deepseek.com", "llm_model": "deepseek-chat"},
    )
    assert response.status_code == 400
    assert "API Key" in response.json()["detail"]
