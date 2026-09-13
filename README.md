# 自动化内容生成与素材管理系统

前后端分离：React (Vite + Tailwind) + FastAPI + SQLite。当前完成 PRD Step 1（脚手架与 Schema）与 Step 2（素材库管理）。

## 目录

- `backend/` FastAPI、SQLAlchemy 模型、Alembic migrations
- `frontend/` Vite React + TypeScript + Tailwind 占位页
- `data/` SQLite 文件 `redc.db`（本地生成，不入库）
- `uploads/` 素材文件
- `exports/` Zip 导出

## 数据库表

| 表 | 用途 |
|---|---|
| `assets` | 主图 / 次图素材库 |
| `competitor_notes` | 竞品原文与 AI/人工改写 |
| `content_packages` | 内容组装与导出状态 |
| `system_settings` | 单例：LLM 配置、IP Skill Prompt、主/次图单价 |
| `tag_catalog` | 次图分类标签库（可增删） |

上传文件在仓库根目录 `uploads/primary/` 与 `uploads/secondary/`，磁盘文件名为「原名_短编号」。

## 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --app-dir .
```

健康检查：`GET http://127.0.0.1:8000/health`

素材库：
- `GET /api/assets` 查询（`type` / `tag` / `available_only`）
- `POST /api/assets` 上传（multipart：`file`、`type`、`category_tags` JSON）
- `GET /api/assets/{id}/file` 预览原图
- 主图一旦绑定 `content_packages`，列表会同步 `is_used=true` 并标记不可选

```bash
cd backend
source .venv/bin/activate
pytest -q
```

## 前端

```bash
cd frontend
npm install
npm run dev
```

默认 `http://localhost:5173`，已配置 CORS 允许该源。
