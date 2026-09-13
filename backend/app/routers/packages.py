from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ContentPackage
from app.schemas import (
    PackageCreateIn,
    PackageExportIn,
    PackageListOut,
    PackageOut,
    PackagePublishIn,
)
from app.services.packages import create_package, delete_package, export_packages, list_packages


def to_package_out(package: ContentPackage) -> PackageOut:
    return PackageOut(
        id=package.id,
        title=package.title,
        ip_name=package.ip_name,
        benefit_point=package.benefit_point,
        primary_asset_id=package.primary_asset_id,
        secondary_asset_ids=list(package.secondary_asset_ids or []),
        competitor_note_id=package.competitor_note_id,
        export_folder_name=package.export_folder_name,
        status=package.status,
        publish_time=package.publish_time,
        note_id=package.note_id,
        created_at=package.created_at,
    )

router = APIRouter(prefix="/api/packages", tags=["packages"])


@router.get("", response_model=PackageListOut)
def get_packages(db: Session = Depends(get_db)) -> PackageListOut:
    return PackageListOut(items=[to_package_out(item) for item in list_packages(db)])


@router.post("", response_model=PackageOut, status_code=201)
def post_package(payload: PackageCreateIn, db: Session = Depends(get_db)) -> PackageOut:
    return to_package_out(create_package(db, payload))


@router.delete("/{package_id}", status_code=204)
def remove_package(package_id: int, db: Session = Depends(get_db)) -> None:
    delete_package(db, package_id)


@router.patch("/{package_id}/publish", response_model=PackageOut)
def patch_publish(
    package_id: int,
    payload: PackagePublishIn,
    db: Session = Depends(get_db),
) -> PackageOut:
    from app.services.dashboard import publish_package

    return to_package_out(publish_package(db, package_id, payload))


@router.post("/export")
def post_export(payload: PackageExportIn, db: Session = Depends(get_db)) -> FileResponse:
    zip_path = export_packages(db, payload.package_ids)
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=zip_path.name,
    )
