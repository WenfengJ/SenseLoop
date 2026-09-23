import {
  Activity,
  AlertTriangle,
  Apple,
  Camera,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Ear,
  FileText,
  HeartPulse,
  Home,
  LockKeyhole,
  Mic,
  Moon,
  Play,
  ShieldCheck,
  Sparkles,
  Utensils,
  Volume2,
  Watch,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { mockProfiles } from "./data/mockProfiles";
import { mockDailySignals } from "./data/mockDailySignals";
import { knowledgeBase } from "./data/knowledgeBase";
import { sleepEventLabels } from "./domain/labels";
import { DailyReport, DailySignals, DietSignal, ProfileType, SleepAudioEvent, UserProfile } from "./domain/types";
import {
  createAgentSession,
  createObservation,
  generateReport,
  getDailySignals,
  getProfiles,
  sendAgentMessage,
  type ObservationPayload,
} from "./services/apiClient";
import { buildDailyReport } from "./services/reportBuilder";

type PageKey = "onboarding" | "today" | "sleep" | "diet" | "signals" | "report" | "architecture";
type ApiMode = "checking" | "api" | "mock";
type ToastState = { kind: "success" | "error" | "info"; message: string };
type SaveObservation = (payload: ObservationPayload) => Promise<void>;
type StoolDraft = {
  shape: NonNullable<DailySignals["stool"]["shape"]>;
  color: NonNullable<DailySignals["stool"]["color"]>;
  dryness: NonNullable<DailySignals["stool"]["dryness"]>;
  frequencyToday: string;
};
type TongueDraft = {
  tongueColor: NonNullable<DailySignals["tongue"]["tongueColor"]>;
  coatingThickness: NonNullable<DailySignals["tongue"]["coatingThickness"]>;
  moisture: NonNullable<DailySignals["tongue"]["moisture"]>;
  photoName: string;
};

const pageNames: Record<PageKey, string> = {
  onboarding: "建档",
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
  const [page, setPage] = useState<PageKey>("onboarding");
  const [profiles, setProfiles] = useState<UserProfile[]>(mockProfiles);
  const [signals, setSignals] = useState<DailySignals>(mockDailySignals.weight_loss_female);
  const [report, setReport] = useState<DailyReport>(() => buildLocalReport(mockProfiles[0], mockDailySignals.weight_loss_female));
  const [apiMode, setApiMode] = useState<ApiMode>("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [agentAnswer, setAgentAnswer] = useState<string>("");

  const profile = useMemo(
    () => profiles.find((item) => item.profileType === profileType) ?? mockProfiles.find((item) => item.profileType === profileType) ?? mockProfiles[0],
    [profileType, profiles],
  );

  useEffect(() => {
    let active = true;
    getProfiles()
      .then((items) => {
        if (!active) return;
        setProfiles(items.length ? items : mockProfiles);
        setApiMode("api");
      })
      .catch(() => {
        if (!active) return;
        setProfiles(mockProfiles);
        setApiMode("mock");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fallbackSignals = mockDailySignals[profile.profileType];
    setIsLoading(true);
    getDailySignals(profile.id)
      .then(async (nextSignals) => {
        if (!active) return;
        setSignals(nextSignals);
        setApiMode("api");
        try {
          const nextReport = await generateReport(profile.id, nextSignals.date);
          if (active) setReport(nextReport);
        } catch {
          if (active) setReport(buildLocalReport(profile, nextSignals));
        }
      })
      .catch(() => {
        if (!active) return;
        setSignals(fallbackSignals);
        setReport(buildLocalReport(profile, fallbackSignals));
        setApiMode((current) => (current === "api" ? "api" : "mock"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile.id, profile.profileType]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function saveObservation(payload: ObservationPayload) {
    try {
      await createObservation(profile.id, signals.date, payload);
      setApiMode("api");
      setToast({ kind: "success", message: "已保存到后端观察记录" });
    } catch {
      setToast({ kind: "error", message: "后端暂不可用，已保留在页面演示状态" });
      setApiMode((current) => (current === "api" ? "api" : "mock"));
    }
  }

  async function handleGenerateReport() {
    setIsLoading(true);
    try {
      const nextReport = await generateReport(profile.id, signals.date);
      setReport(nextReport);
      setApiMode("api");
      setToast({ kind: "success", message: "已调用后端生成健康日报" });
    } catch {
      setReport(buildLocalReport(profile, signals));
      setToast({ kind: "info", message: "后端生成失败，已使用本地规则生成报告" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAskAgent() {
    setAgentAnswer("正在整理数据库里的日报、观察记录和知识库...");
    try {
      const session = await createAgentSession(profile.id);
      const answer = await sendAgentMessage(session.id, `请解释 ${profile.name} 在 ${signals.date} 的健康日报，并指出下一步应该补充哪些记录。`);
      setAgentAnswer(answer.assistantMessage);
      setApiMode("api");
    } catch {
      setAgentAnswer("当前后端 Agent 接口不可用。前端入口已经预留，后续接入 RAG/AI 后这里会展示基于知识库的解释。");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">anker-SenseLoop</p>
          <h1>观息 SenseLoop</h1>
        </div>
        <div className="top-actions">
          <span className={`api-badge ${apiMode}`}>
            {apiMode === "checking" ? "连接中" : apiMode === "api" ? "后端已连接" : "演示数据"}
          </span>
          <button className="ghost-button" type="button" onClick={() => setPage("architecture")}>
            <Database size={16} />
            架构
          </button>
        </div>
      </header>

      <section className="profile-strip" aria-label="用户画像切换">
        {profiles.map((item) => (
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
        {isLoading && <div className="inline-status">正在同步后端数据...</div>}
        {page === "onboarding" && (
          <OnboardingPage
            profile={profile}
            profileType={profile.profileType}
            onGenerateReport={handleGenerateReport}
            onSaveObservation={saveObservation}
          />
        )}
        {page === "today" && <TodayPage report={report} signals={signals} profileType={profile.profileType} />}
        {page === "sleep" && <SleepPage events={signals.audioEvents} />}
        {page === "diet" && <DietPage diet={signals.diet} profileType={profile.profileType} onSaveObservation={saveObservation} />}
        {page === "signals" && <SignalsPage signals={signals} onSaveObservation={saveObservation} />}
        {page === "report" && (
          <ReportPage
            agentAnswer={agentAnswer}
            onAskAgent={handleAskAgent}
            profileType={profile.profileType}
            report={report}
          />
        )}
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
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
}

function buildLocalReport(profile: UserProfile, signals: DailySignals) {
  return buildDailyReport({ profile, signals, rules: knowledgeBase });
}

const intakeChoiceGroups = [
  {
    key: "age",
    label: "年龄",
    options: ["25-34 岁", "35-44 岁", "45-55 岁"],
  },
  {
    key: "goal",
    label: "当前目标",
    options: ["减脂塑形", "睡醒不累", "肠胃稳定"],
  },
  {
    key: "job",
    label: "生活方式",
    options: ["久坐上班", "频繁出差", "备考学习"],
  },
  {
    key: "morning",
    label: "今早感受",
    options: ["疲惫", "口干", "精神还行"],
  },
] as const;

const photoSamples = [
  { id: "meal", label: "早餐照片", status: "已识别", result: "蛋白偏少，精制碳水偏多", icon: <Apple size={16} /> },
  { id: "tongue", label: "舌苔照片", status: "待确认", result: "照片光线一般，建议重新拍摄", icon: <Camera size={16} /> },
  { id: "stool", label: "排便记录", status: "已记录", result: "偏干，建议结合饮水观察", icon: <ClipboardList size={16} /> },
];

const audioSamples = [
  { id: "snore", label: "打鼾片段", time: "02:18", value: "4 段", active: true },
  { id: "cough", label: "咳嗽片段", time: "04:36", value: "2 段", active: true },
  { id: "noise", label: "环境噪声", time: "05:12", value: "1 段", active: false },
];

type IntakeChoiceKey = (typeof intakeChoiceGroups)[number]["key"];
type IntakeTab = "ask" | "look" | "listen" | "touch";

function OnboardingPage({
  profile,
  profileType,
  onGenerateReport,
  onSaveObservation,
}: {
  profile: UserProfile;
  profileType: ProfileType;
  onGenerateReport: () => Promise<void>;
  onSaveObservation: SaveObservation;
}) {
  const [choices, setChoices] = useState<Record<IntakeChoiceKey, string>>({
    age: "25-34 岁",
    goal: "减脂塑形",
    job: "久坐上班",
    morning: "疲惫",
  });
  const [draftProfile, setDraftProfile] = useState({
    name: profile.name,
    age: String(profile.age),
    gender: profile.gender,
    occupation: profile.occupation,
    focus: "睡眠恢复、饮食稳定、晨间精神",
  });
  const [activeTab, setActiveTab] = useState<IntakeTab>("ask");
  const [selectedPhotos, setSelectedPhotos] = useState(["meal", "stool"]);
  const [selectedAudio, setSelectedAudio] = useState(["snore", "cough"]);
  const [reportReady, setReportReady] = useState(false);

  useEffect(() => {
    setDraftProfile({
      name: profile.name,
      age: String(profile.age),
      gender: profile.gender,
      occupation: profile.occupation,
      focus: "睡眠恢复、饮食稳定、晨间精神",
    });
  }, [profile.age, profile.gender, profile.name, profile.occupation]);

  const completion = Math.min(
    100,
    40 + selectedPhotos.length * 12 + selectedAudio.length * 10 + (reportReady ? 12 : 0),
  );
  const hasDryMouth = choices.morning === "口干";
  const goalAdvice =
    choices.goal === "减脂塑形"
      ? "今天饮食先控油控糖，早餐补蛋白，训练只做低强度恢复。"
      : choices.goal === "睡醒不累"
        ? "今天优先降低疲劳负荷，午后减少咖啡因，晚上提前进入睡眠准备。"
        : "今天记录饮水、排便和辛辣摄入，下一餐更清淡稳定。";
  const profileSummary = `${choices.age} · ${choices.job} · ${choices.goal} · 今早${choices.morning}`;
  const tabContent = {
    ask: {
      title: "问：先把用户画像问清楚",
      text: "年龄、目标、职业和晨间感受会直接影响日报建议的优先级。",
      action: "继续补充问卷",
    },
    look: {
      title: "望：用照片补充身体信号",
      text: "饮食、舌苔和排便只沉淀结构化标签，用户可以手动修正。",
      action: "模拟拍照识别",
    },
    listen: {
      title: "闻：把夜间录音转成事件",
      text: "打鼾、咳嗽、起夜和环境噪声会进入晨间报告，而不是只停留在回放。",
      action: "模拟录音分析",
    },
    touch: {
      title: "切：为未来穿戴硬件预留",
      text: "当前 MVP 先展示接口位；未来由 Watch / Band / Pendant 补充心率、血氧和运动体征。",
      action: "查看硬件接口",
    },
  }[activeTab];

  function togglePhoto(id: string) {
    setSelectedPhotos((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleAudio(id: string) {
    setSelectedAudio((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  async function saveDraftProfile() {
    await onSaveObservation({
      signalType: "profile_intake",
      source: "manual",
      privacyLevel: "normal",
      confidence: 1,
      valueJson: {
        draftProfile,
        choices,
        selectedPhotos,
        selectedAudio,
        savedAt: new Date().toISOString(),
      },
    });
  }

  async function generateReportFromBackend() {
    setReportReady(true);
    await onGenerateReport();
  }

  return (
    <>
      <section className="intake-workspace">
        <div className="intake-phone">
          <div className="phone-status">
            <span>9:41</span>
            <strong>SenseLoop 建档</strong>
            <span>{completion}%</span>
          </div>
          <div className="phone-card hero">
            <p className="eyebrow">AI 健康助手</p>
            <h2>先建档，再生成第一份健康日报</h2>
            <p>录音 + 拍照 + 基础信息，组成 SenseLoop 的望闻问切数据源。</p>
            <div className="health-ring" style={{ "--score": `${completion * 3.6}deg` } as React.CSSProperties}>
              <strong>{completion}</strong>
              <span>完成度</span>
            </div>
          </div>

          <div className="phone-grid">
            <button className="mini-tile active" type="button" onClick={() => setActiveTab("ask")}>
              <ClipboardList size={18} />
              <span>问</span>
            </button>
            <button className={selectedPhotos.length ? "mini-tile active" : "mini-tile"} type="button" onClick={() => setActiveTab("look")}>
              <Camera size={18} />
              <span>望</span>
            </button>
            <button className={selectedAudio.length ? "mini-tile active" : "mini-tile"} type="button" onClick={() => setActiveTab("listen")}>
              <Mic size={18} />
              <span>闻</span>
            </button>
            <button className="mini-tile muted" type="button" onClick={() => setActiveTab("touch")}>
              <HeartPulse size={18} />
              <span>切</span>
            </button>
          </div>

          <div className="phone-card report">
            <span>健康日报预览</span>
            <strong>{reportReady ? "报告已生成" : "等待生成"}</strong>
            <p>{goalAdvice}</p>
            <button className="action-button" type="button" onClick={generateReportFromBackend}>
              <FileText size={16} />
              {reportReady ? "重新生成报告" : "生成健康报告"}
            </button>
          </div>
        </div>

        <div className="intake-console">
          <div className="console-head">
            <div>
              <p className="eyebrow">可交互建档 MVP</p>
              <h2>把参考图里的注册流程，改成 SenseLoop 的望闻问切建档页</h2>
              <p>
                基础信息、照片入口、声音事件和报告生成都已经具备可点击闭环；当前建档草稿先写入观察记录，后续补 profile 创建接口即可升级成真实新建档案。
              </p>
            </div>
            <button className="ghost-button compact" type="button" onClick={() => setReportReady(false)}>
              重置报告
            </button>
          </div>

          <section className="intake-panel">
            <div className="panel-toolbar">
              <strong>新建档案草稿</strong>
              <span>保存到后端 observation</span>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>昵称</span>
                <input
                  value={draftProfile.name}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如 小林"
                />
              </label>
              <label className="form-field">
                <span>年龄</span>
                <input
                  min="1"
                  type="number"
                  value={draftProfile.age}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, age: event.target.value }))}
                />
              </label>
              <label className="form-field">
                <span>性别</span>
                <select
                  value={draftProfile.gender}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, gender: event.target.value as UserProfile["gender"] }))}
                >
                  <option value="female">女性</option>
                  <option value="male">男性</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="form-field">
                <span>职业/生活方式</span>
                <input
                  value={draftProfile.occupation}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, occupation: event.target.value }))}
                  placeholder="久坐上班 / 备考学习"
                />
              </label>
              <label className="form-field wide">
                <span>当前关注</span>
                <textarea
                  rows={3}
                  value={draftProfile.focus}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, focus: event.target.value }))}
                />
              </label>
            </div>
            <button className="action-button" type="button" onClick={saveDraftProfile}>
              <CheckCircle2 size={16} />
              保存建档草稿
            </button>
          </section>

          <section className="intake-panel">
            <div className="panel-toolbar">
              <strong>基础信息</strong>
              <span>{profileSummary}</span>
            </div>
            <div className="choice-board">
              {intakeChoiceGroups.map((group) => (
                <div className="choice-group" key={group.key}>
                  <span>{group.label}</span>
                  <div>
                    {group.options.map((option) => (
                      <button
                        className={choices[group.key] === option ? "choice-chip selected" : "choice-chip"}
                        key={option}
                        type="button"
                        onClick={() => setChoices((current) => ({ ...current, [group.key]: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="intake-panel split">
            <div>
              <div className="panel-toolbar">
                <strong>照片数据源</strong>
                <span>{selectedPhotos.length}/3 已选择</span>
              </div>
              <div className="source-list">
                {photoSamples.map((item) => (
                  <button
                    className={selectedPhotos.includes(item.id) ? "source-row selected" : "source-row"}
                    key={item.id}
                    type="button"
                    onClick={() => togglePhoto(item.id)}
                  >
                    <i>{item.icon}</i>
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.result}</em>
                    </span>
                    <b>{item.status}</b>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="panel-toolbar">
                <strong>录音数据源</strong>
                <span>{selectedAudio.length}/3 已选择</span>
              </div>
              <div className="source-list">
                {audioSamples.map((item) => (
                  <button
                    className={selectedAudio.includes(item.id) ? "source-row selected" : "source-row"}
                    key={item.id}
                    type="button"
                    onClick={() => toggleAudio(item.id)}
                  >
                    <i><Volume2 size={16} /></i>
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.time} · {item.value}</em>
                    </span>
                    <b>{selectedAudio.includes(item.id) ? "入报告" : "忽略"}</b>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="diagnosis-tabs" aria-label="望闻问切模块">
        {[
          { key: "ask", label: "问", icon: <ClipboardList size={16} /> },
          { key: "look", label: "望", icon: <Camera size={16} /> },
          { key: "listen", label: "闻", icon: <Mic size={16} /> },
          { key: "touch", label: "切", icon: <HeartPulse size={16} /> },
        ].map((item) => (
          <button
            className={activeTab === item.key ? "tab-card active" : "tab-card"}
            key={item.key}
            type="button"
            onClick={() => setActiveTab(item.key as IntakeTab)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </section>

      <section className="section-grid two">
        <Panel title={tabContent.title}>
          <p>{tabContent.text}</p>
          <button className="action-button" type="button" onClick={generateReportFromBackend}>
            {tabContent.action}
          </button>
        </Panel>
        <Panel title="生成报告亮点">
          <div className="report-preview">
            <div>
              <span>当前画像</span>
              <strong>{profileNotes[profileType]}</strong>
            </div>
            <p>{goalAdvice}</p>
            <ul>
              <li>{hasDryMouth ? "今早口干：建议补水，并观察夜间打鼾和晨间疲惫是否连续出现。" : "今早疲惫：今天优先恢复，不把训练强度拉满。"}</li>
              <li>{selectedPhotos.length ? "照片信号已进入报告，用标签辅助饮食和身体状态建议。" : "照片信号未选择，报告会提示用户补充记录。"}</li>
              <li>{selectedAudio.length ? "夜间录音已进入报告，能解释为什么今天这样安排。" : "录音未纳入时，只根据问答和照片生成轻量建议。"}</li>
            </ul>
          </div>
        </Panel>
      </section>

      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>当前 MVP 亮点：用户可以完成基础问答、选择照片信号、选择录音事件，并即时生成健康日报。边界仍然清楚：只做趋势观察和生活方式建议，不做诊断。</span>
      </section>
    </>
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
  const [sleepView, setSleepView] = useState<"stats" | "clips">("stats");
  const snoreCount = events.filter((event) => event.type === "snore").length;
  const coughCount = events.filter((event) => event.type === "cough").length;
  const markerCount = events.filter((event) => event.type === "wake_marker").length;
  const totalRecordedSec = events.reduce((sum, event) => sum + event.durationSec, 0);
  const averageConfidence = events.length
    ? Math.round((events.reduce((sum, event) => sum + event.confidence, 0) / events.length) * 100)
    : 0;
  const loudEvents = events.filter((event) => event.intensity === "high").length;
  const snoreDuration = events
    .filter((event) => event.type === "snore")
    .reduce((sum, event) => sum + event.durationSec, 0);

  return (
    <>
      <PageTitle
        eyebrow="soundcore Work 夜间声音"
        title="先把昨晚听清楚，再把今天安排明白"
        text="借鉴睡眠录音 App 的细颗粒回看方式：整夜噪声、事件分类、录音片段和来源标签都清楚展示，再进入 SenseLoop 的晨间建议。"
      />
      <div className="card-grid">
        <MetricCard label="声音片段" value={`${events.length}`} suffix={`共 ${formatDuration(totalRecordedSec)}`} icon={<Volume2 size={18} />} />
        <MetricCard label="打鼾" value={`${snoreCount}`} suffix={formatDuration(snoreDuration)} icon={<Moon size={18} />} />
        <MetricCard label="识别置信度" value={`${averageConfidence}%`} icon={<Ear size={18} />} />
      </div>
      <section className="sleep-dashboard">
        <Panel title="整夜声音地图">
          <div className="sleep-session-head">
            <div>
              <span>23:18 - 06:52</span>
              <strong>7h 34m 睡眠观察窗口</strong>
            </div>
            <em>{loudEvents > 0 ? `${loudEvents} 个高强度片段` : "未见高强度片段"}</em>
          </div>
          <NoiseMap events={events} />
          <div className="event-legend">
            <span><i className="legend-dot snore" />打鼾</span>
            <span><i className="legend-dot cough" />咳嗽</span>
            <span><i className="legend-dot wake" />起夜/标记</span>
            <span><i className="legend-dot noise" />环境噪声</span>
          </div>
        </Panel>
        <Panel title="声音事件统计">
          <div className="sleep-stat-grid">
            <SleepStat label="打鼾" value={`${snoreCount} 段`} detail={formatDuration(snoreDuration)} />
            <SleepStat label="咳嗽" value={`${coughCount} 段`} detail="建议结合白天状态观察" />
            <SleepStat label="重点标记" value={`${markerCount} 次`} detail="可进入日报依据" />
            <SleepStat label="本地标签" value="优先" detail="默认保存结构化摘要" />
          </div>
          <div className="sleep-tabs" aria-label="声音详情切换">
            <button className={sleepView === "stats" ? "active" : ""} type="button" onClick={() => setSleepView("stats")}>统计</button>
            <button className={sleepView === "clips" ? "active" : ""} type="button" onClick={() => setSleepView("clips")}>录音片段</button>
          </div>
          <p className="subtle">
            {sleepView === "stats"
              ? "当前为统计视图；接入 SDK 或上传音频后，这里会展示真实来源和识别置信度。"
              : `当前共有 ${events.length} 个录音片段，可在下方列表回看。`}
          </p>
        </Panel>
      </section>
      <section className="section-grid">
        <Panel title="录音片段回看">
          <div className="recording-list">
            {events.map((event, index) => (
              <RecordingRow event={event} index={index} key={event.id} />
            ))}
          </div>
        </Panel>
        <Panel title="近 7 天趋势">
          <TrendBar label="打鼾" values={[30, 42, 34, 48, 40, 52, 58]} />
          <TrendBar label="夜醒/起夜" values={[18, 22, 20, 28, 24, 34, 38]} />
          <TrendBar label="环境噪声" values={[40, 36, 44, 50, 32, 46, 41]} />
          <section className="privacy-mini">
            <LockKeyhole size={16} />
            <span>原始音频优先本地处理；日报默认使用事件标签、时长、强度和趋势摘要。</span>
          </section>
        </Panel>
      </section>
    </>
  );
}

function DietPage({
  diet,
  profileType,
  onSaveObservation,
}: {
  diet: DietSignal[];
  profileType: ProfileType;
  onSaveObservation: SaveObservation;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string; size: number; type: string } | null>(null);
  const [mealDraft, setMealDraft] = useState({ mealType: "lunch", foodName: "待确认餐食", estimatedKcal: "520" });
  const total = diet.reduce((sum, item) => sum + (item.userAdjustedKcal ?? item.estimatedKcal), 0);
  const kcalTarget = profileType === "weight_loss_female" ? "1500-1700" : profileType === "student" ? "1800-2200" : "1600-2000";

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({
      name: file.name,
      url: URL.createObjectURL(file),
      size: file.size,
      type: file.type,
    });
  }

  async function saveMealPhoto() {
    await onSaveObservation({
      signalType: "diet_photo",
      source: "photo_upload",
      privacyLevel: "sensitive",
      confidence: 0.72,
      valueJson: {
        fileName: preview?.name,
        mimeType: preview?.type,
        fileSize: preview?.size,
        mealType: mealDraft.mealType,
        foodName: mealDraft.foodName,
        estimatedKcal: Number(mealDraft.estimatedKcal) || 0,
        note: "MVP 阶段只保存图片元信息和用户修正标签，图片文件存储后续接入对象存储。",
      },
    });
  }

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
          <input
            accept="image/*"
            className="visually-hidden"
            onChange={handleFileSelected}
            ref={fileInputRef}
            type="file"
          />
          <button className="action-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Camera size={16} />
            拍照记录一餐
          </button>
          {preview && (
            <div className="upload-preview">
              <img alt="餐食预览" src={preview.url} />
              <div className="form-grid compact">
                <label className="form-field">
                  <span>餐次</span>
                  <select
                    value={mealDraft.mealType}
                    onChange={(event) => setMealDraft((current) => ({ ...current, mealType: event.target.value }))}
                  >
                    <option value="breakfast">早餐</option>
                    <option value="lunch">午餐</option>
                    <option value="dinner">晚餐</option>
                    <option value="snack">加餐</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>识别/修正</span>
                  <input
                    value={mealDraft.foodName}
                    onChange={(event) => setMealDraft((current) => ({ ...current, foodName: event.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>估算 kcal</span>
                  <input
                    min="0"
                    type="number"
                    value={mealDraft.estimatedKcal}
                    onChange={(event) => setMealDraft((current) => ({ ...current, estimatedKcal: event.target.value }))}
                  />
                </label>
              </div>
              <button className="ghost-button compact" type="button" onClick={saveMealPhoto}>
                <CheckCircle2 size={15} />
                保存餐食记录
              </button>
            </div>
          )}
        </Panel>
      </section>
    </>
  );
}

function SignalsPage({
  signals,
  onSaveObservation,
}: {
  signals: DailySignals;
  onSaveObservation: SaveObservation;
}) {
  const tongueFileRef = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<"stool" | "tongue" | "breath" | null>(null);
  const [stoolDraft, setStoolDraft] = useState<StoolDraft>({
    shape: signals.stool.shape ?? "normal",
    color: signals.stool.color ?? "brown",
    dryness: signals.stool.dryness ?? "normal",
    frequencyToday: String(signals.stool.frequencyToday ?? 1),
  });
  const [tongueDraft, setTongueDraft] = useState<TongueDraft>({
    tongueColor: signals.tongue.tongueColor ?? "pink",
    coatingThickness: signals.tongue.coatingThickness ?? "normal",
    moisture: signals.tongue.moisture ?? "normal",
    photoName: "",
  });
  const [breathDraft, setBreathDraft] = useState({
    level: signals.breath.level,
    dryMouth: signals.breath.dryMouth,
    bitterTaste: signals.breath.bitterTaste,
  });

  async function saveSignal(type: "stool" | "tongue" | "breath") {
    const valueJson =
      type === "stool"
        ? { recorded: true, ...stoolDraft, frequencyToday: Number(stoolDraft.frequencyToday) || 1 }
        : type === "tongue"
          ? { recorded: true, ...tongueDraft, source: tongueDraft.photoName ? "photo_upload" : "manual" }
          : breathDraft;
    await onSaveObservation({
      signalType: type,
      source: type === "tongue" && tongueDraft.photoName ? "photo_upload" : "manual",
      privacyLevel: type === "tongue" ? "sensitive" : "normal",
      confidence: type === "tongue" && tongueDraft.photoName ? 0.68 : 1,
      valueJson,
    });
    setModal(null);
  }

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
          <button className="action-button" type="button" onClick={() => setModal("stool")}>记录排便</button>
        </Panel>
        <Panel title="舌苔观察">
          <SignalValue label="舌色" value={tongueColor(signals.tongue.tongueColor)} />
          <SignalValue label="舌苔" value={coating(signals.tongue.coatingThickness)} />
          <SignalValue label="照片质量" value={photoQuality(signals.tongue.photoQuality)} />
          <button className="action-button" type="button" onClick={() => setModal("tongue")}>拍照记录舌苔</button>
        </Panel>
        <Panel title="口气反馈">
          <SignalValue label="口气等级" value={breathLevel(signals.breath.level)} />
          <SignalValue label="早晨口干" value={signals.breath.dryMouth ? "是" : "否"} />
          <SignalValue label="口苦反馈" value={signals.breath.bitterTaste ? "是" : "否"} />
          <button className="action-button" type="button" onClick={() => setModal("breath")}>记录口气</button>
        </Panel>
      </section>
      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>隐私策略：排便、舌苔、口气均为手动触发；默认保存结构化标签，原始敏感内容不自动上传。</span>
      </section>
      <Modal onClose={() => setModal(null)} open={modal === "stool"} title="记录排便">
        <div className="form-grid">
          <label className="form-field">
            <span>形态</span>
            <select value={stoolDraft.shape} onChange={(event) => setStoolDraft((current) => ({ ...current, shape: event.target.value as StoolDraft["shape"] }))}>
              <option value="hard_lump">偏硬颗粒</option>
              <option value="sausage_cracked">偏干裂</option>
              <option value="normal">正常</option>
              <option value="soft">偏软</option>
              <option value="loose">稀软</option>
              <option value="watery">水样</option>
            </select>
          </label>
          <label className="form-field">
            <span>颜色</span>
            <select value={stoolDraft.color} onChange={(event) => setStoolDraft((current) => ({ ...current, color: event.target.value as StoolDraft["color"] }))}>
              <option value="brown">棕色</option>
              <option value="dark">偏深</option>
              <option value="yellow">偏黄</option>
              <option value="green">偏绿</option>
              <option value="unknown">待确认</option>
            </select>
          </label>
          <label className="form-field">
            <span>干湿</span>
            <select value={stoolDraft.dryness} onChange={(event) => setStoolDraft((current) => ({ ...current, dryness: event.target.value as StoolDraft["dryness"] }))}>
              <option value="dry">偏干</option>
              <option value="normal">正常</option>
              <option value="wet">偏湿</option>
            </select>
          </label>
          <label className="form-field">
            <span>今日次数</span>
            <input min="0" type="number" value={stoolDraft.frequencyToday} onChange={(event) => setStoolDraft((current) => ({ ...current, frequencyToday: event.target.value }))} />
          </label>
        </div>
        <button className="action-button" type="button" onClick={() => saveSignal("stool")}>保存排便记录</button>
      </Modal>
      <Modal onClose={() => setModal(null)} open={modal === "tongue"} title="记录舌苔">
        <input
          accept="image/*"
          className="visually-hidden"
          onChange={(event) => setTongueDraft((current) => ({ ...current, photoName: event.target.files?.[0]?.name ?? "" }))}
          ref={tongueFileRef}
          type="file"
        />
        <button className="ghost-button compact" type="button" onClick={() => tongueFileRef.current?.click()}>
          <Camera size={15} />
          选择舌苔照片
        </button>
        {tongueDraft.photoName && <p className="subtle">已选择：{tongueDraft.photoName}</p>}
        <div className="form-grid">
          <label className="form-field">
            <span>舌色</span>
            <select value={tongueDraft.tongueColor} onChange={(event) => setTongueDraft((current) => ({ ...current, tongueColor: event.target.value as TongueDraft["tongueColor"] }))}>
              <option value="pale">偏淡</option>
              <option value="pink">淡红</option>
              <option value="red">偏红</option>
              <option value="dark_red">暗红</option>
              <option value="unknown">待确认</option>
            </select>
          </label>
          <label className="form-field">
            <span>舌苔</span>
            <select value={tongueDraft.coatingThickness} onChange={(event) => setTongueDraft((current) => ({ ...current, coatingThickness: event.target.value as TongueDraft["coatingThickness"] }))}>
              <option value="thin">薄</option>
              <option value="normal">正常</option>
              <option value="thick">偏厚</option>
              <option value="none">少苔</option>
              <option value="unknown">待确认</option>
            </select>
          </label>
          <label className="form-field">
            <span>湿润度</span>
            <select value={tongueDraft.moisture} onChange={(event) => setTongueDraft((current) => ({ ...current, moisture: event.target.value as TongueDraft["moisture"] }))}>
              <option value="dry">偏干</option>
              <option value="normal">正常</option>
              <option value="wet">偏湿</option>
            </select>
          </label>
        </div>
        <button className="action-button" type="button" onClick={() => saveSignal("tongue")}>保存舌苔记录</button>
      </Modal>
      <Modal onClose={() => setModal(null)} open={modal === "breath"} title="记录口气">
        <div className="form-grid">
          <label className="form-field">
            <span>口气等级</span>
            <select value={breathDraft.level} onChange={(event) => setBreathDraft((current) => ({ ...current, level: event.target.value as typeof breathDraft.level }))}>
              <option value="none">无</option>
              <option value="mild">轻微</option>
              <option value="obvious">明显</option>
              <option value="unknown">待确认</option>
            </select>
          </label>
          <label className="toggle-field">
            <input checked={breathDraft.dryMouth} type="checkbox" onChange={(event) => setBreathDraft((current) => ({ ...current, dryMouth: event.target.checked }))} />
            <span>早晨口干</span>
          </label>
          <label className="toggle-field">
            <input checked={breathDraft.bitterTaste} type="checkbox" onChange={(event) => setBreathDraft((current) => ({ ...current, bitterTaste: event.target.checked }))} />
            <span>口苦反馈</span>
          </label>
        </div>
        <button className="action-button" type="button" onClick={() => saveSignal("breath")}>保存口气记录</button>
      </Modal>
    </>
  );
}

function ReportPage({
  agentAnswer,
  onAskAgent,
  report,
  profileType,
}: {
  agentAnswer: string;
  onAskAgent: () => Promise<void>;
  report: DailyReport;
  profileType: ProfileType;
}) {
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
        <Panel title="AI Agent 解释入口">
          <p>这里预留给 RAG/Agent：读取日报、观察记录和知识库后，解释为什么给出这些建议。</p>
          <button className="action-button" type="button" onClick={onAskAgent}>
            <Sparkles size={16} />
            解释这份日报
          </button>
          {agentAnswer && <p className="agent-answer">{agentAnswer}</p>}
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

function Modal({
  children,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="modal-card"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button aria-label="关闭弹窗" className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const icon = toast.kind === "success" ? <CheckCircle2 size={17} /> : toast.kind === "error" ? <AlertTriangle size={17} /> : <Sparkles size={17} />;
  return (
    <button className={`toast ${toast.kind}`} type="button" onClick={onClose}>
      {icon}
      <span>{toast.message}</span>
    </button>
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
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values);
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const latest = values[values.length - 1] ?? 0;
  const previous = values[values.length - 2] ?? latest;
  const trend = latest > previous ? "较昨晚增加" : latest < previous ? "较昨晚下降" : "与昨晚持平";
  const range = Math.max(1, maxValue - minValue);
  const points = values.map((value, index) => {
    const x = 12 + index * (256 / Math.max(1, values.length - 1));
    const y = 74 - ((value - minValue) / range) * 50;
    return { x, y, value };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `12,82 ${linePoints} 268,82`;
  const averageY = 74 - ((average - minValue) / range) * 50;

  return (
    <div className="trend-row">
      <div className="trend-head">
        <span>{label}</span>
        <em>{trend}</em>
      </div>
      <div className="sparkline-card">
        <svg className="sparkline" viewBox="0 0 280 92" role="img" aria-label={`${label} 7 天趋势`}>
          <polygon points={areaPoints} />
          <line className="average-line" x1="12" x2="268" y1={averageY} y2={averageY} />
          <polyline points={linePoints} />
          {points.map((point, index) => (
            <circle
              className={index === points.length - 1 ? "current-dot" : ""}
              cx={point.x}
              cy={point.y}
              key={`${label}-point-${index}`}
              r={index === points.length - 1 ? 4.6 : 3.3}
            />
          ))}
        </svg>
        <div className="sparkline-labels">
          {["一", "二", "三", "四", "五", "六", "今"].map((day) => (
            <small key={`${label}-${day}`}>{day}</small>
          ))}
        </div>
      </div>
      <div className="trend-foot">
        <span>均值 {average}</span>
        <strong>今日 {latest}</strong>
      </div>
    </div>
  );
}

function NoiseMap({ events }: { events: SleepAudioEvent[] }) {
  const values = [18, 24, 20, 32, 42, 28, 36, 66, 24, 22, 38, 45, 26, 30, 54, 34, 28, 40, 62, 35, 28, 44, 31, 22];

  return (
    <div className="noise-map">
      <div className="noise-bars">
        {values.map((value, index) => (
          <i key={`noise-${index}`} style={{ height: `${value}%` }} />
        ))}
      </div>
      <div className="noise-markers">
        {events.map((event) => (
          <span
            className={`event-marker ${eventMarkerClass(event.type)}`}
            key={event.id}
            style={{ left: `${Math.min(96, Math.max(2, (event.startMinute / 480) * 100))}%` }}
            title={`${formatMinute(event.startMinute)} ${sleepEventLabels[event.type]}`}
          />
        ))}
      </div>
      <div className="noise-axis">
        <span>23:00</span>
        <span>01:00</span>
        <span>03:00</span>
        <span>05:00</span>
        <span>07:00</span>
      </div>
    </div>
  );
}

function SleepStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="sleep-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function RecordingRow({ event, index }: { event: SleepAudioEvent; index: number }) {
  const db = event.intensity === "high" ? 58 : event.intensity === "medium" ? 46 : 37;
  const waveform = [18, 34, 22, 46, 30, 56, 26, 42, 20, 35, 28, 48];

  return (
    <div className="recording-row">
      <button className="play-button" type="button" aria-label={`播放 ${sleepEventLabels[event.type]}`}>
        <Play size={15} fill="currentColor" />
      </button>
      <div className="recording-main">
        <div className="recording-title">
          <strong>{String(index + 1).padStart(2, "0")} · {sleepEventLabels[event.type]}</strong>
          <span>{formatMinute(event.startMinute)} · {formatDuration(event.durationSec)} · {db}dB</span>
        </div>
        <div className="waveform" aria-hidden="true">
          {waveform.map((value, waveIndex) => (
            <i key={`${event.id}-${waveIndex}`} style={{ height: `${Math.max(10, value * event.confidence)}%` }} />
          ))}
        </div>
      </div>
      <em className="source-pill">{sourceLabel(event.source)}</em>
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

function formatDuration(totalSec: number) {
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const minute = Math.floor(totalSec / 60);
  const second = totalSec % 60;
  return second ? `${minute}m ${second}s` : `${minute}m`;
}

function eventMarkerClass(type: SleepAudioEvent["type"]) {
  if (type === "snore") return "snore";
  if (type === "cough") return "cough";
  if (type === "get_up" || type === "wake_marker") return "wake";
  if (type === "ambient_noise") return "noise";
  return "other";
}

function sourceLabel(source: SleepAudioEvent["source"]) {
  return {
    mock: "demo",
    manual: "manual",
    soundcore_sdk: "soundcore",
    audio_model: "model",
  }[source];
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
