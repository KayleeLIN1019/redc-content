from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.test_assets import _upload


def _tag(client: TestClient, name: str, kind: str = "content") -> None:
    created = client.post("/api/tags", json={"name": name, "kind": kind})
    assert created.status_code in (200, 201)


def _ready(client: TestClient) -> int:
    client.put(
        "/api/settings",
        json={
            "api_key": "",
            "api_base_url": "",
            "llm_model": "deepseek-chat",
            "prompt_skills": {"桃子": "skill", "佳佳": "skill"},
            "primary_price": 0,
            "secondary_price": 0,
        },
    )
    note = client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    note_id = note.json()["id"]
    client.patch(f"/api/notes/{note_id}", json={"final_content": "定稿文案"})
    return note_id


def _package(client: TestClient, note_id: int, benefit: str, secondary_ids: list[int]) -> None:
    primary = _upload(client, "primary", ["桃子"])
    assert primary.status_code == 201
    created = client.post(
        "/api/packages",
        json={
            "title": f"历史-{benefit}-{primary.json()['id']}",
            "ip_name": "桃子",
            "benefit_point": benefit,
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": secondary_ids,
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201, created.json()


def test_recommend_follows_benefit_mix_and_rotates(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    note_id = _ready(test_client)
    for name in ("团队介绍", "清单式报价", "施工流程"):
        _tag(test_client, name)

    team = [_upload(test_client, "secondary", ["桃子", "团队介绍"]).json()["id"] for _ in range(4)]
    used_quotes = [_upload(test_client, "secondary", ["桃子", "清单式报价"]).json()["id"] for _ in range(7)]
    fresh_quotes = [_upload(test_client, "secondary", ["桃子", "清单式报价"]).json()["id"] for _ in range(10)]
    other_ip = _upload(test_client, "secondary", ["佳佳", "团队介绍"]).json()["id"]

    history = team[:3] + used_quotes
    _package(test_client, note_id, "报价", history)
    _package(test_client, note_id, "报价", history)

    result = test_client.post(
        "/api/packages/recommend-secondaries",
        json={"ip_name": "桃子", "benefit_point": "报价"},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["matched_benefit"] is True
    assert len(body["asset_ids"]) == 10
    assert set(body["asset_ids"][:3]).issubset(set(team))
    assert "团队介绍 3" in body["summary"]
    assert "清单式报价 7" in body["summary"]
    quote_pool = set(used_quotes + fresh_quotes)
    quote_picks = body["asset_ids"][3:]
    assert set(quote_picks).issubset(quote_pool)
    assert other_ip not in body["asset_ids"]

    seen = {tuple(body["asset_ids"])}
    for _ in range(7):
        again = test_client.post(
            "/api/packages/recommend-secondaries",
            json={"ip_name": "桃子", "benefit_point": "报价"},
        )
        assert again.status_code == 200
        ids = again.json()["asset_ids"]
        assert set(ids[:3]).issubset(set(team))
        assert set(ids[3:]).issubset(quote_pool)
        seen.add(tuple(ids))
    assert len(seen) > 1


def test_recommend_falls_back_without_benefit_history(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    note_id = _ready(test_client)
    _tag(test_client, "团队介绍")
    _tag(test_client, "施工流程")
    team = [_upload(test_client, "secondary", ["桃子", "团队介绍"]).json()["id"] for _ in range(3)]
    flow = [_upload(test_client, "secondary", ["桃子", "施工流程"]).json()["id"] for _ in range(7)]
    _package(test_client, note_id, "样板间招募", team + flow)

    result = test_client.post(
        "/api/packages/recommend-secondaries",
        json={"ip_name": "桃子", "benefit_point": "报价"},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["matched_benefit"] is False
    assert body["summary"].startswith("未按利益点")
    assert len(body["asset_ids"]) == 10
    assert set(body["asset_ids"][:3]) == set(team)
    assert set(body["asset_ids"][3:]) == set(flow)

    empty = test_client.post(
        "/api/packages/recommend-secondaries",
        json={"ip_name": "佳佳", "benefit_point": "报价"},
    )
    assert empty.status_code == 200
    assert empty.json()["asset_ids"] == []
    assert "没有可用次图" in empty.json()["summary"]

    missing_ip = test_client.post(
        "/api/packages/recommend-secondaries",
        json={"ip_name": "  ", "benefit_point": "报价"},
    )
    assert missing_ip.status_code == 400
