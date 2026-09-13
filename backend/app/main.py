from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.routers.assets import router as assets_router
from app.routers.dashboard import router as dashboard_router
from app.routers.notes import router as notes_router
from app.routers.packages import router as packages_router
from app.routers.settings import router as settings_router
from app.routers.tags import router as tags_router
from app.schemas import TagListOut, TagOut
from app.services.tags import list_tags

app = FastAPI(title="Redc", description="自动化内容生成与素材管理系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets_router)
app.include_router(dashboard_router)
app.include_router(notes_router)
app.include_router(packages_router)
app.include_router(settings_router)
app.include_router(tags_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meta/secondary-tags", response_model=TagListOut)
def secondary_tags_alias(db: Session = Depends(get_db)) -> TagListOut:
    return TagListOut(items=[TagOut.model_validate(item) for item in list_tags(db)])
