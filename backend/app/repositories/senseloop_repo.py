from datetime import date
from uuid import uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.models.tables import (
    AgentMessageTable,
    AgentSessionTable,
    BreathRecordTable,
    DailySignalDayTable,
    DietRecordTable,
    KnowledgeChunkTable,
    KnowledgeSourceTable,
    ProfileGoalTable,
    SignalObservationTable,
    SleepAudioEventTable,
    SleepSignalTable,
    StoolRecordTable,
    TongueRecordTable,
    UserProfileTable,
    VitalRecordTable,
)


def seed_demo_data(session: Session) -> None:
    if session.scalar(select(func.count(UserProfileTable.id))):
        return
    for profile in PROFILES:
        profile_row = UserProfileTable(
            id=profile["id"],
            name=profile["name"],
            profile_type=profile["profileType"],
            age=profile["age"],
            gender=profile["gender"],
            occupation=profile["occupation"],
            coffee=profile["habits"]["coffee"],
            late_night_snack=profile["habits"]["lateNightSnack"],
            sedentary_hours=profile["habits"]["sedentaryHours"],
            exercise_frequency=profile["habits"]["exerciseFrequency"],
            sleep_problem=profile["habits"]["sleepProblem"],
            goals=[ProfileGoalTable(goal=goal) for goal in profile["goals"]],
        )
        session.add(profile_row)
        _insert_signals(session, profile_row, MOCK_SIGNALS[profile["profileType"]])
    session.commit()


def list_profiles(session: Session) -> list[dict]:
    return [_profile_to_dict(profile) for profile in session.scalars(_profile_query().order_by(UserProfileTable.id)).all()]


def get_profile_by_type(session: Session, profile_type: str) -> dict | None:
    row = session.scalar(_profile_query().where(UserProfileTable.profile_type == profile_type))
    return _profile_to_dict(row) if row else None


def get_profile_by_id(session: Session, profile_id: str) -> dict | None:
    row = session.scalar(_profile_query().where(UserProfileTable.id == profile_id))
    return _profile_to_dict(row) if row else None


def get_signals_by_profile_type(session: Session, profile_type: str) -> dict | None:
    profile = session.scalar(select(UserProfileTable).where(UserProfileTable.profile_type == profile_type))
    if profile is None:
        return None
    return get_signals_by_profile_id(session, profile.id)


def get_signals_by_profile_id(session: Session, profile_id: str, signal_date: str | None = None) -> dict | None:
    statement = _day_query().where(DailySignalDayTable.profile_id == profile_id).order_by(DailySignalDayTable.signal_date.desc())
    if signal_date:
        statement = statement.where(DailySignalDayTable.signal_date == date.fromisoformat(signal_date))
    row = session.scalar(statement.limit(1))
    return _day_to_signals(row) if row else None


def create_observation(session: Session, profile_id: str, signal_date: str, payload: dict) -> dict:
    day = _get_or_create_day(session, profile_id, signal_date)
    row = SignalObservationTable(
        id=str(uuid4()),
        day_id=day.id,
        profile_id=profile_id,
        signal_type=payload["signalType"],
        value_json=payload["valueJson"],
        source=payload.get("source", "manual"),
        confidence=payload.get("confidence"),
        privacy_level=payload.get("privacyLevel", "normal"),
    )
    session.add(row)
    session.commit()
    return {
        "id": row.id,
        "signalType": row.signal_type,
        "valueJson": row.value_json,
        "source": row.source,
        "confidence": row.confidence,
        "privacyLevel": row.privacy_level,
    }


def list_observations(session: Session, profile_id: str, signal_date: str, signal_type: str | None = None) -> list[dict]:
    day = session.scalar(
        select(DailySignalDayTable).where(
            DailySignalDayTable.profile_id == profile_id,
            DailySignalDayTable.signal_date == date.fromisoformat(signal_date),
        )
    )
    if not day:
        return []
    statement = select(SignalObservationTable).where(SignalObservationTable.day_id == day.id)
    if signal_type:
        statement = statement.where(SignalObservationTable.signal_type == signal_type)
    return [
        {
            "id": row.id,
            "signalType": row.signal_type,
            "valueJson": row.value_json,
            "source": row.source,
            "confidence": row.confidence,
            "privacyLevel": row.privacy_level,
        }
        for row in session.scalars(statement.order_by(SignalObservationTable.signal_type)).all()
    ]


def create_knowledge_source(session: Session, payload: dict) -> dict:
    row = KnowledgeSourceTable(
        id=str(uuid4()),
        source_type=payload["sourceType"],
        title=payload["title"],
        author=payload.get("author"),
        source_uri=payload.get("sourceUri"),
        version=payload.get("version", "v1"),
        language=payload.get("language", "zh-CN"),
        extra_metadata=payload.get("metadata", {}),
    )
    session.add(row)
    session.commit()
    return _knowledge_source_to_dict(row)


