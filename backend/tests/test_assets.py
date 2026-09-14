import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models import CompetitorNote, ContentPackage
from tests.conftest import PIXEL_PNG


def _upload(
    client: TestClient,
    asset_type: str,
    tags: list[str] | None = None,
    filename: str = "pixel.png",
):
    data = {"type": asset_type, "category_tags": json.dumps(tags or [])}
    files = {"file": (filename, PIXEL_PNG, "image/png")}
    return client.post("/api/assets", data=data, files=files)


def test_upload_primary_and_list(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    response = _upload(test_client, "primary", filename="客厅.png")
    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "primary"
    assert body["is_used"] is False
    assert body["billable"] is True
    assert body["selectable"] is True
    assert body["category_tags"] == []
    assert body["original_filename"] == "客厅.png"
    assert body["storage_path"].startswith("uploads/primary/客厅_")
    assert body["storage_path"].endswith(".png")

    listed = test_client.get("/api/assets", params={"type": "primary"})
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1

    file_res = test_client.get(body["url"])
    assert file_res.status_code == 200
    assert file_res.content == PIXEL_PNG


def test_upload_and_patch_primary_tags(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    created = _upload(test_client, "primary", ["户型图"])
    assert created.status_code == 201
    assert created.json()["category_tags"] == ["户型图"]
    asset_id = created.json()["id"]

    patched = test_client.patch(f"/api/assets/{asset_id}", json={"category_tags": ["效果图", "户型图"]})
    assert patched.status_code == 200
    assert patched.json()["category_tags"] == ["效果图", "户型图"]

    filtered = test_client.get("/api/assets", params={"type": "primary", "tag": "效果图"})
    assert len(filtered.json()["items"]) == 1


def test_upload_secondary_tags(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    empty = _upload(test_client, "secondary", [])
    assert empty.status_code == 201
    assert empty.json()["category_tags"] == []

    invalid = _upload(test_client, "secondary", ["不存在"])
    assert invalid.status_code == 400

    ok = _upload(test_client, "secondary", ["户型图", "效果图"])
    assert ok.status_code == 201
    assert ok.json()["category_tags"] == ["户型图", "效果图"]

    filtered = test_client.get("/api/assets", params={"type": "secondary", "tag": "户型图"})
    assert len(filtered.json()["items"]) == 1

    empty_filter = test_client.get("/api/assets", params={"tag": "团队"})
    assert empty_filter.json()["items"] == []


def test_batch_update_asset_tags(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    first = _upload(test_client, "primary", ["户型图"])
    second = _upload(test_client, "secondary", ["效果图"])
    third = _upload(test_client, "primary", [])
    ids = [first.json()["id"], second.json()["id"], third.json()["id"]]

    added = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": ids, "add_tags": ["效果图"]},
    )
    assert added.status_code == 200
    by_id = {item["id"]: item["category_tags"] for item in added.json()["items"]}
    assert by_id[ids[0]] == ["户型图", "效果图"]
    assert by_id[ids[1]] == ["效果图"]
    assert by_id[ids[2]] == ["效果图"]

    removed = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": ids[:2], "remove_tags": ["效果图"]},
    )
    assert removed.status_code == 200
    by_id = {item["id"]: item["category_tags"] for item in removed.json()["items"]}
    assert by_id[ids[0]] == ["户型图"]
    assert by_id[ids[1]] == []

    invalid = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": ids, "add_tags": ["不存在的标签"]},
    )
    assert invalid.status_code == 400

    empty = test_client.patch("/api/assets/batch", json={"asset_ids": ids})
    assert empty.status_code == 400
    missing = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": [999], "add_tags": ["户型图"]},
    )
    assert missing.status_code == 404


def test_batch_toggle_billable(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    first = _upload(test_client, "secondary", ["户型图"])
    second = _upload(test_client, "primary")
    ids = [first.json()["id"], second.json()["id"]]
    assert first.json()["billable"] is True

    excluded = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": ids, "billable": False},
    )
    assert excluded.status_code == 200
    assert all(item["billable"] is False for item in excluded.json()["items"])

    restored = test_client.patch(
        f"/api/assets/{ids[0]}",
        json={"billable": True},
    )
    assert restored.status_code == 200
    assert restored.json()["billable"] is True


