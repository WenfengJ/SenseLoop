import { DailySignals, ProfileType } from "../domain/types";
import { mockProfiles } from "./mockProfiles";
import { mockSleepEvents } from "./mockSleepEvents";

const profileId = (type: ProfileType) => mockProfiles.find((profile) => profile.profileType === type)!.id;

export const mockDailySignals: Record<ProfileType, DailySignals> = {
  weight_loss_female: {
    date: "2026-09-18",
    profileId: profileId("weight_loss_female"),
    sleep: { sleepDurationHours: 6.4, sleepQuality: "fair", wakeCount: 2, userSleepFeeling: "tired" },
    audioEvents: mockSleepEvents.weight_loss_female,
    diet: [{ id: "diet-w1", mealType: "dinner", foodName: "鸡腿饭", foodTags: ["high_carb", "high_oil"], portion: "medium", estimatedKcal: 720, confidence: 0.72, source: "mock" }],
    stool: { recorded: true, shape: "sausage_cracked", color: "brown", dryness: "dry", frequencyToday: 1, source: "manual" },
    tongue: { recorded: true, tongueColor: "red", coatingThickness: "thick", moisture: "dry", photoQuality: "good", source: "mock" },
    breath: { level: "mild", dryMouth: true, bitterTaste: false, source: "manual" },
    vitals: { heartRateResting: 72, steps: 6200, exerciseMinutes: 18, source: "mock" },
  },
  elderly: {
    date: "2026-09-18",
    profileId: profileId("elderly"),
    sleep: { sleepDurationHours: 6.8, sleepQuality: "poor", wakeCount: 3, userSleepFeeling: "tired" },
    audioEvents: mockSleepEvents.elderly,
    diet: [{ id: "diet-e1", mealType: "dinner", foodName: "咸粥和小菜", foodTags: ["high_carb"], portion: "small", estimatedKcal: 480, confidence: 0.65, source: "mock" }],
    stool: { recorded: true, shape: "normal", color: "brown", dryness: "normal", frequencyToday: 1, source: "manual" },
    tongue: { recorded: true, tongueColor: "pale", coatingThickness: "thin", moisture: "dry", photoQuality: "good", source: "mock" },
    breath: { level: "mild", dryMouth: true, bitterTaste: false, source: "manual" },
    vitals: { heartRateResting: 78, steps: 3600, exerciseMinutes: 12, source: "mock" },
  },
  office_worker: {
    date: "2026-09-18",
    profileId: profileId("office_worker"),
    sleep: { sleepDurationHours: 5.3, sleepQuality: "poor", wakeCount: 3, userSleepFeeling: "very_tired" },
    audioEvents: mockSleepEvents.office_worker,
    diet: [{ id: "diet-o1", mealType: "snack", foodName: "夜宵烧烤", foodTags: ["high_oil", "spicy", "late_night"], portion: "large", estimatedKcal: 980, confidence: 0.7, source: "mock" }],
    stool: { recorded: true, shape: "hard_lump", color: "brown", dryness: "dry", frequencyToday: 0, source: "manual" },
    tongue: { recorded: true, tongueColor: "red", coatingThickness: "thick", moisture: "dry", marks: ["teeth_marks"], photoQuality: "good", source: "mock" },
    breath: { level: "obvious", dryMouth: true, bitterTaste: true, source: "manual" },
    vitals: { heartRateResting: 82, steps: 4200, exerciseMinutes: 0, source: "mock" },
  },
  student: {
    date: "2026-09-18",
    profileId: profileId("student"),
    sleep: { sleepDurationHours: 6.1, sleepQuality: "fair", wakeCount: 1, userSleepFeeling: "tired" },
    audioEvents: mockSleepEvents.student,
    diet: [{ id: "diet-s1", mealType: "breakfast", foodName: "奶茶和面包", foodTags: ["high_sugar", "high_carb"], portion: "medium", estimatedKcal: 530, confidence: 0.68, source: "mock" }],
    stool: { recorded: false, source: "manual" },
    tongue: { recorded: false, source: "mock" },
    breath: { level: "none", dryMouth: false, bitterTaste: false, source: "manual" },
    vitals: { steps: 5100, exerciseMinutes: 8, source: "mock" },
  },
  insomnia: {
    date: "2026-09-18",
    profileId: profileId("insomnia"),
    sleep: { sleepDurationHours: 4.7, sleepQuality: "poor", wakeCount: 4, userSleepFeeling: "very_tired" },
    audioEvents: mockSleepEvents.insomnia,
    diet: [{ id: "diet-i1", mealType: "dinner", foodName: "清淡晚餐", foodTags: ["vegetable_rich"], portion: "medium", estimatedKcal: 520, confidence: 0.76, source: "mock" }],
    stool: { recorded: true, shape: "normal", color: "brown", dryness: "normal", frequencyToday: 1, source: "manual" },
    tongue: { recorded: true, tongueColor: "pink", coatingThickness: "normal", moisture: "normal", photoQuality: "good", source: "mock" },
    breath: { level: "none", dryMouth: false, bitterTaste: false, source: "manual" },
    vitals: { heartRateResting: 76, steps: 3000, exerciseMinutes: 0, source: "mock" },
  },
};
