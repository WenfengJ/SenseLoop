import { ProfileType, SleepAudioEvent } from "../domain/types";

export const mockSleepEvents: Record<ProfileType, SleepAudioEvent[]> = {
  weight_loss_female: [
    { id: "w1", type: "turn_over", startMinute: 82, durationSec: 8, intensity: "medium", confidence: 0.76, source: "mock" },
    { id: "w2", type: "cough", startMinute: 146, durationSec: 4, intensity: "low", confidence: 0.7, source: "mock" },
    { id: "w3", type: "snore", startMinute: 224, durationSec: 48, intensity: "low", confidence: 0.74, source: "mock" },
  ],
  elderly: [
    { id: "e1", type: "cough", startMinute: 92, durationSec: 6, intensity: "medium", confidence: 0.82, source: "mock" },
    { id: "e2", type: "get_up", startMinute: 181, durationSec: 120, intensity: "medium", confidence: 0.8, source: "mock" },
    { id: "e3", type: "cough", startMinute: 263, durationSec: 5, intensity: "medium", confidence: 0.78, source: "mock" },
    { id: "e4", type: "wake_marker", startMinute: 308, durationSec: 1, intensity: "low", confidence: 1, source: "mock" },
  ],
  office_worker: [
    { id: "o1", type: "ambient_noise", startMinute: 41, durationSec: 260, intensity: "high", confidence: 0.85, source: "mock" },
    { id: "o2", type: "turn_over", startMinute: 124, durationSec: 12, intensity: "medium", confidence: 0.72, source: "mock" },
    { id: "o3", type: "snore", startMinute: 249, durationSec: 62, intensity: "medium", confidence: 0.8, source: "mock" },
  ],
  student: [
    { id: "s1", type: "ambient_noise", startMinute: 65, durationSec: 300, intensity: "medium", confidence: 0.74, source: "mock" },
    { id: "s2", type: "turn_over", startMinute: 170, durationSec: 10, intensity: "low", confidence: 0.68, source: "mock" },
  ],
  insomnia: [
    { id: "i1", type: "wake_marker", startMinute: 58, durationSec: 1, intensity: "low", confidence: 1, source: "mock" },
    { id: "i2", type: "turn_over", startMinute: 143, durationSec: 11, intensity: "medium", confidence: 0.72, source: "mock" },
    { id: "i3", type: "ambient_noise", startMinute: 196, durationSec: 180, intensity: "medium", confidence: 0.77, source: "mock" },
    { id: "i4", type: "wake_marker", startMinute: 244, durationSec: 1, intensity: "low", confidence: 1, source: "mock" },
  ],
};
