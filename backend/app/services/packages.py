import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Asset, CompetitorNote, ContentPackage
from app.schemas import PackageCreateIn
from app.services.assets import mark_primary_asset_used, resolve_asset_file


def sanitize_part(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "-", value).strip(" .")
    return cleaned or "未命名"


def create_package(db: Session, payload: PackageCreateIn) -> ContentPackage:
    title = payload.title.strip()
    ip_name = payload.ip_name.strip()
    benefit_point = payload.benefit_point.strip()
    if not title or not ip_name or not benefit_point:
        raise HTTPException(status_code=400, detail="标题、IP 和利益点不能为空")

    note = db.get(CompetitorNote, payload.competitor_note_id)
    if note is None or not (note.final_content or "").strip():
        raise HTTPException(status_code=400, detail="请选择已确认定稿的改写文案")
    if note.ip_name != ip_name:
        raise HTTPException(status_code=400, detail="文案 IP 与套件 IP 不一致")

    primary = db.get(Asset, payload.primary_asset_id)
    if primary is None or primary.type != "primary":
        raise HTTPException(status_code=400, detail="请选择一张主图")
    if primary.is_used:
        raise HTTPException(status_code=400, detail="该主图已被使用")

    secondary_ids: list[int] = []
    for asset_id in payload.secondary_asset_ids:
        asset = db.get(Asset, asset_id)
        if asset is None or asset.type != "secondary":
            raise HTTPException(status_code=400, detail=f"次图不存在或类型错误: {asset_id}")
        if asset_id not in secondary_ids:
            secondary_ids.append(asset_id)

    package = ContentPackage(
        title=title,
        ip_name=ip_name,
        benefit_point=benefit_point,
        primary_asset_id=primary.id,
        secondary_asset_ids=secondary_ids,
        competitor_note_id=note.id,
        status="draft",
    )
    db.add(package)
    mark_primary_asset_used(db, primary.id)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="该主图已被绑定到其他套件") from exc
    db.refresh(package)
    return package


def release_primary_if_unbound(db: Session, asset_id: int) -> None:
    still_bound = db.scalar(
        select(ContentPackage.id).where(ContentPackage.primary_asset_id == asset_id).limit(1)
    )
    if still_bound is not None:
        return
    asset = db.get(Asset, asset_id)
    if asset is not None and asset.type == "primary":
        asset.is_used = False


def delete_package(db: Session, package_id: int) -> None:
    package = db.get(ContentPackage, package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="套件不存在")
    if package.status == "published":
        raise HTTPException(
            status_code=400,
            detail="已发布套件不能删除，以免看板数据丢失",
        )
    primary_id = package.primary_asset_id
    db.delete(package)
    db.flush()
    release_primary_if_unbound(db, primary_id)
    db.commit()


def list_packages(db: Session) -> list[ContentPackage]:
    stmt = select(ContentPackage).order_by(
        ContentPackage.created_at.desc(),
        ContentPackage.id.desc(),
    )
    return list(db.scalars(stmt))


def _copy_asset(asset: Asset, dest: Path) -> None:
    source = resolve_asset_file(asset)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)


def export_packages(db: Session, package_ids: list[int]) -> Path:
    if not package_ids:
        raise HTTPException(status_code=400, detail="请选择要导出的内容套件")

    packages: list[ContentPackage] = []
    for package_id in package_ids:
        package = db.get(ContentPackage, package_id)
        if package is None:
            raise HTTPException(status_code=404, detail=f"套件不存在: {package_id}")
        packages.append(package)

    ip_names = {item.ip_name for item in packages}
    if len(ip_names) != 1:
        raise HTTPException(status_code=400, detail="一次只能导出同一 IP 的套件")
    ip_name = next(iter(ip_names))
    folder_name = f"{datetime.now().strftime('%Y%m%d')}-{sanitize_part(ip_name)}"

    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    staging = settings.exports_dir / folder_name
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    ordered = sorted(packages, key=lambda item: (item.created_at, item.id))
    for index, package in enumerate(ordered, start=1):
        note = db.get(CompetitorNote, package.competitor_note_id)
        primary = db.get(Asset, package.primary_asset_id)
        if note is None or primary is None:
            raise HTTPException(status_code=400, detail=f"套件 {package.id} 缺少文案或主图")

        sub_name = f"{index}-{sanitize_part(package.ip_name)}-{sanitize_part(package.benefit_point)}"
        dest = staging / sub_name
        dest.mkdir(parents=True)
        copy_text = (note.final_content or note.ai_draft or "").strip()
        (dest / "文案.md").write_text(copy_text, encoding="utf-8")
        primary_ext = Path(primary.file_path).suffix or ".png"
        _copy_asset(primary, dest / f"主图{primary_ext}")
        for i, secondary_id in enumerate(package.secondary_asset_ids or [], start=1):
            secondary = db.get(Asset, secondary_id)
            if secondary is None:
                continue
            ext = Path(secondary.file_path).suffix or ".png"
            _copy_asset(secondary, dest / f"次图{i}{ext}")

        package.status = "exported"
        package.export_folder_name = folder_name

    zip_path = settings.exports_dir / f"{folder_name}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path in staging.rglob("*"):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(settings.exports_dir))

    db.commit()
    return zip_path
