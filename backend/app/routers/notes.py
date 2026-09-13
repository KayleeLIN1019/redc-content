from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    NoteConfirmIn,
    NoteListOut,
    NoteOut,
    NoteParseLinkIn,
    NoteParseLinkOut,
    NoteRewriteBatchIn,
    NoteRewriteBatchOut,
    NoteRewriteIn,
)
from app.services.link_fetch import fetch_page_text
from app.services.notes import (
    confirm_note,
    create_note,
    delete_note,
    list_notes,
    rewrite_note,
    rewrite_notes_batch,
)

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=NoteListOut)
def get_notes(db: Session = Depends(get_db)) -> NoteListOut:
    return NoteListOut(items=[NoteOut.model_validate(item) for item in list_notes(db)])


@router.post("", response_model=NoteOut, status_code=201)
def post_note(payload: NoteRewriteIn, db: Session = Depends(get_db)) -> NoteOut:
    return NoteOut.model_validate(create_note(db, payload))


@router.post("/rewrite", response_model=NoteOut, status_code=201)
def post_rewrite(payload: NoteRewriteIn, db: Session = Depends(get_db)) -> NoteOut:
    return NoteOut.model_validate(rewrite_note(db, payload))


@router.post("/rewrite/batch", response_model=NoteRewriteBatchOut)
def post_rewrite_batch(
    payload: NoteRewriteBatchIn, db: Session = Depends(get_db)
) -> NoteRewriteBatchOut:
    return rewrite_notes_batch(db, payload)


@router.post("/parse-link", response_model=NoteParseLinkOut)
def post_parse_link(payload: NoteParseLinkIn) -> NoteParseLinkOut:
    url = payload.url.strip()
    return NoteParseLinkOut(url=url, content=fetch_page_text(url))


@router.patch("/{note_id}", response_model=NoteOut)
def patch_note(
    note_id: int,
    payload: NoteConfirmIn,
    db: Session = Depends(get_db),
) -> NoteOut:
    return NoteOut.model_validate(confirm_note(db, note_id, payload))


@router.delete("/{note_id}", status_code=204)
def remove_note(note_id: int, db: Session = Depends(get_db)) -> None:
    delete_note(db, note_id)
