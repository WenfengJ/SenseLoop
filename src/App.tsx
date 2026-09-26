import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowLeft,
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
import { DailyReport, DailySignals, DietSignal, ProfileType, SleepAudioEvent, SleepSignal, UserProfile } from "./domain/types";
import {
  analyzeTongue,
  createProfile,
  createAgentSession,
  createObservation,
  generateReport,
  chatWithQihuangAgent,
  getAgentContext,
  getOrCreateGuestIdentity,
  getDailySignals,
  getProfiles,
  getSessionIdentity,
  requestEmailCode,
  sendAgentMessage,
  summarizeHealthDocument,
  updateProfile,
  verifyEmailCode,
  type AgentMessageResult,
  type EmailCodeResult,
  type HealthDocumentSummaryPayload,
  type HealthDocumentSummaryResult,
  type ObservationPayload,
  type GuestIdentity,
  type ProfileWritePayload,
} from "./services/apiClient";
import { buildDailyReport } from "./services/reportBuilder";

type PageKey = "today" | "detect" | "consult" | "report" | "mine" | "architecture";
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
  today: "今日",
  detect: "记录",
  consult: "问助手",
  report: "报告",
  mine: "我的",
  architecture: "说明",
};

const demoRelationshipNames: Record<string, string> = {
  "profile-weight-loss": "我",
  "profile-elderly": "父亲",
  "profile-office": "母亲",
  "profile-student": "儿子",
  "profile-insomnia": "伴侣",
};

function profileDisplayName(profile: UserProfile) {
  return demoRelationshipNames[profile.id] ?? profile.name;
}

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

const profileGoalOptions: Array<{ value: UserProfile["goals"][number]; label: string }> = [
  { value: "sleep_recovery", label: "睡眠恢复" },
  { value: "weight_loss", label: "体重管理" },
  { value: "elderly_care", label: "老人关怀" },
  { value: "focus_study", label: "学习专注" },
  { value: "reduce_fatigue", label: "减少疲劳" },
  { value: "digestive_health", label: "脾胃消化" },
];

function profileGoalLabels(profile: UserProfile) {
  return profile.goals
    .map((value) => profileGoalOptions.find((item) => item.value === value)?.label)
    .filter((label): label is string => Boolean(label));
}

function profileToDraft(profile: UserProfile, accountId?: string | null): ProfileWritePayload {
  return {
    accountId: accountId ?? null,
    name: profileDisplayName(profile),
    profileType: profile.profileType,
    age: profile.age,
    gender: profile.gender,
    occupation: profile.occupation,
    birthDate: profile.birthDate ?? "",
    birthHour: profile.birthHour ?? "",
    fourDiagnosisProfile: {
      tongueNote: profile.fourDiagnosisProfile?.tongueNote ?? "",
      stoolNote: profile.fourDiagnosisProfile?.stoolNote ?? "",
      sleepSoundNote: profile.fourDiagnosisProfile?.sleepSoundNote ?? "",
      mainConcern: profile.fourDiagnosisProfile?.mainConcern ?? "",
    },
    goals: [...profile.goals],
    habits: { ...profile.habits },
  };
}

function sanitizeProfileDraft(draft: ProfileWritePayload, accountId?: string | null): ProfileWritePayload {
  return {
    accountId: accountId ?? draft.accountId ?? null,
    name: draft.name.trim() || "我的健康档案",
    profileType: draft.profileType,
    age: Math.min(120, Math.max(1, Number(draft.age) || 30)),
    gender: draft.gender,
    occupation: draft.occupation.trim() || "未填写",
    birthDate: draft.birthDate || null,
    birthHour: draft.birthHour || null,
    fourDiagnosisProfile: {
      tongueNote: draft.fourDiagnosisProfile?.tongueNote?.trim() || "",
      stoolNote: draft.fourDiagnosisProfile?.stoolNote?.trim() || "",
      sleepSoundNote: draft.fourDiagnosisProfile?.sleepSoundNote?.trim() || "",
      mainConcern: draft.fourDiagnosisProfile?.mainConcern?.trim() || "",
    },
    goals: draft.goals.length ? draft.goals : ["sleep_recovery"],
    habits: {
      coffee: draft.habits.coffee,
      lateNightSnack: Boolean(draft.habits.lateNightSnack),
      sedentaryHours: Math.min(18, Math.max(0, Number(draft.habits.sedentaryHours) || 0)),
      exerciseFrequency: draft.habits.exerciseFrequency,
      sleepProblem: draft.habits.sleepProblem,
    },
  };
}

