import json
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Asset
from app.schemas import AssetBatchIn, AssetListOut, AssetOut, AssetTagsUpdate
from app.services.assets import (
    batch_update_assets,
    delete_asset,
    resolve_asset_file,
    save_upload,
    sync_used_primaries,
    update_asset,
    validate_category_tags,
)
from app.services.occupancy import bound_primary_asset_ids

router = APIRouter(prefix="/api/assets", tags=["assets"])


def _to_out(asset: Asset, bound_primary_ids: set[int] | None = None) -> AssetOut:
    used_primary = asset.type == "primary" and asset.is_used
    locked = bound_primary_ids if bound_primary_ids is not None else set()
    return AssetOut(
        id=asset.id,
        type=asset.type,  # type: ignore[arg-type]
        file_path=asset.file_path,
        original_filename=asset.original_filename or "",
        storage_path=f"uploads/{asset.file_path}",
        category_tags=list(asset.category_tags or []),
        is_used=asset.is_used,
        billable=bool(asset.billable),
        selectable=not used_primary,
        type_locked=asset.id in locked,
        url=f"/api/assets/{asset.id}/file",
        created_at=asset.created_at,
    )


@router.get("", response_model=AssetListOut)
def list_assets(
    asset_type: Literal["primary", "secondary"] | None = Query(default=None, alias="type"),
    tag: str | None = None,
    available_only: bool = False,
    db: Session = Depends(get_db),
) -> AssetListOut:
    sync_used_primaries(db)
    db.commit()

    stmt = select(Asset).order_by(Asset.created_at.desc(), Asset.id.desc())
    if asset_type:
        stmt = stmt.where(Asset.type == asset_type)
    if available_only:
        stmt = stmt.where(or_(Asset.type != "primary", Asset.is_used.is_(False)))
    assets = list(db.scalars(stmt))
    if tag:
        assets = [item for item in assets if tag in (item.category_tags or [])]
    bound = bound_primary_asset_ids(db)
    return AssetListOut(items=[_to_out(item, bound) for item in assets])


@router.patch("/batch", response_model=AssetListOut)
def patch_batch_assets(payload: AssetBatchIn, db: Session = Depends(get_db)) -> AssetListOut:
    items = batch_update_assets(db, payload)
    bound = bound_primary_asset_ids(db)
    return AssetListOut(items=[_to_out(item, bound) for item in items])


@router.post("", response_model=AssetOut, status_code=201)
async def upload_asset(
    file: UploadFile = File(...),
    asset_type: Literal["primary", "secondary"] = Form(..., alias="type"),
    category_tags: str = Form(default="[]"),
    db: Session = Depends(get_db),
) -> AssetOut:
    try:
        raw_tags = json.loads(category_tags) if category_tags else []
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="category_tags 必须是 JSON 数组") from exc
    if not isinstance(raw_tags, list) or not all(isinstance(item, str) for item in raw_tags):
        raise HTTPException(status_code=400, detail="category_tags 必须是字符串数组")

    tags = validate_category_tags(db, asset_type, raw_tags)
    relative_path, original_filename = save_upload(file, asset_type)
    asset = Asset(
        type=asset_type,
        file_path=relative_path,
        original_filename=original_filename,
        category_tags=tags,
        is_used=False,
        billable=True,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _to_out(asset, bound_primary_asset_ids(db))


@router.patch("/{asset_id}", response_model=AssetOut)
def patch_asset(
    asset_id: int,
    payload: AssetTagsUpdate,
    db: Session = Depends(get_db),
) -> AssetOut:
    asset = update_asset(db, asset_id, payload)
    return _to_out(asset, bound_primary_asset_ids(db))


@router.delete("/{asset_id}", status_code=204)
def remove_asset(asset_id: int, db: Session = Depends(get_db)) -> None:
    delete_asset(db, asset_id)


@router.get("/{asset_id}/file")
def get_asset_file(asset_id: int, db: Session = Depends(get_db)) -> FileResponse:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="素材不存在")
    path = resolve_asset_file(asset)
    return FileResponse(path)
