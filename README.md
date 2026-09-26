# anker-SenseLoop 观息

## 1. 产品定位

**观息 SenseLoop 是一个以“岐黄问诊助手”为中心的个人健康助手。**

它以 Anker 官方硬件 **soundcore Work 录音豆** 作为夜间声音入口，记录鼾声、咳嗽、夜醒、起夜和环境噪声，并把这些声音作为中医“闻诊”的核心线索。用户还可以补充舌苔、排便、饮食、体检资料和问诊对话，让系统围绕“望闻问切”形成连续的健康档案。

SenseLoop 的目标不是给用户多一个睡眠分数，而是回答更具体的问题：

- 昨晚鼾声和夜醒多，今天该怎么恢复？
- 舌苔偏干、排便偏干，饮食和饮水要怎么调整？
- 体检报告里有异常项，接下来应该补充哪些信息？
- 哪些变化只是日常观察，哪些情况需要咨询医生？

一句话概括：

> SenseLoop 用 soundcore Work 记录夜间身体声音，再结合舌苔、排便、体检资料和问诊对话，帮助用户形成可追问、可解释、可沉淀的个人健康建议。

## 2. 核心闭环

```text
soundcore Work 睡眠声音
  -> 闻诊事件：鼾声、咳嗽、夜醒、起夜、环境噪声
  -> 四诊补充：舌苔、排便、饮食、体检资料、问诊对话
  -> 中医知识库 / RAG / 风险边界
  -> 岐黄问诊助手
  -> 今日建议、报告沉淀、长期记忆
```

睡眠和鼾声是 SenseLoop 的 MVP 主线。它们最贴合 soundcore 的硬件能力，也是用户每天早上最容易理解的健康入口。

## 3. 望闻问切如何落到产品里

- **望**：舌苔、饮食图、体检报告、非隐私视觉观察。
- **闻**：睡眠声音、鼾声、咳嗽、夜醒、起夜、环境噪声、口气。
- **问**：岐黄问诊助手、症状描述、排便、生活习惯、健康目标。
- **切**：心率、步数、运动、未来穿戴体征。

SenseLoop 借用“望闻问切”作为产品结构，但不做医疗诊断，只做健康趋势观察、生活方式建议和必要的就医提醒。

## 4. 目标用户

当前设计覆盖五类典型用户：

| 用户 | 他们关心什么 | SenseLoop 给什么 |
| --- | --- | --- |
| 年轻女性 / 减脂人群 | 热量、排便、睡眠、皮肤状态、运动强度 | 今日 kcal 建议、饮食调整、训练强度建议 |
| 老年人 | 夜间咳嗽、起夜、饮食清淡、家人关怀 | 异常趋势提醒、清淡饮食建议、家人同步思路 |
| 上班族 / 熬夜人群 | 睡眠债、咖啡因、外卖、肠胃负担 | 熬夜修复计划、低强度运动、咖啡因控制 |
| 学生 | 学习压力、早餐、营养补给、睡眠 | 作息建议、蛋白质和水分提醒、户外活动建议 |
| 长期失眠人群 | 夜醒、环境噪声、睡前行为、第二天恢复 | 睡眠趋势观察、午睡控制、晚间放松流程 |

## 5. 当前 Demo

当前 Demo 已经跑通前后端闭环。

前端包含：

- 今日页：昨晚睡眠声音摘要、鼾声/咳嗽/夜醒线索和今日建议。
- 检测页：用望闻问切组织舌诊、夜间声音、资料上传、饮食和排便。
- 问诊页：岐黄问诊助手，保留用户状态卡，可读取档案、睡眠、舌诊、报告摘要和知识库。
- 报告页：沉淀日报、舌诊报告、资料摘要和趋势线索。
- 我的页：游客身份、邮箱验证码登录、多健康档案、出生年月日/时辰和四诊档案信息。

后台包含：

- FastAPI 后端。
- PostgreSQL + pgvector。
- 游客身份和邮箱验证码登录。
- 多健康档案与 `profileId` 隔离。
- 岐黄问诊 Agent API。
- 图片/PDF 上传、本地磁盘文件存储和摘要接口。
- 占位中医知识库和 RAG 检索接口。

## 6. 当前边界

已实现：

