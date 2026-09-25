# Demo 链接与运行方式

## 推荐演示路径

预选提交视频建议按下面顺序录制：

```text
Anker 录音笔夜间声音 -> 今日页 -> 检测页 -> 舌诊/资料上传 -> 问诊助手 -> 报告 -> 我的/邮箱验证码登录
```

演示重点：

- 硬件入口：Anker 录音笔 / soundcore Work 记录夜间打鼾、咳嗽、夜醒和环境声音。
- MVP 闭环：先把“睡眠声音闻诊主线 + 舌苔/排便/资料辅助 + 中医知识库解释 + 个人健康助手”跑通。
- 今日页：展示昨晚声音事件如何转成睡眠摘要和今日恢复建议。
- 检测页：展示四诊入口如何组织夜间声音、舌苔、体检报告、饮食/排便/口气。
- 舌诊/资料上传：展示录音笔听不到的信息如何通过图片/PDF 和用户记录补充进健康档案。
- 问诊助手：展示岐黄问诊助手可以结合夜间声音、用户档案、舌苔、排便、报告和中医知识库生成建议。
- 报告页：展示检测和问诊结果可以沉淀为报告、摘要和趋势。
- 我的页：展示游客身份、邮箱验证码登录、设备信息和健康档案管理。

## 当前本地 Demo

前端：

```text
http://127.0.0.1:5173/
```

## 在线 Demo

前端：

```text
https://13-57-166-217.sslip.io/senseloop/
```

后台健康检查：

```text
https://13-57-166-217.sslip.io/senseloop-api/health
```

报告接口示例：

```text
https://13-57-166-217.sslip.io/senseloop-api/api/report/weight_loss_female
```

数据库状态：

```text
https://13-57-166-217.sslip.io/senseloop-api/api/db/status
```

GitHub 仓库：

```text
https://github.com/WenfengJ/SenseLoop
```

后台：

```text
http://127.0.0.1:8000/
```

后台健康检查：

```text
http://127.0.0.1:8000/health
```

## 当前线上状态

- 前端已部署在 `/senseloop/`。
- 后端已部署在 `/senseloop-api/`。
- 后端服务为 FastAPI。
- 数据库为 PostgreSQL + pgvector。
- 图片/PDF 原始文件暂存服务器本地云磁盘，数据库保存文件索引和摘要。
- 邮箱验证码接口已接通，演示环境可直接完成登录流程。

## 快速启动

只启动前端：

```bash
bash scripts/start-frontend.sh
```

只启动后台：

```bash
bash scripts/start-backend.sh
```

同时启动前后端：

```bash
bash scripts/start-all.sh
```

## 预选提交时需要人工补充

如果官方提交表单需要公开视频或在线 Demo，请补充：

- GitHub 仓库链接：`https://github.com/WenfengJ/SenseLoop`
- 在线部署链接：`https://13-57-166-217.sslip.io/senseloop/`
- 3 分钟演示视频链接。
- PPT 或项目概览附件链接。

这些链接目前需要人工上传或部署后填写。
