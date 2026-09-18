import { sleepEventLabels } from "../domain/labels";
import { DailyReport, DailySignals, KnowledgeRule, UserProfile } from "../domain/types";
import { matchRules } from "./recommendationEngine";

type BuildReportInput = {
  profile: UserProfile;
  signals: DailySignals;
  rules: KnowledgeRule[];
};

export function buildDailyReport({ profile, signals, rules }: BuildReportInput): DailyReport {
  const matchedRules = matchRules(profile, signals, rules);
  const foodAdvice = unique(matchedRules.flatMap((rule) => rule.foodAdvice ?? []));
  const recoveryAdvice = unique(matchedRules.flatMap((rule) => rule.recoveryAdvice ?? []));
  const riskNotice = unique(matchedRules.flatMap((rule) => rule.riskNotice ?? []));
  const recoveryScore = calculateRecoveryScore(signals);
  const status = recoveryScore < 65 ? "observe" : recoveryScore < 78 ? "recovery_needed" : "stable";

  return {
    id: `report-${profile.profileType}-${signals.date}`,
    date: signals.date,
    profileId: profile.id,
    title: `${profile.name} · 每日健康建议`,
    status,
    recoveryScore,
    oneSentenceAdvice: buildOneSentence(profile.profileType, status),
    nightAudioSummary: buildAudioSummary(signals),
    bodyStatusHints: unique(matchedRules.map((rule) => rule.statusHint).filter(Boolean) as string[]),
    foodAdvice,
    recoveryAdvice,
    riskNotice,
    fourDiagnosisCompletion: {
      wang: signals.diet.length > 0 || signals.stool.recorded || signals.tongue.recorded,
      wen: signals.audioEvents.length > 0 || signals.breath.level !== "unknown",
      wenAsk: true,
      qie: Boolean(signals.vitals.heartRateResting || signals.vitals.steps),
    },
    evidenceTags: signals.audioEvents.map((event) => sleepEventLabels[event.type]),
  };
}

function calculateRecoveryScore(signals: DailySignals) {
  let score = 88;
  if (signals.sleep.sleepQuality === "fair") score -= 10;
  if (signals.sleep.sleepQuality === "poor") score -= 20;
  score -= Math.min(signals.sleep.wakeCount * 4, 16);
  score -= signals.audioEvents.filter((event) => event.intensity === "high").length * 5;
  if (signals.stool.dryness === "dry") score -= 5;
  return Math.max(45, Math.min(96, score));
}

function buildAudioSummary(signals: DailySignals) {
  const counts = signals.audioEvents.reduce<Record<string, number>>((acc, event) => {
    const label = sleepEventLabels[event.type];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([label, count]) => `${label} ${count} 次`);
}

function buildOneSentence(profileType: UserProfile["profileType"], status: DailyReport["status"]) {
  if (profileType === "weight_loss_female") return "今天适合轻控热量，不适合硬扛高强度训练。";
  if (profileType === "elderly") return "昨夜起夜和咳嗽需要关注，今天以清淡饮食和低强度活动为主。";
  if (profileType === "office_worker") return "昨晚恢复不足，今天先减轻肠胃负担，再做低强度恢复。";
  if (profileType === "student") return "今天优先补能量、稳专注，不建议靠高糖饮料硬撑。";
  if (profileType === "insomnia") return "今天重点不是补很多觉，而是重新建立稳定睡眠节律。";
  return status === "stable" ? "今天状态稳定，保持当前节奏。" : "今天更适合恢复和观察。";
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}
