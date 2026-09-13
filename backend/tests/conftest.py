from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.constants import DEFAULT_LLM_MODEL, SECONDARY_ASSET_TAGS
from app.database import Base, get_db
from app.main import app
from app.models import Asset, CompetitorNote, ContentPackage, SystemSetting, TagCatalog  # noqa: F401

PIXEL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(settings, "uploads_dir", uploads)
    exports = tmp_path / "exports"
    exports.mkdir()
    monkeypatch.setattr(settings, "exports_dir", exports)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    seed_db = TestingSession()
    for name in SECONDARY_ASSET_TAGS:
        seed_db.add(TagCatalog(name=name))
    seed_db.add(
        SystemSetting(
            id=1,
            api_key="",
            api_base_url="",
            llm_model=DEFAULT_LLM_MODEL,
            prompt_skills={},
        )
    )
    seed_db.commit()
    seed_db.close()

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, TestingSession
    app.dependency_overrides.clear()
