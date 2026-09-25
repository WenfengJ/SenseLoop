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
- `POST /api/identity/guest`
- `POST /api/auth/email/code`
- `POST /api/auth/email/verify`
- `POST /api/auth/session`
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

## 账号与邮箱验证码

当前已支持两种入口：

- 游客身份：`POST /api/identity/guest`，适合首次体验，会自动创建本机游客档案。
- 邮箱验证码：`POST /api/auth/email/code` 发码，`POST /api/auth/email/verify` 验证并登录，同一邮箱在不同设备会复用同一个账号和默认健康档案。

验证码会以哈希形式写入数据库，默认 10 分钟有效，错误尝试超过 5 次后需要重新发送。验证成功后签发 30 天会话令牌，前端刷新时通过 `POST /api/auth/session` 恢复身份。

如果没有配置 SMTP，发码接口会返回 `delivery = "dev"` 和 `devCode`，用于本地演示和测试。生产发信可在 `backend/.env` 配置：

```bash
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="noreply@example.com"
SMTP_PASSWORD="..."
SMTP_FROM="noreply@example.com"
SMTP_TLS="true"
EMAIL_CODE_SECRET="change-me"
AUTH_SESSION_DAYS="30"
```

## AI 通道配置

后端会自动读取 `backend/.env`，不会把密钥提交到 Git。

DeepSeek 使用 OpenAI-compatible 通道，推荐配置：

```bash
DEEPSEEK_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.deepseek.com"
OPENAI_MODEL="deepseek-chat"
DEEPSEEK_VISION_MODEL="deepseek-flash"
```

`OPENAI_MODEL` 用于普通问诊、报告润色和文本分析；`DEEPSEEK_VISION_MODEL` 用于图片资料、舌图、饮食图等需要看图的解读。没有配置视觉模型时，后端会尝试用默认模型处理图片；如果模型不支持图片，会返回“未能可靠识别图片内容”的诚实提示，不会根据文件名猜测结论。

检查 AI 通道配置是否被读取：

```bash
curl http://127.0.0.1:8000/api/ai/status
```

当前已打通：

- `POST /api/agent/sessions`
- `POST /api/agent/sessions/{session_id}/messages`
- `POST /api/profiles/{profile_id}/tongue-analysis`
- `POST /api/profiles/{profile_id}/documents/summarize`

其中 messages 接口会先保存用户消息，再尝试调用 DeepSeek 生成 assistant 回复，并把回复保存为 `agent_messages.role = assistant`。如果密钥缺失或模型调用失败，接口会保留现有降级文案，方便后续继续开发 RAG、工具调用和多轮上下文。

舌诊分析接口会接收前端上传后的结构化舌象标签和图片元信息，创建 `agent_sessions.session_type = tongue_analysis` 会话，调用模型生成手机报告页可展示的分析文本，并把输入、输出、模型名、AI 是否启用写入 `signal_observations.signal_type = tongue_analysis`。如果模型调用失败，接口会返回后端规则生成的降级分析，同时仍然落库，保证页面可用。

健康资料解读接口会保存图片/PDF 元信息，PDF 会优先提取文本，图片会优先调用视觉模型。生成结果会写入 `health_documents.summary`，并同步写入 `signal_observations.signal_type = health_document_summary`，供问诊 Agent 读取。

## 文件存储

第一版生产部署暂时选择服务器本地磁盘，也就是云服务器挂载盘。原始图片、PDF、后续音频不写入 PostgreSQL，后端会把文件保存到：

```text
backend/.local/uploads/
```

数据库只保存 `media_assets.storage_key`、`mime_type`、`byte_size`、`sha256`、`privacy_level`，并在 `health_documents.extra_metadata.mediaAssetId` 里关联文件资产。这样后续迁移到 MinIO、S3、R2 等对象存储时，可以尽量保持 API 和业务表不变，只替换存储 adapter。

可选环境变量：

```bash
LOCAL_FILE_STORAGE_DIR="/data/senseloop"
LOCAL_FILE_STORAGE_MAX_BYTES="20971520"
```

默认最大单文件 20MB。`backend/.local/` 已在 `.gitignore` 中，不会提交原始健康资料。

## Mock 数据入库

初始化本地数据库并写入更丰富的 7 天趋势、用户反馈、媒体元信息、知识库切片和 Agent 样例：

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python scripts/seed_rich_mock_data.py
```

这批数据用于下一阶段前端切 API、RAG 检索和 AI Agent 调试。图片/音频只把索引信息写入 `media_assets`，原始二进制由文件存储层保存，不塞进 PostgreSQL。

## 后续接入点

- `app/adapters/soundcore_adapter.py`
- `app/adapters/eufy_adapter.py`
- `app/adapters/llm_adapter.py`
- `app/repositories/senseloop_repo.py`
- `app/models/tables.py`
