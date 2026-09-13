from pathlib import Path
from uuid import uuid4
import re
import shutil

from fastapi import HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.models import Asset, ContentPackage, TagCatalog
from app.schemas import AssetBatchIn, AssetTagsUpdate
from app.services.occupancy import bound_primary_asset_ids, packages_for_asset, raise_if_occupied

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def sync_used_primaries(db: Session) -> None:
    bound_ids = list(db.scalars(select(ContentPackage.primary_asset_id)))
    if not bound_ids:
        return
    db.execute(
        update(Asset)
        .where(
            Asset.id.in_(bound_ids),
            Asset.type == "primary",
            Asset.is_used.is_(False),
        )
        .values(is_used=True)
    )
    db.flush()


def mark_primary_asset_used(db: Session, asset_id: int) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="素材不存在")
    if asset.type == "primary":
        asset.is_used = True
        db.flush()
    return asset


def catalog_names(db: Session) -> set[str]:
    return set(db.scalars(select(TagCatalog.name)))


def validate_category_tags(db: Session, _asset_type: str, tags: list[str]) -> list[str]:
    unique_tags = [item.strip() for item in dict.fromkeys(tags) if item.strip()]
    allowed = catalog_names(db)
    invalid = [tag for tag in unique_tags if tag not in allowed]
    if invalid:
        raise HTTPException(status_code=400, detail=f"无效标签: {', '.join(invalid)}")
    return unique_tags


def _normalize_remove_tags(tags: list[str]) -> list[str]:
    return [item.strip() for item in dict.fromkeys(tags) if item.strip()]


def apply_tag_mode(current: list[str], incoming: list[str], mode: str) -> list[str]:
    if mode == "replace":
        return incoming
    if mode == "add":
        return list(dict.fromkeys([*current, *incoming]))
    drop = set(incoming)
    return [item for item in current if item not in drop]


def relocate_asset_file(asset: Asset, new_type: str) -> None:
    dest_dir = settings.uploads_dir / new_type
    dest_dir.mkdir(parents=True, exist_ok=True)
    source = settings.uploads_dir / asset.file_path
    dest = dest_dir / Path(asset.file_path).name
    if dest.exists() and dest.resolve() != source.resolve():
        dest = dest_dir / f"{Path(dest).stem}_{uuid4().hex[:6]}{dest.suffix}"
    if source.is_file() and source.resolve() != dest.resolve():
        shutil.move(str(source), str(dest))
    elif not dest.is_file():
        raise HTTPException(status_code=400, detail="素材文件不存在，无法改主次图")
    asset.file_path = f"{new_type}/{dest.name}"


def change_asset_type(db: Session, asset: Asset, new_type: str) -> None:
    if asset.type == new_type:
        return
    if new_type == "secondary" and asset.id in bound_primary_asset_ids(db):
        raise HTTPException(
            status_code=400,
            detail="该图已被套件用作主图，不能改成次图。请先到「内容打包」删除对应套件。",
        )
    relocate_asset_file(asset, new_type)
    asset.type = new_type
    if new_type == "secondary":
        asset.is_used = False


def update_asset(db: Session, asset_id: int, payload: AssetTagsUpdate) -> Asset:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="素材不存在")
    if payload.category_tags is None and payload.type is None:
        raise HTTPException(status_code=400, detail="请选择要修改的主次图或标签")
    if payload.category_tags is not None:
        asset.category_tags = validate_category_tags(db, asset.type, payload.category_tags)
        flag_modified(asset, "category_tags")
    if payload.type is not None:
        change_asset_type(db, asset, payload.type)
    db.commit()
    db.refresh(asset)
    return asset


def batch_update_assets(db: Session, payload: AssetBatchIn) -> list[Asset]:
    asset_ids = list(dict.fromkeys(payload.asset_ids))
    if not asset_ids:
        raise HTTPException(status_code=400, detail="请选择要修改的素材")

    assets = list(db.scalars(select(Asset).where(Asset.id.in_(asset_ids))))
    found = {asset.id: asset for asset in assets}
    missing = [item for item in asset_ids if item not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"素材不存在: {', '.join(map(str, missing))}")

    add_tags = validate_category_tags(db, "any", payload.add_tags) if payload.add_tags else []
    remove_tags = _normalize_remove_tags(payload.remove_tags)
    if payload.type is None and not add_tags and not remove_tags:
        raise HTTPException(status_code=400, detail="请选择要修改的主次图或标签")

    if payload.type == "secondary":
        locked = [item for item in asset_ids if item in bound_primary_asset_ids(db)]
        if locked:
            raise HTTPException(
                status_code=400,
                detail=f"这些图已被套件用作主图，不能改成次图: {', '.join(map(str, locked))}",
            )

    updated: list[Asset] = []
    for asset_id in asset_ids:
        asset = found[asset_id]
        if payload.type is not None:
            change_asset_type(db, asset, payload.type)
        next_tags = list(asset.category_tags or [])
        if add_tags:
            next_tags = apply_tag_mode(next_tags, add_tags, "add")
        if remove_tags:
            next_tags = apply_tag_mode(next_tags, remove_tags, "remove")
        if next_tags != list(asset.category_tags or []):
            asset.category_tags = next_tags
            flag_modified(asset, "category_tags")
        updated.append(asset)
    db.commit()
    for asset in updated:
        db.refresh(asset)
    return updated


def sanitize_stem(filename: str) -> str:
    stem = Path(filename).stem
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", stem).strip(" .")
    return (cleaned or "image")[:80]


def save_upload(file: UploadFile, asset_type: str) -> tuple[str, str]:
    original = file.filename or "upload"
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 jpg / jpeg / png / webp / gif")

    dest_dir = settings.uploads_dir / asset_type
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{sanitize_stem(original)}_{uuid4().hex[:8]}{ext}"
    dest = dest_dir / stored_name
    size = 0
    with dest.open("wb") as buffer:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            buffer.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="文件为空")
    return f"{asset_type}/{stored_name}", Path(original).name


def resolve_asset_file(asset: Asset) -> Path:
    uploads_root = settings.uploads_dir.resolve()
    path = (settings.uploads_dir / asset.file_path).resolve()
    if not path.is_relative_to(uploads_root) or not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return path


def delete_asset(db: Session, asset_id: int) -> None:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="素材不存在")
    raise_if_occupied("素材", packages_for_asset(db, asset.id))
    path = settings.uploads_dir / asset.file_path
    if path.is_file():
        path.unlink()
    db.delete(asset)
    db.commit()
