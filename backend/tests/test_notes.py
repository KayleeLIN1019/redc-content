import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models import CompetitorNote
from app.services.llm import chat_completions_url


def _configure_settings(client: TestClient, **overrides) -> None:
    payload = {
        "api_key": "sk-test-key",
        "api_base_url": "https://api.deepseek.com",
        "llm_model": "deepseek-chat",
        "prompt_skills": {"桃子": "按桃子口吻改写，保留事实"},
        "primary_price": 0,
        "secondary_price": 0,
    }
    payload.update(overrides)
    response = client.put("/api/settings", json=payload)
    assert response.status_code == 200


def _llm_response(content: str = "改写后的文案") -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": content}}]},
        request=httpx.Request("POST", "https://api.deepseek.com/v1/chat/completions"),
    )


def test_chat_completions_url_normalizes_base() -> None:
    assert (
        chat_completions_url("https://api.deepseek.com")
        == "https://api.deepseek.com/v1/chat/completions"
    )
    assert (
        chat_completions_url("https://api.deepseek.com/")
        == "https://api.deepseek.com/v1/chat/completions"
    )
    assert (
        chat_completions_url("https://api.deepseek.com/v1")
        == "https://api.deepseek.com/v1/chat/completions"
    )
    assert (
        chat_completions_url("https://api.deepseek.com/v1/")
        == "https://api.deepseek.com/v1/chat/completions"
    )


def test_rewrite_saves_ai_draft(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, SessionLocal = client
    _configure_settings(test_client)

    def fake_post(url: str, **kwargs):
        assert url == "https://api.deepseek.com/v1/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer sk-test-key"
        assert kwargs["json"]["model"] == "deepseek-chat"
        assert kwargs["json"]["messages"][0]["content"] == "按桃子口吻改写，保留事实"
        assert kwargs["json"]["messages"][1]["content"] == "竞品原文"
        return _llm_response("改写后的文案")

    monkeypatch.setattr(httpx, "post", fake_post)

    response = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_content": "竞品原文"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["ip_name"] == "桃子"
    assert body["raw_content"] == "竞品原文"
    assert body["ai_draft"] == "改写后的文案"
    assert body["final_content"] is None

    db = SessionLocal()
    note = db.get(CompetitorNote, body["id"])
    assert note is not None
    assert note.ai_draft == "改写后的文案"
    assert note.final_content is None
    db.close()


def test_rewrite_from_link_strips_html(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client)

    def fake_get(url: str, **kwargs):
        assert url == "https://example.com/note"
        return httpx.Response(
            200,
            text="<html><body><p>竞品 HTML 正文</p></body></html>",
            request=httpx.Request("GET", url),
        )

    def fake_post(url: str, **kwargs):
        assert kwargs["json"]["messages"][1]["content"] == "竞品 HTML 正文"
        return _llm_response("来自链接的改写")

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)

    response = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_link": "https://example.com/note"},
    )
    assert response.status_code == 201
    assert response.json()["raw_content"] == "竞品 HTML 正文"
    assert response.json()["ai_draft"] == "来自链接的改写"


def test_rewrite_link_fetch_failure_asks_to_paste(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client)

    def fake_get(url: str, **kwargs):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "get", fake_get)

    response = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_link": "https://www.xiaohongshu.com/explore/1"},
    )
    assert response.status_code == 400
    assert "粘贴" in response.json()["detail"] or "解析" in response.json()["detail"]


