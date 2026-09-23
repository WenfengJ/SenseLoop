# Task 13：后端持久化与接口实现设计

## 1. 本任务结论

SenseLoop 当前前端已经把核心产品闭环跑通：

```text
UserProfile
  + DailySignals
  + KnowledgeRule[]
  -> DailyReport
```

后端下一步不应该先追求复杂微服务，而是把这条闭环从 mock 数据迁移成可持久化、可上传、可追踪、可替换 adapter 的 API。

推荐后端路线：

- 后端框架：沿用当前 `backend/app/main.py` 的 FastAPI。
- 数据库：MVP 和产品化阶段优先选择 PostgreSQL。
- 本地演示：可以保留 mock / SQLite fallback，但正式后端以 PostgreSQL 为主。
- API 合同：所有返回 JSON 直接匹配 `src/domain/types.ts` 的 camelCase 字段。
- 报告生成：规则引擎仍是主判断逻辑，LLM 只做文案润色。

## 2. 为什么纯前端会卡住

纯前端 Demo 适合证明体验，但会在这些地方遇到上限：

- 不能保存用户长期画像、连续 7 天趋势和历史日报。
- 不能可靠处理真实 soundcore Work / 上传音频 / 图片上传。
- 不能记录用户修正 kcal、舌苔、排便等反馈。
- 不能做家庭共享、隐私删除、数据来源审计。
- 不能让规则库、模型输出、日报生成形成可回溯链路。

因此后端的核心目标不是“把页面搬到服务器”，而是沉淀数据资产和生成链路。

## 3. 前后端字段合同

前端当前核心类型来自：

```text
src/domain/types.ts
```

后端 API 必须保持这些字段名，不做 snake_case 输出：

- `profileType`
- `lateNightSnack`
- `sedentaryHours`
- `exerciseFrequency`
- `sleepProblem`
- `startMinute`
- `durationSec`
- `sleepDurationHours`
- `sleepQuality`
- `wakeCount`
- `userSleepFeeling`
- `mealType`
- `foodName`
- `foodTags`
- `estimatedKcal`
- `userAdjustedKcal`
- `frequencyToday`
- `tongueColor`
- `coatingThickness`
- `photoQuality`
- `dryMouth`
- `bitterTaste`
- `heartRateResting`
- `exerciseMinutes`
- `recoveryScore`
- `oneSentenceAdvice`
- `nightAudioSummary`
- `bodyStatusHints`
- `foodAdvice`
- `recoveryAdvice`
- `riskNotice`
- `fourDiagnosisCompletion`
- `evidenceTags`

后端内部可以用 Python snake_case，但 Pydantic response model 需要通过 alias 输出 camelCase。

## 4. 后端模块设计

建议目录：

```text
backend/
  app/
    main.py
    api/
      profiles.py
      signals.py
      reports.py
      uploads.py
      devices.py
      rules.py
    domain/
      schemas.py
      enums.py
    models/
      tables.py
    repositories/
      profile_repo.py
      signal_repo.py
      report_repo.py
      rule_repo.py
    services/
      report_builder.py
      recommendation_engine.py
      ingestion_service.py
      media_service.py
    adapters/
      soundcore_adapter.py
      eufy_adapter.py
      audio_model_adapter.py
      vision_model_adapter.py
      llm_adapter.py
    db.py
```

职责边界：

| 层 | 职责 |
| --- | --- |
| API | 参数校验、鉴权、返回前端合同 |
| repository | 数据库读写，不放业务规则 |
| service | 报告生成、规则匹配、数据汇总 |
| adapter | 真实硬件、上传文件、模型能力接入 |
| domain schemas | 和前端完全对齐的 Pydantic schema |

## 5. 数据库选型讨论

### 5.1 推荐结论

推荐最终选择：

```text
PostgreSQL 16 + JSONB + pgvector
```

选择原因：

- SenseLoop 数据既有强结构字段，又有会变化的多模态标签。
- 用户画像、饮食、声音事件、日报适合关系型表。
- 舌苔、排便、模型输出、设备原始 payload 适合 JSONB 保留扩展性。
- 需要按用户、日期、事件类型、连续趋势查询，PostgreSQL 索引能力足够。
- 中医知识库、健康知识库可以先存 PostgreSQL；语义检索向量用 pgvector，不必一开始引入独立向量库。

### 5.2 PostgreSQL 是否足够存知识库

结论：

> 对当前 MVP 和早期产品，PostgreSQL 足够存中医知识库、健康知识库、规则库、报告和 RAG 检索切片。

原因：

- 知识源文档适合存在普通表里，例如标题、来源、版本、适用人群、审核状态。
- 切片文本适合存在 `text` 字段里。
- 标签、适用范围、禁忌、来源 metadata 适合存在 JSONB。
- embedding 向量可以存在 pgvector 字段。
- 审核、发布、回滚、引用证据都需要事务和关系查询，PostgreSQL 很适合。

早期不建议单独上 Elasticsearch、Milvus、Pinecone 或 MongoDB。它们不是不能用，而是会增加部署、同步、权限和数据一致性成本。