- 前端 Demo。
- FastAPI 后端。
- PostgreSQL + pgvector。
- 邮箱验证码登录。
- 多健康档案。
- 问诊 Agent API。
- 文件上传和摘要。
- 占位知识库检索。
- 快速启动脚本。
- 预选提交材料目录。

仍在增强：

- 夜间声音事件。
- 饮食识别结果。
- 排便标签。
- 舌苔标签。
- 口气反馈。
- 心率、步数、运动数据。

当前不承诺：

- 不做医疗诊断。
- 不判断具体疾病。
- 不自动拍摄隐私内容。
- 不承诺真实 SDK 已接入。
- 不承诺 kcal 精准识别。
- 不替代医生或安保/照护责任人。

## 7. 为什么适合 Anker 比赛

这个项目贴合 Anker 黑客松的点在于：

- **真实设备**：用 soundcore Work 作为夜间声音采集入口。
- **真实场景**：睡眠差、打鼾、咳嗽、熬夜、减脂、老人关怀都是高频场景。
- **可演示闭环**：前端可以展示今日、检测、问诊、报告、我的完整流程，后端有 Agent、数据库和知识库基础。
- **软硬件协同**：录音豆不是只录音，而是作为闻诊入口进入 App、知识库、问诊助手和报告系统。
- **未来产品想象**：可以自然演进为 SenseLoop Watch / Band / Pendant。

## 8. 快速启动

### 在线 Demo

- Demo 地址：`https://13-57-166-217.sslip.io/senseloop/`
- 后台健康检查：`https://13-57-166-217.sslip.io/senseloop-api/health`
- GitHub 仓库：`https://github.com/WenfengJ/SenseLoop`
- 服务器部署说明：[服务器部署说明](docs/deployment/服务器部署说明.md)

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

### 前端手动启动

```bash
npm install --cache ./.npm-cache
npm run dev -- --host 127.0.0.1 --port 5173
```

### 后台手动启动

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

后台接口：

- `GET /health`
- `GET /api/profiles`
- `GET /api/signals/{profile_type}`
- `GET /api/report/{profile_type}`

## 9. 项目结构

```text
anker-watch/
  src/                 # 前端 HTML Demo
  backend/             # Python API 后台骨架
  docs/                # 产品、比赛、技术与任务文档
  scripts/             # 快速启动脚本
  package.json         # 前端运行入口
  README.md            # 项目说明和讲解入口
```

## 10. 文档索引

### 参赛与产品总览

- [预选提交包索引](docs/submission-preselection/README.md)
- [预选提交包与补充清单](docs/submission-preselection/TODO-参赛提交补充清单.md)
- [PPT 答辩材料](docs/submission-preselection/deck/anker-SenseLoop-答辩材料.pptx)
- [PDF 答辩材料](docs/submission-preselection/deck/anker-SenseLoop-答辩材料.pdf)
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

### 预选提交材料

- [预选提交包索引](docs/submission-preselection/README.md)
- [预选提交包与补充清单](docs/submission-preselection/TODO-参赛提交补充清单.md)
- [PPT / PDF 答辩材料说明](docs/submission-preselection/deck/README.md)
- [3 分钟演示视频脚本](docs/submission-preselection/3分钟演示视频脚本.md)
- [当前实现边界说明](docs/submission-preselection/当前实现边界说明.md)
- [24 小时现场开发计划](docs/submission-preselection/24小时现场开发计划.md)
- [Roadmap 路线图](docs/submission-preselection/Roadmap路线图.md)
- [隐私与医疗边界说明](docs/submission-preselection/隐私与医疗边界说明.md)
- [系统架构图](docs/submission-preselection/diagrams/系统架构图.md)

### 历史草稿

- [v1 初稿 Prompt](docs/drafts/产品设计Prompt-v1初稿.md)
- [初稿设计 v2](docs/drafts/初稿设计_v2.md)

## 11. 推荐阅读顺序

录制或答辩前，建议按这个顺序快速过一遍材料：

1. README：确认产品定位、硬件入口和当前 Demo 边界。
2. 3 分钟演示视频脚本：按真实页面顺序练口播。
3. 项目概览：补充完整的产品、架构和商业故事。
4. 评委可能会问的问题：准备现场追问。
5. 当前实现边界说明：说明哪些已实现、哪些是后续扩展。
