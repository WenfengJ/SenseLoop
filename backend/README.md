# SenseLoop Python Backend

这是 SenseLoop Demo 的 Python 后台骨架，用于把前端 mock 逻辑逐步迁移成 API。

## 当前定位

当前后台先做三件事：

- 提供用户画像列表。
- 提供每日身体信号 mock 数据。
- 根据用户画像生成每日健康报告。

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

## API

- `GET /health`
- `GET /api/profiles`
- `GET /api/signals/{profile_type}`
- `GET /api/report/{profile_type}`

## 后续接入点

- `app/adapters/soundcore_adapter.py`
- `app/adapters/eufy_adapter.py`
- `app/adapters/llm_adapter.py`
