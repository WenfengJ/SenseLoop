# Task 7：数据与知识库设计

## 1. 本任务结论

SenseLoop 的数据设计必须服务一个目标：

> 把多模态身体信号统一转成结构化标签，再由用户画像和健康知识库生成每日行动建议。

当前不追求复杂数据库，先用 TypeScript 类型 + 本地 JSON/mock 数据即可。

核心数据链路：

```text
UserProfile
  + SleepAudioEvents
  + DailySignals
  + KnowledgeBase
  -> RecommendationEngine
  -> DailyReport
```

## 2. 用户画像数据结构

```ts
type ProfileType =
  | "weight_loss_female"
  | "elderly"
  | "office_worker"
  | "student"
  | "insomnia";

type UserProfile = {
  id: string;
  name: string;
  profileType: ProfileType;
  age?: number;
  gender?: "female" | "male" | "other";
  heightCm?: number;
  weightKg?: number;
  occupation?: string;
  goals: HealthGoal[];
  habits: UserHabit;
  riskPreferences: RiskPreference;
};

type HealthGoal =
  | "sleep_recovery"
  | "weight_loss"
  | "elderly_care"
  | "focus_study"
  | "reduce_fatigue"
  | "digestive_health";

type UserHabit = {
  coffee: "none" | "low" | "medium" | "high";
  lateNightSnack: boolean;
  sedentaryHours?: number;
  exerciseFrequency: "low" | "medium" | "high";
  sleepProblem: "none" | "mild" | "moderate" | "severe";
};

type RiskPreference = {
  notifyFamily?: boolean;
  showMedicalReminder: boolean;
  privacyMode: "strict" | "balanced";
};
```

## 3. 每日身体数据结构

```ts
type DailySignals = {
  date: string;
  profileId: string;
  sleep: SleepSignal;
  audioEvents: SleepAudioEvent[];
  diet?: DietSignal[];
  stool?: StoolSignal;
  tongue?: TongueSignal;
  breath?: BreathSignal;
  vitals?: VitalSignal;
  userFeedback?: UserFeedback;
};
```

## 4. 夜间声音标签体系

```ts
type SleepAudioEventType =
  | "snore"
  | "cough"
  | "breathing_noise"
  | "turn_over"
  | "wake_marker"
  | "get_up"
  | "ambient_noise"
  | "unknown";

type SleepAudioEvent = {
  id: string;
  type: SleepAudioEventType;
  startMinute: number;
  durationSec: number;
  intensity: "low" | "medium" | "high";
  confidence: number;
  source: "mock" | "manual" | "soundcore_sdk" | "audio_model";
  note?: string;
};

type SleepSignal = {
  sleepDurationHours?: number;
  sleepQuality: "good" | "fair" | "poor";
  wakeCount?: number;
  userSleepFeeling?: "refreshed" | "tired" | "very_tired";
};
```

标签解释：

- `snore`：打鼾片段。
- `cough`：咳嗽片段。
- `breathing_noise`：呼吸相关声音片段，不等同医疗判断。
- `turn_over`：翻身或床铺摩擦。
- `wake_marker`：用户重点标记。
- `get_up`：起夜或离床事件。
- `ambient_noise`：环境噪声。

## 5. 大便标签体系

```ts
type StoolShape =
  | "hard_lump"
  | "sausage_cracked"
  | "normal"
  | "soft"
  | "loose"
  | "watery";

type StoolColor =
  | "brown"
  | "dark"
  | "yellow"
  | "green"
  | "red_flag"
  | "unknown";

type StoolSignal = {
  recorded: boolean;
  shape?: StoolShape;
  color?: StoolColor;
  dryness?: "dry" | "normal" | "wet";
  frequencyToday?: number;
  source: "manual" | "photo_upload" | "mock";
  privacyLevel: "sensitive";
  notes?: string;
};
```

建议：

- 当前 Demo 使用手动标签。
- `red_flag` 只触发“建议观察/必要时就医”，不诊断。
- 不保存默认图片。

## 6. 舌苔标签体系

```ts
type TongueColor = "pale" | "pink" | "red" | "dark_red" | "unknown";
type CoatingThickness = "thin" | "normal" | "thick" | "none" | "unknown";

type TongueSignal = {
  recorded: boolean;
  tongueColor?: TongueColor;
  coatingThickness?: CoatingThickness;
  moisture?: "dry" | "normal" | "wet";
  marks?: ("teeth_marks" | "cracks" | "spots")[];
  photoQuality?: "good" | "low_light" | "blurred" | "color_uncertain";
  source: "manual" | "photo_upload" | "mock";
  notes?: string;
};
```

建议：

- 当前 Demo 可用模拟舌苔标签。
- 图片识别结果必须带 `photoQuality`。
- 输出生活建议，不输出疾病判断。

## 7. 饮食标签体系

