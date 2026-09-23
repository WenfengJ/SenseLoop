import json

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType


class Vector1536(UserDefinedType):
    cache_ok = True

    def get_col_spec(self, **kw):
        return "vector(1536)"

    def bind_processor(self, dialect):
        def process(value):
            if value is None:
                return None
            if dialect.name == "postgresql":
                return "[" + ",".join(str(item) for item in value) + "]"
            return json.dumps(value)

        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            if value is None or isinstance(value, list):
                return value
            if isinstance(value, str):
                if dialect.name == "postgresql":
                    inner = value.strip().strip("[]")
                    return [float(item.strip()) for item in inner.split(",") if item.strip()]
                return json.loads(value)
            return value

        return process


@compiles(Vector1536, "sqlite")
def _compile_vector_sqlite(type_, compiler, **kw):
    return "JSON"


class Base(DeclarativeBase):
    pass


class UserProfileTable(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    profile_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str] = mapped_column(String, nullable=False)
    occupation: Mapped[str] = mapped_column(String, nullable=False)
    coffee: Mapped[str] = mapped_column(String, nullable=False)
    late_night_snack: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sedentary_hours: Mapped[float] = mapped_column(Float, nullable=False)
    exercise_frequency: Mapped[str] = mapped_column(String, nullable=False)
    sleep_problem: Mapped[str] = mapped_column(String, nullable=False)
    risk_preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    goals: Mapped[list["ProfileGoalTable"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    signal_days: Mapped[list["DailySignalDayTable"]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class ProfileGoalTable(Base):
    __tablename__ = "profile_goals"

    profile_id: Mapped[str] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), primary_key=True)
    goal: Mapped[str] = mapped_column(String, primary_key=True)

    profile: Mapped[UserProfileTable] = relationship(back_populates="goals")


class DailySignalDayTable(Base):
    __tablename__ = "daily_signal_days"
    __table_args__ = (UniqueConstraint("profile_id", "signal_date", name="uq_profile_signal_date"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    signal_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String, default="mock", nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    profile: Mapped[UserProfileTable] = relationship(back_populates="signal_days")
    sleep: Mapped["SleepSignalTable"] = relationship(back_populates="day", cascade="all, delete-orphan")
    audio_events: Mapped[list["SleepAudioEventTable"]] = relationship(back_populates="day", cascade="all, delete-orphan")
    diet_records: Mapped[list["DietRecordTable"]] = relationship(back_populates="day", cascade="all, delete-orphan")
    stool: Mapped["StoolRecordTable"] = relationship(back_populates="day", cascade="all, delete-orphan")
    tongue: Mapped["TongueRecordTable"] = relationship(back_populates="day", cascade="all, delete-orphan")
    breath: Mapped["BreathRecordTable"] = relationship(back_populates="day", cascade="all, delete-orphan")
    vitals: Mapped["VitalRecordTable"] = relationship(back_populates="day", cascade="all, delete-orphan")


class SleepSignalTable(Base):
    __tablename__ = "sleep_signals"

    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), primary_key=True)
    sleep_duration_hours: Mapped[float] = mapped_column(Float, nullable=False)
    sleep_quality: Mapped[str] = mapped_column(String, nullable=False)
    wake_count: Mapped[int] = mapped_column(Integer, nullable=False)
    user_sleep_feeling: Mapped[str] = mapped_column(String, nullable=False)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="sleep")


class SleepAudioEventTable(Base):
    __tablename__ = "sleep_audio_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    intensity: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text)
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="audio_events")


class DietRecordTable(Base):
    __tablename__ = "diet_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(String, nullable=False)
    food_name: Mapped[str] = mapped_column(String, nullable=False)
    food_tags: Mapped[list] = mapped_column(JSON, default=list)
    portion: Mapped[str] = mapped_column(String, nullable=False)
    estimated_kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    user_adjusted_kcal: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    media_asset_id: Mapped[str | None] = mapped_column(String)
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="diet_records")


