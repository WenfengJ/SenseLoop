# anker-SenseLoop

观息 SenseLoop 是一款基于夜间声音、睡眠、饮食、排便、舌苔、口气等多模态身体信号的 AI 健康助手。它不只是记录用户昨晚发生了什么，而是帮用户读懂身体每天释放的细微信号，并在早晨生成“今天怎么吃、怎么动、怎么恢复、哪些异常需要持续观察”的个性化行动建议。

## 当前项目结构

```text
anker-watch/
  src/                 # 前端 HTML Demo
  backend/             # Python API 后台骨架
  docs/                # 产品、比赛、技术与任务文档
  package.json         # 前端运行入口
  README.md            # 项目索引
```

## 快速查看

### 一键启动

只启动前端：

```bash
bash scripts/start-frontend.sh
```

只启动 Python 后台：

```bash
bash scripts/start-backend.sh
```

同时启动前端和后台：

```bash
bash scripts/start-all.sh
```

默认地址：

- 前端：`http://127.0.0.1:5173/`
- 后台：`http://127.0.0.1:8000/`

### 前端 Demo

```bash
npm install --cache ./.npm-cache
npm run dev -- --host 127.0.0.1 --port 5173
```

打开：

```text
http://127.0.0.1:5173/
```

当前前端已实现：

- 首页。
- 睡眠页。
- 饮食页。
- 信号页。
- 日报页。
- 技术架构页。
- 五类用户画像切换。
- 基于 mock 数据和规则引擎生成每日建议。

### Python 后台

零依赖版本：

```bash
cd backend
python3 simple_server.py
```

如 8000 端口不可用：

```bash
cd backend
PORT=8010 python3 simple_server.py
```

FastAPI 版本：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

当前后台已预留：

- `GET /health`
- `GET /api/profiles`
- `GET /api/signals/{profile_type}`
- `GET /api/report/{profile_type}`

## 文档索引

### 参赛与产品总览

- [项目概览](docs/presentation/anker-SenseLoop-项目概览.md)
- [项目概览 HTML](docs/presentation/anker-SenseLoop-项目概览.html)
- [参赛背景](docs/drafts/需求参赛背景.md)
- [正式架构初稿](docs/drafts/初稿设计_v3.md)

### 执行任务清单

- [Task 0：参赛定位校准](docs/tasks/Task0-参赛定位校准.md)
- [Task 1：行业背景调查](docs/tasks/Task1-行业背景调查.md)
- [Task 2：官方硬件能力映射](docs/tasks/Task2-官方硬件能力映射.md)
- [Task 3：MVP 亮点整理](docs/tasks/Task3-MVP亮点整理.md)
- [Task 4：用户画像与日报设计](docs/tasks/Task4-用户画像与日报设计.md)
- [Task 5：中医望闻问切产品化设计](docs/tasks/Task5-中医望闻问切产品化设计.md)
- [Task 6：技术可行性分析](docs/tasks/Task6-技术可行性分析.md)
- [Task 7：数据与知识库设计](docs/tasks/Task7-数据与知识库设计.md)
- [Task 8：技术架构跑通](docs/tasks/Task8-技术架构跑通.md)
- [Task 9：产品商业化故事](docs/tasks/Task9-产品商业化故事.md)
- [Task 10：原型图设计](docs/tasks/Task10-原型图设计.md)
- [Task 11：HTML Demo 实现方案 / 项目脚手架搭建](docs/tasks/Task11-HTML-Demo实现方案与项目脚手架搭建.md)
- [Task 12：HTML Demo 页面实现](docs/tasks/Task12-HTML-Demo页面实现.md)

### 历史草稿

- [v1 初稿 Prompt](docs/drafts/产品设计Prompt-v1初稿.md)
- [初稿设计 v2](docs/drafts/初稿设计_v2.md)

## 当前技术路线

```text
soundcore Work / mock audio
  -> 夜间声音事件
  -> 用户画像 + 饮食/排便/舌苔/口气等身体信号
  -> 本地知识库与规则引擎
  -> 每日健康报告
  -> HTML Demo 展示
```

当前版本重点是先跑通比赛可演示闭环。真实 soundcore Work SDK、eufy SDK、音频模型、图像模型和 LLM API 都通过 adapter 预留，现场拿到能力后再替换。
