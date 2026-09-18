import {
  Activity,
  AlertTriangle,
  Apple,
  Camera,
  ChevronRight,
  Clock3,
  Database,
  Ear,
  HeartPulse,
  Home,
  Moon,
  ShieldCheck,
  Sparkles,
  Utensils,
  Watch,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { mockProfiles } from "./data/mockProfiles";
import { mockDailySignals } from "./data/mockDailySignals";
import { knowledgeBase } from "./data/knowledgeBase";
import { sleepEventLabels } from "./domain/labels";
import { DietSignal, ProfileType, SleepAudioEvent } from "./domain/types";
import { buildDailyReport } from "./services/reportBuilder";

type PageKey = "today" | "sleep" | "diet" | "signals" | "report" | "architecture";

const pageNames: Record<PageKey, string> = {
  today: "今日",
  sleep: "睡眠",
  diet: "饮食",
  signals: "信号",
  report: "日报",
  architecture: "架构",
};

const profileNotes: Record<ProfileType, string> = {
  weight_loss_female: "减脂、皮肤状态、排便和训练强度联动",
  elderly: "夜间异常、起夜咳嗽、饮食清淡和家人关怀",
  office_worker: "熬夜修复、咖啡因、肠胃负担和低强度恢复",
  student: "作息、营养补给、学习压力和户外活动",
  insomnia: "夜醒趋势、环境噪声、午睡控制和睡前流程",
};

const foodTagLabels: Record<string, string> = {
  high_oil: "偏油",
  high_sugar: "高糖",
  high_protein: "高蛋白",
  vegetable_rich: "蔬菜充足",
  high_carb: "高碳水",
  spicy: "辛辣",
  cold_drink: "冷饮",
  late_night: "夜宵",
};

const statusLabels = {
  stable: "稳定",
  recovery_needed: "需要恢复",
  observe: "建议观察",
};

export default function App() {
  const [profileType, setProfileType] = useState<ProfileType>("weight_loss_female");
  const [page, setPage] = useState<PageKey>("today");

  const profile = mockProfiles.find((item) => item.profileType === profileType) ?? mockProfiles[0];
  const signals = mockDailySignals[profile.profileType];
  const report = useMemo(
    () => buildDailyReport({ profile, signals, rules: knowledgeBase }),
    [profile, signals],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">anker-SenseLoop</p>
          <h1>观息 SenseLoop</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => setPage("architecture")}>
          <Database size={16} />
          架构
        </button>
      </header>

      <section className="profile-strip" aria-label="用户画像切换">
        {mockProfiles.map((item) => (
          <button
            className={item.profileType === profileType ? "chip active" : "chip"}
            key={item.id}
            type="button"
            onClick={() => setProfileType(item.profileType)}
          >
            {item.name}
          </button>
        ))}
      </section>

      <section className="page-frame">
        {page === "today" && <TodayPage report={report} signals={signals} profileType={profile.profileType} />}
        {page === "sleep" && <SleepPage events={signals.audioEvents} />}
        {page === "diet" && <DietPage diet={signals.diet} profileType={profile.profileType} />}
        {page === "signals" && <SignalsPage signals={signals} />}
        {page === "report" && <ReportPage report={report} profileType={profile.profileType} />}
        {page === "architecture" && <ArchitecturePage />}
      </section>

      <nav className="bottom-nav" aria-label="页面导航">
        {(Object.keys(pageNames) as PageKey[])
          .filter((key) => key !== "architecture")
          .map((key) => (
            <button
              className={page === key ? "nav-item active" : "nav-item"}
              key={key}
              type="button"
              onClick={() => setPage(key)}
            >
              {pageNames[key]}
            </button>
          ))}
      </nav>
    </main>
  );
}

