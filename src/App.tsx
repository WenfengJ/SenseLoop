import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowLeft,
  CalendarDays,
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
  UserPlus,
  Users,
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
  analyzeTongue,
  createAgentSession,
  createObservation,
  generateReport,
  getDailySignals,
  getProfiles,
  sendAgentMessage,
  type ObservationPayload,
} from "./services/apiClient";
import { buildDailyReport } from "./services/reportBuilder";

type PageKey = "onboarding" | "profiles" | "today" | "sleep" | "diet" | "signals" | "report" | "architecture";
type ApiMode = "checking" | "api" | "mock";
type ToastState = { kind: "success" | "error" | "info"; message: string };
type SaveObservation = (payload: ObservationPayload) => Promise<void>;
type AnalyzeTongue = (input: { date: string; tongue: TongueDraft; upload: TongueUpload | null }) => Promise<string>;
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
type TongueUpload = { name: string; url: string; size: number; type: string };

const pageNames: Record<PageKey, string> = {
  onboarding: "建档",
  profiles: "档案",
  today: "今日",
  sleep: "睡眠",
  diet: "饮食",
  signals: "四诊",
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
      setAgentAnswer(answer.assistantMessage || answer.answer || "");
      setApiMode("api");
    } catch {
      setAgentAnswer("当前后端 Agent 接口不可用。前端入口已经预留，后续接入 RAG/AI 后这里会展示基于知识库的解释。");
    }
  }

  async function handleAnalyzeTongue(input: { date: string; tongue: TongueDraft; upload: TongueUpload | null }) {
    const result = await analyzeTongue(profile.id, {
      date: input.date,
      tongue: {
        recorded: true,
        tongueColor: input.tongue.tongueColor,
        coatingThickness: input.tongue.coatingThickness,
        moisture: input.tongue.moisture,
        photoName: input.tongue.photoName,
      },
      upload: input.upload ? { name: input.upload.name, size: input.upload.size, type: input.upload.type } : null,
    });
    setApiMode("api");
    setToast({
      kind: result.aiEnabled ? "success" : "info",
      message: result.aiEnabled ? "已调用模型完成舌诊分析并落库" : "模型暂不可用，已用后端规则生成舌诊分析并落库",
    });
    return result.analysis;
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
            onOpenProfiles={() => setPage("profiles")}
            onSaveObservation={saveObservation}
          />
        )}
        {page === "profiles" && (
          <ProfileArchivePage
            activeProfile={profile}
            onBack={() => setPage("onboarding")}
            onSelectProfile={(nextProfileType) => {
              setProfileType(nextProfileType);
              setPage("onboarding");
            }}
            profiles={profiles}
          />
        )}
        {page === "today" && <TodayPage report={report} signals={signals} profileType={profile.profileType} />}
        {page === "sleep" && <SleepPage events={signals.audioEvents} />}
        {page === "diet" && <DietPage diet={signals.diet} profileType={profile.profileType} onSaveObservation={saveObservation} />}
        {page === "signals" && <SignalsPage signals={signals} onAnalyzeTongue={handleAnalyzeTongue} onSaveObservation={saveObservation} />}
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
  onOpenProfiles,
  onSaveObservation,
}: {
  profile: UserProfile;
  profileType: ProfileType;
  onGenerateReport: () => Promise<void>;
  onOpenProfiles: () => void;
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
            <div className="button-stack">
              <button className="ghost-button compact" type="button" onClick={onOpenProfiles}>
                <Users size={15} />
                其他档案
              </button>
              <button className="ghost-button compact" type="button" onClick={() => setReportReady(false)}>
                重置报告
              </button>
            </div>
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

const birthHourOptions = [
  { key: "zi", label: "子时", time: "23:00-01:00" },
  { key: "chou", label: "丑时", time: "01:00-03:00" },
  { key: "yin", label: "寅时", time: "03:00-05:00" },
  { key: "mao", label: "卯时", time: "05:00-07:00" },
  { key: "chen", label: "辰时", time: "07:00-09:00" },
  { key: "si", label: "巳时", time: "09:00-11:00" },
  { key: "wu", label: "午时", time: "11:00-13:00" },
  { key: "wei", label: "未时", time: "13:00-15:00" },
  { key: "shen", label: "申时", time: "15:00-17:00" },
  { key: "you", label: "酉时", time: "17:00-19:00" },
  { key: "xu", label: "戌时", time: "19:00-21:00" },
  { key: "hai", label: "亥时", time: "21:00-23:00" },
];

function ProfileArchivePage({
  activeProfile,
  onBack,
  onSelectProfile,
  profiles,
}: {
  activeProfile: UserProfile;
  onBack: () => void;
  onSelectProfile: (profileType: ProfileType) => void;
  profiles: UserProfile[];
}) {
  const [mode, setMode] = useState<"list" | "new" | "reports">("list");
  const [draft, setDraft] = useState({
    name: "用户3968",
    gender: "male",
    birthDate: "2021-03-18",
    birthHour: "you",
  });

  if (mode === "new") {
    return (
      <section className="mobile-app-page">
        <div className="mobile-app-top">
          <button className="icon-button" type="button" onClick={() => setMode("list")} aria-label="返回档案列表">
            <ArrowLeft size={18} />
          </button>
          <strong>第 4 步 / 共 4 步</strong>
          <span>五运六气</span>
        </div>
        <div className="step-progress" aria-label="建档步骤">
          {["舌诊", "脉诊", "问诊", "五运六气"].map((item, index) => (
            <span className={index === 3 ? "active" : ""} key={item}>{item}</span>
          ))}
        </div>
        <div className="mobile-hint">已从档案中自动填入出生信息，如需修改可直接更改</div>
        <section className="mobile-form-card">
          <label className="form-field">
            <span><CalendarDays size={15} /> 出生日期</span>
            <input
              type="date"
              value={draft.birthDate}
              onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))}
            />
          </label>
        </section>
        <section className="mobile-form-card">
          <div className="mobile-form-title">
            <Clock3 size={16} />
            出生时辰
          </div>
          <div className="birth-hour-grid">
            {birthHourOptions.map((item) => (
              <button
                className={draft.birthHour === item.key ? "birth-hour active" : "birth-hour"}
                key={item.key}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, birthHour: item.key }))}
              >
                <strong>{item.label}</strong>
                <span>{item.time}</span>
              </button>
            ))}
          </div>
        </section>
        <button className="action-button mobile-primary" type="button" onClick={() => setMode("list")}>
          确认并继续
        </button>
      </section>
    );
  }

  if (mode === "reports") {
    return (
      <section className="mobile-app-page">
        <div className="mobile-app-top">
          <button className="icon-button" type="button" onClick={() => setMode("list")} aria-label="返回档案首页">
            <ArrowLeft size={18} />
          </button>
          <strong>我的报告</strong>
          <span>历史测评</span>
        </div>
        <section className="archive-list">
          {profiles.map((item, index) => (
            <button
              className={item.id === activeProfile.id ? "archive-row active" : "archive-row"}
              key={item.id}
              type="button"
              onClick={() => {
                onSelectProfile(item.profileType);
                setMode("list");
              }}
            >
              <span>{String(72 - index * 3)}</span>
              <div>
                <strong>{item.name} · 四诊合参健康报告</strong>
                <em>舌诊 / 问诊 / 五运六气 · 点击切换档案查看</em>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
      </section>
    );
  }

  return (
    <section className="mobile-app-page">
      <div className="mobile-brand-bar">
        <div className="brand-mark">SL</div>
        <strong>岐黄 AI 健康</strong>
        <button className="profile-pill" type="button">
          {activeProfile.name}
          <ChevronRight size={14} />
        </button>
      </div>
      <section className="mobile-welcome-card">
        <p>下午好，{activeProfile.name}</p>
        <span>基于中医四诊合参，AI 智能分析你的健康状态</span>
      </section>
      <div className="mobile-action-grid">
        <button className="mobile-action-card active" type="button" onClick={() => setMode("new")}>
          <UserPlus size={28} />
          <strong>新建档案</strong>
          <span>舌诊 / 问诊 / 五运六气</span>
        </button>
        <button className="mobile-action-card" type="button" onClick={() => setMode("reports")}>
          <FileText size={28} />
          <strong>我的报告</strong>
          <span>查看历史健康报告</span>
        </button>
      </div>
      <button className="action-button mobile-primary" type="button" onClick={() => setMode("new")}>
        开始健康测评
      </button>
      <section className="mobile-info-card">
        <h3>服务号测评说明</h3>
        <ol>
          <li>舌诊：拍摄舌面/舌底照片，AI 智能分析舌象</li>
          <li>问诊：通过智能问卷采集症状与体征信息</li>
          <li>五运六气：基于出生时辰推算运气养生方案</li>
        </ol>
      </section>
      <section className="archive-list">
        <div className="panel-toolbar">
          <strong>其他档案</strong>
          <span>点击可切换当前页面画像</span>
        </div>
        {profiles.map((item) => (
          <button
            className={item.id === activeProfile.id ? "archive-row active" : "archive-row"}
            key={item.id}
            type="button"
            onClick={() => onSelectProfile(item.profileType)}
          >
            <span>{item.name.slice(0, 1)}</span>
            <div>
              <strong>{item.name}</strong>
              <em>{item.age} 岁 · {item.occupation}</em>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </section>
    </section>
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
  onAnalyzeTongue,
  signals,
  onSaveObservation,
}: {
  onAnalyzeTongue: AnalyzeTongue;
  signals: DailySignals;
  onSaveObservation: SaveObservation;
}) {
  const tongueFileRef = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<"stool" | "tongue" | "breath" | null>(null);
  const [tongueUpload, setTongueUpload] = useState<TongueUpload | null>(null);
  const [showTongueReport, setShowTongueReport] = useState(Boolean(signals.tongue.recorded));
  const [tongueAiText, setTongueAiText] = useState("");
  const [tongueAiLoading, setTongueAiLoading] = useState(false);
  const [tongueAiError, setTongueAiError] = useState("");
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

  useEffect(() => () => {
    if (tongueUpload?.url) URL.revokeObjectURL(tongueUpload.url);
  }, [tongueUpload?.url]);

  async function handleTongueFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (tongueUpload?.url) URL.revokeObjectURL(tongueUpload.url);
    const nextUpload = {
      name: file.name,
      url: URL.createObjectURL(file),
      size: file.size,
      type: file.type,
    };
    const nextDraft: TongueDraft = {
      ...tongueDraft,
      photoName: file.name,
      tongueColor: "pale",
      coatingThickness: "thin",
      moisture: "dry",
    };
    setTongueUpload(nextUpload);
    setTongueDraft(nextDraft);
    setShowTongueReport(true);
    setTongueAiLoading(true);
    setTongueAiError("");
    try {
      const analysis = await onAnalyzeTongue({ date: signals.date, tongue: nextDraft, upload: nextUpload });
      setTongueAiText(analysis);
    } catch {
      setTongueAiError("模型分析暂不可用，已保留本地舌象报告，可稍后再次测评。");
    } finally {
      setTongueAiLoading(false);
    }
  }

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
    if (type === "tongue") setShowTongueReport(true);
    setModal(null);
  }

  return (
    <>
      <PageTitle
        eyebrow="望闻记录"
        title="舌诊、便诊、口气反馈，组成今日四诊线索"
        text="这些记录用于趋势观察和生活方式建议，敏感数据默认优先保存结构化标签。"
      />
      <section className="section-grid three">
        <Panel title="便诊记录">
          <SignalValue label="今日状态" value={signals.stool.recorded ? stoolShape(signals.stool.shape) : "未记录"} />
          <SignalValue label="颜色" value={signals.stool.color ? stoolColor(signals.stool.color) : "未记录"} />
          <SignalValue label="趋势" value={signals.stool.dryness === "dry" ? "近几天偏干" : "暂无明显异常"} />
          <button className="action-button" type="button" onClick={() => setModal("stool")}>记录排便</button>
        </Panel>
        <Panel title="舌诊观察">
          <SignalValue label="舌色" value={tongueColor(signals.tongue.tongueColor)} />
          <SignalValue label="舌苔" value={coating(signals.tongue.coatingThickness)} />
          <SignalValue label="照片质量" value={photoQuality(signals.tongue.photoQuality)} />
          <button className="action-button" type="button" onClick={() => setModal("tongue")}>拍照记录舌苔</button>
        </Panel>
        <Panel title="闻诊反馈">
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
      {showTongueReport && (
        <TongueDiagnosisReport
          aiError={tongueAiError}
          aiLoading={tongueAiLoading}
          aiText={tongueAiText}
          draft={tongueDraft}
          onRetest={() => setModal("tongue")}
          upload={tongueUpload}
        />
      )}
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
          onChange={handleTongueFileSelected}
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

const constitutionScores = [
  { label: "阳虚质", value: 85, highlight: true },
  { label: "气虚质", value: 75 },
  { label: "湿热质", value: 55 },
  { label: "阴虚质", value: 50 },
  { label: "痰湿质", value: 45 },
  { label: "血瘀质", value: 40 },
  { label: "气郁质", value: 35 },
  { label: "平和质", value: 15 },
];

const foodTherapyItems = [
  { name: "山药", text: "性平味甘，补脾养胃，生津益肺", usage: "蒸食、煮粥或炖汤，每日 100-200g" },
  { name: "核桃", text: "性温味甘，补肾温肺，润肠通便", usage: "每日 2-3 个，嚼食或煮粥" },
  { name: "红枣", text: "性温味甘，补中益气，养血安神", usage: "每日 3-5 颗，泡茶或煮粥" },
  { name: "生姜", text: "性微温味辛，解表散寒，温中止呕", usage: "做菜佐料或晨起含服，不宜过量" },
];

function TongueDiagnosisReport({
  aiError,
  aiLoading,
  aiText,
  draft,
  onRetest,
  upload,
}: {
  aiError: string;
  aiLoading: boolean;
  aiText: string;
  draft: TongueDraft;
  onRetest: () => void;
  upload: TongueUpload | null;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "tongue" | "inquiry" | "wuyun" | "risk" | "therapy">("tongue");
  const [shareStatus, setShareStatus] = useState("");
  const mainPattern = draft.moisture === "dry" || draft.coatingThickness === "none" ? "阴虚内热，以胃阴不足为主" : draft.tongueColor === "pale" ? "气血偏虚，脾胃运化不足倾向" : "气虚质";
  const abnormalItems = [
    draft.tongueColor === "pale" ? "舌色偏淡白，提示气血不足倾向" : "舌色以淡红为主，需结合疲劳和饮食观察",
    draft.moisture === "dry" ? "舌面津液偏少，建议结合口干和睡眠状态观察" : "津液尚可，继续观察晨起口干变化",
    draft.coatingThickness === "thin" || draft.coatingThickness === "none" ? "舌苔偏薄或少苔，近期不宜过食辛辣燥热" : "舌苔厚薄变化需结合饮食和排便趋势判断",
  ];
  const tabs = [
    { key: "overview", label: "体质总览" },
    { key: "tongue", label: "舌诊" },
    { key: "inquiry", label: "问诊" },
    { key: "wuyun", label: "五运六气" },
    { key: "risk", label: "风险评估" },
    { key: "therapy", label: "调理方案" },
  ] as const;
  const featureCards = [
    { title: "舌色", value: draft.tongueColor === "pale" ? "舌质淡白偏淡，局部可见淡红" : tongueColor(draft.tongueColor), tone: "rose" },
    { title: "舌形", value: "舌体形态适中略偏胖，质地较为柔嫩", tone: "amber" },
    { title: "苔质", value: draft.coatingThickness === "none" ? "少苔或局部剥脱，舌面较光洁" : `${coating(draft.coatingThickness)}，需结合饮食观察`, tone: "gold" },
    { title: "津液", value: draft.moisture === "dry" ? "津液偏少，舌面水润度不足" : "津液尚可，舌面有光泽", tone: "blue" },
  ];

  async function handleShareReport() {
    const text = `SenseLoop 舌诊报告：${mainPattern}。舌象要点：${abnormalItems.join("；")}。当前结果仅作健康管理参考。`;
    try {
      const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: "SenseLoop 舌诊报告", text });
        setShareStatus("已打开系统分享");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareStatus("报告摘要已复制");
    } catch {
      setShareStatus("分享暂不可用，可稍后重试");
    }
  }

  return (
    <section className="tongue-report-shell">
      <div className="tcm-report-brand">
        <div className="brand-leaf">叶</div>
        <div>
          <strong>AI 中医舌诊</strong>
          <span>Traditional TCM Tongue Analysis</span>
        </div>
      </div>
      <div className="report-hero-card">
        <div>
          <p>AI 四诊合参 · 舌诊健康报告</p>
          <h2>用户3968</h2>
          <span>测评日期：2026年3月15日</span>
          <div className="report-pill-row">
            <b>舌诊 · 已完成</b>
            <b>问诊 · 已完成</b>
            <b>五运六气 · 已完成</b>
          </div>
        </div>
        <div className="report-score-ring">
          <strong>72</strong>
          <span>综合评分</span>
        </div>
      </div>
      <div className="report-tab-strip">
        {tabs.map((item) => (
          <button className={activeTab === item.key ? "active" : ""} key={item.key} type="button" onClick={() => setActiveTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {activeTab === "overview" && (
        <section className="tongue-result-card">
          <h3>体质辨识结果</h3>
          <div className="constitution-title">
            <strong>{mainPattern}</strong>
            <span>主要倾向</span>
          </div>
          <p>当前结果结合舌象标签与模型分析生成，只做健康管理参考，不替代医疗诊断。</p>
          <strong className="mini-heading">九型体质评估</strong>
          <div className="constitution-list">
            {constitutionScores.map((item) => (
              <div className="constitution-row" key={item.label}>
                <span>{item.label}</span>
                <i><b style={{ width: `${item.value}%` }} /></i>
                <em>{item.value}%{item.highlight ? " *" : ""}</em>
              </div>
            ))}
          </div>
        </section>
      )}
      {activeTab === "tongue" && (
        <>
          <section className="tongue-result-card">
            <h3>舌象分析</h3>
            <div className="tongue-photo-grid">
              <figure>
                {upload ? <img alt="舌面上传预览" src={upload.url} /> : <div className="tongue-placeholder">舌</div>}
                <figcaption>舌面</figcaption>
              </figure>
              <figure>
                <div className="tongue-placeholder underside">舌下</div>
                <figcaption>舌下</figcaption>
              </figure>
            </div>
            <div className="tongue-feature-grid">
              {featureCards.map((item) => (
                <article className={`tongue-feature-card ${item.tone}`} key={item.title}>
                  <span>{item.title}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
          <section className="diagnosis-card">
            <h3><CheckCircle2 size={22} /> 辨证结果 <span>(Diagnosis)</span></h3>
            <b>{mainPattern}</b>
            <p>您的舌象较显著的特征会优先进入健康管理建议。请结合问诊、排便、睡眠和饮食记录一起观察。</p>
          </section>
          <section className="ai-analysis-box">
            <h3><Sparkles size={20} /> 模型分析</h3>
            {aiLoading && <p>正在调用后端模型分析舌象...</p>}
            {aiError && <p>{aiError}</p>}
            {!aiLoading && !aiError && aiText && aiText.split("\n").filter(Boolean).map((line) => <p key={line}>{line}</p>)}
            {!aiLoading && !aiError && !aiText && <p>上传舌苔照片后，这里会展示后端模型生成的分析结果。</p>}
          </section>
        </>
      )}
      {activeTab === "inquiry" && (
        <section className="tongue-result-card">
          <h3>问诊摘要</h3>
          <div className="inquiry-grid">
            {["晨起口干", "精神不振", "食欲一般", "睡眠偏晚"].map((item) => <span key={item}>{item}</span>)}
          </div>
          <p>后续这里会接入问卷模块，把口干、口苦、畏寒、出汗、排便等回答与舌象合参。</p>
        </section>
      )}
      {activeTab === "wuyun" && (
        <section className="tongue-result-card">
          <h3>五运六气参考</h3>
          <p>当前按春末湿热与作息消耗场景处理：饮食宜清润，避免连续熬夜、辛辣和大汗运动。</p>
          <div className="abnormal-box">
            <strong>季节提醒</strong>
            <p>如近期口干、咽干明显，优先关注补水、睡眠和室内湿度。</p>
          </div>
        </section>
      )}
      {activeTab === "risk" && (
        <section className="tongue-result-card">
          <h3>风险评估</h3>
          <div className="abnormal-box">
            <strong>注意事项</strong>
            {abnormalItems.map((item) => <p key={item}>· {item}</p>)}
            <p>· 如出现持续疼痛、发热、口腔溃疡不愈或明显不适，请及时就医。</p>
          </div>
        </section>
      )}
      {activeTab === "therapy" && (
        <section className="therapy-card">
          <div className="therapy-head">
            <span>膳</span>
            <div>
              <h3>饮食调理与个性化食疗</h3>
              <p>基于体质辨识和舌诊数据，精选药食同源食材</p>
            </div>
          </div>
          <div className="diet-advice-card">
            <h3><Apple size={20} /> 饮食调理 (Diet)</h3>
            <p>多吃滋阴润燥的食物，如银耳、百合、雪梨、莲藕、山药。</p>
            <p>避免辛辣刺激性食物，少吃油炸烧烤，减少温热性食物过量摄入。</p>
          </div>
          <div className="herb-chip-grid">
            {["石斛（滋养胃阴）", "麦冬（养阴生津）", "沙参（清肺养阴）", "玉竹（养阴润燥）", "枸杞子（滋补肝肾）", "西洋参（补气养阴）"].map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="therapy-grid">
            {foodTherapyItems.map((item) => (
              <article className="therapy-item" key={item.name}>
                <div>{item.name.slice(0, 1)}</div>
                <strong>{item.name}</strong>
                <p>{item.text}</p>
                <em>{item.usage}</em>
              </article>
            ))}
          </div>
          <div className="lifestyle-list">
            <h3><Clock3 size={20} /> 起居建议 (Lifestyle)</h3>
            <p>务必保证充足睡眠，尽量在晚上 11 点前入睡。</p>
            <p>运动宜缓，避免大汗淋漓的剧烈运动。</p>
            <p>保持情绪平稳，避免焦虑急躁。</p>
          </div>
        </section>
      )}
      <section className="fixed-report-actions">
        <button className="ghost-button" type="button" onClick={handleShareReport}>分享报告</button>
        <button className="action-button compact" type="button" onClick={onRetest}>再次测评</button>
        {shareStatus && <span>{shareStatus}</span>}
      </section>
    </section>
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