class StoolRecordTable(Base):
    __tablename__ = "stool_records"

    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), primary_key=True)
    recorded: Mapped[bool] = mapped_column(Boolean, nullable=False)
    shape: Mapped[str | None] = mapped_column(String)
    color: Mapped[str | None] = mapped_column(String)
    dryness: Mapped[str | None] = mapped_column(String)
    frequency_today: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String, nullable=False)
    privacy_level: Mapped[str] = mapped_column(String, default="sensitive", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="stool")


class TongueRecordTable(Base):
    __tablename__ = "tongue_records"

    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), primary_key=True)
    recorded: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tongue_color: Mapped[str | None] = mapped_column(String)
    coating_thickness: Mapped[str | None] = mapped_column(String)
    moisture: Mapped[str | None] = mapped_column(String)
    marks: Mapped[list] = mapped_column(JSON, default=list)
    photo_quality: Mapped[str | None] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, nullable=False)
    media_asset_id: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="tongue")


class BreathRecordTable(Base):
    __tablename__ = "breath_records"

    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[str] = mapped_column(String, nullable=False)
    dry_mouth: Mapped[bool] = mapped_column(Boolean, nullable=False)
    bitter_taste: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="breath")


class VitalRecordTable(Base):
    __tablename__ = "vital_records"

    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), primary_key=True)
    heart_rate_resting: Mapped[int | None] = mapped_column(Integer)
    steps: Mapped[int | None] = mapped_column(Integer)
    exercise_minutes: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String, nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    day: Mapped[DailySignalDayTable] = relationship(back_populates="vitals")


class SignalObservationTable(Base):
    __tablename__ = "signal_observations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    day_id: Mapped[str] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    signal_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    source: Mapped[str] = mapped_column(String, default="manual", nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    privacy_level: Mapped[str] = mapped_column(String, default="normal", nullable=False)


class MediaAssetTable(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_id: Mapped[str | None] = mapped_column(ForeignKey("user_profiles.id", ondelete="SET NULL"), index=True)
    day_id: Mapped[str | None] = mapped_column(ForeignKey("daily_signal_days.id", ondelete="SET NULL"), index=True)
    media_type: Mapped[str] = mapped_column(String, nullable=False)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    privacy_level: Mapped[str] = mapped_column(String, default="normal", nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))


class KnowledgeSourceTable(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[str | None] = mapped_column(String)
    source_uri: Mapped[str | None] = mapped_column(String)
    version: Mapped[str] = mapped_column(String, default="v1", nullable=False)
    language: Mapped[str] = mapped_column(String, default="zh-CN", nullable=False)
    review_status: Mapped[str] = mapped_column(String, default="draft", nullable=False, index=True)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)


class KnowledgeChunkTable(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (UniqueConstraint("source_id", "chunk_index", name="uq_source_chunk_index"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    applies_to: Mapped[list] = mapped_column(JSON, default=list)
    safety_level: Mapped[str] = mapped_column(String, default="normal", nullable=False)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding: Mapped[list | None] = mapped_column(Vector1536)


class AgentSessionTable(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    session_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="running", nullable=False)
    model_name: Mapped[str | None] = mapped_column(String)
    system_prompt_version: Mapped[str | None] = mapped_column(String)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))


class AgentMessageTable(Base):
    __tablename__ = "agent_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    extra_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentToolCallTable(Base):
    __tablename__ = "agent_tool_calls"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))


class RagRetrievalLogTable(Base):
    __tablename__ = "rag_retrieval_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("agent_sessions.id", ondelete="SET NULL"), index=True)
    report_id: Mapped[str | None] = mapped_column(String, index=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_id: Mapped[str] = mapped_column(ForeignKey("knowledge_chunks.id", ondelete="CASCADE"), nullable=False, index=True)
    score: Mapped[float | None] = mapped_column(Float)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    used_in_answer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
