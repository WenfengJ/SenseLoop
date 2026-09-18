# Task 11：HTML Demo 实现方案 / 项目脚手架搭建

## 1. 本任务结论

SenseLoop 的 HTML Demo 第一版要优先保证：

> 无硬件 SDK、无真实数据源、无 API Key、无网络，也能完整跑通“用户画像 -> 夜间声音事件 -> 多模态身体信号 -> 每日建议 -> 页面展示”的闭环。

实现策略：

- 使用 React + TypeScript + Vite 搭建单页 Demo。
- 使用本地 mock 数据模拟 soundcore Work、用户画像、睡眠声音、饮食、排便、舌苔、口气和体征。
- 使用本地规则引擎生成每日报告。
- 通过 adapter 预留 soundcore Work、eufy、音频上传、图片上传和 LLM 接口。
- 当前先实现可演示页面，不依赖后端。

## 2. Demo 第一版目标

第一版 Demo 必须能演示：

- 切换五类用户画像。
- 首页展示今日健康状态、恢复分、四诊完成度、今日建议。
- 睡眠页展示 soundcore Work 夜间声音事件。
- 饮食页展示 kcal 区间估算和用户修正入口。
- 身体信号页展示排便、舌苔、口气记录。
- 日报页根据不同用户画像生成不同重点。
- 架构页说明当前原型和未来手表/手环/项链演进。

第一版不追求：

- 真实 SDK 接入。
- 真实音频识别。
- 真实图片识别。
- 真实云端 LLM 调用。
- 用户账号系统。
- 数据库。

## 3. 技术栈

推荐技术栈：

- Vite
- React
- TypeScript
- CSS
- 本地 JSON / TypeScript mock 数据

原因：

- 24 小时比赛开发速度快。
- 可直接本地运行。
- 可部署为静态页面。
- 页面交互足够丰富。
- 方便后续接入真实 SDK 和 API。

## 4. 项目目录结构

```text
anker-watch/
  package.json
  index.html
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    domain/
      types.ts
      labels.ts
    data/
      mockProfiles.ts
      mockSleepEvents.ts
      mockDailySignals.ts
      knowledgeBase.ts
    services/
      reportBuilder.ts
      recommendationEngine.ts
    adapters/
      mockAdapter.ts
      soundcoreAdapter.ts
      eufyAdapter.ts
      llmAdapter.ts
    components/
      BottomNav.tsx
      ProfileSwitcher.tsx
      StatusHero.tsx
      FourDiagnosisPanel.tsx
      AdviceCards.tsx
      AudioTimeline.tsx
    pages/
      TodayPage.tsx
      SleepPage.tsx
      DietPage.tsx
      SignalsPage.tsx
      ReportPage.tsx
      ArchitecturePage.tsx
    styles/
      theme.css
      app.css
```

## 5. 页面路由设计

当前不引入复杂路由库，使用 React state 控制页面切换。

页面枚举：

```ts
type PageKey =
  | "today"
  | "sleep"
  | "diet"
  | "signals"
  | "report"
  | "architecture";
```

底部导航：

- 今日
- 睡眠
- 饮食
- 信号
- 日报

架构页入口：

- 顶部“架构”按钮。
- 或 Demo 模式浮动入口。

## 6. 数据实现方案

### 6.1 用户画像

准备五套用户：

- 年轻女性 / 减脂人群。
- 老年人。
- 上班族 / 熬夜人群。
- 学生。
- 长期失眠人群。

每套用户包含：

- 基础信息。
- 目标。
- 生活习惯。
- 风险偏好。

### 6.2 夜间声音事件

每套用户准备一组 `SleepAudioEvent[]`：

- 打鼾。
- 咳嗽。
- 呼吸相关声音。
- 翻身。
- 起夜。
- 环境噪声。
- 重点标记。

字段必须保留：

- 类型。
- 开始时间。
- 持续时间。
- 强度。
- 置信度。
- 数据来源。

### 6.3 每日身体信号

每套用户准备：

- 睡眠感受。
- 饮食记录。
- 排便状态。
- 舌苔状态。
- 口气反馈。
- 体征数据。

### 6.4 知识库

第一版使用本地规则：

- 睡眠规则。
- 饮食规则。
- 排便规则。
- 舌苔规则。
- 口气规则。
- 减脂规则。
- 老人关怀规则。
- 熬夜修复规则。

## 7. 报告生成方案

报告生成链路：

```text
UserProfile
  + DailySignals
  + SleepAudioEvent[]
  + KnowledgeRule[]
  -> recommendationEngine
  -> DailyReport
```

报告内容：

- 今日状态。
- 恢复分。
- 一句话建议。
- 夜间声音摘要。
- 身体状态提示。
- 今日饮食建议。
- 今日运动/恢复建议。
- 异常趋势提醒。
- 四诊完成度。
- 证据标签。

第一版使用规则模板生成，保证无 API Key 也能稳定演示。

## 8. Adapter 预留方案

### 8.1 soundcoreAdapter

当前：

- 暂时返回 mock 夜间声音事件。

未来：

- 接入 soundcore Work SDK。
- 获取设备状态。
- 获取录音事件。
- 获取重点标记。

### 8.2 eufyAdapter

当前：

- 返回 mock 视觉事件和隐私区状态。

未来：

- 接入 eufy 摄像头事件。
- 只用于非隐私生活状态观察。

### 8.3 llmAdapter

当前：

- 不调用真实 API。

未来：

- 接入 API Key。
- 只做文案润色和结构化报告生成。
- 医疗风险仍由规则控制。

## 9. 24 小时开发顺序

### 阶段一：脚手架

- 建立 Vite + React + TypeScript 项目。
- 建立目录结构。
- 建立类型文件。
- 建立 mock 数据。

### 阶段二：核心闭环

- 用户画像切换。
- 报告生成。
- 首页展示。
- 日报展示。

### 阶段三：页面补齐

- 睡眠声音页。
- 饮食页。
- 身体信号页。
- 技术架构页。

### 阶段四：体验增强

- 时间线视觉。
- 四诊完成度。
- 趋势图。
- 建议卡片。
- Demo 演示数据固定。

### 阶段五：现场增强

- 上传音频。
- 上传图片。
- 接入 SDK。
- 接入 API Key。

## 10. 当前脚手架验收标准

项目脚手架完成后应满足：

- 有 `package.json`。
- 有 `index.html`。
- 有 `src/main.tsx` 和 `src/App.tsx`。
- 有 domain 类型。
- 有 mock 数据。
- 有报告生成服务。
- 有 adapter 占位。
- 有页面目录。
- 后续可以直接开始写 HTML Demo。

## 11. 本任务结论

HTML Demo 的正确方向不是先追求“真实识别”，而是先做出一个稳定、完整、可讲清楚的产品体验。

第一版只要把以下闭环跑通，就已经足够有比赛价值：

```text
soundcore Work 夜间声音
  + 用户画像
  + 身体信号补充
  + 健康知识库
  -> 每日行动建议
```

项目脚手架已按这个方向搭建，后续可以直接进入页面实现。