```ts
type DietSignal = {
  id: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  foodName: string;
  foodTags: FoodTag[];
  portion: "small" | "medium" | "large" | "unknown";
  estimatedKcal?: number;
  userAdjustedKcal?: number;
  confidence?: number;
  source: "manual" | "photo_upload" | "mock" | "vision_model";
};

type FoodTag =
  | "high_oil"
  | "high_sugar"
  | "high_protein"
  | "vegetable_rich"
  | "high_carb"
  | "spicy"
  | "cold_drink"
  | "late_night";
```

建议：

- kcal 使用区间或估算值。
- 必须支持用户修正。
- 不承诺精准热量。

## 8. 心率、口气、反馈标签体系

```ts
type BreathSignal = {
  level: "none" | "mild" | "obvious" | "unknown";
  dryMouth?: boolean;
  bitterTaste?: boolean;
  source: "manual" | "mock" | "future_sensor";
};

type VitalSignal = {
  heartRateResting?: number;
  bloodPressure?: {
    systolic: number;
    diastolic: number;
  };
  steps?: number;
  exerciseMinutes?: number;
  source: "manual" | "mock" | "future_wearable";
};

type UserFeedback = {
  morningFeeling: "refreshed" | "tired" | "very_tired";
  stressLevel: "low" | "medium" | "high";
  appetite: "low" | "normal" | "high";
  notes?: string;
};
```

## 9. 知识库基础结构

```ts
type KnowledgeRule = {
  id: string;
  category:
    | "sleep"
    | "diet"
    | "stool"
    | "tongue"
    | "breath"
    | "exercise"
    | "risk";
  appliesTo: ProfileType[] | "all";
  conditions: RuleCondition[];
  advice: AdviceBlock;
  priority: "low" | "medium" | "high";
  safetyLevel: "normal" | "observe" | "medical_reminder";
};

type RuleCondition = {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "includes";
  value: string | number | boolean;
};

type AdviceBlock = {
  statusHint?: string;
  foodAdvice?: string[];
  recoveryAdvice?: string[];
  riskNotice?: string[];
  explanation?: string;
};
```

## 10. 知识库分类

### 睡眠健康知识

用于：

- 打鼾偏多。
- 咳嗽偏多。
- 夜醒偏多。
- 环境噪声偏高。
- 睡眠时长不足。

建议方向：

- 降低运动强度。
- 控制咖啡因。
- 午间短休。
- 睡前减少屏幕。
- 连续异常建议咨询医生。

### 饮食营养知识

用于：

- 高油。
- 高糖。
- 晚餐过晚。
- 蛋白质不足。
- 蔬菜不足。

建议方向：

- 清淡饮食。
- 增加蛋白质。
- 增加膳食纤维。
- 减少宵夜和高糖饮料。

### 减脂建议知识

用于：

- 睡眠不足。
- 运动不足。
- kcal 偏高。
- 排便偏干。

建议方向：

- 不建议极端节食。
- 中低强度运动。
- 控制总热量。
- 补水和膳食纤维。

### 中医舌苔知识

用于：

- 舌苔偏厚。
- 舌面偏干。
- 齿痕。
- 裂纹。

建议方向：

- 注意补水。
- 减少油腻。
- 结合睡眠和饮食继续观察。
- 不做诊断。

### 排便与肠胃知识

用于：

- 排便偏干。
- 腹泻。
- 频率异常。
- 颜色异常。

建议方向：

- 补水。
- 膳食纤维。
- 清淡饮食。
- 连续异常建议就医。

## 11. 报告生成链路

```text
1. 读取 UserProfile
2. 读取 DailySignals
3. 汇总夜间声音事件
4. 根据标签命中 KnowledgeRule
5. 按 ProfileType 调整建议优先级
6. 生成 DailyReport
7. 前端展示今日状态、摘要、建议、风险提醒
```

## 12. 每日报告数据结构

```ts
type DailyReport = {
  id: string;
  date: string;
  profileId: string;
  title: string;
  status: "stable" | "recovery_needed" | "observe";
  recoveryScore: number;
  oneSentenceAdvice: string;
  nightAudioSummary: string[];
  bodyStatusHints: string[];
  foodAdvice: string[];
  recoveryAdvice: string[];
  riskNotice: string[];
  fourDiagnosisCompletion: {
    wang: boolean;
    wen: boolean;
    wenAsk: boolean;
    qie: boolean;
  };
  evidenceTags: string[];
};
```

## 13. Mock 数据建议

至少准备 5 套：

- 上班族熬夜样例。
- 老年人咳嗽起夜样例。
- 减脂人群排便偏干样例。
- 学生睡眠不足样例。
- 失眠人群夜醒样例。

每套包含：

- `UserProfile`
- `DailySignals`
- `SleepAudioEvent[]`
- `DailyReport`

## 14. 本任务结论

数据结构要稳定，真实硬件和真实模型要可替换。

最重要的设计原则：

> 前端和报告引擎只依赖统一标签，不直接依赖具体硬件、模型或 SDK。

这样现场即使没有 SDK、没有 API Key、没有真实音频，也能用 mock 数据跑通；一旦拿到真实输入，只需要替换采集和识别适配器。