export default function App() {
  const [activeProfileId, setActiveProfileId] = useState<string>(mockProfiles[0].id);
  const [page, setPage] = useState<PageKey>("today");
  const [previousPage, setPreviousPage] = useState<PageKey>("today");
  const [profiles, setProfiles] = useState<UserProfile[]>(mockProfiles);
  const [signals, setSignals] = useState<DailySignals>(mockDailySignals.weight_loss_female);
  const [report, setReport] = useState<DailyReport>(() => buildLocalReport(mockProfiles[0], mockDailySignals.weight_loss_female));
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);
  const [apiMode, setApiMode] = useState<ApiMode>("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [agentAnswer, setAgentAnswer] = useState<string>("");

  const profile = useMemo(() => {
    const source = profiles.find((item) => item.id === activeProfileId) ?? profiles[0] ?? mockProfiles[0];
    return { ...source, name: profileDisplayName(source) };
  }, [activeProfileId, profiles]);

  useEffect(() => {
    let active = true;
    const storedDeviceId = window.localStorage.getItem("senseloopDeviceId");
    const storedSessionToken = window.localStorage.getItem("senseloopSessionToken");
    const identityRequest = storedSessionToken ? getSessionIdentity(storedSessionToken, storedDeviceId) : getOrCreateGuestIdentity(storedDeviceId);
    identityRequest
      .then((nextIdentity) => {
        if (!active) return;
        window.localStorage.setItem("senseloopDeviceId", nextIdentity.deviceId);
        setIdentity(nextIdentity);
        const items = nextIdentity.profiles;
        setProfiles(items.length ? items : mockProfiles);
        const defaultProfile = items.find((item) => item.id === nextIdentity.profileId) ?? items[0];
        if (defaultProfile) setActiveProfileId(defaultProfile.id);
        setApiMode("api");
      })
      .catch(async () => {
        if (!active) return;
        window.localStorage.removeItem("senseloopSessionToken");
        try {
          const guestIdentity = await getOrCreateGuestIdentity(storedDeviceId);
          if (!active) return;
          window.localStorage.setItem("senseloopDeviceId", guestIdentity.deviceId);
          setIdentity(guestIdentity);
          const items = guestIdentity.profiles;
          setProfiles(items.length ? items : mockProfiles);
          const defaultProfile = items.find((item) => item.id === guestIdentity.profileId) ?? items[0];
          if (defaultProfile) setActiveProfileId(defaultProfile.id);
          setApiMode("api");
        } catch {
          if (!active) return;
          setIdentity({ deviceId: "demo-device-local", guestUserId: "guest-demo-local", profileId: mockProfiles[0].id, profiles: mockProfiles });
          setProfiles(mockProfiles);
          setApiMode("mock");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function applyIdentity(nextIdentity: GuestIdentity) {
    window.localStorage.setItem("senseloopDeviceId", nextIdentity.deviceId);
    window.localStorage.removeItem("senseloopEmail");
    if (nextIdentity.authMode === "email" && nextIdentity.sessionToken) {
      window.localStorage.setItem("senseloopSessionToken", nextIdentity.sessionToken);
    } else {
      window.localStorage.removeItem("senseloopSessionToken");
    }
    setIdentity(nextIdentity);
    setProfiles(nextIdentity.profiles.length ? nextIdentity.profiles : mockProfiles);
    const defaultProfile = nextIdentity.profiles.find((item) => item.id === nextIdentity.profileId) ?? nextIdentity.profiles[0];
    if (defaultProfile) setActiveProfileId(defaultProfile.id);
    setApiMode("api");
  }

  async function handleRequestEmailCode(email: string, displayName?: string) {
    const result = await requestEmailCode(email, displayName || null, identity?.deviceId ?? window.localStorage.getItem("senseloopDeviceId"));
    setToast({ kind: "success", message: result.delivery === "email" ? "验证码已发送，请查看邮箱" : "验证码已生成，可在页面中查看" });
    return result;
  }

  async function handleVerifyEmailCode(email: string, code: string, displayName?: string) {
    const nextIdentity = await verifyEmailCode(email, code, displayName || null, identity?.deviceId ?? window.localStorage.getItem("senseloopDeviceId"));
    applyIdentity(nextIdentity);
    setToast({ kind: "success", message: "已登录账号" });
  }

  async function handleGuestLogin() {
    const nextIdentity = await getOrCreateGuestIdentity(identity?.deviceId ?? window.localStorage.getItem("senseloopDeviceId"));
    applyIdentity(nextIdentity);
    setToast({ kind: "success", message: "已切换为游客使用" });
  }

  async function handleCreateProfile(payload: ProfileWritePayload) {
    if (!identity?.accountId) {
      setToast({ kind: "error", message: "请先登录账号或创建游客身份" });
      throw new Error("account is required");
    }
    const nextProfile = await createProfile({ ...payload, accountId: identity.accountId });
    setProfiles((current) => [...current.filter((item) => item.id !== nextProfile.id), nextProfile]);
    setActiveProfileId(nextProfile.id);
    setIdentity((current) => current ? { ...current, profileId: nextProfile.id, profiles: [...current.profiles.filter((item) => item.id !== nextProfile.id), nextProfile] } : current);
    setApiMode("api");
    setToast({ kind: "success", message: "新健康档案已保存" });
  }

  async function handleUpdateProfile(profileId: string, payload: ProfileWritePayload) {
    const nextProfile = await updateProfile(profileId, { ...payload, accountId: identity?.accountId ?? null });
    setProfiles((current) => current.map((item) => (item.id === nextProfile.id ? nextProfile : item)));
    setIdentity((current) => current ? { ...current, profiles: current.profiles.map((item) => (item.id === nextProfile.id ? nextProfile : item)) } : current);
    setApiMode("api");
    setToast({ kind: "success", message: "健康档案已更新" });
  }

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
      setToast({ kind: "success", message: "已保存记录" });
    } catch {
      setToast({ kind: "error", message: "暂时无法同步，请稍后再试" });
      setApiMode((current) => (current === "api" ? "api" : "mock"));
    }
  }

  async function handleGenerateReport() {
    setIsLoading(true);
    try {
      const nextReport = await generateReport(profile.id, signals.date);
      setReport(nextReport);
      setApiMode("api");
      setToast({ kind: "success", message: "健康报告已更新" });
    } catch {
      setReport(buildLocalReport(profile, signals));
      setToast({ kind: "info", message: "暂时无法更新，已为你保留当前报告" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAskAgent() {
    setAgentAnswer("正在整理你的日报和近期记录...");
    try {
      const session = await createAgentSession(profile.id);
      const answer = await sendAgentMessage(session.id, `请解释 ${profile.name} 在 ${signals.date} 的健康日报，并指出下一步应该补充哪些记录。`);
      setAgentAnswer(answer.assistantMessage || answer.answer || "");
      setApiMode("api");
    } catch {
      setAgentAnswer("暂时无法连接问诊助手，请稍后再试。你仍可以先补充睡眠、舌诊或饮食记录。");
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
      message: result.aiEnabled ? "舌诊分析已完成" : "已生成舌诊参考报告",
    });
    return result.analysis;
  }

  function openPage(nextPage: PageKey) {
    if (nextPage !== page) setPreviousPage(page);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            {apiMode === "checking" ? "同步中" : apiMode === "api" ? "已同步" : "离线模式"}
          </span>
          <button className="ghost-button" type="button" onClick={() => openPage("architecture")}>
            <Database size={16} />
            说明
          </button>
        </div>
      </header>

      {page !== "mine" && (
        <section className="profile-strip" aria-label="当前健康档案切换">
          {profiles.map((item) => (
            <button
              className={item.id === profile.id ? "chip active" : "chip"}
              key={item.id}
              type="button"
              onClick={() => setActiveProfileId(item.id)}
            >
              {profileDisplayName(item)}
            </button>
          ))}
        </section>
      )}

      <section className="page-frame">
        {isLoading && <div className="inline-status">正在更新健康记录...</div>}
        {page === "today" && (
          <TodayPage
            onOpenConsult={() => openPage("consult")}
            onOpenDetect={() => openPage("detect")}
            report={report}
            signals={signals}
            profileType={profile.profileType}
          />
        )}
        {page === "detect" && (
          <DetectPage
            onAnalyzeTongue={handleAnalyzeTongue}
            onOpenConsult={() => openPage("consult")}
            onSaveObservation={saveObservation}
            onSummarizeDocument={async (payload) => summarizeHealthDocument(profile.id, payload)}
            profileType={profile.profileType}
            signals={signals}
          />
        )}
        {page === "consult" && (
          <ConsultPage
            identity={identity}
            profile={profile}
            report={report}
            signals={signals}
            onOpenDetect={() => openPage("detect")}
          />
        )}
        {page === "report" && (
          <ReportPage
            agentAnswer={agentAnswer}
            onAskAgent={handleAskAgent}
            profileType={profile.profileType}
            report={report}
          />
        )}
        {page === "mine" && (
          <MinePage
            activeProfile={profile}
            identity={identity}
            onCreateProfile={handleCreateProfile}
            onGenerateReport={handleGenerateReport}
            onGuestLogin={handleGuestLogin}
            onRequestEmailCode={handleRequestEmailCode}
            onSaveObservation={saveObservation}
            onSelectProfile={(nextProfileId) => {
              setActiveProfileId(nextProfileId);
            }}
            onUpdateProfile={handleUpdateProfile}
            onVerifyEmailCode={handleVerifyEmailCode}
            profiles={profiles}
          />
        )}
        {page === "architecture" && <ArchitecturePage onBack={() => setPage(previousPage === "architecture" ? "today" : previousPage)} />}
      </section>

      <nav className="bottom-nav" aria-label="页面导航">
        {(Object.keys(pageNames) as PageKey[])
          .filter((key) => key !== "architecture")
          .map((key) => (
            <button
              className={`${page === key ? "nav-item active" : "nav-item"}${key === "consult" ? " nav-item-primary" : ""}`}
              key={key}
              type="button"
              onClick={() => openPage(key)}
            >
              {key === "consult" && <Sparkles size={17} />}
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
      title: "切：记录运动与体征",
      text: "先记录心率、步数和运动状态，帮助判断今天适合恢复还是活动。",
      action: "查看体征记录",
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
            <p className="eyebrow">健康助手</p>
            <h2>先建档，再生成第一份健康日报</h2>
            <p>补充录音、照片和基础信息后，建议会更贴近你的日常状态。</p>
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
            <p className="eyebrow">健康档案</p>
            <h2>先完成基础信息，再生成你的第一份健康报告</h2>
            <p>
                补充生活方式、睡眠感受和日常记录后，建议会更贴近你的身体状态。
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
              <span>保存后可用于今日建议</span>
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
                <strong>照片记录</strong>
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
                <strong>夜间声音</strong>
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
              <li>{hasDryMouth ? "今早口干：建议补水，并观察夜间打鼾和晨间疲惫是否连续出现。" : "今早疲惫：今天优先恢复，运动强度不宜过高。"}</li>
              <li>{selectedPhotos.length ? "照片信号已进入报告，用标签辅助饮食和身体状态建议。" : "照片信号未选择，报告会提示用户补充记录。"}</li>
              <li>{selectedAudio.length ? "夜间录音已进入报告，能解释为什么今天这样安排。" : "录音未纳入时，只根据问答和照片生成轻量建议。"}</li>
            </ul>
          </div>
        </Panel>
      </section>

      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>所有建议仅用于日常健康管理。若不适持续、加重或影响生活，请及时咨询医生。</span>
      </section>
    </>
  );
}

function MinePage({
  activeProfile,
  identity,
  onCreateProfile,
  onGenerateReport,
  onGuestLogin,
  onRequestEmailCode,
  onSaveObservation,
  onSelectProfile,
  onUpdateProfile,
  onVerifyEmailCode,
  profiles,
}: {
  activeProfile: UserProfile;
  identity: GuestIdentity | null;
  onCreateProfile: (payload: ProfileWritePayload) => Promise<void>;
  onGenerateReport: () => Promise<void>;
  onGuestLogin: () => Promise<void>;
  onRequestEmailCode: (email: string, displayName?: string) => Promise<EmailCodeResult>;
  onSaveObservation: SaveObservation;
  onSelectProfile: (profileId: string) => void;
  onUpdateProfile: (profileId: string, payload: ProfileWritePayload) => Promise<void>;
  onVerifyEmailCode: (email: string, code: string, displayName?: string) => Promise<void>;
  profiles: UserProfile[];
}) {
  const [email, setEmail] = useState(identity?.email ?? "");
  const [emailCode, setEmailCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [displayName, setDisplayName] = useState(identity?.displayName ?? "");
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileWritePayload>(() => profileToDraft(activeProfile, identity?.accountId));

  useEffect(() => {
    setEmail(identity?.email ?? "");
    setDisplayName(identity?.displayName ?? "");
    setEmailCode("");
    setCodeSentTo("");
    setDevCode("");
  }, [identity?.email, identity?.displayName]);

  useEffect(() => {
    setProfileDraft(profileToDraft(activeProfile, identity?.accountId));
  }, [activeProfile, identity?.accountId]);

  async function submitEmailCodeRequest() {
    if (!email.trim()) return;
    setAccountLoading(true);
    try {
      const result = await onRequestEmailCode(email.trim(), displayName.trim() || undefined);
      setCodeSentTo(result.email);
      setDevCode(result.devCode ?? "");
      setEmailCode(result.devCode ?? "");
    } finally {
      setAccountLoading(false);
    }
  }

  async function submitEmailCodeVerify() {
    if (!email.trim() || !emailCode.trim()) return;
    setAccountLoading(true);
    try {
      await onVerifyEmailCode(email.trim(), emailCode.trim(), displayName.trim() || undefined);
    } finally {
      setAccountLoading(false);
    }
  }

  async function submitGuestLogin() {
    setAccountLoading(true);
    try {
      await onGuestLogin();
    } finally {
      setAccountLoading(false);
    }
  }

  async function saveCurrentProfile() {
    setProfileSaving(true);
    try {
      await onUpdateProfile(activeProfile.id, sanitizeProfileDraft(profileDraft, identity?.accountId));
    } finally {
      setProfileSaving(false);
    }
  }

  async function createNewProfileFromDraft() {
    setProfileSaving(true);
    try {
      await onCreateProfile({
        ...sanitizeProfileDraft(profileDraft, identity?.accountId),
        name: profileDraft.name.trim() ? profileDraft.name.trim() : "新的健康档案",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  function startNewProfileDraft() {
    setProfileDraft({
      ...profileToDraft(activeProfile, identity?.accountId),
      name: "",
      age: 30,
      occupation: "",
      birthDate: "",
      birthHour: "",
      fourDiagnosisProfile: {
        tongueNote: "",
        stoolNote: "",
        sleepSoundNote: "",
        mainConcern: "",
      },
      goals: ["sleep_recovery"],
      habits: {
        coffee: "low",
        lateNightSnack: false,
        sedentaryHours: 6,
        exerciseFrequency: "medium",
        sleepProblem: "mild",
      },
    });
    setProfileEditorOpen(true);
    window.setTimeout(() => {
      document.getElementById("health-profile-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <>
      <button className="account-profile-hero" type="button" onClick={() => setAccountPanelOpen((current) => !current)}>
        <div className="account-avatar">{identity?.authMode === "email" ? (identity.displayName || identity.email || "我").slice(0, 1) : "访"}</div>
        <div className="account-profile-copy">
          <span>{identity?.authMode === "email" ? "SenseLoop 账号" : "游客模式"}</span>
          <strong>{identity?.authMode === "email" ? identity.displayName || identity.email : "登录 / 注册"}</strong>
          <p>{identity?.authMode === "email" ? identity.email : "登录后可跨设备同步家庭档案与问诊记忆"}</p>
        </div>
        <ChevronRight size={20} />
      </button>

      {accountPanelOpen && (
        <section className="account-login-panel">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">账号与同步</p>
              <h3>{identity?.authMode === "email" ? "切换或管理账号" : "登录 SenseLoop"}</h3>
            </div>
            <button className="ghost-button compact" type="button" onClick={() => setAccountPanelOpen(false)}>收起</button>
          </div>
          <div className="form-grid compact">
            <label className="form-field">
              <span>邮箱</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label className="form-field">
              <span>昵称</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="可选" />
            </label>
            <label className="form-field">
              <span>验证码</span>
              <input
                inputMode="numeric"
                maxLength={6}
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位验证码"
              />
            </label>
          </div>
          {codeSentTo && (
            <p className="account-hint">
              验证码已发送至 {codeSentTo}。{devCode ? `本地演示验证码：${devCode}` : "请在 10 分钟内完成登录。"}
            </p>
          )}
          <div className="account-actions">
            <button className="ghost-button compact" type="button" onClick={submitEmailCodeRequest} disabled={accountLoading || !email.trim()}>
              发送验证码
            </button>
            <button className="action-button compact" type="button" onClick={submitEmailCodeVerify} disabled={accountLoading || !email.trim() || !emailCode.trim()}>
              验证并登录
            </button>
            <button className="ghost-button compact" type="button" onClick={submitGuestLogin} disabled={accountLoading}>
              游客使用
            </button>
          </div>
        </section>
      )}

      <section className="family-profile-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">家庭健康档案</p>
            <h3>现在查看：{profileDisplayName(activeProfile)}</h3>
          </div>
          <button className="ghost-button compact" type="button" onClick={startNewProfileDraft}>
            <UserPlus size={15} />
            新增成员
          </button>
        </div>
        <div className="family-profile-grid">
          {profiles.map((item) => (
            <button
              className={item.id === activeProfile.id ? "family-profile-card active" : "family-profile-card"}
              key={item.id}
              type="button"
              onClick={() => onSelectProfile(item.id)}
            >
              <span className="family-avatar">{profileDisplayName(item).slice(0, 1)}</span>
              <strong>{profileDisplayName(item)}</strong>
              <span className="family-meta">{item.age} 岁 · {item.occupation || "待完善"}</span>
              <span className="family-card-label">健康目标</span>
              <span className="family-tag-list">
                {profileGoalLabels(item).slice(0, 2).map((label) => <b key={label}>{label}</b>)}
              </span>
            </button>
          ))}
          <button className="family-profile-card add" type="button" onClick={startNewProfileDraft}>
            <span className="family-avatar"><UserPlus size={18} /></span>
            <strong>新增</strong>
            <em>建立独立档案</em>
          </button>
        </div>
        <div className="active-profile-summary">
          <div>
            <span>当前档案</span>
            <strong>{profileDisplayName(activeProfile)} · {activeProfile.age} 岁 · {activeProfile.occupation}</strong>
            <p>{profileNotes[activeProfile.profileType]}</p>
          </div>
          <div className="button-stack">
            <button className="ghost-button compact" type="button" onClick={() => setProfileEditorOpen((current) => !current)}>
              {profileEditorOpen ? "收起档案" : "编辑档案"}
            </button>
            <button className="action-button compact" type="button" onClick={onGenerateReport}>
              <FileText size={16} />
              更新今日报告
            </button>
          </div>
        </div>
      </section>

      <section className="section-grid two mine-settings-grid">
        {profileEditorOpen && (
        <div id="health-profile-editor">
        <Panel title="编辑健康档案">
          <div className="form-grid compact">
            <label className="form-field">
              <span>姓名/昵称</span>
              <input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>年龄</span>
              <input type="number" min={1} max={120} value={profileDraft.age} onChange={(event) => setProfileDraft((current) => ({ ...current, age: Number(event.target.value) || current.age }))} />
            </label>
            <label className="form-field">
              <span>性别</span>
              <select value={profileDraft.gender} onChange={(event) => setProfileDraft((current) => ({ ...current, gender: event.target.value as UserProfile["gender"] }))}>
                <option value="female">女性</option>
                <option value="male">男性</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="form-field">
              <span>生活方式</span>
              <input value={profileDraft.occupation} onChange={(event) => setProfileDraft((current) => ({ ...current, occupation: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>出生年月日</span>
              <input type="date" value={profileDraft.birthDate ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, birthDate: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>出生时辰</span>
              <select value={profileDraft.birthHour ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, birthHour: event.target.value }))}>
                <option value="">暂不确定</option>
                <option value="zi">子时 23:00-01:00</option>
                <option value="chou">丑时 01:00-03:00</option>
                <option value="yin">寅时 03:00-05:00</option>
                <option value="mao">卯时 05:00-07:00</option>
                <option value="chen">辰时 07:00-09:00</option>
                <option value="si">巳时 09:00-11:00</option>
                <option value="wu">午时 11:00-13:00</option>
                <option value="wei">未时 13:00-15:00</option>
                <option value="shen">申时 15:00-17:00</option>
                <option value="you">酉时 17:00-19:00</option>
                <option value="xu">戌时 19:00-21:00</option>
                <option value="hai">亥时 21:00-23:00</option>
              </select>
            </label>
            <label className="form-field">
              <span>咖啡因</span>
              <select value={profileDraft.habits.coffee} onChange={(event) => setProfileDraft((current) => ({ ...current, habits: { ...current.habits, coffee: event.target.value as UserProfile["habits"]["coffee"] } }))}>
                <option value="none">不喝</option>
                <option value="low">少量</option>
                <option value="medium">中等</option>
                <option value="high">较多</option>
              </select>
            </label>
            <label className="form-field">
              <span>睡眠困扰</span>
              <select value={profileDraft.habits.sleepProblem} onChange={(event) => setProfileDraft((current) => ({ ...current, habits: { ...current.habits, sleepProblem: event.target.value as UserProfile["habits"]["sleepProblem"] } }))}>
                <option value="none">暂无</option>
                <option value="mild">轻微</option>
                <option value="moderate">明显</option>
                <option value="severe">严重</option>
              </select>
            </label>
            <label className="form-field">
              <span>久坐小时</span>
              <input type="number" min={0} max={18} step={0.5} value={profileDraft.habits.sedentaryHours} onChange={(event) => setProfileDraft((current) => ({ ...current, habits: { ...current.habits, sedentaryHours: Number(event.target.value) || 0 } }))} />
            </label>
            <label className="form-field inline-check">
              <input type="checkbox" checked={profileDraft.habits.lateNightSnack} onChange={(event) => setProfileDraft((current) => ({ ...current, habits: { ...current.habits, lateNightSnack: event.target.checked } }))} />
              <span>经常夜宵</span>
            </label>
          </div>
          <div className="form-grid compact">
            <label className="form-field">
              <span>舌苔/口干线索</span>
              <textarea rows={3} value={profileDraft.fourDiagnosisProfile?.tongueNote ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, fourDiagnosisProfile: { ...(current.fourDiagnosisProfile ?? {}), tongueNote: event.target.value } }))} placeholder="例如：舌苔偏厚、口干、容易口苦" />
            </label>
            <label className="form-field">
              <span>排便习惯</span>
              <textarea rows={3} value={profileDraft.fourDiagnosisProfile?.stoolNote ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, fourDiagnosisProfile: { ...(current.fourDiagnosisProfile ?? {}), stoolNote: event.target.value } }))} placeholder="例如：偏干、一天一次、偶尔腹胀" />
            </label>
            <label className="form-field">
              <span>睡眠声音关注</span>
              <textarea rows={3} value={profileDraft.fourDiagnosisProfile?.sleepSoundNote ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, fourDiagnosisProfile: { ...(current.fourDiagnosisProfile ?? {}), sleepSoundNote: event.target.value } }))} placeholder="例如：鼾声多、夜里咳嗽、容易醒" />
            </label>
            <label className="form-field">
              <span>主要健康关注</span>
              <textarea rows={3} value={profileDraft.fourDiagnosisProfile?.mainConcern ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, fourDiagnosisProfile: { ...(current.fourDiagnosisProfile ?? {}), mainConcern: event.target.value } }))} placeholder="例如：减脂、睡眠恢复、脾胃、疲劳" />
            </label>
          </div>
          <div className="goal-selector">
            {profileGoalOptions.map((goal) => (
              <button
                className={profileDraft.goals.includes(goal.value) ? "mini-chip active" : "mini-chip"}
                key={goal.value}
                type="button"
                onClick={() => setProfileDraft((current) => ({
                  ...current,
                  goals: current.goals.includes(goal.value)
                    ? current.goals.filter((item) => item !== goal.value)
                    : [...current.goals, goal.value],
                }))}
              >
                {goal.label}
              </button>
            ))}
          </div>
          <div className="account-actions">
            <button className="action-button compact" type="button" onClick={saveCurrentProfile} disabled={profileSaving}>
              保存当前档案
            </button>
            <button className="ghost-button compact" type="button" onClick={createNewProfileFromDraft} disabled={profileSaving}>
              另存为新档案
            </button>
          </div>
        </Panel>
        </div>
        )}
        <Panel title="隐私设置">
          <AdviceLine icon={<ShieldCheck size={16} />} title="敏感数据分级" text="舌图、体检报告、排便、口气、原始聊天会标记为敏感数据。" />
          <AdviceLine icon={<LockKeyhole size={16} />} title="记忆范围" text="较早的记录会整理成摘要，减少不必要的敏感信息保留。" />
          <AdviceLine icon={<Database size={16} />} title="档案隔离" text="每个健康档案独立保存，切换档案后只查看对应记录。" />
        </Panel>
      </section>
      <section className="section-grid two">
        <Panel title="隐私确认">
          <p>健康建议需要结合你的睡眠、舌诊、饮食和问诊记录。你可以随时选择补充或停止记录。</p>
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => onSaveObservation({
              signalType: "privacy_ack",
              source: "manual",
              privacyLevel: "normal",
              confidence: 1,
              valueJson: { acknowledgedAt: new Date().toISOString(), profileId: activeProfile.id },
            })}
          >
            <CheckCircle2 size={15} />
            我已了解
          </button>
        </Panel>
        <Panel title="账号说明">
          <p>游客适合快速体验；邮箱账号适合换设备继续使用同一份健康档案和问诊记忆。</p>
        </Panel>
      </section>
    </>
  );
}

function TodayPage({
  onOpenConsult,
  onOpenDetect,
  report,
  signals,
  profileType,
}: {
  onOpenConsult: () => void;
  onOpenDetect: () => void;
  report: ReturnType<typeof buildDailyReport>;
  signals: (typeof mockDailySignals)[ProfileType];
  profileType: ProfileType;
}) {
  const completed = Object.values(report.fourDiagnosisCompletion).filter(Boolean).length;
  const snoreCount = signals.audioEvents.filter((event) => event.type === "snore").length;
  const coughCount = signals.audioEvents.filter((event) => event.type === "cough").length;
  const loudEvents = signals.audioEvents.filter((event) => event.intensity === "high").length;

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">今日状态 · 岐黄问诊助手</p>
          <h2>{report.oneSentenceAdvice}</h2>
          <p className="lead">{profileNotes[profileType]}</p>
          <div className="hero-action-row">
            <button className="action-button" type="button" onClick={onOpenConsult}>
              <Sparkles size={16} />
              问问岐黄助手
            </button>
            <button className="ghost-button" type="button" onClick={onOpenDetect}>
              <ClipboardList size={16} />
              补充健康记录
            </button>
          </div>
        </div>
        <div className="score-dial">
          <span>恢复分</span>
          <strong>{report.recoveryScore}</strong>
          <em>{statusLabels[report.status]}</em>
        </div>
      </section>

      <div className="card-grid">
        <MetricCard label="睡眠时长" value={`${signals.sleep.sleepDurationHours}h`} icon={<Moon size={18} />} />
        <MetricCard label="鼾声/咳嗽" value={`${snoreCount}/${coughCount}`} suffix={`高强度 ${loudEvents}`} icon={<Ear size={18} />} />
        <MetricCard label="四诊完成" value={`${completed}/4`} icon={<Sparkles size={18} />} />
      </div>

      <section className="section-grid two">
        <Panel title="昨晚闻诊摘要">
          <AdviceLine icon={<Moon size={16} />} title="睡眠观察" text={`${signals.sleep.sleepDurationHours} 小时，夜醒/起夜 ${signals.sleep.wakeCount} 次，醒后感受：${sleepFeelingLabel(signals.sleep.userSleepFeeling)}。`} />
          <AdviceLine icon={<Volume2 size={16} />} title="夜间声音" text={`共 ${signals.audioEvents.length} 段声音事件，打鼾 ${snoreCount} 段，咳嗽 ${coughCount} 段。`} />
          <AdviceLine icon={<ShieldCheck size={16} />} title="提醒" text="夜间声音只用于趋势观察，不能作为疾病诊断依据。" />
        </Panel>
        <Panel title="四诊完成度">
          <DiagnosisRow label="望" active={report.fourDiagnosisCompletion.wang} text="饮食、排便、舌苔" />
          <DiagnosisRow label="闻" active={report.fourDiagnosisCompletion.wen} text="夜间声音、口气反馈" />
          <DiagnosisRow label="问" active={report.fourDiagnosisCompletion.wenAsk} text="画像、醒后感受、饮食记录" />
          <DiagnosisRow label="切" active={report.fourDiagnosisCompletion.qie} text="心率、步数、运动状态" />
        </Panel>
      </section>
      <section className="section-grid two">
        <Panel title="今日三件事">
          <AdviceLine icon={<Utensils size={16} />} title="怎么吃" text={report.foodAdvice[0] ?? "保持清淡和稳定饮食。"} />
          <AdviceLine icon={<Activity size={16} />} title="怎么动" text={report.recoveryAdvice[0] ?? "维持低强度活动。"} />
          <AdviceLine icon={<Clock3 size={16} />} title="怎么恢复" text={report.riskNotice[0] ?? "今晚提前进入睡眠准备。"} />
        </Panel>
        <Panel title="问诊助手下一步">
          <p>岐黄问诊助手会读取当前档案、昨晚声音、舌诊/报告摘要和近 7 天记忆，再主动追问缺失信息。</p>
          <button className="action-button" type="button" onClick={onOpenConsult}>
            <Sparkles size={16} />
            开始问诊
          </button>
        </Panel>
      </section>
    </>
  );
}

function SleepPage({ events, onBack }: { events: SleepAudioEvent[]; onBack: () => void }) {
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
        text="回看整晚的声音片段，了解打鼾、咳嗽、起夜和环境噪声是否影响了今天的精神状态。"
        onBack={onBack}
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
              ? "当前为统计视图，你可以切换到录音片段查看具体时间。"
              : `共有 ${events.length} 个录音片段，可在下方列表回看。`}
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
  onBack,
}: {
  diet: DietSignal[];
  profileType: ProfileType;
  onSaveObservation: SaveObservation;
  onBack: () => void;
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
        note: "已记录图片名称和你的修正标签，便于后续回看。",
      },
    });
  }

  return (
    <>
      <PageTitle
        eyebrow="饮食记录"
        title="记录这一餐，帮你安排下一餐"
        text="拍照或手动记录都可以。热量只是参考，你可以随时修正识别结果。"
        onBack={onBack}
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

function DetectPage({
  onAnalyzeTongue,
  onOpenConsult,
  onSaveObservation,
  onSummarizeDocument,
  profileType,
  signals,
}: {
  onAnalyzeTongue: AnalyzeTongue;
  onOpenConsult: () => void;
  onSaveObservation: SaveObservation;
  onSummarizeDocument: (payload: HealthDocumentSummaryPayload) => Promise<HealthDocumentSummaryResult>;
  profileType: ProfileType;
  signals: DailySignals;
}) {
  const [mode, setMode] = useState<"overview" | "sleep" | "tongue" | "diet" | "document">("overview");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docDraft, setDocDraft] = useState({ description: "体检报告里有几项箭头指标，想整理重点并看看今天需要注意什么。", extractedText: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docSummary, setDocSummary] = useState("");
  const [docLoading, setDocLoading] = useState(false);

  async function handleDocFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setDocFile(file);
    if (!file) return;
    const text = await readTextFromFile(file);
    if (text) {
      setDocDraft((current) => ({ ...current, extractedText: text.slice(0, 5000) }));
    }
  }

  async function submitDocumentSummary() {
    if (!docFile) {
      setDocSummary("请先选择图片或 PDF。");
      return;
    }
    setDocLoading(true);
    try {
      const fileBase64 = await readFileAsBase64(docFile);
      const result = await onSummarizeDocument({
        date: signals.date,
        documentType: docFile.type.includes("pdf") ? "pdf" : "checkup_report",
        fileName: docFile.name,
        mimeType: docFile.type || "application/octet-stream",
        byteSize: docFile.size,
        userDescription: docDraft.description,
        extractedText: docDraft.extractedText || null,
        fileBase64,
        metadata: { entry: "detect_page" },
      });
      setDocSummary(result.summary);
    } catch {
      setDocSummary("暂时无法完成资料解读。你可以稍后重试，或重新上传更清晰的原图/PDF。");
    } finally {
      setDocLoading(false);
    }
  }

  function renderDocumentPanel() {
    return (
      <Panel title="健康资料解读">
        <input accept="image/*,.pdf" className="visually-hidden" onChange={handleDocFile} ref={fileRef} type="file" />
        <button className="ghost-button compact" type="button" onClick={() => fileRef.current?.click()}>
          <FileText size={15} />
          选择体检报告、舌图或健康资料
        </button>
        {docFile && <p className="subtle">已选择：{docFile.name}</p>}
        <label className="form-field">
          <span>想重点了解什么</span>
          <textarea rows={3} value={docDraft.description} onChange={(event) => setDocDraft((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label className="form-field">
          <span>资料补充</span>
          <textarea rows={4} value={docDraft.extractedText} onChange={(event) => setDocDraft((current) => ({ ...current, extractedText: event.target.value }))} placeholder="可选：拍摄日期、报告类型、近期睡眠/饮食/排便变化，或你最关心的问题" />
        </label>
        <div className="account-actions">
          <button className="action-button compact" type="button" onClick={submitDocumentSummary} disabled={docLoading}>
            <Sparkles size={16} />
            {docLoading ? "正在解读..." : "开始解读"}
          </button>
          <button className="ghost-button compact" type="button" onClick={onOpenConsult}>
            <ClipboardList size={15} />
            去问诊助手
          </button>
        </div>
        {docSummary && <p className="agent-answer">{docSummary}</p>}
      </Panel>
    );
  }

  if (mode === "sleep") return <SleepPage events={signals.audioEvents} onBack={() => setMode("overview")} />;
  if (mode === "tongue") return <SignalsPage signals={signals} onAnalyzeTongue={onAnalyzeTongue} onSaveObservation={onSaveObservation} onBack={() => setMode("overview")} />;
  if (mode === "diet") return <DietPage diet={signals.diet} profileType={profileType} onSaveObservation={onSaveObservation} onBack={() => setMode("overview")} />;
  if (mode === "document") {
    return (
      <>
        <PageTitle
          eyebrow="报告解读"
          title="把资料整理成可追问的健康线索"
          text="上传体检报告、舌图或健康图片后，系统会保存资料并生成摘要，后续可带到岐黄问诊助手继续追问。"
          onBack={() => setMode("overview")}
        />
        <section className="section-grid two">
          {renderDocumentPanel()}
          <Panel title="解读后怎么用">
            <AdviceLine icon={<FileText size={16} />} title="整理重点" text="先提取异常指标、图片线索和用户最关心的问题。" />
            <AdviceLine icon={<Moon size={16} />} title="关联睡眠" text="可继续让助手结合昨晚鼾声、咳嗽、夜醒和恢复建议一起解释。" />
            <AdviceLine icon={<Database size={16} />} title="保留依据" text="摘要会进入当前健康档案，便于报告和问诊助手引用。" />
          </Panel>
        </section>
      </>
    );
  }

  return (
    <>
      <PageTitle
        eyebrow="健康记录"
        title="把今天的健康线索记下来"
        text="上传舌图、查看夜间声音、记录饮食或整理体检报告，让建议更贴近你今天的状态。"
      />
      <section className="diagnosis-tabs detect-grid">
        {[
          { key: "tongue", title: "望诊", text: "舌图、饮食图、体检报告", icon: <Camera size={18} /> },
          { key: "sleep", title: "闻诊", text: "夜间声音、鼾声、咳嗽、起夜、口气", icon: <Ear size={18} /> },
          { key: "document", title: "报告解读", text: "整理重点指标、异常线索和追问建议", icon: <FileText size={18} /> },
          { key: "diet", title: "饮食记录", text: "拍照或手动记录一餐", icon: <Utensils size={18} /> },
        ].map((item) => (
          <button className="tab-card detect-card" key={item.key} type="button" onClick={() => setMode(item.key as typeof mode)}>
            {item.icon}
            <span>{item.title}</span>
            <em>{item.text}</em>
          </button>
        ))}
      </section>
      <section className="section-grid two">
        <Panel title="昨晚声音优先进入问诊">
          <AdviceLine icon={<Moon size={16} />} title="睡眠时长" text={`${signals.sleep.sleepDurationHours} 小时，${sleepQualityLabel(signals.sleep.sleepQuality)}。`} />
          <AdviceLine icon={<Ear size={16} />} title="闻诊证据" text={`夜间声音 ${signals.audioEvents.length} 段，数据来源包含 ${Array.from(new Set(signals.audioEvents.map((item) => sourceLabel(item.source)))).join(" / ")}。`} />
          <div className="account-actions">
            <button className="action-button compact" type="button" onClick={onOpenConsult}>带着昨晚声音去问诊</button>
            <button className="ghost-button compact" type="button" onClick={() => setMode("sleep")}>查看夜间声音详情</button>
          </div>
        </Panel>
        {renderDocumentPanel()}
      </section>
      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>体检报告、舌图和问诊记录都属于敏感信息。你可以随时只上传必要资料，并在“我的”里管理账号和档案。</span>
      </section>
    </>
  );
}

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  citations?: Array<Record<string, unknown>>;
};

function ConsultPage({
  identity,
  onOpenDetect,
  profile,
  report,
  signals,
}: {
  identity: GuestIdentity | null;
  onOpenDetect: () => void;
  profile: UserProfile;
  report: DailyReport;
  signals: DailySignals;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "我是岐黄问诊助手。我会结合你的档案、昨晚声音、舌诊/报告摘要和近 7 天记忆来解释趋势。你可以问：昨晚为什么醒来累？打鼾多今天怎么安排？",
    },
  ]);
  const [draft, setDraft] = useState("昨晚有点累，结合鼾声和舌诊，今天应该怎么调整？");
  const [loading, setLoading] = useState(false);
  const [contextSummary, setContextSummary] = useState("正在读取近 7 天记忆...");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const snoreCount = signals.audioEvents.filter((event) => event.type === "snore").length;
  const coughCount = signals.audioEvents.filter((event) => event.type === "cough").length;

  useEffect(() => {
    let active = true;
    getAgentContext(profile.id)
      .then((context) => {
        if (!active) return;
        const memory = typeof context.memory?.summary === "string" ? context.memory.summary : "暂无长期记忆，问诊后会自动更新 7 天摘要。";
        setContextSummary(memory);
      })
      .catch(() => {
        if (!active) return;
        setContextSummary("暂时无法读取历史摘要，你仍可以继续描述今天的情况。");
      });
    return () => {
      active = false;
    };
  }, [profile.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(message = draft) {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setLoading(true);
    try {
      const result: AgentMessageResult = await chatWithQihuangAgent(profile.id, trimmed, sessionId);
      setSessionId(result.sessionId);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.assistantMessage || result.answer || "我已经记录这次问诊，但暂时没有生成回复。",
          citations: result.citations,
        },
      ]);
      const memorySummary = typeof result.memory?.summary === "string" ? result.memory.summary : "";
      if (memorySummary) setContextSummary(memorySummary);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: "问诊助手暂时无法连接。你可以稍后再试；如果昨晚鼾声、夜醒或口干连续出现，今天先降低运动强度、清淡饮食，并观察是否持续。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadForChat(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessages((current) => [
      ...current,
      { id: `file-${Date.now()}`, role: "user", content: `上传文件：${file.name}，请结合问诊解释。` },
    ]);
    setLoading(true);
    try {
      const extractedText = await readTextFromFile(file);
      const fileBase64 = await readFileAsBase64(file);
      const result = await summarizeHealthDocument(profile.id, {
        date: signals.date,
        documentType: file.type.includes("pdf") ? "pdf" : "other_image",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        userDescription: "问诊聊天窗口上传的健康资料",
        extractedText: extractedText || null,
        fileBase64,
        metadata: { entry: "consult_page" },
      });
      setMessages((current) => [
        ...current,
        {
          id: `file-summary-${Date.now()}`,
          role: "assistant",
          content: result.summary,
          citations: result.citations,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: `file-error-${Date.now()}`, role: "assistant", content: "暂时无法读取这份文件。你可以稍后重试，或重新上传更清晰的原图/PDF。" },
      ]);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <section className="consult-shell">
        <aside className="consult-status-card">
          <p className="eyebrow">岐黄问诊助手</p>
          <h2>{profile.name}</h2>
          <span>{profile.age} 岁 · {profile.occupation}</span>
          <div className="consult-status-grid">
            <b>{signals.sleep.sleepDurationHours}h<em>睡眠</em></b>
            <b>{snoreCount}<em>鼾声</em></b>
            <b>{coughCount}<em>咳嗽</em></b>
            <b>{report.recoveryScore}<em>恢复分</em></b>
          </div>
          <p>{contextSummary}</p>
          <div className="identity-mini">
            <span>当前档案</span>
            <strong>{profile.name}</strong>
            <span>身份状态</span>
            <strong>{identity?.guestUserId ? "游客使用中" : "未同步"}</strong>
          </div>
        </aside>
        <section className="chat-panel">
          <div className="chat-head">
            <div>
              <strong>问诊对话</strong>
              <span>结合近期记录，持续记住你的健康重点</span>
            </div>
            <button className="ghost-button compact" type="button" onClick={onOpenDetect}>
              <ClipboardList size={15} />
              去记录
            </button>
          </div>
          <div className="quick-prompts">
            {["昨晚为什么醒来累？", "打鼾多今天怎么安排运动？", "舌苔偏干和口干有没有关系？"].map((item) => (
              <button key={item} type="button" onClick={() => sendMessage(item)}>{item}</button>
            ))}
          </div>
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((message) => (
              <article className={`chat-bubble ${message.role}`} key={message.id}>
                <p>{message.content}</p>
                {message.citations?.length ? (
                  <div className="citation-row">
                    {message.citations.slice(0, 3).map((item, index) => (
                      <span key={`${message.id}-${index}`}>{String(item.title ?? "知识卡")}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {loading && <article className="chat-bubble assistant"><p>正在读取档案、睡眠声音、知识卡和记忆...</p></article>}
          </div>
          <div className="chat-composer">
            <input accept="image/*,.pdf" className="visually-hidden" onChange={handleUploadForChat} ref={fileRef} type="file" />
            <button className="icon-button" type="button" onClick={() => fileRef.current?.click()} aria-label="上传健康文件">
              <FileText size={18} />
            </button>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} placeholder="描述症状、昨晚声音、舌图或体检报告..." />
            <button className="action-button compact" type="button" onClick={() => sendMessage()} disabled={loading}>
              发送
            </button>
          </div>
        </section>
      </section>
      <section className="privacy-strip">
        <ShieldCheck size={18} />
        <span>岐黄问诊助手只做健康管理建议。原始图片、PDF、音频属于敏感数据；长期记忆默认保存摘要，不保存原始敏感文件。</span>
      </section>
    </>
  );
}

function SignalsPage({
  onAnalyzeTongue,
  signals,
  onSaveObservation,
  onBack,
}: {
  onAnalyzeTongue: AnalyzeTongue;
  signals: DailySignals;
  onSaveObservation: SaveObservation;
  onBack: () => void;
}) {
  const tongueFileRef = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<"stool" | "tongue" | "breath" | null>(null);
  const [tongueUpload, setTongueUpload] = useState<TongueUpload | null>(null);
  const [showTongueReport, setShowTongueReport] = useState(false);
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
      setTongueAiError("暂时无法完成舌象解读，已保留当前舌象记录，可稍后再次测评。");
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
        onBack={onBack}
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
  const observations = [
    { label: "舌色", value: tongueColor(draft.tongueColor) },
    { label: "舌苔", value: coating(draft.coatingThickness) },
    { label: "湿润度", value: draft.moisture === "dry" ? "偏干" : draft.moisture === "wet" ? "偏湿" : "正常" },
  ];

  return (
    <section className="tongue-observation-card">
      <div className="panel-toolbar">
        <div>
          <p className="eyebrow">本次记录</p>
          <h3>舌象参考</h3>
        </div>
        <span className="api-badge">仅供日常观察</span>
      </div>
      <div className="tongue-observation-body">
        {upload ? <img alt="舌面上传预览" src={upload.url} /> : <div className="tongue-placeholder">舌</div>}
        <div className="tongue-observation-values">
          {observations.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="ai-analysis-box">
        <h3><Sparkles size={20} /> AI 观察说明</h3>
        {aiLoading && <p>正在整理这次舌象记录...</p>}
        {aiError && <p>{aiError}</p>}
        {!aiLoading && !aiError && aiText && aiText.split("\n").filter(Boolean).map((line) => <p key={line}>{line}</p>)}
        {!aiLoading && !aiError && !aiText && <p>已保存本次舌象标签。结合口干、饮食、排便和睡眠记录后，助手才能给出更有依据的生活建议。</p>}
      </div>
      <p className="subtle">舌象变化不能单独用于诊断疾病或判断体质；如有持续不适，请咨询专业医生。</p>
      <button className="ghost-button compact" type="button" onClick={onRetest}>重新记录</button>
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
        <Panel title="问问岐黄助手">
          <p>如果你想知道为什么这样建议，可以让岐黄助手结合睡眠、舌诊和饮食记录解释给你听。</p>
          <button className="action-button" type="button" onClick={onAskAgent}>
            <Sparkles size={16} />
            解释这份报告
          </button>
          {agentAnswer && <p className="agent-answer">{agentAnswer}</p>}
        </Panel>
      </section>
    </>
  );
}

function ArchitecturePage({ onBack }: { onBack: () => void }) {
  return (
    <>
      <PageTitle
        eyebrow="服务说明"
        title="SenseLoop 如何理解你的健康线索"
        text="SenseLoop 会把睡眠声音、舌图、饮食和问诊记录合在一起，生成日常健康管理建议。"
        onBack={onBack}
      />
      <section className="architecture-flow">
        <ArchStep icon={<Ear size={20} />} title="夜间声音" text="记录打鼾、咳嗽、起夜和环境噪声，帮助解释晨起疲惫。" />
        <ArchStep icon={<Home size={20} />} title="日常记录" text="补充饮食、排便、舌苔、口气和醒后感受。" />
        <ArchStep icon={<Database size={20} />} title="健康建议" text="结合近期变化，给出饮食、运动和恢复建议。" />
        <ArchStep icon={<Watch size={20} />} title="体征记录" text="心率、步数和运动状态可帮助判断恢复负荷。" />
      </section>
      <section className="section-grid two">
        <Panel title="你可以记录什么">
          <p>睡眠声音、舌图、饮食、排便、口气、体检报告和主观感受都可以作为健康线索。</p>
        </Panel>
        <Panel title="需要注意什么">
          <p>报告只用于日常健康管理，不替代医生诊断。若异常持续或明显不适，请及时就医。</p>
        </Panel>
      </section>
    </>
  );
}

function PageTitle({ eyebrow, title, text, onBack }: { eyebrow: string; title: string; text: string; onBack?: () => void }) {
  return (
    <section className="page-title">
      {onBack && (
        <button className="page-back-button" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回
        </button>
      )}
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

async function readTextFromFile(file: File) {
  const isTextLike =
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.type.includes("csv") ||
    /\.(txt|csv|json|md)$/i.test(file.name);
  if (!isTextLike) return "";
  try {
    return await file.text();
  } catch {
    return "";
  }
}

async function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("文件读取失败"));
        return;
      }
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
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
    mock: "样例",
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

function sleepFeelingLabel(value: SleepSignal["userSleepFeeling"]) {
  return { refreshed: "精神尚可", tired: "偏疲惫", very_tired: "明显疲惫" }[value];
}

function sleepQualityLabel(value: SleepSignal["sleepQuality"]) {
  return { good: "睡眠质量较好", fair: "睡眠质量一般", poor: "睡眠质量偏差" }[value];
}