def search_knowledge(session: Session, query: str, source_types: list[str], top_k: int) -> list[dict]:
    statement = select(KnowledgeChunkTable, KnowledgeSourceTable).join(
        KnowledgeSourceTable, KnowledgeChunkTable.source_id == KnowledgeSourceTable.id
    )
    if source_types:
        statement = statement.where(KnowledgeSourceTable.source_type.in_(source_types))
    # Lightweight fallback search before embedding retrieval is wired.
    statement = statement.where(KnowledgeChunkTable.content.contains(query[:20])).limit(top_k)
    return [
        {
            "chunkId": chunk.id,
            "sourceId": source.id,
            "title": source.title,
            "content": chunk.content,
            "score": None,
            "safetyLevel": chunk.safety_level,
        }
        for chunk, source in session.execute(statement).all()
    ]


def create_agent_session(session: Session, payload: dict) -> dict:
    row = AgentSessionTable(
        id=str(uuid4()),
        profile_id=payload["profileId"],
        session_type=payload["sessionType"],
        extra_metadata=payload.get("metadata", {}),
    )
    session.add(row)
    session.commit()
    return {"id": row.id, "profileId": row.profile_id, "sessionType": row.session_type, "status": row.status}


def add_agent_message(session: Session, session_id: str, message: str) -> dict:
    row = AgentMessageTable(id=str(uuid4()), session_id=session_id, role="user", content=message)
    session.add(row)
    session.commit()
    return {
        "answer": "Agent 会话已记录。RAG 检索和工具调用会在下一阶段接入。",
        "citations": [],
        "toolCalls": [{"toolName": "persist_agent_message", "status": "succeeded"}],
    }


def count_profiles(session: Session) -> int:
    return session.scalar(select(func.count(UserProfileTable.id))) or 0


def _profile_query() -> Select:
    return select(UserProfileTable).options(selectinload(UserProfileTable.goals))


def _day_query() -> Select:
    return select(DailySignalDayTable).options(
        selectinload(DailySignalDayTable.sleep),
        selectinload(DailySignalDayTable.audio_events),
        selectinload(DailySignalDayTable.diet_records),
        selectinload(DailySignalDayTable.stool),
        selectinload(DailySignalDayTable.tongue),
        selectinload(DailySignalDayTable.breath),
        selectinload(DailySignalDayTable.vitals),
    )


def _insert_signals(session: Session, profile: UserProfileTable, signals: dict) -> None:
    day = DailySignalDayTable(
        id=f"day-{profile.profile_type}-{signals['date']}",
        profile_id=profile.id,
        signal_date=date.fromisoformat(signals["date"]),
        source="mock",
    )
    session.add(day)
    sleep = signals["sleep"]
    session.add(
        SleepSignalTable(
            day=day,
            sleep_duration_hours=sleep["sleepDurationHours"],
            sleep_quality=sleep["sleepQuality"],
            wake_count=sleep["wakeCount"],
            user_sleep_feeling=sleep["userSleepFeeling"],
        )
    )
    for event in signals["audioEvents"]:
        session.add(
            SleepAudioEventTable(
                id=event["id"],
                day=day,
                type=event["type"],
                start_minute=event["startMinute"],
                duration_sec=event["durationSec"],
                intensity=event["intensity"],
                confidence=event["confidence"],
                source=event["source"],
                note=event.get("note"),
                raw_payload=event,
            )
        )
    for item in signals["diet"]:
        session.add(
            DietRecordTable(
                id=item["id"],
                day=day,
                meal_type=item["mealType"],
                food_name=item["foodName"],
                food_tags=item["foodTags"],
                portion=item["portion"],
                estimated_kcal=item["estimatedKcal"],
                user_adjusted_kcal=item.get("userAdjustedKcal"),
                confidence=item["confidence"],
                source=item["source"],
                raw_payload=item,
            )
        )
    stool = signals["stool"]
    session.add(
        StoolRecordTable(
            day=day,
            recorded=stool["recorded"],
            shape=stool.get("shape"),
            color=stool.get("color"),
            dryness=stool.get("dryness"),
            frequency_today=stool.get("frequencyToday"),
            source=stool["source"],
        )
    )
    tongue = signals["tongue"]
    session.add(
        TongueRecordTable(
            day=day,
            recorded=tongue["recorded"],
            tongue_color=tongue.get("tongueColor"),
            coating_thickness=tongue.get("coatingThickness"),
            moisture=tongue.get("moisture"),
            marks=tongue.get("marks", []),
            photo_quality=tongue.get("photoQuality"),
            source=tongue["source"],
        )
    )
    breath = signals["breath"]
    session.add(
        BreathRecordTable(
            day=day,
            level=breath["level"],
            dry_mouth=breath["dryMouth"],
            bitter_taste=breath["bitterTaste"],
            source=breath["source"],
        )
    )
    vitals = signals["vitals"]
    session.add(
        VitalRecordTable(
            day=day,
            heart_rate_resting=vitals.get("heartRateResting"),
            steps=vitals.get("steps"),
            exercise_minutes=vitals.get("exerciseMinutes"),
            source=vitals["source"],
            raw_payload=vitals,
        )
    )


