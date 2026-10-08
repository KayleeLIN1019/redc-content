from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.test_assets import _upload


def test_image_set_crud(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    first = _upload(test_client, "secondary")
    second = _upload(test_client, "secondary")

    created = test_client.post(
        "/api/image-sets",
        json={"name": "施工对比套图", "asset_ids": [first.json()["id"], second.json()["id"], first.json()["id"]]},
    )
    assert created.status_code == 201
    assert created.json()["name"] == "施工对比套图"
    # 重复 id 去重
    assert created.json()["asset_ids"] == [first.json()["id"], second.json()["id"]]

    listed = test_client.get("/api/image-sets").json()["items"]
    assert len(listed) == 1

    duplicated = test_client.post(
        "/api/image-sets",
        json={"name": "施工对比套图", "asset_ids": [first.json()["id"]]},
    )
    assert duplicated.status_code == 400

    removed = test_client.delete(f"/api/image-sets/{created.json()['id']}")
    assert removed.status_code == 204
    assert test_client.get("/api/image-sets").json()["items"] == []
    # 删除套图不影响素材本身
    assert len(test_client.get("/api/assets").json()["items"]) == 2


def test_image_set_rejects_primary_and_missing(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    primary = _upload(test_client, "primary")

    bad_type = test_client.post(
        "/api/image-sets",
        json={"name": "错误套图", "asset_ids": [primary.json()["id"]]},
    )
    assert bad_type.status_code == 400
    assert "类型错误" in bad_type.json()["detail"]

    missing = test_client.post(
        "/api/image-sets",
        json={"name": "不存在", "asset_ids": [99999]},
    )
    assert missing.status_code == 400

    empty_name = test_client.post(
        "/api/image-sets",
        json={"name": "  ", "asset_ids": []},
    )
    assert empty_name.status_code in (400, 422)

    not_found = test_client.delete("/api/image-sets/99999")
    assert not_found.status_code == 404
