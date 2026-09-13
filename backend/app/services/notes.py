from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import MAX_LLM_CONCURRENCY, MAX_REWRITE_BATCH
from app.models import CompetitorNote
from app.schemas import (
    NoteConfirmIn,
    NoteRewriteBatchError,
    NoteRewriteBatchIn,
    NoteRewriteBatchOut,
    NoteRewriteIn,
    NoteOut,
)
from app.services.link_fetch import fetch_page_text
from app.services.llm import complete_chat
from app.services.occupancy import packages_for_note, raise_if_occupied
from app.services.settings import get_or_create_settings


def _skill_for_ip(prompt_skills: dict, ip_name: str) -> str:
    raw = prompt_skills.get(ip_name)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    raise HTTPException(
        status_code=400,
        detail=f"未找到 IP「{ip_name}」的改写技能，请先在设置中添加",
    )


def _resolve_source(raw_link: str | None, raw_content: str | None) -> tuple[str | None, str]:
    content = (raw_content or "").strip()
    link = (raw_link or "").strip() or None
    if not content and not link:
        raise HTTPException(status_code=400, detail="请提供竞品链接或粘贴正文")
    if not content and link:
        content = fetch_page_text(link)
    return link, content


def create_note(db: Session, payload: NoteRewriteIn) -> CompetitorNote:
    ip_name = payload.ip_name.strip()
    if not ip_name:
        raise HTTPException(status_code=400, detail="请选择 IP")

    raw_link, raw_content = _resolve_source(payload.raw_link, payload.raw_content)

    settings = get_or_create_settings(db)
    _skill_for_ip(settings.prompt_skills or {}, ip_name)

    note = CompetitorNote(
        ip_name=ip_name,
        raw_link=raw_link,
        raw_content=raw_content,
        ai_draft=None,
        final_content=None,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def rewrite_note(db: Session, payload: NoteRewriteIn) -> CompetitorNote:
    ip_name = payload.ip_name.strip()
    if not ip_name:
        raise HTTPException(status_code=400, detail="请选择 IP")

    raw_link, raw_content = _resolve_source(payload.raw_link, payload.raw_content)
    settings = get_or_create_settings(db)
    if not (settings.api_key or "").strip():
        raise HTTPException(status_code=400, detail="未配置 API Key，请先在设置中填写")

    skill = _skill_for_ip(settings.prompt_skills or {}, ip_name)
    ai_draft = complete_chat(
        api_key=settings.api_key,
        api_base_url=settings.api_base_url,
        model=settings.llm_model,
        system_prompt=skill,
        user_content=raw_content,
    )

    note = CompetitorNote(
        ip_name=ip_name,
        raw_link=raw_link,
        raw_content=raw_content,
        ai_draft=ai_draft,
        final_content=None,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def rewrite_notes_batch(db: Session, payload: NoteRewriteBatchIn) -> NoteRewriteBatchOut:
    ip_name = payload.ip_name.strip()
    if not ip_name:
        raise HTTPException(status_code=400, detail="请选择 IP")
    if not payload.items:
        raise HTTPException(status_code=400, detail="请至少提供一条待改写内容")
    if len(payload.items) > MAX_REWRITE_BATCH:
        raise HTTPException(status_code=400, detail=f"一次最多改写 {MAX_REWRITE_BATCH} 条")

    settings = get_or_create_settings(db)
    if not (settings.api_key or "").strip():
        raise HTTPException(status_code=400, detail="未配置 API Key，请先在设置中填写")
    skill = _skill_for_ip(settings.prompt_skills or {}, ip_name)
    workers = max(1, min(MAX_LLM_CONCURRENCY, int(settings.max_concurrency or MAX_LLM_CONCURRENCY)))

    prepared: list[tuple[str | None, str] | None] = [None] * len(payload.items)
    errors: list[NoteRewriteBatchError] = []
    for index, item in enumerate(payload.items):
        try:
            prepared[index] = _resolve_source(item.raw_link, item.raw_content)
        except HTTPException as exc:
            errors.append(NoteRewriteBatchError(index=index, detail=str(exc.detail)))

    drafts: list[str | None] = [None] * len(payload.items)

    def _generate(index: int, content: str) -> tuple[int, str | None, str | None]:
        try:
            text = complete_chat(
                api_key=settings.api_key,
                api_base_url=settings.api_base_url,
                model=settings.llm_model,
                system_prompt=skill,
                user_content=content,
            )
            return index, text, None
        except HTTPException as exc:
            return index, None, str(exc.detail)
        except Exception as exc:
            return index, None, f"LLM 调用失败: {exc}"

    pending = [(index, source[1]) for index, source in enumerate(prepared) if source is not None]
    if pending:
        with ThreadPoolExecutor(max_workers=min(workers, len(pending))) as pool:
            futures = [pool.submit(_generate, index, content) for index, content in pending]
            for future in as_completed(futures):
                index, text, detail = future.result()
                if detail:
                    errors.append(NoteRewriteBatchError(index=index, detail=detail))
                else:
                    drafts[index] = text

    notes: list[CompetitorNote] = []
    for index, source in enumerate(prepared):
        if source is None or drafts[index] is None:
            continue
        raw_link, raw_content = source
        note = CompetitorNote(
            ip_name=ip_name,
            raw_link=raw_link,
            raw_content=raw_content,
            ai_draft=drafts[index],
            final_content=None,
        )
        db.add(note)
        notes.append(note)
    db.commit()
    for note in notes:
        db.refresh(note)

    if not notes:
        first = errors[0].detail if errors else "改写失败"
        raise HTTPException(status_code=400, detail=first)

    errors.sort(key=lambda item: item.index)
    return NoteRewriteBatchOut(
        items=[NoteOut.model_validate(note) for note in notes],
        errors=errors,
    )


def list_notes(db: Session) -> list[CompetitorNote]:
    stmt = select(CompetitorNote).order_by(
        CompetitorNote.created_at.desc(),
        CompetitorNote.id.desc(),
    )
    return list(db.scalars(stmt))


def confirm_note(db: Session, note_id: int, payload: NoteConfirmIn) -> CompetitorNote:
    note = db.get(CompetitorNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    note.final_content = payload.final_content
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note_id: int) -> None:
    note = db.get(CompetitorNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    raise_if_occupied("改写", packages_for_note(db, note_id))
    db.delete(note)
    db.commit()
