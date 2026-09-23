# Task 14：前端可用性 Review 与功能开发建议

## 1. Review 结论

当前前端视觉表达已经能讲清楚 SenseLoop 的产品故事，但可用性仍停留在“演示原型”阶段。

主要问题：

- 页面大部分数据仍来自前端 mock，不来自后端数据库。
- “拍照记录一餐”“记录排便”“拍照记录舌苔”“记录口气”等按钮看起来可操作，但点击后没有任何反馈。
- “建档”不是新建档案流程，只是固定选项组合；用户不能输入真实姓名、年龄、目标、习惯，也不能保存到数据库。
- 没有图片上传、文件预览、上传进度、成功提示、错误提示。
- 报告生成只在前端本地计算，未调用后端 `/reports/{date}/generate`。
- 没有 loading、empty、error、保存成功、保存失败等状态。

一句话判断：

> 现在前端适合路演讲故事，但不适合让用户真实完成“建档 -> 上传/记录 -> 保存 -> 生成报告 -> 查看反馈”的闭环。

## 2. 浏览器实测结果

测试地址：

```text
http://127.0.0.1:5173/
```

实测页面：

- 建档。
- 今日。
- 睡眠。
- 饮食。
- 信号。
- 日报。

实测发现：

| 页面 | 可点击项 | 实际结果 |
| --- | --- | --- |
| 建档 | 生成健康报告 | 只改变前端局部状态，不保存、不调用后端、不进入真实日报生成链路 |
| 建档 | 隐私说明 | 点击后无变化 |
| 饮食 | 拍照记录一餐 | 点击后无弹窗、无文件选择、无上传、无保存 |
| 信号 | 记录排便 | 点击后无弹窗、无表单、无保存 |
| 信号 | 拍照记录舌苔 | 点击后无文件选择、无上传、无识别结果 |
| 信号 | 记录口气 | 点击后无表单、无保存 |
| 睡眠 | 统计 / 录音片段 | 只是静态按钮，未切换内容 |

DOM 实测：

- 全局没有 `input`、`textarea`、`select`。
- 没有 `type="file"`。
- 没有 dialog/modal。
- 没有 API fetch。
- 主要页面切换只依赖 React state。

## 3. 代码层问题定位

### 3.1 前端没有接后端 API

位置：

```text
src/App.tsx
```

当前数据来源：

```ts
import { mockProfiles } from "./data/mockProfiles";
import { mockDailySignals } from "./data/mockDailySignals";
import { knowledgeBase } from "./data/knowledgeBase";
```

问题：

- `profile`、`signals`、`report` 都在前端本地生成。
- 后端数据库已经有 `/api/profiles`、`/api/signals`、`/api/report`，但前端完全没有使用。
- 页面看不到数据库里刚 seed 的 7 天趋势、用户反馈、知识库和 Agent 样例。

建议：

新增：

```text
src/services/apiClient.ts
```

至少支持：

```ts
getProfiles()
getDailySignals(profileId, date)
generateReport(profileId, date)
createObservation(profileId, date, payload)
uploadMedia(profileId, date, file, mediaType)
searchKnowledge(query)
createAgentSession(profileId, sessionType)
sendAgentMessage(sessionId, message)
```

### 3.2 建档页不是“新建档案”

位置：

```text
src/App.tsx
```

当前逻辑：

- 用户只能在固定 chip 中切换五类画像。
- 建档页里年龄、目标、生活方式、晨间感受都是固定选项。
- 没有姓名、年龄数字、性别、身高、体重、职业、目标、生活习惯等表单。
- 没有保存按钮真正创建 profile。

建议：

新建 `ProfileCreatePage` 或把 `OnboardingPage` 拆成：

```text
ProfileForm
GoalSelector
HabitForm
MorningFeedbackForm
MediaUploadPanel
CreateReportAction
```

第一版字段：

| 字段 | 控件 |
| --- | --- |
| 昵称 | 文本输入 |
| 年龄 | 数字输入 |
| 性别 | segmented control |
| 职业/生活方式 | select 或 chip |
| 目标 | 多选 chip |
| 咖啡因 | segmented control |
| 宵夜 | toggle |
| 久坐小时 | slider/number |
| 睡眠问题 | segmented control |

保存后调用：

```http
PUT /api/profiles/{profileId}
```

当前后端还需要补这个接口。

### 3.3 拍照功能没有真实上传链路

位置：

```text
src/App.tsx
```

问题按钮：

```text
拍照记录一餐
拍照记录舌苔
```

当前问题：

- 没有 `input type="file"`。
- 没有图片预览。
- 没有上传状态。
- 没有写入数据库。
- 没有用户修正识别标签。

建议交互：

```text
点击拍照/上传
  -> 打开文件选择
  -> 显示图片预览
  -> 用户确认餐次/标签/kcal 或舌苔标签
  -> 保存 media asset 元信息
  -> 保存 diet/tongue signal
  -> 重新生成报告
```

前端最小实现：

```tsx
<input type="file" accept="image/*" />
```

后端建议：

- 文件本体：MinIO/S3 或本地 private uploads。
- 数据库：只保存 `media_assets.storage_key`、`mime_type`、`sha256`、`privacy_level`。
- 不建议把图片二进制直接塞进 PostgreSQL。

### 3.4 身体信号按钮没有表单

位置：

```text
src/App.tsx
```

问题按钮：

```text
记录排便
记录口气
```

建议：

点击后打开 bottom sheet / modal：

排便：

- 是否记录。
- 形状。
- 颜色。
- 干湿。
- 今日次数。
- 备注。

