from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.test_assets import _upload
from tests.test_packages import _confirmed_note


def test_dashboard_and_publish(client: tuple[TestClient, sessionmaker]) -> None:
    test_client, _ = client
    empty = test_client.get("/api/dashboard")
    assert empty.status_code == 200
    assert empty.json()["total_packages"] == 0
    assert empty.json()["estimated_revenue"] == 0

    note_id = _confirmed_note(test_client)
    test_client.put(
        "/api/settings",
        json={
            "api_key": "",
            "api_base_url": "",
            "llm_model": "deepseek-chat",
            "prompt_skills": {"桃子": "skill"},
            "primary_price": 10,
            "secondary_price": 3,
        },
    )
    primary = _upload(test_client, "primary", ["桃子"])
    secondary = _upload(test_client, "secondary", ["户型图", "桃子"])
    created = test_client.post(
        "/api/packages",
        json={
            "title": "看板套件",
            "ip_name": "桃子",
            "benefit_point": "装企承诺",
            "primary_asset_id": primary.json()["id"],
            "secondary_asset_ids": [secondary.json()["id"]],
            "competitor_note_id": note_id,
        },
    )
    assert created.status_code == 201
    package_id = created.json()["id"]

    extra_primary = _upload(test_client, "primary", ["效果图"])
    assert extra_primary.status_code == 201

    stats = test_client.get("/api/dashboard").json()
    assert stats["total_packages"] == 1
    assert stats["unpublished_count"] == 1
    assert stats["inventory_primary"] == 2
    assert stats["inventory_secondary"] == 1
    assert stats["billable_primary"] == 2
    assert stats["billable_secondary"] == 1
    assert stats["excluded_count"] == 0
    assert stats["primary_used"] == 1
    assert stats["secondary_used"] == 1
    assert stats["estimated_revenue"] == 23
    peach = next(item for item in stats["revenue_by_ip"] if item["ip_name"] == "桃子")
    assert peach["primary_count"] == 1
    assert peach["secondary_count"] == 1
    assert peach["primary_revenue"] == 10
    assert peach["secondary_revenue"] == 3
    untagged = next(item for item in stats["revenue_by_ip"] if item["ip_name"] == "未打 IP")
    assert untagged["primary_count"] == 1
    assert untagged["secondary_count"] == 0
    assert stats["benefit_distribution"][0]["benefit_point"] == "装企承诺"
    assert stats["published_by_benefit"] == []
    by_tag = {item["tag"]: item["count"] for item in stats["assets_by_tag"]}
    assert by_tag["户型图"] == 1
    assert by_tag["效果图"] == 1

    published = test_client.patch(
        f"/api/packages/{package_id}/publish",
        json={"note_id": "note-88", "publish_time": "2026-09-13T12:00:00"},
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert published.json()["note_id"] == "note-88"

    after = test_client.get("/api/dashboard").json()
    assert after["published_count"] == 1
    assert after["unpublished_count"] == 0
    assert after["published_by_benefit"] == [{"benefit_point": "装企承诺", "count": 1}]

    excluded = test_client.patch(
        f"/api/assets/{secondary.json()['id']}",
        json={"billable": False},
    )
    assert excluded.status_code == 200
    assert excluded.json()["billable"] is False
    billed = test_client.get("/api/dashboard").json()
    assert billed["billable_secondary"] == 0
    assert billed["excluded_count"] == 1
    assert billed["estimated_revenue"] == 20
    peach_after = next(item for item in billed["revenue_by_ip"] if item["ip_name"] == "桃子")
    assert peach_after["secondary_count"] == 0
    assert peach_after["secondary_revenue"] == 0