def test_parse_link_reads_xiaohongshu_state(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client

    def fake_get(url: str, **kwargs):
        return httpx.Response(
            200,
            text="""<script>window.__INITIAL_STATE__ = {"note":{"noteDetailMap":{"abc":{"note":{"title":"标题","desc":"正文内容"}}}}};</script>""",
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    response = test_client.post(
        "/api/notes/parse-link",
        json={"url": "https://www.xiaohongshu.com/explore/abc"},
    )
    assert response.status_code == 200
    assert "标题" in response.json()["content"]
    assert "正文内容" in response.json()["content"]


def test_rewrite_unexpected_llm_error_is_400(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client)

    def fake_post(url: str, **kwargs):
        raise ImportError(
            "Using SOCKS proxy, but the 'socksio' package is not installed."
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    response = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_content": "原文"},
    )
    assert response.status_code == 400
    assert "LLM" in response.json()["detail"]


def test_rewrite_requires_key_and_skill(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, _ = client
    missing_key = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_content": "原文"},
    )
    assert missing_key.status_code == 400
    assert "API Key" in missing_key.json()["detail"]

    _configure_settings(test_client, prompt_skills={})
    missing_skill = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_content": "原文"},
    )
    assert missing_skill.status_code == 400
    assert "技能" in missing_skill.json()["detail"]


def test_create_note_without_llm(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, SessionLocal = client
    _configure_settings(test_client, api_key="")
    created = test_client.post(
        "/api/notes",
        json={"ip_name": "桃子", "raw_content": "手动粘贴原文"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["raw_content"] == "手动粘贴原文"
    assert body["ai_draft"] is None
    assert body["final_content"] is None

    db = SessionLocal()
    note = db.get(CompetitorNote, body["id"])
    assert note is not None
    assert note.ai_draft is None
    db.close()

    missing_skill = test_client.post(
        "/api/notes",
        json={"ip_name": "未知IP", "raw_content": "原文"},
    )
    assert missing_skill.status_code == 400



def test_confirm_and_list_notes(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client)
    monkeypatch.setattr(httpx, "post", lambda url, **kwargs: _llm_response("初稿"))

    created = test_client.post(
        "/api/notes/rewrite",
        json={"ip_name": "桃子", "raw_content": "原文"},
    )
    note_id = created.json()["id"]

    patched = test_client.patch(
        f"/api/notes/{note_id}",
        json={"final_content": "人工定稿"},
    )
    assert patched.status_code == 200
    assert patched.json()["final_content"] == "人工定稿"

    missing = test_client.patch("/api/notes/999", json={"final_content": "x"})
    assert missing.status_code == 404

    listed = test_client.get("/api/notes")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == note_id
    assert items[0]["ai_draft"] == "初稿"
    assert items[0]["final_content"] == "人工定稿"


def test_rewrite_batch_runs_all_items(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client, max_concurrency=8)

    def fake_post(url: str, **kwargs):
        source = kwargs["json"]["messages"][1]["content"]
        return _llm_response(f"改写-{source}")

    monkeypatch.setattr(httpx, "post", fake_post)
    response = test_client.post(
        "/api/notes/rewrite/batch",
        json={
            "ip_name": "桃子",
            "items": [
                {"raw_content": "A"},
                {"raw_content": "B"},
                {"raw_content": "C"},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    drafts = sorted(item["ai_draft"] for item in body["items"])
    assert drafts == ["改写-A", "改写-B", "改写-C"]
    assert body["errors"] == []


def test_rewrite_batch_keeps_partial_success(
    client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client
    _configure_settings(test_client)

    def fake_post(url: str, **kwargs):
        source = kwargs["json"]["messages"][1]["content"]
        if source == "坏":
            raise httpx.ConnectError("boom")
        return _llm_response(f"改写-{source}")

    monkeypatch.setattr(httpx, "post", fake_post)
    response = test_client.post(
        "/api/notes/rewrite/batch",
        json={
            "ip_name": "桃子",
            "items": [
                {"raw_content": "好"},
                {"raw_content": "坏"},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["ai_draft"] == "改写-好"
    assert len(body["errors"]) == 1
    assert body["errors"][0]["index"] == 1


def test_delete_note(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    _configure_settings(test_client)
    created = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    note_id = created.json()["id"]
    deleted = test_client.delete(f"/api/notes/{note_id}")
    assert deleted.status_code == 204
    assert test_client.get("/api/notes").json()["items"] == []
    missing = test_client.delete("/api/notes/999")
    assert missing.status_code == 404


def test_delete_note_blocked_when_packaged(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    _configure_settings(test_client)
    from tests.test_assets import _upload

    note = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    note_id = note.json()["id"]
    test_client.patch(f"/api/notes/{note_id}", json={"final_content": "定稿"})
    primary = _upload(test_client, "primary")
    created = test_client.post(
        "/api/packages",
        json={
            "title": "占用改写",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    blocked = test_client.delete(f"/api/notes/{note_id}")
    assert blocked.status_code == 400
    assert "占用改写" in blocked.json()["detail"]
