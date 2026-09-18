# Task 8：技术架构跑通

## 1. 本任务结论

SenseLoop 的工程架构必须以“可跑通、可替换、可演示”为第一原则。

推荐架构：

```text
采集适配层
  -> 信号标签层
  -> 知识库规则层
  -> 报告生成层
  -> App 展示层
```

当前原型先用 mock 数据跑通，真实硬件 SDK、API Key、音频模型、图像模型都以 adapter 方式预留。

## 2. 技术总架构

```text
soundcore Work / mock audio / uploaded audio
        |
        v
Audio Adapter
        |
        v
SleepAudioEvent[]

App Form / photo upload / mock signals / eufy placeholder
        |
        v
Signal Adapter
        |
        v
DailySignals

UserProfile + DailySignals + KnowledgeBase
        |
        v
Recommendation Engine
        |
        v
DailyReport
        |
        v
React App / HTML Demo
```

## 3. 项目架子建议

推荐先搭建：

```text
anker-watch/
  src/
    app/
      App.tsx
      routes.tsx
    components/
      DailyReportView.tsx
      AudioTimeline.tsx
      ProfileSwitcher.tsx
      SignalCards.tsx
      RecommendationCards.tsx
      FourDiagnosisPanel.tsx
    data/
      mockProfiles.ts
      mockSleepEvents.ts
      mockDailySignals.ts
      knowledgeBase.ts
    domain/
      types.ts
      labels.ts
      reportTypes.ts
    services/
      recommendationEngine.ts
      reportBuilder.ts
      knowledgeMatcher.ts
      scoring.ts
    adapters/
      soundcoreAdapter.ts
      eufyAdapter.ts
      audioUploadAdapter.ts
      photoUploadAdapter.ts
      mockAdapter.ts
      llmAdapter.ts
    pages/
      DashboardPage.tsx
      SleepAudioPage.tsx
      SignalsPage.tsx
      ReportPage.tsx
      ArchitecturePage.tsx
    styles/
      theme.css
```

## 4. 数据采集层设计

### 4.1 soundcore Work

当前：

- 使用 `mockAdapter` 返回夜间声音事件。
- 支持上传音频文件作为展示素材。
- 保留 `soundcoreAdapter` 接口。

接口：

```ts
type SoundcoreAdapter = {
  getDeviceStatus(): Promise<DeviceStatus>;
  getNightAudioEvents(date: string): Promise<SleepAudioEvent[]>;
  getMarkers(date: string): Promise<SleepAudioEvent[]>;
};
```

当前 mock：

- 返回打鼾、咳嗽、起夜、环境噪声、重点标记。

现场替换：

- 如果拿到 SDK，只改 `soundcoreAdapter`，不改页面和报告引擎。

### 4.2 App 输入

采集：

- 用户画像。
- 睡前反馈。
- 醒后感受。
- 饮食。
- 排便。
- 舌苔。
- 口气。
- 手动体征。

当前：

- 表单 + mock 数据。

### 4.3 手机拍照

当前：

- 支持上传饮食/舌苔图片。
- 先不做真实图像识别。
- 上传后允许选择标签或使用 mock 识别结果。

未来：

- 接视觉模型。
- 返回食物标签、kcal、舌苔标签。

### 4.4 eufy

当前：

- 作为 placeholder。
- 展示“非隐私视觉观察”能力。
- 不接真实视频流也可演示。

接口：

```ts
type EufyAdapter = {
  getActivityEvents(date: string): Promise<VisualEvent[]>;
  getPrivacyZoneStatus(): Promise<PrivacyZoneStatus>;
};
```

## 5. 事件识别层设计

### 5.1 当前识别方式

当前不依赖真实模型，使用：

- 预置标签。
- 用户手动修正。
- mock confidence。
- 规则映射。

### 5.2 音频事件识别

输出统一为：

```ts
SleepAudioEvent[]
```

来源可以是：

- mock。
- 手动标注。
- 上传音频后人工选择。
- soundcore SDK。
- audio model。

页面不关心来源，只关心统一标签。

### 5.3 图像事件识别

输出统一为：

- `DietSignal[]`
- `TongueSignal`
- `StoolSignal`

来源可以是：

- mock。
- 用户手动选择。
- 图片上传。
- vision model。

### 5.4 食物热量估算

策略：

- 先估算区间。
- 用户可修正。
- 报告用修正值优先。

### 5.5 舌苔识别

策略：

- 当前使用标签。
- 保留 `photoQuality`。
- 输出建议不做诊断。

### 5.6 大便状态标签

策略：

- 当前手动选择。
- 不做自动拍摄。
- 不默认保存图片。

## 6. 知识库层设计

知识库以本地 TypeScript/JSON 开始。