function TodayPage({
  report,
  signals,
  profileType,
}: {
  report: ReturnType<typeof buildDailyReport>;
  signals: (typeof mockDailySignals)[ProfileType];
  profileType: ProfileType;
}) {
  const completed = Object.values(report.fourDiagnosisCompletion).filter(Boolean).length;

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">今日健康状态</p>
          <h2>{report.oneSentenceAdvice}</h2>
          <p className="lead">{profileNotes[profileType]}</p>
        </div>
        <div className="score-dial">
          <span>恢复分</span>
          <strong>{report.recoveryScore}</strong>
          <em>{statusLabels[report.status]}</em>
        </div>
      </section>

      <div className="card-grid">
        <MetricCard label="睡眠时长" value={`${signals.sleep.sleepDurationHours}h`} icon={<Moon size={18} />} />
        <MetricCard label="夜间声音" value={`${signals.audioEvents.length}条`} icon={<Ear size={18} />} />
        <MetricCard label="四诊完成" value={`${completed}/4`} icon={<Sparkles size={18} />} />
      </div>

      <section className="section-grid two">
        <Panel title="四诊完成度">
          <DiagnosisRow label="望" active={report.fourDiagnosisCompletion.wang} text="饮食、排便、舌苔" />
          <DiagnosisRow label="闻" active={report.fourDiagnosisCompletion.wen} text="夜间声音、口气反馈" />
          <DiagnosisRow label="问" active={report.fourDiagnosisCompletion.wenAsk} text="画像、醒后感受、饮食记录" />
          <DiagnosisRow label="切" active={report.fourDiagnosisCompletion.qie} text="心率、步数、运动状态" />
        </Panel>
        <Panel title="今日三件事">
          <AdviceLine icon={<Utensils size={16} />} title="怎么吃" text={report.foodAdvice[0] ?? "保持清淡和稳定饮食。"} />
          <AdviceLine icon={<Activity size={16} />} title="怎么动" text={report.recoveryAdvice[0] ?? "维持低强度活动。"} />
          <AdviceLine icon={<Clock3 size={16} />} title="怎么恢复" text={report.riskNotice[0] ?? "今晚提前进入睡眠准备。"} />
        </Panel>
      </section>
    </>
  );
}

