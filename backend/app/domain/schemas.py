from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ProfileType = Literal["weight_loss_female", "elderly", "office_worker", "student", "insomnia"]


class UserHabit(BaseModel):
    coffee: Literal["none", "low", "medium", "high"]
    lateNightSnack: bool
    sedentaryHours: float
    exerciseFrequency: Literal["low", "medium", "high"]
    sleepProblem: Literal["none", "mild", "moderate", "severe"]


class UserProfile(BaseModel):
    id: str
    name: str
    profileType: ProfileType
    age: int
    gender: Literal["female", "male", "other"]
    occupation: str
    goals: list[str]
    habits: UserHabit


class SleepAudioEvent(BaseModel):
    id: str
    type: str
    startMinute: int
    durationSec: int
    intensity: Literal["low", "medium", "high"]
    confidence: float
    source: Literal["mock", "manual", "soundcore_sdk", "audio_model"]
    note: str | None = None


class SleepSignal(BaseModel):
    sleepDurationHours: float
    sleepQuality: Literal["good", "fair", "poor"]
    wakeCount: int
    userSleepFeeling: Literal["refreshed", "tired", "very_tired"]


class DietSignal(BaseModel):
    id: str
    mealType: Literal["breakfast", "lunch", "dinner", "snack"]
    foodName: str
    foodTags: list[str]
    portion: Literal["small", "medium", "large", "unknown"]
    estimatedKcal: int
    userAdjustedKcal: int | None = None
    confidence: float
    source: Literal["manual", "photo_upload", "mock", "vision_model"]


class StoolSignal(BaseModel):
    recorded: bool
    shape: str | None = None
    color: str | None = None
    dryness: str | None = None
    frequencyToday: int | None = None
    source: Literal["manual", "photo_upload", "mock"]


class TongueSignal(BaseModel):
    recorded: bool
    tongueColor: str | None = None
    coatingThickness: str | None = None
    moisture: str | None = None
    marks: list[str] = Field(default_factory=list)
    photoQuality: str | None = None
    source: Literal["manual", "photo_upload", "mock"]


class BreathSignal(BaseModel):
    level: Literal["none", "mild", "obvious", "unknown"]
    dryMouth: bool
    bitterTaste: bool
    source: Literal["manual", "mock", "future_sensor"]


class VitalSignal(BaseModel):
    heartRateResting: int | None = None
    steps: int | None = None
    exerciseMinutes: int | None = None
    source: Literal["manual", "mock", "future_wearable"]


class DailySignals(BaseModel):
    date: str
    profileId: str
    sleep: SleepSignal
    audioEvents: list[SleepAudioEvent]
    diet: list[DietSignal]
    stool: StoolSignal
    tongue: TongueSignal
    breath: BreathSignal
    vitals: VitalSignal


class FourDiagnosisCompletion(BaseModel):
    wang: bool
    wen: bool
    wenAsk: bool
    qie: bool


class DailyReport(BaseModel):
    id: str
    date: str
    profileId: str
    title: str
    status: Literal["stable", "recovery_needed", "observe"]
    recoveryScore: int
    oneSentenceAdvice: str
    nightAudioSummary: list[str]
    bodyStatusHints: list[str]
    foodAdvice: list[str]
    recoveryAdvice: list[str]
    riskNotice: list[str]
    fourDiagnosisCompletion: FourDiagnosisCompletion
    evidenceTags: list[str]


class SignalObservationCreate(BaseModel):
    signalType: str
    valueJson: dict[str, Any]
    source: str = "manual"
    confidence: float | None = None
    privacyLevel: Literal["normal", "sensitive"] = "normal"


class KnowledgeSourceCreate(BaseModel):
    sourceType: str
    title: str
    author: str | None = None
    sourceUri: str | None = None
    version: str = "v1"
    language: str = "zh-CN"
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeSearchRequest(BaseModel):
    query: str
    sourceTypes: list[str] = Field(default_factory=list)
    topK: int = 5
    profileType: ProfileType | None = None


class AgentSessionCreate(BaseModel):
    profileId: str
    sessionType: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentMessageCreate(BaseModel):
    message: str
    useRag: bool = True
    allowedTools: list[str] = Field(default_factory=list)


class DbStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool
    url: str | None
    profileCount: int | None = None
    vectorReady: bool | None = None
