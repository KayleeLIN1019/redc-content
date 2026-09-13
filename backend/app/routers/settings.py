from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import LlmTestIn, LlmTestOut, SettingsOut, SettingsUpdate
from app.services.settings import (
    get_or_create_settings,
    test_llm_connection,
    to_settings_out,
    update_settings,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)) -> SettingsOut:
    return to_settings_out(get_or_create_settings(db))


@router.put("", response_model=SettingsOut)
def put_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> SettingsOut:
    return to_settings_out(update_settings(db, payload))


@router.post("/test-llm", response_model=LlmTestOut)
def post_test_llm(payload: LlmTestIn, db: Session = Depends(get_db)) -> LlmTestOut:
    return test_llm_connection(db, payload)
