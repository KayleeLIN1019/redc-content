from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import ImageSetCreateIn, ImageSetListOut, ImageSetOut
from app.services.image_sets import create_image_set, delete_image_set, list_image_sets

router = APIRouter(prefix="/api/image-sets", tags=["image-sets"])


@router.get("", response_model=ImageSetListOut)
def get_image_sets(db: Session = Depends(get_db)) -> ImageSetListOut:
    return ImageSetListOut(items=[ImageSetOut.model_validate(item) for item in list_image_sets(db)])


@router.post("", response_model=ImageSetOut, status_code=201)
def post_image_set(payload: ImageSetCreateIn, db: Session = Depends(get_db)) -> ImageSetOut:
    return ImageSetOut.model_validate(create_image_set(db, payload))


@router.delete("/{image_set_id}", status_code=204)
def remove_image_set(image_set_id: int, db: Session = Depends(get_db)) -> Response:
    delete_image_set(db, image_set_id)
    return Response(status_code=204)
