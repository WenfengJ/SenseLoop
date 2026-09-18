export type ProfileType =
  | "weight_loss_female"
  | "elderly"
  | "office_worker"
  | "student"
  | "insomnia";

export type UserProfile = {
  id: string;
  name: string;
  profileType: ProfileType;
  age: number;
  gender: "female" | "male" | "other";
  occupation: string;
  goals: HealthGoal[];
  habits: UserHabit;
};

export type HealthGoal =
  | "sleep_recovery"
  | "weight_loss"
  | "elderly_care"
  | "focus_study"
  | "reduce_fatigue"
  | "digestive_health";

export type UserHabit = {
  coffee: "none" | "low" | "medium" | "high";
  lateNightSnack: boolean;
  sedentaryHours: number;
  exerciseFrequency: "low" | "medium" | "high";
  sleepProblem: "none" | "mild" | "moderate" | "severe";
};

export type SleepAudioEventType =
  | "snore"
  | "cough"
  | "breathing_noise"
  | "turn_over"
  | "wake_marker"
  | "get_up"
  | "ambient_noise"
  | "unknown";

export type SleepAudioEvent = {
  id: string;
  type: SleepAudioEventType;
  startMinute: number;
  durationSec: number;
  intensity: "low" | "medium" | "high";
  confidence: number;
  source: "mock" | "manual" | "soundcore_sdk" | "audio_model";
  note?: string;
};

export type SleepSignal = {
  sleepDurationHours: number;
  sleepQuality: "good" | "fair" | "poor";
  wakeCount: number;
  userSleepFeeling: "refreshed" | "tired" | "very_tired";
};

export type DietSignal = {
  id: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  foodName: string;
  foodTags: FoodTag[];
  portion: "small" | "medium" | "large" | "unknown";
  estimatedKcal: number;
  userAdjustedKcal?: number;
  confidence: number;
  source: "manual" | "photo_upload" | "mock" | "vision_model";
};

export type FoodTag =
  | "high_oil"
  | "high_sugar"
  | "high_protein"
  | "vegetable_rich"
  | "high_carb"
  | "spicy"
  | "cold_drink"
  | "late_night";

export type StoolSignal = {
  recorded: boolean;
  shape?: "hard_lump" | "sausage_cracked" | "normal" | "soft" | "loose" | "watery";
  color?: "brown" | "dark" | "yellow" | "green" | "red_flag" | "unknown";
  dryness?: "dry" | "normal" | "wet";
  frequencyToday?: number;
  source: "manual" | "photo_upload" | "mock";
};

export type TongueSignal = {
  recorded: boolean;
  tongueColor?: "pale" | "pink" | "red" | "dark_red" | "unknown";
  coatingThickness?: "thin" | "normal" | "thick" | "none" | "unknown";
  moisture?: "dry" | "normal" | "wet";
  marks?: ("teeth_marks" | "cracks" | "spots")[];
  photoQuality?: "good" | "low_light" | "blurred" | "color_uncertain";
  source: "manual" | "photo_upload" | "mock";
};

export type BreathSignal = {
  level: "none" | "mild" | "obvious" | "unknown";
  dryMouth: boolean;
  bitterTaste: boolean;
  source: "manual" | "mock" | "future_sensor";
};

export type VitalSignal = {
  heartRateResting?: number;
  steps?: number;
  exerciseMinutes?: number;
  source: "manual" | "mock" | "future_wearable";
};

export type DailySignals = {
  date: string;
  profileId: string;
  sleep: SleepSignal;
  audioEvents: SleepAudioEvent[];
  diet: DietSignal[];
  stool: StoolSignal;
  tongue: TongueSignal;
  breath: BreathSignal;
  vitals: VitalSignal;
};

export type KnowledgeRule = {
  id: string;
  category: "sleep" | "diet" | "stool" | "tongue" | "breath" | "exercise" | "risk";
  appliesTo: ProfileType[] | "all";
  priority: "low" | "medium" | "high";
  statusHint?: string;
  foodAdvice?: string[];
  recoveryAdvice?: string[];
  riskNotice?: string[];
};

export type DailyReport = {
  id: string;
  date: string;
  profileId: string;
  title: string;
  status: "stable" | "recovery_needed" | "observe";
  recoveryScore: number;
  oneSentenceAdvice: string;
  nightAudioSummary: string[];
  bodyStatusHints: string[];
  foodAdvice: string[];
  recoveryAdvice: string[];
  riskNotice: string[];
  fourDiagnosisCompletion: {
    wang: boolean;
    wen: boolean;
    wenAsk: boolean;
    qie: boolean;
  };
  evidenceTags: string[];
};
