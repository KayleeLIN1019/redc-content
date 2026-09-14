from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ContentPackage

PACKAGE_STATUS_LABELS = {
    "draft": "草稿",
    "exported": "已导出",
    "published": "已发布",
}


def package_brief(package: ContentPackage) -> str:
    status = PACKAGE_STATUS_LABELS.get(package.status, package.status)
    return f"「{package.title}」({status}，{package.ip_name}·{package.benefit_point})"


def bound_primary_asset_ids(db: Session) -> set[int]:
    return set(db.scalars(select(ContentPackage.primary_asset_id)))


def packages_for_asset(db: Session, asset_id: int) -> list[ContentPackage]:
    """Only primary images occupy a kit. Secondaries stay listed but can be deleted."""
    stmt = select(ContentPackage).where(ContentPackage.primary_asset_id == asset_id)
    return list(db.scalars(stmt))


def packages_for_note(db: Session, note_id: int) -> list[ContentPackage]:
    stmt = select(ContentPackage).where(ContentPackage.competitor_note_id == note_id)
    return list(db.scalars(stmt))


def raise_if_occupied(kind: str, packages: list[ContentPackage]) -> None:
    if not packages:
        return
    labels = "、".join(package_brief(item) for item in packages)
    published = any(item.status == "published" for item in packages)
    if kind == "主图":
        hint = (
            "已发布套件会留在看板里，不能删绑定的主图。"
            if published
            else "点「加入待导出套件」就会占用主图，即使还没下载 Zip。请先到「内容打包」删除该套件。"
        )
    else:
        hint = (
            "已发布套件会留在看板里，不能删绑定的改写。"
            if published
            else (
                "点「加入待导出套件」就会占用，即使还没下载 Zip。"
                "请先到「内容打包」删除该套件。"
            )
        )
    raise HTTPException(status_code=400, detail=f"该{kind}已被套件{labels}占用。{hint}")