def test_change_asset_type(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    created = _upload(test_client, "primary", ["户型图"])
    asset_id = created.json()["id"]
    assert created.json()["type"] == "primary"
    assert created.json()["type_locked"] is False

    patched = test_client.patch(f"/api/assets/{asset_id}", json={"type": "secondary"})
    assert patched.status_code == 200
    assert patched.json()["type"] == "secondary"
    assert patched.json()["file_path"].startswith("secondary/")
    assert test_client.get(patched.json()["url"]).status_code == 200

    listed = test_client.get("/api/assets", params={"type": "secondary"})
    assert any(item["id"] == asset_id for item in listed.json()["items"])

    batched = test_client.patch(
        "/api/assets/batch",
        json={"asset_ids": [asset_id], "type": "primary"},
    )
    assert batched.status_code == 200
    assert batched.json()["items"][0]["type"] == "primary"
    assert batched.json()["items"][0]["file_path"].startswith("primary/")


def test_cannot_demote_bound_primary(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    bound = _upload(test_client, "primary")
    test_client.put(
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
    note = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    test_client.patch(f"/api/notes/{note.json()['id']}", json={"final_content": "定稿"})
    created = test_client.post(
        "/api/packages",
        json={
            "title": "占用主图",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": bound.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note.json()["id"],
        },
    )
    assert created.status_code == 201
    listed = test_client.get("/api/assets")
    item = next(row for row in listed.json()["items"] if row["id"] == bound.json()["id"])
    assert item["type_locked"] is True
    blocked = test_client.patch(f"/api/assets/{bound.json()['id']}", json={"type": "secondary"})
    assert blocked.status_code == 400


def test_custom_tag_create_upload_and_delete(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    created = test_client.post("/api/tags", json={"name": " 新风格 "})
    assert created.status_code == 201
    tag = created.json()
    assert tag["name"] == "新风格"
    assert tag["kind"] == "content"

    ip_tag = test_client.post("/api/tags", json={"name": "新IP", "kind": "ip"})
    assert ip_tag.status_code == 201
    assert ip_tag.json()["kind"] == "ip"

    uploaded = _upload(test_client, "secondary", ["新风格", "户型图"])
    assert uploaded.status_code == 201
    asset_id = uploaded.json()["id"]

    patched = test_client.patch(f"/api/assets/{asset_id}", json={"category_tags": ["新风格"]})
    assert patched.status_code == 200
    assert patched.json()["category_tags"] == ["新风格"]

    deleted = test_client.delete(f"/api/tags/{tag['id']}")
    assert deleted.status_code == 204
    remaining = test_client.get("/api/assets")
    item = next(row for row in remaining.json()["items"] if row["id"] == asset_id)
    assert "新风格" not in item["category_tags"]
    names = [row["name"] for row in test_client.get("/api/tags").json()["items"]]
    assert "新风格" not in names


def test_primary_used_after_package_bind(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, SessionLocal = client
    created = _upload(test_client, "primary")
    asset_id = created.json()["id"]

    db = SessionLocal()
    note = CompetitorNote(ip_name="桃子", raw_content="原文", final_content="定稿")
    db.add(note)
    db.flush()
    db.add(
        ContentPackage(
            title="测试套件",
            ip_name="桃子",
            benefit_point="装企承诺",
            primary_asset_id=asset_id,
            secondary_asset_ids=[],
            competitor_note_id=note.id,
            status="draft",
        )
    )
    db.commit()
    db.close()

    listed = test_client.get("/api/assets", params={"type": "primary"})
    item = listed.json()["items"][0]
    assert item["is_used"] is True
    assert item["selectable"] is False

    available = test_client.get("/api/assets", params={"available_only": True})
    assert available.json()["items"] == []


def test_delete_asset_and_block_bound(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    unused = _upload(test_client, "primary")
    assert test_client.delete(f"/api/assets/{unused.json()['id']}").status_code == 204
    assert test_client.get("/api/assets").json()["items"] == []

    bound = _upload(test_client, "primary")
    test_client.put(
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
    note = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    test_client.patch(f"/api/notes/{note.json()['id']}", json={"final_content": "定稿"})
    created = test_client.post(
        "/api/packages",
        json={
            "title": "占用",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": bound.json()["id"],
            "secondary_asset_ids": [],
            "competitor_note_id": note.json()["id"],
        },
    )
    assert created.status_code == 201
    blocked = test_client.delete(f"/api/assets/{bound.json()['id']}")
    assert blocked.status_code == 400
    assert "占用" in blocked.json()["detail"]
    assert "加入待导出套件" in blocked.json()["detail"]


def test_delete_secondary_even_if_listed_in_package(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    test_client.put(
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
    note = test_client.post("/api/notes", json={"ip_name": "桃子", "raw_content": "原文"})
    test_client.patch(f"/api/notes/{note.json()['id']}", json={"final_content": "定稿"})
    primary = _upload(test_client, "primary")
    secondary = _upload(test_client, "secondary", ["户型图"])
    created = test_client.post(
        "/api/packages",
        json={
            "title": "次图可删",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [secondary.json()["id"]],
            "competitor_note_id": note.json()["id"],
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]
    secondary_id = secondary.json()["id"]

    removed = test_client.delete(f"/api/assets/{secondary_id}")
    assert removed.status_code == 204
    assert all(item["id"] != secondary_id for item in test_client.get("/api/assets").json()["items"])

    listed = test_client.get("/api/packages").json()["items"]
    assert listed[0]["id"] == package_id
    assert listed[0]["secondary_asset_ids"] == [secondary_id]
    assert test_client.delete(f"/api/assets/{primary.json()['id']}").status_code == 400
