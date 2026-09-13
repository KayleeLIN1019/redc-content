from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDC_")

    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'redc.db'}"
    uploads_dir: Path = PROJECT_ROOT / "uploads"
    exports_dir: Path = PROJECT_ROOT / "exports"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
