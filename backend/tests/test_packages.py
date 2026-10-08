import zipfile

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models import ContentPackage
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
        assert any(name.endswith("文案.txt") for name in names)
        assert any("主图" in name for name in names)
        assert any("次图1" in name for name in names)
        copy = archive.read(next(name for name in names if name.endswith("文案.txt"))).decode("utf-8")
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


def test_export_skips_deleted_secondary_and_keeps_published_kit(
    client: tuple[TestClient, sessionmaker],
) -> None:
    test_client, _ = client
    note_id = _confirmed_note(test_client)
    primary = _upload(test_client, "primary")
    secondary = _upload(test_client, "secondary", ["户型图"])
    created = test_client.post(
        "/api/packages",
        json={
            "title": "发布后换次图",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [secondary.json()["id"]],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]
    published = test_client.patch(
        f"/api/packages/{package_id}/publish",
        json={"note_id": "n-keep"},
    )
    assert published.status_code == 200
    assert test_client.delete(f"/api/assets/{secondary.json()['id']}").status_code == 204

    kept = test_client.get("/api/packages").json()["items"][0]
    assert kept["id"] == package_id
    assert kept["status"] == "published"
    assert kept["note_id"] == "n-keep"
    assert kept["secondary_asset_ids"] == [secondary.json()["id"]]

    stats = test_client.get("/api/dashboard").json()
    assert stats["published_count"] == 1
    assert stats["secondary_used"] == 1
    assert stats["inventory_secondary"] == 0

    exported = test_client.post("/api/packages/export", json={"package_ids": [package_id]})
    assert exported.status_code == 200
    from io import BytesIO

    with zipfile.ZipFile(BytesIO(exported.content)) as archive:
        names = archive.namelist()
        assert any("主图" in name for name in names)
        assert any(name.endswith("文案.txt") for name in names)
        assert not any("次图" in name for name in names)

    after_export = test_client.get("/api/packages").json()["items"][0]
    assert after_export["status"] == "published"
    assert after_export["note_id"] == "n-keep"


def test_publish_direct_marks_assets_used(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    first = _upload(test_client, "primary")
    second = _upload(test_client, "primary")

    created = test_client.post(
        "/api/packages/publish-direct",
        json={
            "title": "旧内容补登记",
            "ip_name": "佳佳",
            "benefit_point": "清单报价",
            "primary_asset_ids": [first.json()["id"], second.json()["id"]],
            "note_id": "abc123",
            "publish_time": "2026-09-01T00:00:00",
        },
    )
    assert created.status_code == 201
    items = created.json()["items"]
    assert len(items) == 2
    assert all(item["status"] == "published" for item in items)
    assert all(item["note_id"] == "abc123" for item in items)
    assert items[0]["publish_time"].startswith("2026-09-01")

    stats = test_client.get("/api/dashboard").json()
    assert stats["published_count"] == 2
    assert stats["primary_used"] == 2

    assets = test_client.get("/api/assets").json()["items"]
    assert all(item["is_used"] for item in assets)

    reused = test_client.post(
        "/api/packages/publish-direct",
        json={
            "title": "重复登记",
            "ip_name": "佳佳",
            "benefit_point": "清单报价",
            "primary_asset_ids": [first.json()["id"]],
        },
    )
    assert reused.status_code == 400

    listed = test_client.get("/api/packages").json()["items"]
    assert len(listed) == 2
    delete_blocked = test_client.delete(f"/api/packages/{listed[0]['id']}")
    assert delete_blocked.status_code == 400


def test_edit_draft_images_releases_old_primary(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, session_factory = client
    note_id = _confirmed_note(test_client)
    primary = _upload(test_client, "primary")
    replacement = _upload(test_client, "primary")
    first_secondary = _upload(test_client, "secondary")
    second_secondary = _upload(test_client, "secondary")
    created = test_client.post(
        "/api/packages",
        json={
            "title": "可编辑草稿",
            "ip_name": "桃子",
            "benefit_point": "装企介绍",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [first_secondary.json()["id"]],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]

    updated = test_client.patch(
        f"/api/packages/{package_id}/images",
        json={
            "primary_asset_id": replacement.json()["id"],
            "secondary_asset_ids": [second_secondary.json()["id"], first_secondary.json()["id"]],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "draft"
    assert updated.json()["primary_asset_id"] == replacement.json()["id"]
    assert updated.json()["secondary_asset_ids"] == [
        second_secondary.json()["id"],
        first_secondary.json()["id"],
    ]
    assets = {item["id"]: item for item in test_client.get("/api/assets").json()["items"]}
    assert assets[primary.json()["id"]]["is_used"] is False
    assert assets[replacement.json()["id"]]["is_used"] is True

    taken = test_client.patch(
        f"/api/packages/{package_id}/images",
        json={"primary_asset_id": primary.json()["id"], "secondary_asset_ids": []},
    )
    assert taken.status_code == 200

    session = session_factory()
    package = session.get(ContentPackage, package_id)
    assert package is not None
    package.status = "exported"
    session.commit()
    session.close()

    blocked = test_client.patch(
        f"/api/packages/{package_id}/images",
        json={"primary_asset_id": replacement.json()["id"], "secondary_asset_ids": []},
    )
    assert blocked.status_code == 400
    assert "未导出" in blocked.json()["detail"]