文件：

```text
src/data/knowledgeBase.ts
```

内容包括：

- 睡眠规则。
- 饮食规则。
- 排便规则。
- 舌苔规则。
- 减脂规则。
- 运动恢复规则。
- 风险提醒规则。

规则执行顺序：

1. 先匹配高风险提醒。
2. 再匹配用户画像。
3. 再匹配声音事件。
4. 再匹配饮食、排便、舌苔、体征。
5. 合并建议并去重。

## 7. 报告生成层设计

### 7.1 输入

```ts
type BuildReportInput = {
  profile: UserProfile;
  signals: DailySignals;
  rules: KnowledgeRule[];
};
```

### 7.2 输出

```ts
type BuildReportOutput = DailyReport;
```

### 7.3 报告生成流程

```text
1. 计算声音事件摘要
2. 计算恢复分 recoveryScore
3. 命中知识库规则
4. 按用户画像调整建议
5. 生成 oneSentenceAdvice
6. 生成 foodAdvice
7. 生成 recoveryAdvice
8. 生成 riskNotice
9. 返回 DailyReport
```

### 7.4 无 API Key 版本

使用规则和模板：

- 稳定。
- 可离线演示。
- 不依赖网络。

### 7.5 有 API Key 版本

LLM 只负责润色和自然语言生成。

输入：

- `UserProfile`
- `DailySignals`
- 命中的 `KnowledgeRule[]`

输出：

- 必须符合 `DailyReport` JSON Schema。

注意：

- LLM 不直接决定医疗风险。
- 风险边界由规则引擎控制。

## 8. App 展示层设计

### 8.1 首页

展示：

- 今日状态。
- 恢复分。
- 今日一句建议。
- 四诊完成度。
- 关键异常提醒。

### 8.2 夜间声音页

展示：

- 声音事件时间线。
- 打鼾、咳嗽、起夜、环境噪声。
- 重点标记。
- soundcore Work 状态。

### 8.3 信号补充页

展示：

- 饮食记录。
- 排便记录。
- 舌苔记录。
- 睡眠感受。
- 口气反馈。

### 8.4 每日报告页

展示：

- 夜间声音摘要。
- 身体状态提示。
- 今日饮食建议。
- 今日运动/恢复建议。
- 异常趋势提醒。

### 8.5 架构说明页

展示：

- 当前原型：soundcore Work + App + 知识库。
- 辅助硬件：eufy。
- 未来产品：Watch / Band / Pendant。

## 9. 当前原型与未来硬件分层

### 9.1 当前必须实现

- mock 数据。
- 用户画像切换。
- 声音事件时间线。
- 每日报告生成。
- 建议卡片。
- 四诊完成度。
- 架构说明页。

### 9.2 当前可选增强

- 音频上传。
- 图片上传。
- API Key 接入。
- eufy placeholder 页面。
- 本地存储。

### 9.3 未来硬件

- soundcore Work SDK 真实接入。
- eufy SDK 真实接入。
- 穿戴设备传感器。
- 端侧音频模型。
- 端侧图像模型。
- 家庭健康趋势。

## 10. 24 小时比赛开发顺序

### 第 1 阶段：项目架子

- Vite + React + TypeScript。
- 路由。
- 样式主题。
- mock 数据。

### 第 2 阶段：核心报告闭环

- 用户画像切换。
- mock 夜间声音事件。
- 规则引擎。
- 每日报告生成。
- 报告页面。

### 第 3 阶段：展示增强

- 夜间声音时间线。
- 四诊完成度。
- 建议卡片。
- 原型/未来架构页。

### 第 4 阶段：可选能力

- 上传音频。
- 上传图片。
- eufy placeholder。
- LLM adapter。
- 本地存储。

### 第 5 阶段：演示脚本和稳定性

- 固定演示数据。
- 准备五类用户切换。
- 准备异常趋势样例。
- 保证无网络也能跑。

## 11. fallback 设计

### 没有 soundcore SDK

使用 mock audio events。

### 没有 eufy SDK

使用 eufy placeholder 和模拟视觉事件。

### 没有 API Key

使用规则引擎和模板报告。

### 没有真实音频

使用内置夜间事件数据。

### 没有图片数据

使用标签选择和示例图占位。

### 网络不可用

整个 Demo 仍可本地运行。

## 12. 本任务结论

最优架构不是“先接真实硬件”，而是：

> 先用统一数据结构跑通完整体验，再用 adapter 接真实硬件和 AI 能力。

这能保证：

- 现在就能搭项目架子。
- 无数据源也能演示。
- 无 API Key 也能生成报告。
- 现场拿到 SDK 后能快速替换。
- 最终产品路线仍然指向健康穿戴硬件。