口气：

- 无/轻微/明显/未知。
- 是否口干。
- 是否口苦。
- 备注。

保存到：

```http
POST /api/profiles/{profileId}/signals/{date}/observations
```

或后续专用接口：

```http
PUT /api/profiles/{profileId}/signals/{date}/stool
PUT /api/profiles/{profileId}/signals/{date}/breath
```

### 3.5 睡眠页按钮是静态按钮

位置：

```text
src/App.tsx
```

问题：

- “统计 / 录音片段”没有状态。
- 播放按钮只是图标，不播放、不展开详情。
- 7 天趋势是硬编码数组，不来自数据库。

建议：

- 增加 `sleepTab` state。
- 统计页展示分类聚合。
- 录音片段页展示事件列表。
- 播放按钮至少展开详情；真实音频接入后再播放。
- 7 天趋势调用后端历史 signals。

### 3.6 缺少全局反馈系统

当前缺少：

- 保存中。
- 保存成功。
- 保存失败。
- 后端不可用。
- 数据为空。
- 图片过大/格式错误。
- 隐私确认。

建议新增：

```text
Toast
InlineError
LoadingSkeleton
EmptyState
ConfirmDialog
```

## 4. 美观性 Review

优点：

- 整体视觉完成度不错，适合比赛路演。
- 色彩不单调，绿色、青色、黄色、红色都有用到。
- 卡片圆角保持在 8px 左右，整体专业。
- 首页、睡眠、饮食、信号、日报的故事线清晰。
- 建档页第一屏视觉吸引力强。

问题：

- 顶部大标题和内容区域之间信息密度偏高，移动端可能显得拥挤。
- 很多按钮使用相同视觉样式，但行为差异巨大，有的能切页，有的无效果。
- 静态演示文案较多，真实操作控件较少，用户会误以为“点不动”。
- 睡眠页和日报页更像展示板，缺少 drill-down 能力。
- 底部导航占据空间较大，部分页面首屏内容被挤压。

建议：

- 把无功能按钮改成 disabled 或加“即将接入”状态，避免误导。
- 所有主按钮必须有明确结果：弹窗、跳转、保存、toast、状态变化。
- 将“说明文字”减少，换成真实输入和结果。
- 建档页优先做成分步表单，而不是静态介绍页。
- 页面内 CTA 不要超过 1 个主按钮 + 1 个次按钮。

## 5. 推荐前端开发路线

### P0：让页面真正可操作

目标：

> 用户能新建档案、上传/记录信号、保存到数据库、生成报告。

任务：

1. 新增 `apiClient.ts`。
2. 前端读取 `/api/profiles`。
3. 前端读取 `/api/profiles/{profileId}/signals?date=...`。
4. 建档页改为真实表单。
5. 饮食页加图片上传和预览。
6. 信号页加排便/口气 modal。
7. 保存成功后刷新日报。

### P1：把数据库 mock 数据展示出来

目标：

> 页面能看到数据库里的 7 天趋势、用户反馈、知识库和 Agent 样例。

任务：

1. 睡眠页 7 天趋势改为 API 数据。
2. 今日页显示 morning feedback。
3. 日报页增加“为什么这样建议”入口。
4. 增加 Agent 问答面板，但先用 mock agent response。

### P2：为 AI 集成准备 UI

目标：

> 下一步接 AI 时，前端已经有入口、状态和引用展示。

任务：

1. 增加“问问 SenseLoop”按钮。
2. Agent 回答展示 citations。
3. 报告解释展示工具调用状态。
4. RAG 检索结果展示知识来源。
5. 所有 AI 输出明确医疗边界。

## 6. 建议的组件拆分

当前 `src/App.tsx` 已经过大，应拆分：

```text
src/services/apiClient.ts
src/components/Toast.tsx
src/components/Modal.tsx
src/components/FileUpload.tsx
src/components/ProfileForm.tsx
src/components/StoolForm.tsx
src/components/BreathForm.tsx
src/components/TongueUploadForm.tsx
src/components/MealUploadForm.tsx
src/components/AgentExplainPanel.tsx
src/pages/OnboardingPage.tsx
src/pages/TodayPage.tsx
src/pages/SleepPage.tsx
src/pages/DietPage.tsx
src/pages/SignalsPage.tsx
src/pages/ReportPage.tsx
```

## 7. 验收标准

下一轮前端开发至少满足：

- 新建用户档案后，profile 出现在画像列表中。
- 上传一张饮食图片后，页面显示预览和 mock 识别标签。
- 保存饮食记录后，数据库出现 media asset 和 diet/observation 数据。
- 记录排便/口气后，页面立即刷新身体信号。
- 点击生成报告后，调用后端生成接口。
- 后端失败时页面有错误提示。
- 没有任何看起来可点但点了无反馈的主按钮。

## 8. 本次数据库 Mock 数据补充

本次已新增脚本：

```text
backend/scripts/seed_rich_mock_data.py
```

脚本会写入：

- 近 7 天身体信号趋势。
- 晨间用户反馈 observations。
- 图片/媒体元信息 media assets。
- 生活方式知识库 source/chunks。
- Agent 会话样例。
- RAG retrieval logs。

验证结果：

```text
days: 23
observations: 18
knowledge_sources: 1
knowledge_chunks: 5
media_assets: 18
agent_sessions: 1
rag_logs: 2
```

这批数据已经足够支撑下一轮：

- 前端 API 化。
- 7 天趋势页。
- 图片上传 UI。
- Agent explain panel。
- RAG 引用展示。
