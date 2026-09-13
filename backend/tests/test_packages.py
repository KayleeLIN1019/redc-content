import zipfile

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.conftest import PIXEL_PNG
from tests.test_assets import _upload


def _confirmed_note(client: TestClient) -> int:
    client.put(
        "/api/settings",
        json={
            "api_key": "",
            "api_base_url": "",
            "llm_model": "deepseek-chat",
            "prompt_skills": {"桃子": "skill"},
            "primary_price": 0,
            "secondary_price": 0,
        },
    )
    created = client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    note_id = created.json()["id"]
    client.patch(f"/api/notes/{note_id}", json={"final_content": "定稿文案"})
    return note_id


def test_create_and_export_package(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    note_id = _confirmed_note(test_client)
    primary = _upload(test_client, "primary")
    secondary = _upload(test_client, "secondary", ["户型图"])
    created = test_client.post(
        "/api/packages",
        json={
            "title": "测试套件",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [secondary.json()["id"]],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    reused = test_client.post(
        "/api/packages",
        json={
            "title": "重复主图",
            "ip_name": "桃子",
            "benefit_point": "清单报价",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note_id,
        },
    )
    assert reused.status_code == 400

    exported = test_client.post("/api/packages/export", json={"package_ids": [package_id]})
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/zip")

    from io import BytesIO

    with zipfile.ZipFile(BytesIO(exported.content)) as archive:
        names = archive.namelist()
        assert any(name.endswith("文案.md") for name in names)
        assert any("主图" in name for name in names)
        assert any("次图1" in name for name in names)
        copy = archive.read(next(name for name in names if name.endswith("文案.md"))).decode("utf-8")
        assert copy == "定稿文案"

    listed = test_client.get("/api/packages")
    assert listed.json()["items"][0]["status"] == "exported"

    unused = _upload(test_client, "primary")
    unconfirmed = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "未定稿"})
    bad = test_client.post(
        "/api/packages",
        json={
            "title": "坏套件",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": unused.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": unconfirmed.json()["id"],
        },
    )
    assert bad.status_code == 400


def test_delete_draft_package_releases_primary(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    note_id = _confirmed_note(test_client)
    primary = _upload(test_client, "primary")
    created = test_client.post(
        "/api/packages",
        json={
            "title": "可删草稿",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]
    primary_id = primary.json()["id"]

    assert test_client.delete(f"/api/assets/{primary_id}").status_code == 400
    assert test_client.delete(f"/api/notes/{note_id}").status_code == 400

    removed = test_client.delete(f"/api/packages/{package_id}")
    assert removed.status_code == 204
    assert test_client.get("/api/packages").json()["items"] == []

    available = test_client.get("/api/assets", params={"available_only": True})
    assert primary_id in {item["id"] for item in available.json()["items"]}
    assert test_client.delete(f"/api/assets/{primary_id}").status_code == 204
    assert test_client.delete(f"/api/notes/{note_id}").status_code == 204


def test_cannot_delete_published_package(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    note_id = _confirmed_note(test_client)
    primary = _upload(test_client, "primary")
    created = test_client.post(
        "/api/packages",
        json={
            "title": "已发布",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note_id,
        },
    )
    package_id = created.json()["id"]
    published = test_client.patch(
        f"/api/packages/{package_id}/publish",
        json={"note_id": "n1"},
    )
    assert published.status_code == 200
    blocked = test_client.delete(f"/api/packages/{package_id}")
    assert blocked.status_code == 400
    assert "已发布" in blocked.json()["detail"]
