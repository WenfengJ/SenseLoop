import { DailySignals, KnowledgeRule, UserProfile } from "../domain/types";

export function matchRules(profile: UserProfile, _signals: DailySignals, rules: KnowledgeRule[]) {
  return rules.filter((rule) => rule.appliesTo === "all" || rule.appliesTo.includes(profile.profileType));
}
