# SenseLoop Python Backend

这是 SenseLoop Demo 的 Python 后台骨架，用于把前端 mock 逻辑逐步迁移成 API。

## 当前定位

当前后台先做三件事：

- 提供用户画像列表。
- 提供每日身体信号 mock 数据。
- 根据用户画像生成每日健康报告。
- 启动时自动初始化本地 SQLite 或生产 PostgreSQL，并把 Demo 数据 seed 到数据库。

真实 soundcore Work SDK、eufy SDK、音频识别、图像识别、LLM API Key 都通过 adapter 预留，现场拿到能力后再替换。

## 启动方式

推荐从项目根目录启动：

```bash
bash scripts/start-backend.sh
```

### 标准库零依赖版本

如果现场网络不可用，无法安装 FastAPI，可以直接启动零依赖版本：

```bash
cd backend
python3 simple_server.py
```

服务地址：

```text
http://127.0.0.1:8000
```

如 8000 端口被占用或被限制：

```bash
PORT=8010 python3 simple_server.py
```

### FastAPI 版本

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

默认未配置 `DATABASE_URL` 时，后端会使用本地 SQLite：

```text
backend/.local/senseloop.db
```

生产环境使用 PostgreSQL：

```bash
export DATABASE_URL="postgresql://senseloop_app:<password>@senseloop_postgres:5432/senseloop"
```

如果是 `postgresql://`，后端会自动转换为 SQLAlchemy 的 `postgresql+psycopg://`。

## API

- `GET /health`
- `GET /api/db/status`
- `GET /api/profiles`
- `GET /api/signals/{profile_type}`
- `GET /api/profiles/{profile_id}/signals?date=2026-09-18`
- `GET /api/report/{profile_type}`
- `POST /api/profiles/{profile_id}/reports/{date}/generate`
- `POST /api/profiles/{profile_id}/signals/{date}/observations`
- `POST /api/knowledge/sources`
- `POST /api/knowledge/search`
- `POST /api/agent/sessions`
- `POST /api/agent/sessions/{session_id}/messages`

前三个展示 API 会在数据库不可用时 fallback 到 mock 数据；写入类 API 需要数据库可用。

## Mock 数据入库

初始化本地数据库并写入更丰富的 7 天趋势、用户反馈、媒体元信息、知识库切片和 Agent 样例：

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python scripts/seed_rich_mock_data.py
```

这批数据用于下一阶段前端切 API、RAG 检索和 AI Agent 调试。图片/音频仍只写入 `media_assets.storage_key` 元信息，不把原始二进制塞进 PostgreSQL。

## 后续接入点

- `app/adapters/soundcore_adapter.py`
- `app/adapters/eufy_adapter.py`
- `app/adapters/llm_adapter.py`
- `app/repositories/senseloop_repo.py`
- `app/models/tables.py`