### 5.3 行业标准组合

更接近行业生产环境的组合是：

| 组件 | 是否第一阶段需要 | 行业常见职责 | SenseLoop 建议 |
| --- | --- | --- | --- |
| PostgreSQL | 必须 | 业务主库、关系数据、事务、JSONB、pgvector | 主数据库，存用户、信号、报告、规则、知识库、RAG 切片 |
| Redis | 建议第二阶段加入 | 缓存、限流、短期会话、异步任务状态、分布式锁 | 不做主存储，只做缓存和任务状态 |
| 对象存储 S3/MinIO | 有上传后需要 | 存音频、图片、PDF、原始文件 | 上传音频、饮食图、舌苔图不要直接塞 PostgreSQL |
| Celery/RQ/Arq + Redis | 有识别任务后需要 | 后台任务队列 | 音频识别、图片识别、RAG ingest、日报批量生成 |
| 独立向量库 | 后期可选 | 大规模向量检索 | 先用 pgvector；百万级切片或复杂多租户检索后再评估 |
| Elasticsearch/OpenSearch | 后期可选 | 全文搜索、日志检索 | 健康知识库规模大、搜索体验要求高时再加 |
| TimescaleDB | 后期可选 | 高频时间序列 | Watch/Band 高频心率、血氧、运动流再加 |

### 5.4 Redis 的位置

Redis 不应该替代 PostgreSQL。

Redis 适合：

- 缓存用户当天报告、近 7 天趋势。
- 保存 Agent 对话的短期运行状态。
- 保存异步识别任务状态，例如 `audio_recognition:running`。
- 做接口限流，避免 LLM / 识别接口被刷爆。
- 做简单分布式锁，避免同一天报告被重复生成。

Redis 不适合：

- 长期保存用户健康档案。
- 长期保存日报。
- 长期保存知识库。
- 作为唯一的 Agent 记忆。

### 5.5 对象存储的位置

音频、图片、PDF、原始知识库文件建议放对象存储，而不是直接放 PostgreSQL。

推荐：

- 本地开发：文件系统或 MinIO。
- 云端部署：S3 兼容对象存储。
- PostgreSQL 只存 `storage_key`、`mime_type`、`sha256`、`privacy_level`、关联用户和日期。

这样可以避免数据库膨胀，也方便做权限控制、删除和文件生命周期管理。

### 5.6 不建议优先 MongoDB

MongoDB 可以存灵活 JSON，但当前前端类型已经很清晰，而且后续会高频查询：

- 某用户近 7 天睡眠趋势。
- 某类音频事件连续出现次数。
- 每日报告命中的规则。
- 用户修正 kcal 与模型估算差异。
- 家庭成员共享摘要。

这些查询用关系型模型更稳。

### 5.7 不建议一开始上 TimescaleDB

TimescaleDB 适合高频传感器时间序列，比如心率每秒采样、血氧连续流。当前 MVP 的数据粒度主要是每日信号和夜间事件片段，不需要一开始增加复杂度。

后续进入 Watch / Band 阶段，可以在 PostgreSQL 上平滑引入 TimescaleDB 扩展。

### 5.8 SQLite 的位置

SQLite 适合：

- 本地 Demo。
- 无网络现场 fallback。
- 单人试用。

但不建议作为正式后端数据库，因为它不适合多人账号、并发写入、家庭共享、云端部署和权限审计。

## 6. 核心表设计

### 6.1 users

存真实账号。当前 Demo 可以先用匿名用户。

```sql
create table users (
  id uuid primary key,
  display_name text not null,
  email text unique,
  phone text unique,
  auth_provider text not null default 'anonymous',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### 6.2 user_profiles

直接对应前端 `UserProfile`。

```sql
create table user_profiles (
  id text primary key,
  user_id uuid references users(id),
  name text not null,
  profile_type text not null check (profile_type in (
    'weight_loss_female',
    'elderly',
    'office_worker',
    'student',
    'insomnia'
  )),
  age int not null,
  gender text not null check (gender in ('female', 'male', 'other')),
  occupation text not null,
  coffee text not null check (coffee in ('none', 'low', 'medium', 'high')),
  late_night_snack boolean not null,
  sedentary_hours numeric(4,1) not null,
  exercise_frequency text not null check (exercise_frequency in ('low', 'medium', 'high')),
  sleep_problem text not null check (sleep_problem in ('none', 'mild', 'moderate', 'severe')),
  risk_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_profiles_user_id on user_profiles(user_id);
create index idx_user_profiles_profile_type on user_profiles(profile_type);
```

### 6.3 profile_goals

把 `goals: HealthGoal[]` 拆出来，方便查询人群目标。

```sql
create table profile_goals (
  profile_id text not null references user_profiles(id) on delete cascade,
  goal text not null check (goal in (
    'sleep_recovery',
    'weight_loss',
    'elderly_care',
    'focus_study',
    'reduce_fatigue',
    'digestive_health'
  )),
  primary key (profile_id, goal)
);
```

### 6.4 daily_signal_days

一位用户一天一份身体信号总入口，对应前端 `DailySignals` 的外层。

```sql
create table daily_signal_days (
  id uuid primary key,
  profile_id text not null references user_profiles(id) on delete cascade,
  signal_date date not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, signal_date)
);

