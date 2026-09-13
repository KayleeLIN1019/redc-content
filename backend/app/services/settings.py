from decimal import Decimal
from time import perf_counter

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.constants import DEFAULT_LLM_MODEL, MAX_LLM_CONCURRENCY
from app.models import SystemSetting
from app.schemas import LlmTestIn, LlmTestOut, SettingsOut, SettingsUpdate
from app.services.llm import LLM_TEST_TIMEOUT_SECONDS, complete_chat


def mask_api_key(api_key: str) -> tuple[bool, str]:
    if not api_key:
        return False, ""
    return True, api_key[-4:]


def get_or_create_settings(db: Session) -> SystemSetting:
    row = db.get(SystemSetting, 1)
    if row is None:
        row = SystemSetting(
            id=1,
            api_key="",
            api_base_url="",
            llm_model=DEFAULT_LLM_MODEL,
            max_concurrency=MAX_LLM_CONCURRENCY,
            prompt_skills={},
            primary_price=Decimal("0"),
            secondary_price=Decimal("0"),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def to_settings_out(row: SystemSetting) -> SettingsOut:
    has_api_key, api_key_masked = mask_api_key(row.api_key or "")
    return SettingsOut(
        api_key_masked=api_key_masked,
        has_api_key=has_api_key,
        api_base_url=row.api_base_url or "",
        llm_model=row.llm_model or DEFAULT_LLM_MODEL,
        max_concurrency=int(row.max_concurrency or MAX_LLM_CONCURRENCY),
        prompt_skills=dict(row.prompt_skills or {}),
        primary_price=float(row.primary_price or 0),
        secondary_price=float(row.secondary_price or 0),
    )


def update_settings(db: Session, payload: SettingsUpdate) -> SystemSetting:
    row = get_or_create_settings(db)
    if payload.api_key:
        row.api_key = payload.api_key
    row.api_base_url = payload.api_base_url
    row.llm_model = payload.llm_model.strip() or row.llm_model or DEFAULT_LLM_MODEL
    row.max_concurrency = payload.max_concurrency
    row.prompt_skills = payload.prompt_skills
    row.primary_price = payload.primary_price
    row.secondary_price = payload.secondary_price
    db.commit()
    db.refresh(row)
    return row


def test_llm_connection(db: Session, payload: LlmTestIn) -> LlmTestOut:
    row = get_or_create_settings(db)
    api_key = (payload.api_key or "").strip() or (row.api_key or "").strip()
    api_base_url = (payload.api_base_url or "").strip() or (row.api_base_url or "")
    model = (payload.llm_model or "").strip() or (row.llm_model or DEFAULT_LLM_MODEL)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key，请先填写后再测试")
    started = perf_counter()
    reply = complete_chat(
        api_key=api_key,
        api_base_url=api_base_url,
        model=model,
        system_prompt="You are a connection probe. Reply with the single word OK.",
        user_content="ping",
        timeout=LLM_TEST_TIMEOUT_SECONDS,
    )
    latency_ms = int((perf_counter() - started) * 1000)
    return LlmTestOut(ok=True, model=model, latency_ms=latency_ms, reply=reply[:80])
