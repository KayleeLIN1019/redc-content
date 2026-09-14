from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import TagCreate, TagListOut, TagOut
from app.services.tags import create_tag, delete_tag, list_tags

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=TagListOut)
def get_tags(db: Session = Depends(get_db)) -> TagListOut:
    return TagListOut(items=[TagOut.model_validate(item) for item in list_tags(db)])


@router.post("", response_model=TagOut, status_code=201)
def post_tag(payload: TagCreate, db: Session = Depends(get_db)) -> TagOut:
    return TagOut.model_validate(create_tag(db, payload.name, payload.kind))


@router.delete("/{tag_id}", status_code=204)
def remove_tag(tag_id: int, db: Session = Depends(get_db)) -> Response:
    delete_tag(db, tag_id)
    return Response(status_code=204)