function SleepPage({ events }: { events: SleepAudioEvent[] }) {
  const snoreCount = events.filter((event) => event.type === "snore").length;
  const coughCount = events.filter((event) => event.type === "cough").length;
  const markerCount = events.filter((event) => event.type === "wake_marker").length;

  return (
    <>
      <PageTitle
        eyebrow="soundcore Work 夜间声音"
        title="把夜间声音转成第二天能执行的健康建议"
        text="当前使用原型数据展示设备能力，现场可替换为 soundcore Work SDK、上传音频或人工标注事件。"
      />
      <div className="card-grid">
        <MetricCard label="打鼾片段" value={`${snoreCount}`} icon={<Moon size={18} />} />
        <MetricCard label="咳嗽片段" value={`${coughCount}`} icon={<Ear size={18} />} />
        <MetricCard label="重点标记" value={`${markerCount}`} icon={<AlertTriangle size={18} />} />
      </div>
      <section className="section-grid">
        <Panel title="夜间声音时间线">
          <div className="timeline">
            {events.map((event) => (
              <div className="timeline-item" key={event.id}>
                <span>{formatMinute(event.startMinute)}</span>
                <strong>{sleepEventLabels[event.type]}</strong>
                <em>{event.intensity === "high" ? "强" : event.intensity === "medium" ? "中" : "轻"} · {Math.round(event.confidence * 100)}%</em>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="近 7 天趋势">
          <TrendBar label="打鼾" values={[30, 42, 34, 48, 40, 52, 58]} />
          <TrendBar label="夜醒/起夜" values={[18, 22, 20, 28, 24, 34, 38]} />
          <TrendBar label="环境噪声" values={[40, 36, 44, 50, 32, 46, 41]} />
          <p className="subtle">趋势用于演示长期观察思路，不作为医疗诊断。</p>
        </Panel>
      </section>
    </>
  );
}

function DietPage({ diet, profileType }: { diet: DietSignal[]; profileType: ProfileType }) {
  const total = diet.reduce((sum, item) => sum + (item.userAdjustedKcal ?? item.estimatedKcal), 0);
  const kcalTarget = profileType === "weight_loss_female" ? "1500-1700" : profileType === "student" ? "1800-2200" : "1600-2000";

  return (
    <>
      <PageTitle
        eyebrow="饮食记录"
        title="拍照估算只是入口，真正价值是下一餐怎么调整"
        text="Demo 使用模拟识别结果，设计上保留用户修正机制，避免把 kcal 说成绝对精准。"
      />
      <div className="card-grid">
        <MetricCard label="今日建议" value={`${kcalTarget}`} suffix="kcal" icon={<Apple size={18} />} />
        <MetricCard label="已记录" value={`${total}`} suffix="kcal" icon={<Utensils size={18} />} />
        <MetricCard label="记录方式" value="拍照/手动" icon={<Camera size={18} />} />
      </div>
      <section className="section-grid two">
        <Panel title="今日餐食">
          {diet.map((item) => (
            <div className="meal-row" key={item.id}>
              <div>
                <strong>{mealName(item.mealType)} · {item.foodName}</strong>
                <p>{item.estimatedKcal - 80}-{item.estimatedKcal + 80} kcal · 置信度 {Math.round(item.confidence * 100)}%</p>
              </div>
              <span>{portionName(item.portion)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="饮食标签与建议">
          <div className="tag-wrap">
            {diet.flatMap((item) => item.foodTags).map((tag) => (
              <span className="tag" key={tag}>{foodTagLabels[tag]}</span>
            ))}
          </div>
          <p>下一餐减少油脂和精制碳水，优先补充蛋白质、蔬菜和水分。</p>
          <button className="action-button" type="button">
            <Camera size={16} />
            拍照记录一餐
          </button>
        </Panel>
      </section>
    </>
  );
}

function SignalsPage({ signals }: { signals: (typeof mockDailySignals)[ProfileType] }) {
  return (
    <>
      <PageTitle
        eyebrow="身体信号"
        title="排便、舌苔、口气都以主动记录为前提"
        text="这些信号用于趋势观察和生活方式建议，敏感数据默认只保存标签，不保存原始图片。"
      />
      <section className="section-grid three">
        <Panel title="排便记录">
          <SignalValue label="今日状态" value={signals.stool.recorded ? stoolShape(signals.stool.shape) : "未记录"} />
          <SignalValue label="颜色" value={signals.stool.color ? stoolColor(signals.stool.color) : "未记录"} />
          <SignalValue label="趋势" value={signals.stool.dryness === "dry" ? "近几天偏干" : "暂无明显异常"} />
          <button className="action-button" type="button">记录排便</button>
        </Panel>
        <Panel title="舌苔观察">
          <SignalValue label="舌色" value={tongueColor(signals.tongue.tongueColor)} />
          <SignalValue label="舌苔" value={coating(signals.tongue.coatingThickness)} />
          <SignalValue label="照片质量" value={photoQuality(signals.tongue.photoQuality)} />
          <button className="action-button" type="button">拍照记录舌苔</button>
        </Panel>
        <Panel title="口气反馈">
          <SignalValue label="口气等级" value={breathLevel(signals.breath.level)} />
          <SignalValue label="早晨口干" value={signals.breath.dryMouth ? "是" : "否"} />
          <SignalValue label="口苦反馈" value={signals.breath.bitterTaste ? "是" : "否"} />
          <button className="action-button" type="button">记录口气</button>
        </Panel>
      </section>
      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>隐私策略：排便、舌苔、口气均为手动触发；默认保存结构化标签，原始敏感内容不自动上传。</span>
      </section>
    </>
  );
}

function ReportPage({ report, profileType }: { report: ReturnType<typeof buildDailyReport>; profileType: ProfileType }) {
  return (
    <>
      <PageTitle
        eyebrow="每日健康日报"
        title={report.oneSentenceAdvice}
        text={profileNotes[profileType]}
      />
      <section className="report-layout">
        <Panel title="夜间声音摘要">
          {report.nightAudioSummary.map((item) => <p key={item}>{item}</p>)}
        </Panel>
        <Panel title="身体状态提示">
          {(report.bodyStatusHints.length ? report.bodyStatusHints : ["今天以趋势观察为主，保持稳定作息。"]).map((item) => <p key={item}>{item}</p>)}
        </Panel>
        <Panel title="今天怎么吃">
          {report.foodAdvice.map((item) => <p key={item}>{item}</p>)}
        </Panel>
        <Panel title="今天怎么动 / 怎么恢复">
          {report.recoveryAdvice.map((item) => <p key={item}>{item}</p>)}
        </Panel>
        <Panel title="异常趋势提醒">
          {report.riskNotice.map((item) => <p key={item}>{item}</p>)}
        </Panel>
      </section>
    </>
  );
}

function ArchitecturePage() {
  return (
    <>
      <PageTitle
        eyebrow="技术架构"
        title="当前用 soundcore Work 跑通声音健康洞察，未来演进到健康穿戴硬件"
        text="真实设备、模型和 API 都通过 adapter 接入；没有 SDK 时，Demo 仍可用 mock 数据完整演示。"
      />
      <section className="architecture-flow">
        <ArchStep icon={<Ear size={20} />} title="当前原型" text="soundcore Work 采集夜间声音、重点标记和设备状态。" />
        <ArchStep icon={<Home size={20} />} title="App 补充" text="用户画像、饮食、排便、舌苔、口气和醒后感受。" />
        <ArchStep icon={<Database size={20} />} title="知识库与规则" text="睡眠、饮食、排便、舌苔、减脂和恢复建议规则。" />
        <ArchStep icon={<Watch size={20} />} title="未来硬件" text="手表、手环或项链集成声音、图像、体征和端侧识别。" />
      </section>
      <section className="section-grid two">
        <Panel title="当前可演示">
          <p>五类用户画像切换、夜间声音时间线、四诊完成度、每日健康建议、隐私边界和未来演进。</p>
        </Panel>
        <Panel title="现场可增强">
          <p>接入 soundcore Work SDK、上传真实音频、补充 eufy 非隐私视觉事件、接入 API Key 做报告润色。</p>
        </Panel>
      </section>
    </>
  );
}

function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="lead">{text}</p>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function MetricCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon: React.ReactNode }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {suffix && <em>{suffix}</em>}
    </article>
  );
}

function DiagnosisRow({ label, active, text }: { label: string; active: boolean; text: string }) {
  return (
    <div className="diagnosis-row">
      <strong className={active ? "active-dot" : ""}>{label}</strong>
      <span>{text}</span>
      <em>{active ? "已完成" : "待补充"}</em>
    </div>
  );
}

function AdviceLine({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="advice-line">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function TrendBar({ label, values }: { label: string; values: number[] }) {
  return (
    <div className="trend-row">
      <span>{label}</span>
      <div className="bars">
        {values.map((value, index) => (
          <i key={`${label}-${index}`} style={{ height: `${value}px` }} />
        ))}
      </div>
    </div>
  );
}

function SignalValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ArchStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="arch-step">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <ChevronRight size={18} />
    </article>
  );
}

function formatMinute(total: number) {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function mealName(type: DietSignal["mealType"]) {
  return { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" }[type];
}

function portionName(portion: DietSignal["portion"]) {
  return { small: "小份", medium: "中等", large: "大份", unknown: "待确认" }[portion];
}

function stoolShape(shape?: string) {
  return {
    hard_lump: "偏硬颗粒",
    sausage_cracked: "偏干裂",
    normal: "正常",
    soft: "偏软",
    loose: "稀软",
    watery: "水样",
  }[shape ?? ""] ?? "未记录";
}

function stoolColor(color?: string) {
  return {
    brown: "棕色",
    dark: "偏深",
    yellow: "偏黄",
    green: "偏绿",
    red_flag: "异常颜色",
    unknown: "待确认",
  }[color ?? ""] ?? "未记录";
}

function tongueColor(color?: string) {
  return { pale: "偏淡", pink: "淡红", red: "偏红", dark_red: "暗红", unknown: "待确认" }[color ?? ""] ?? "未记录";
}

function coating(value?: string) {
  return { thin: "薄", normal: "正常", thick: "偏厚", none: "少苔", unknown: "待确认" }[value ?? ""] ?? "未记录";
}

function photoQuality(value?: string) {
  return { good: "光线正常", low_light: "光线不足", blurred: "模糊", color_uncertain: "颜色不确定" }[value ?? ""] ?? "未上传";
}

function breathLevel(level: string) {
  return { none: "无", mild: "轻微", obvious: "明显", unknown: "待确认" }[level] ?? "待确认";
}