create index idx_daily_signal_days_profile_date
  on daily_signal_days(profile_id, signal_date desc);
```

### 6.5 sleep_signals

对应 `SleepSignal`。

```sql
create table sleep_signals (
  day_id uuid primary key references daily_signal_days(id) on delete cascade,
  sleep_duration_hours numeric(4,2) not null,
  sleep_quality text not null check (sleep_quality in ('good', 'fair', 'poor')),
  wake_count int not null,
  user_sleep_feeling text not null check (user_sleep_feeling in ('refreshed', 'tired', 'very_tired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.6 sleep_audio_events

对应 `SleepAudioEvent[]`。

```sql
create table sleep_audio_events (
  id text primary key,
  day_id uuid not null references daily_signal_days(id) on delete cascade,
  type text not null check (type in (
    'snore',
    'cough',
    'breathing_noise',
    'turn_over',
    'wake_marker',
    'get_up',
    'ambient_noise',
    'unknown'
  )),
  start_minute int not null check (start_minute >= 0),
  duration_sec int not null check (duration_sec >= 0),
  intensity text not null check (intensity in ('low', 'medium', 'high')),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source text not null check (source in ('mock', 'manual', 'soundcore_sdk', 'audio_model')),
  note text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_sleep_audio_events_day_id on sleep_audio_events(day_id);
create index idx_sleep_audio_events_type on sleep_audio_events(type);
create index idx_sleep_audio_events_source on sleep_audio_events(source);
```

### 6.7 diet_records

对应 `DietSignal[]`。

```sql
create table diet_records (
  id text primary key,
  day_id uuid not null references daily_signal_days(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_name text not null,
  food_tags text[] not null default '{}',
  portion text not null check (portion in ('small', 'medium', 'large', 'unknown')),
  estimated_kcal int not null,
  user_adjusted_kcal int,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source text not null check (source in ('manual', 'photo_upload', 'mock', 'vision_model')),
  media_asset_id uuid,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_diet_records_day_id on diet_records(day_id);
create index idx_diet_records_food_tags on diet_records using gin(food_tags);
```

### 6.8 stool_records

对应 `StoolSignal`。敏感信号只存标签，不默认存图片。

```sql
create table stool_records (
  day_id uuid primary key references daily_signal_days(id) on delete cascade,
  recorded boolean not null,
  shape text check (shape in ('hard_lump', 'sausage_cracked', 'normal', 'soft', 'loose', 'watery')),
  color text check (color in ('brown', 'dark', 'yellow', 'green', 'red_flag', 'unknown')),
  dryness text check (dryness in ('dry', 'normal', 'wet')),
  frequency_today int,
  source text not null check (source in ('manual', 'photo_upload', 'mock')),
  privacy_level text not null default 'sensitive',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.9 tongue_records

对应 `TongueSignal`。

```sql
create table tongue_records (
  day_id uuid primary key references daily_signal_days(id) on delete cascade,
  recorded boolean not null,
  tongue_color text check (tongue_color in ('pale', 'pink', 'red', 'dark_red', 'unknown')),
  coating_thickness text check (coating_thickness in ('thin', 'normal', 'thick', 'none', 'unknown')),
  moisture text check (moisture in ('dry', 'normal', 'wet')),
  marks text[] not null default '{}',
  photo_quality text check (photo_quality in ('good', 'low_light', 'blurred', 'color_uncertain')),
  source text not null check (source in ('manual', 'photo_upload', 'mock')),
  media_asset_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.10 breath_records

对应 `BreathSignal`。

```sql
create table breath_records (
  day_id uuid primary key references daily_signal_days(id) on delete cascade,
  level text not null check (level in ('none', 'mild', 'obvious', 'unknown')),
  dry_mouth boolean not null,
  bitter_taste boolean not null,
  source text not null check (source in ('manual', 'mock', 'future_sensor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.11 vital_records

对应 `VitalSignal`。

```sql
create table vital_records (
  day_id uuid primary key references daily_signal_days(id) on delete cascade,
  heart_rate_resting int,
  steps int,
  exercise_minutes int,
  blood_pressure_systolic int,
  blood_pressure_diastolic int,
  source text not null check (source in ('manual', 'mock', 'future_wearable')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.12 knowledge_rules

对应 `KnowledgeRule`。当前前端规则比较轻，后端可以先兼容轻量版，再逐步补 `conditions`。

```sql
create table knowledge_rules (
  id text primary key,
  category text not null check (category in ('sleep', 'diet', 'stool', 'tongue', 'breath', 'exercise', 'risk')),
  applies_to text[] not null default '{}',
  priority text not null check (priority in ('low', 'medium', 'high')),
  safety_level text not null default 'normal' check (safety_level in ('normal', 'observe', 'medical_reminder')),
  conditions jsonb not null default '[]'::jsonb,
  status_hint text,
  food_advice text[] not null default '{}',
  recovery_advice text[] not null default '{}',
  risk_notice text[] not null default '{}',
  enabled boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_knowledge_rules_category on knowledge_rules(category);
create index idx_knowledge_rules_applies_to on knowledge_rules using gin(applies_to);
```

`applies_to = '{}'` 表示前端里的 `"all"`。

### 6.13 daily_reports

对应 `DailyReport`。报告建议要落库，便于回看和审计。

```sql
create table daily_reports (
  id text primary key,
  day_id uuid not null references daily_signal_days(id) on delete cascade,
  profile_id text not null references user_profiles(id),
  report_date date not null,
  title text not null,
  status text not null check (status in ('stable', 'recovery_needed', 'observe')),
  recovery_score int not null check (recovery_score >= 0 and recovery_score <= 100),
  one_sentence_advice text not null,
  night_audio_summary text[] not null default '{}',
  body_status_hints text[] not null default '{}',
  food_advice text[] not null default '{}',
  recovery_advice text[] not null default '{}',
  risk_notice text[] not null default '{}',
  four_diagnosis_completion jsonb not null,
  evidence_tags text[] not null default '{}',
  generator_version text not null default 'rules-v1',
  llm_trace_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, report_date)
);

create index idx_daily_reports_profile_date
  on daily_reports(profile_id, report_date desc);
```

### 6.14 report_rule_matches

记录每份日报命中了哪些规则。

```sql
create table report_rule_matches (
  report_id text not null references daily_reports(id) on delete cascade,
  rule_id text not null references knowledge_rules(id),
  priority text not null,
  matched_snapshot jsonb not null default '{}'::jsonb,
  primary key (report_id, rule_id)
);
```

### 6.15 media_assets

保存上传音频、饮食图片、舌苔图片的元信息。文件本体建议放对象存储或本地私有目录，不直接塞数据库。

```sql
create table media_assets (
  id uuid primary key,
  profile_id text references user_profiles(id),
  day_id uuid references daily_signal_days(id),
  media_type text not null check (media_type in ('audio', 'meal_photo', 'tongue_photo')),
  storage_key text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  source text not null check (source in ('upload', 'soundcore_sdk', 'eufy_sdk', 'mock')),
  privacy_level text not null default 'normal' check (privacy_level in ('normal', 'sensitive')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_media_assets_day_id on media_assets(day_id);
create unique index idx_media_assets_sha256 on media_assets(sha256);
```

### 6.16 device_integrations

记录 soundcore / eufy / future wearable 的连接状态。

```sql
create table device_integrations (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('soundcore', 'eufy', 'senseloop_watch', 'manual')),
  device_name text,
  external_device_id text,
  status text not null check (status in ('connected', 'disconnected', 'mock')),
  permissions jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.17 signal_observations

用于承接新增页面和新增身体信号。成熟模块可以继续使用专表，探索期模块先写入通用 observation，避免每新增一个功能就大改表结构。

```sql
create table signal_observations (
  id uuid primary key,
  day_id uuid not null references daily_signal_days(id) on delete cascade,
  profile_id text not null references user_profiles(id),
  signal_type text not null,
  value_json jsonb not null,
  source text not null default 'manual',
  confidence numeric(4,3) check (confidence >= 0 and confidence <= 1),
  media_asset_id uuid references media_assets(id),
  privacy_level text not null default 'normal' check (privacy_level in ('normal', 'sensitive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_signal_observations_day_type on signal_observations(day_id, signal_type);
create index idx_signal_observations_profile_type on signal_observations(profile_id, signal_type);
create index idx_signal_observations_value_json on signal_observations using gin(value_json);
```

适合先放：

- 情绪记录。
- 环境记录。
- 用药记录。
- 疲劳自评。
- 运动恢复主观反馈。
- 新硬件尚未稳定的数据字段。

### 6.18 knowledge_sources

存中医知识库、健康知识库、产品说明、审核过的建议材料等知识源。

```sql
create table knowledge_sources (
  id uuid primary key,
  source_type text not null check (source_type in ('tcm', 'nutrition', 'sleep', 'exercise', 'product', 'medical_boundary', 'custom')),
  title text not null,
  author text,
  source_uri text,
  version text not null default 'v1',
  language text not null default 'zh-CN',
  review_status text not null default 'draft' check (review_status in ('draft', 'reviewed', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_knowledge_sources_type_status on knowledge_sources(source_type, review_status);
```

### 6.19 knowledge_chunks

存 RAG 检索切片。需要启用 pgvector。

```sql
create extension if not exists vector;

create table knowledge_chunks (
  id uuid primary key,
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  summary text,
  tags text[] not null default '{}',
  applies_to text[] not null default '{}',
  safety_level text not null default 'normal' check (safety_level in ('normal', 'observe', 'medical_reminder')),
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index idx_knowledge_chunks_source_id on knowledge_chunks(source_id);
create index idx_knowledge_chunks_tags on knowledge_chunks using gin(tags);
create index idx_knowledge_chunks_embedding
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops);
```

说明：

- `knowledge_rules` 负责确定安全边界和规则建议。
- `knowledge_chunks` 负责 RAG 引用和解释。
- RAG 输出不能绕过 `knowledge_rules` 的风险控制。

### 6.20 agent_sessions

记录一次 AI Agent 会话，例如“解释今天日报”“分析 7 天趋势”“生成明日改善计划”。

```sql
create table agent_sessions (
  id uuid primary key,
  profile_id text not null references user_profiles(id),
  session_type text not null check (session_type in ('report_explain', 'trend_analysis', 'daily_plan', 'health_chat', 'debug')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  model_name text,
  system_prompt_version text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index idx_agent_sessions_profile_started
  on agent_sessions(profile_id, started_at desc);
```

### 6.21 agent_messages

记录 Agent 对话消息。长期记忆仍以 PostgreSQL 为准，Redis 只做短期状态。

```sql
create table agent_messages (
  id uuid primary key,
  session_id uuid not null references agent_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_agent_messages_session_created
  on agent_messages(session_id, created_at);
```

### 6.22 agent_tool_calls

记录 Agent 调用了哪些工具、参数是什么、输出是什么，方便调试和审计。

```sql
create table agent_tool_calls (
  id uuid primary key,
  session_id uuid not null references agent_sessions(id) on delete cascade,
  tool_name text not null,
  input_json jsonb not null,
  output_json jsonb,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_agent_tool_calls_session_id on agent_tool_calls(session_id);
create index idx_agent_tool_calls_tool_name on agent_tool_calls(tool_name);
```

### 6.23 rag_retrieval_logs

记录一次 RAG 检索命中了哪些知识切片，支撑引用证据和排查错误建议。

```sql
create table rag_retrieval_logs (
  id uuid primary key,
  session_id uuid references agent_sessions(id) on delete set null,
  report_id text references daily_reports(id) on delete set null,
  query text not null,
  chunk_id uuid not null references knowledge_chunks(id),
  score numeric(8,6),
  rank int not null,
  used_in_answer boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_rag_retrieval_logs_session_id on rag_retrieval_logs(session_id);
create index idx_rag_retrieval_logs_report_id on rag_retrieval_logs(report_id);
```

## 7. API 设计

### 7.1 健康检查

```http
GET /health
```

返回：

```json
{
  "status": "ok",
  "service": "anker-SenseLoop"
}
```

### 7.2 用户画像列表

兼容当前前端画像切换。

```http
GET /api/profiles
```

返回 `UserProfile[]`：

```json
[
  {
    "id": "profile-weight-loss",
    "name": "减脂女性",
    "profileType": "weight_loss_female",
    "age": 28,
    "gender": "female",
    "occupation": "产品经理",
    "goals": ["weight_loss", "sleep_recovery", "digestive_health"],
    "habits": {
      "coffee": "medium",
      "lateNightSnack": false,
      "sedentaryHours": 8,
      "exerciseFrequency": "medium",
      "sleepProblem": "mild"
    }
  }
]
```

### 7.3 创建或更新用户画像

```http
PUT /api/profiles/{profileId}
Content-Type: application/json
```

请求体直接使用 `UserProfile`。

返回：

```json
{
  "profile": { "...": "UserProfile" }
}
```

### 7.4 获取某天完整信号

兼容当前：

```http
GET /api/signals/{profileType}
```

产品化版本：

```http
GET /api/profiles/{profileId}/signals?date=2026-09-18
```

返回 `DailySignals`：

```json
{
  "date": "2026-09-18",
  "profileId": "profile-weight-loss",
  "sleep": {
    "sleepDurationHours": 6.4,
    "sleepQuality": "fair",
    "wakeCount": 2,
    "userSleepFeeling": "tired"
  },
  "audioEvents": [],
  "diet": [],
  "stool": {
    "recorded": true,
    "shape": "sausage_cracked",
    "color": "brown",
    "dryness": "dry",
    "frequencyToday": 1,
    "source": "manual"
  },
  "tongue": {
    "recorded": true,
    "tongueColor": "red",
    "coatingThickness": "thick",
    "moisture": "dry",
    "photoQuality": "good",
    "source": "mock"
  },
  "breath": {
    "level": "mild",
    "dryMouth": true,
    "bitterTaste": false,
    "source": "manual"
  },
  "vitals": {
    "heartRateResting": 72,
    "steps": 6200,
    "exerciseMinutes": 18,
    "source": "mock"
  }
}
```

### 7.5 保存睡眠信号

```http
PUT /api/profiles/{profileId}/signals/{date}/sleep
```

请求体：

```json
{
  "sleepDurationHours": 6.4,
  "sleepQuality": "fair",
  "wakeCount": 2,
  "userSleepFeeling": "tired"
}
```

返回更新后的 `DailySignals`。

### 7.6 批量写入夜间声音事件

```http
PUT /api/profiles/{profileId}/signals/{date}/audio-events
```

请求体：

```json
{
  "events": [
    {
      "id": "audio-w1",
      "type": "snore",
      "startMinute": 224,
      "durationSec": 18,
      "intensity": "low",
      "confidence": 0.78,
      "source": "soundcore_sdk",
      "note": "自动识别"
    }
  ]
}
```

语义：

- 默认覆盖当天事件列表。
- 如果要追加，用 `POST /api/profiles/{profileId}/signals/{date}/audio-events`。
- `source` 会直接影响睡眠页的数据来源标签。

### 7.7 写入饮食记录

```http
POST /api/profiles/{profileId}/signals/{date}/diet
```

请求体使用 `DietSignal`。

用户修正 kcal：

```http
PATCH /api/profiles/{profileId}/signals/{date}/diet/{dietId}
```

请求体：

```json
{
  "userAdjustedKcal": 680
}
```

### 7.8 写入排便、舌苔、口气、体征

```http
PUT /api/profiles/{profileId}/signals/{date}/stool
PUT /api/profiles/{profileId}/signals/{date}/tongue
PUT /api/profiles/{profileId}/signals/{date}/breath
PUT /api/profiles/{profileId}/signals/{date}/vitals
```

请求体分别对应：

- `StoolSignal`
- `TongueSignal`
- `BreathSignal`
- `VitalSignal`

返回更新后的 `DailySignals`。

### 7.9 生成或读取日报

兼容当前：

```http
GET /api/report/{profileType}
```

产品化版本：

```http
POST /api/profiles/{profileId}/reports/{date}/generate
```

请求体：

```json
{
  "forceRegenerate": false,
  "useLlmPolish": false
}
```

返回 `DailyReport`：

```json
{
  "id": "report-weight-loss-female-2026-09-18",
  "date": "2026-09-18",
  "profileId": "profile-weight-loss",
  "title": "减脂女性 · 每日健康建议",
  "status": "recovery_needed",
  "recoveryScore": 72,
  "oneSentenceAdvice": "今天适合轻控热量，不适合硬扛高强度训练。",
  "nightAudioSummary": ["翻身 1 次", "咳嗽 1 次", "打鼾 1 次"],
  "bodyStatusHints": ["昨晚恢复不足，今天更适合降低强度。"],
  "foodAdvice": ["今天控制总热量，但不要极端节食；早餐保留优质蛋白。"],
  "recoveryAdvice": ["恢复不足时不建议 HIIT，适合 30 分钟快走。"],
  "riskNotice": ["如果夜醒、咳嗽或打鼾连续增加，建议持续观察。"],
  "fourDiagnosisCompletion": {
    "wang": true,
    "wen": true,
    "wenAsk": true,
    "qie": true
  },
  "evidenceTags": ["翻身", "咳嗽", "打鼾"]
}
```

读取历史日报：

```http
GET /api/profiles/{profileId}/reports?from=2026-09-12&to=2026-09-18
GET /api/profiles/{profileId}/reports/{date}
```

### 7.10 上传音频或图片

```http
POST /api/profiles/{profileId}/signals/{date}/media
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 说明 |
| --- | --- |
| `file` | 音频或图片文件 |
| `mediaType` | `audio` / `meal_photo` / `tongue_photo` |
| `source` | `upload` / `soundcore_sdk` / `eufy_sdk` / `mock` |

返回：

```json
{
  "id": "6bb2f48d-fef7-48d1-87a6-8b0f1a2d3d9f",
  "mediaType": "audio",
  "storageKey": "private/profile-weight-loss/2026-09-18/audio.wav",
  "privacyLevel": "normal"
}
```

上传后可以触发识别：

```http
POST /api/media/{mediaId}/recognize
```

返回统一标签，而不是直接返回模型原始结果：

```json
{
  "audioEvents": [
    {
      "id": "audio-generated-1",
      "type": "snore",
      "startMinute": 224,
      "durationSec": 18,
      "intensity": "low",
      "confidence": 0.78,
      "source": "audio_model"
    }
  ]
}
```

### 7.11 新增模块通用信号接口

用于支撑后续新增页面，例如情绪页、环境页、用药页、运动恢复页。稳定后再拆成专表。

```http
POST /api/profiles/{profileId}/signals/{date}/observations
```

请求体：

```json
{
  "signalType": "mood",
  "valueJson": {
    "level": "medium",
    "stress": "high",
    "note": "上午会议后明显疲劳"
  },
  "source": "manual",
  "confidence": 1,
  "privacyLevel": "normal"
}
```

读取：

```http
GET /api/profiles/{profileId}/signals/{date}/observations?signalType=mood
```

### 7.12 知识库管理接口

知识库来源包括中医知识、睡眠知识、营养知识、运动恢复知识、产品说明和医疗边界说明。

创建知识源：

```http
POST /api/knowledge/sources
```

请求体：

```json
{
  "sourceType": "tcm",
  "title": "舌苔与生活方式建议知识库",
  "author": "SenseLoop Team",
  "sourceUri": "internal://tcm-tongue-v1",
  "version": "v1",
  "language": "zh-CN",
  "metadata": {
    "scope": "lifestyle_advice",
    "medicalBoundary": "not_diagnosis"
  }
}
```

导入切片：

```http
POST /api/knowledge/sources/{sourceId}/chunks
```

请求体：

```json
{
  "chunks": [
    {
      "chunkIndex": 0,
      "content": "舌面偏干可结合饮水、睡眠、饮食油腻程度继续观察，不应单独作为疾病判断。",
      "summary": "舌面偏干的观察边界",
      "tags": ["tongue", "dry", "tcm"],
      "appliesTo": ["all"],
      "safetyLevel": "normal",
      "metadata": {
        "category": "tongue"
      }
    }
  ],
  "generateEmbedding": true
}
```

检索：

```http
POST /api/knowledge/search
```

请求体：

```json
{
  "query": "舌苔厚且口干应该给什么生活建议",
  "sourceTypes": ["tcm", "nutrition"],
  "topK": 5,
  "profileType": "office_worker"
}
```

返回：

```json
{
  "chunks": [
    {
      "chunkId": "4dd0b4c5-0ff3-4db0-9ff6-217c97e8b956",
      "sourceId": "65f8895b-f37b-4e12-8a11-764f4f78f98a",
      "title": "舌苔与生活方式建议知识库",
      "content": "舌面偏干可结合饮水、睡眠、饮食油腻程度继续观察，不应单独作为疾病判断。",
      "score": 0.82,
      "safetyLevel": "normal"
    }
  ]
}
```

### 7.13 Agent 接口

Agent 用于解释日报、分析趋势、生成行动计划和健康问答。Agent 不能直接绕过规则引擎给医疗判断。

创建 Agent 会话：

```http
POST /api/agent/sessions
```

请求体：

```json
{
  "profileId": "profile-weight-loss",
  "sessionType": "report_explain",
  "metadata": {
    "reportId": "report-weight-loss-female-2026-09-18"
  }
}
```

发送消息：

```http
POST /api/agent/sessions/{sessionId}/messages
```

请求体：

```json
{
  "message": "为什么今天不建议我做高强度训练？",
  "useRag": true,
  "allowedTools": [
    "get_daily_report",
    "get_recent_signals",
    "retrieve_health_knowledge"
  ]
}
```

返回：

```json
{
  "answer": "今天不建议高强度训练，主要因为昨晚睡眠质量一般、夜间有声音事件，并且排便偏干。更稳妥的选择是快走、拉伸或轻力量。",
  "citations": [
    {
      "chunkId": "4dd0b4c5-0ff3-4db0-9ff6-217c97e8b956",
      "title": "运动恢复建议知识库",
      "snippet": "恢复不足时优先选择低强度活动。"
    }
  ],
  "toolCalls": [
    {
      "toolName": "get_daily_report",
      "status": "succeeded"
    },
    {
      "toolName": "retrieve_health_knowledge",
      "status": "succeeded"
    }
  ]
}
```

读取会话历史：

```http
GET /api/agent/sessions/{sessionId}
GET /api/agent/sessions?profileId=profile-weight-loss
```

## 8. 报告生成流程

后端生成日报的流程：

```text
1. 读取 UserProfile
2. 读取 DailySignals
3. 汇总 SleepAudioEvent
4. 读取启用中的 KnowledgeRule
5. 规则引擎命中建议
6. 计算 recoveryScore 和 status
7. 合并 foodAdvice / recoveryAdvice / riskNotice
8. 生成 DailyReport
9. 保存 daily_reports 和 report_rule_matches
10. 返回和前端类型完全一致的 JSON
```

关键原则：

- 医疗边界由规则控制，不交给 LLM 自由判断。
- LLM 只能在已命中的建议范围内润色文案。
- 报告必须保存命中规则，方便解释和回滚。
- 再次生成时默认复用已有报告，除非 `forceRegenerate=true`。

## 9. Agent / RAG 生成流程

Agent 和 RAG 不替代规则引擎，而是服务两个场景：

- 报告解释：回答“为什么给我这个建议”。
- 知识增强：从中医知识库、健康知识库中检索可引用内容，让建议更有依据。

推荐流程：

```text
1. 创建 agent_sessions
2. 写入用户问题 agent_messages
3. 调用工具读取 DailyReport / DailySignals / 近 7 天趋势
4. 调用 RAG 检索 knowledge_chunks
5. 写入 rag_retrieval_logs
6. 生成回答前执行安全边界检查
7. 写入 assistant 消息和 agent_tool_calls
8. 返回 answer + citations + toolCalls
```

Agent 可用工具先限制为：

```text
get_daily_report(profileId, date)
get_recent_signals(profileId, days)
get_report_history(profileId, from, to)
retrieve_health_knowledge(query, filters)
explain_rule_match(reportId)
draft_daily_plan(profileId, date)
```

安全原则：

- Agent 不直接写健康结论到日报，日报仍由 report service 生成。
- Agent 可以生成解释、草稿、问答回复。
- Agent 使用的知识切片必须来自 `review_status = published` 的知识源。
- 回答涉及异常或风险时，必须优先使用 `knowledge_rules` 和 `riskNotice`。
- 所有工具调用都写入 `agent_tool_calls`，所有检索证据都写入 `rag_retrieval_logs`。

## 10. 当前代码迁移顺序

### 阶段一：API 合同补齐

- 给 `backend/app/domain` 补齐 Pydantic schema。
- 让 `/api/profiles` 返回完整 `UserProfile[]`。
- 让 `/api/signals/{profile_type}` 返回完整 `DailySignals`。
- 让 `/api/report/{profile_type}` 返回完整 `DailyReport`。
- 前端增加一个 `apiClient`，可以在 mock 和 API 之间切换。

### 阶段二：PostgreSQL 落库

- 引入 SQLAlchemy / SQLModel。
- 增加 Alembic migration。
- 把当前 mock profiles、signals、knowledge rules 做成 seed 数据。
- 保持现有 mock fallback，方便演示。

### 阶段三：输入闭环

- 实现画像保存。
- 实现饮食 kcal 修正。
- 实现排便、舌苔、口气、体征手动写入。
- 实现重新生成日报。

### 阶段四：真实数据源

- 增加音频上传。
- 音频识别结果写入 `sleep_audio_events`。
- 图片上传生成 `diet_records` 或 `tongue_records`。
- soundcore / eufy adapter 接入后，只写统一标签表。

### 阶段五：AI Agent / RAG

- 开启 PostgreSQL pgvector 扩展。
- 增加 `knowledge_sources`、`knowledge_chunks`、`rag_retrieval_logs`。
- 增加 `agent_sessions`、`agent_messages`、`agent_tool_calls`。
- 导入中医知识库、健康知识库、医疗边界说明。
- 实现 `retrieve_health_knowledge` 和 `explain_report`。
- 前端新增“问问 SenseLoop”或“解释这份日报”入口。

## 11. 前端改造点

当前前端直接读：

```text
src/data/mockProfiles.ts
src/data/mockDailySignals.ts
src/data/knowledgeBase.ts
```

建议新增：

```text
src/services/apiClient.ts
```

提供：

```ts
getProfiles(): Promise<UserProfile[]>
getDailySignals(profileId: string, date: string): Promise<DailySignals>
generateReport(profileId: string, date: string): Promise<DailyReport>
updateDietRecord(profileId: string, date: string, diet: DietSignal): Promise<DailySignals>
updateStool(profileId: string, date: string, stool: StoolSignal): Promise<DailySignals>
updateTongue(profileId: string, date: string, tongue: TongueSignal): Promise<DailySignals>
uploadMedia(profileId: string, date: string, file: File, mediaType: string): Promise<MediaAsset>
createObservation(profileId: string, date: string, observation: SignalObservation): Promise<DailySignals>
searchKnowledge(query: string): Promise<KnowledgeSearchResult>
createAgentSession(profileId: string, sessionType: string): Promise<AgentSession>
sendAgentMessage(sessionId: string, message: string): Promise<AgentAnswer>
```

配置：

```text
VITE_DATA_MODE=mock | api
VITE_API_BASE_URL=http://127.0.0.1:8000
```

这样现场演示时 API 不稳定仍可回到 mock。

## 12. 隐私和删除设计

需要从第一版后端就预留：

- 敏感数据标记：`privacy_level = sensitive`。
- 排便不默认存图片，只存标签。
- 音频和图片文件支持软删除。
- `users.deleted_at` 和 `media_assets.deleted_at` 支持删除审计。
- 导出用户数据时，按 `profile_id` 汇总画像、信号、报告、媒体元信息。

推荐 API：

```http
DELETE /api/profiles/{profileId}/signals/{date}
DELETE /api/media/{mediaId}
GET /api/profiles/{profileId}/export
```

## 13. 最终建议

本项目的数据库选型，我建议这样定：

| 阶段 | 数据库 | 原因 |
| --- | --- | --- |
| 当前 Demo | mock 数据 + 可选 SQLite | 保证现场稳定、无网络可跑 |
| 可试用 MVP | PostgreSQL + JSONB + pgvector | 画像、日报、历史趋势、知识库、RAG 切片、上传记录都需要可靠持久化 |
| 生产增强 | PostgreSQL + Redis + 对象存储 + 任务队列 | 缓存、后台识别、Agent 状态、音频图片文件存储 |
| 产品化 | PostgreSQL + pgvector + Redis + 对象存储 + 可选 TimescaleDB / 独立向量库 | 知识库检索、长期趋势、高频穿戴数据逐步扩展 |

最终主数据库选 PostgreSQL，是因为它同时适合：

- 结构化用户画像。
- 每日健康信号。
- 夜间声音事件。
- 饮食/舌苔/排便标签。
- JSONB 模型原始结果。
- 历史趋势查询。
- 报告生成审计。
- 后续向量检索和时间序列扩展。

中医知识库、健康知识库、RAG 切片和引用证据，早期都可以放 PostgreSQL。行业标准不是“所有东西只用一个库”，而是：

```text
PostgreSQL 做业务事实主库
Redis 做缓存、限流、短期状态和任务状态
对象存储保存音频、图片、PDF、原始知识文件
任务队列处理音频识别、图片识别、RAG ingest 和日报批量生成
pgvector 先承担向量检索，规模变大后再评估独立向量库
```

这比一开始选择纯前端、本地 JSON、MongoDB 或专门时间序列库更均衡，也更符合健康类 AI 应用的生产架构演进。