def _get_or_create_day(session: Session, profile_id: str, signal_date: str) -> DailySignalDayTable:
    parsed = date.fromisoformat(signal_date)
    day = session.scalar(select(DailySignalDayTable).where(DailySignalDayTable.profile_id == profile_id, DailySignalDayTable.signal_date == parsed))
    if day:
        return day
    day = DailySignalDayTable(id=str(uuid4()), profile_id=profile_id, signal_date=parsed, source="manual")
    session.add(day)
    session.flush()
    return day


def _profile_to_dict(profile: UserProfileTable) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "profileType": profile.profile_type,
        "age": profile.age,
        "gender": profile.gender,
        "occupation": profile.occupation,
        "goals": [goal.goal for goal in profile.goals],
        "habits": {
            "coffee": profile.coffee,
            "lateNightSnack": profile.late_night_snack,
            "sedentaryHours": profile.sedentary_hours,
            "exerciseFrequency": profile.exercise_frequency,
            "sleepProblem": profile.sleep_problem,
        },
    }


def _day_to_signals(day: DailySignalDayTable) -> dict:
    return {
        "date": day.signal_date.isoformat(),
        "profileId": day.profile_id,
        "sleep": {
            "sleepDurationHours": day.sleep.sleep_duration_hours,
            "sleepQuality": day.sleep.sleep_quality,
            "wakeCount": day.sleep.wake_count,
            "userSleepFeeling": day.sleep.user_sleep_feeling,
        },
        "audioEvents": [
            {
                "id": event.id,
                "type": event.type,
                "startMinute": event.start_minute,
                "durationSec": event.duration_sec,
                "intensity": event.intensity,
                "confidence": event.confidence,
                "source": event.source,
                **({"note": event.note} if event.note else {}),
            }
            for event in sorted(day.audio_events, key=lambda item: item.start_minute)
        ],
        "diet": [
            {
                "id": item.id,
                "mealType": item.meal_type,
                "foodName": item.food_name,
                "foodTags": item.food_tags,
                "portion": item.portion,
                "estimatedKcal": item.estimated_kcal,
                **({"userAdjustedKcal": item.user_adjusted_kcal} if item.user_adjusted_kcal is not None else {}),
                "confidence": item.confidence,
                "source": item.source,
            }
            for item in day.diet_records
        ],
        "stool": {
            "recorded": day.stool.recorded,
            **({"shape": day.stool.shape} if day.stool.shape else {}),
            **({"color": day.stool.color} if day.stool.color else {}),
            **({"dryness": day.stool.dryness} if day.stool.dryness else {}),
            **({"frequencyToday": day.stool.frequency_today} if day.stool.frequency_today is not None else {}),
            "source": day.stool.source,
        },
        "tongue": {
            "recorded": day.tongue.recorded,
            **({"tongueColor": day.tongue.tongue_color} if day.tongue.tongue_color else {}),
            **({"coatingThickness": day.tongue.coating_thickness} if day.tongue.coating_thickness else {}),
            **({"moisture": day.tongue.moisture} if day.tongue.moisture else {}),
            **({"marks": day.tongue.marks} if day.tongue.marks else {}),
            **({"photoQuality": day.tongue.photo_quality} if day.tongue.photo_quality else {}),
            "source": day.tongue.source,
        },
        "breath": {
            "level": day.breath.level,
            "dryMouth": day.breath.dry_mouth,
            "bitterTaste": day.breath.bitter_taste,
            "source": day.breath.source,
        },
        "vitals": {
            **({"heartRateResting": day.vitals.heart_rate_resting} if day.vitals.heart_rate_resting is not None else {}),
            **({"steps": day.vitals.steps} if day.vitals.steps is not None else {}),
            **({"exerciseMinutes": day.vitals.exercise_minutes} if day.vitals.exercise_minutes is not None else {}),
            "source": day.vitals.source,
        },
    }


def _knowledge_source_to_dict(row: KnowledgeSourceTable) -> dict:
    return {
        "id": row.id,
        "sourceType": row.source_type,
        "title": row.title,
        "author": row.author,
        "sourceUri": row.source_uri,
        "version": row.version,
        "language": row.language,
        "reviewStatus": row.review_status,
        "metadata": row.extra_metadata,
    }
