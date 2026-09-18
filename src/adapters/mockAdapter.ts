import { ProfileType } from "../domain/types";
import { mockDailySignals } from "../data/mockDailySignals";

export function getMockDailySignals(profileType: ProfileType) {
  return Promise.resolve(mockDailySignals[profileType]);
}
