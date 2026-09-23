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
- `GET /api/ai/status`
- `GET /api/profiles`
- `GET /api/signals/{profile_type}`
- `GET /api/profiles/{profile_id}/signals?date=2026-09-18`
- `GET /api/report/{profile_type}`
- `POST /api/profiles/{profile_id}/reports/{date}/generate`
- `POST /api/profiles/{profile_id}/signals/{date}/observations`
- `POST /api/profiles/{profile_id}/tongue-analysis`
- `POST /api/knowledge/sources`
- `POST /api/knowledge/search`
- `POST /api/agent/sessions`
- `POST /api/agent/sessions/{session_id}/messages`

前三个展示 API 会在数据库不可用时 fallback 到 mock 数据；写入类 API 需要数据库可用。

## AI 通道配置

后端会自动读取 `backend/.env`，不会把密钥提交到 Git。

DeepSeek 使用 OpenAI-compatible 通道，推荐配置：

```bash
DEEPSEEK_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.deepseek.com"
OPENAI_MODEL="deepseek-chat"
```

检查 AI 通道配置是否被读取：

```bash
curl http://127.0.0.1:8000/api/ai/status
```

当前已打通：

- `POST /api/agent/sessions`
- `POST /api/agent/sessions/{session_id}/messages`
- `POST /api/profiles/{profile_id}/tongue-analysis`

其中 messages 接口会先保存用户消息，再尝试调用 DeepSeek 生成 assistant 回复，并把回复保存为 `agent_messages.role = assistant`。如果密钥缺失或模型调用失败，接口会保留现有降级文案，方便后续继续开发 RAG、工具调用和多轮上下文。

舌诊分析接口会接收前端上传后的结构化舌象标签和图片元信息，创建 `agent_sessions.session_type = tongue_analysis` 会话，调用模型生成手机报告页可展示的分析文本，并把输入、输出、模型名、AI 是否启用写入 `signal_observations.signal_type = tongue_analysis`。如果模型调用失败，接口会返回后端规则生成的降级分析，同时仍然落库，保证页面可用。

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
