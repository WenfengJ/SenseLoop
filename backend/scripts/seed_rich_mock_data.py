from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from app.db import init_db, open_session
from app.models.tables import (
    AgentMessageTable,
    AgentSessionTable,
    AgentToolCallTable,
    BreathRecordTable,
    DailySignalDayTable,
    DietRecordTable,
    KnowledgeChunkTable,
    KnowledgeSourceTable,
    MediaAssetTable,
    RagRetrievalLogTable,
    SignalObservationTable,
    SleepAudioEventTable,
    SleepSignalTable,
    StoolRecordTable,
    TongueRecordTable,
    VitalRecordTable,
)
from app.repositories.senseloop_repo import seed_demo_data


BASE_DATE = date(2026, 9, 18)


def main() -> None:
    init_db()
    with open_session() as session:
        seed_demo_data(session)
        if session.query(KnowledgeSourceTable).filter_by(title="SenseLoop 生活方式知识库 Mock").first():
            print("Rich mock data already seeded.")
            return
        _seed_signal_history(session)
        source_id, chunk_ids = _seed_knowledge(session)
        _seed_agent_trace(session, chunk_ids)
        session.commit()
    print("Rich mock data seeded.")


def _seed_signal_history(session) -> None:
    profiles = [
        ("profile-weight-loss", "weight_loss_female"),
        ("profile-office", "office_worker"),
        ("profile-elderly", "elderly"),
    ]
    for profile_id, profile_type in profiles:
        for offset in range(1, 7):
            signal_date = BASE_DATE - timedelta(days=offset)
            day_id = f"day-{profile_type}-{signal_date.isoformat()}"
            if session.get(DailySignalDayTable, day_id):
                continue
            sleep_quality = "poor" if offset in (1, 4) and profile_type == "office_worker" else "fair"
            wake_count = 3 if sleep_quality == "poor" else 1 + (offset % 2)
            day = DailySignalDayTable(id=day_id, profile_id=profile_id, signal_date=signal_date, source="mock_rich")
            session.add(day)
            session.add(
                SleepSignalTable(
                    day=day,
                    sleep_duration_hours=round(6.8 - offset * 0.18, 1),
                    sleep_quality=sleep_quality,
                    wake_count=wake_count,
                    user_sleep_feeling="very_tired" if sleep_quality == "poor" else "tired",
                )
            )
            for index, event_type in enumerate(["snore", "turn_over", "cough" if offset % 2 == 0 else "ambient_noise"]):
                session.add(
                    SleepAudioEventTable(
                        id=f"audio-{profile_type}-{offset}-{index}",
                        day=day,
                        type=event_type,
                        start_minute=60 + offset * 18 + index * 64,
                        duration_sec=8 + offset + index * 4,
                        intensity="high" if sleep_quality == "poor" and index == 0 else "medium",
                        confidence=0.66 + index * 0.07,
                        source="mock",
                        raw_payload={"mockScenario": "7_day_trend"},
                    )
                )
            session.add(
                DietRecordTable(
                    id=f"diet-{profile_type}-{offset}",
                    day=day,
                    meal_type="dinner",
                    food_name="清淡套餐" if offset % 2 else "外卖盖饭",
                    food_tags=["vegetable_rich"] if offset % 2 else ["high_oil", "high_carb"],
                    portion="medium",
                    estimated_kcal=520 if offset % 2 else 760,
                    confidence=0.72,
                    source="mock",
                    raw_payload={"mockScenario": "meal_feedback"},
                )
            )
            session.add(
                StoolRecordTable(
                    day=day,
                    recorded=True,
                    shape="normal" if offset % 3 else "sausage_cracked",
                    color="brown",
                    dryness="normal" if offset % 3 else "dry",
                    frequency_today=1,
                    source="manual",
                )
            )
            session.add(
                TongueRecordTable(
                    day=day,
                    recorded=True,
                    tongue_color="pink" if offset % 2 else "red",
                    coating_thickness="normal" if offset % 2 else "thick",
                    moisture="normal" if offset % 2 else "dry",
                    marks=[],
                    photo_quality="good",
                    source="mock",
                )
            )
            session.add(BreathRecordTable(day=day, level="mild", dry_mouth=offset % 2 == 0, bitter_taste=False, source="manual"))
            session.add(
                VitalRecordTable(
                    day=day,
                    heart_rate_resting=70 + offset,
                    steps=4200 + offset * 380,
                    exercise_minutes=10 + offset,
                    source="mock",
                    raw_payload={"mockScenario": "daily_vitals"},
                )
            )
            session.add(
                SignalObservationTable(
                    id=str(uuid4()),
                    day_id=day.id,
                    profile_id=profile_id,
                    signal_type="morning_feedback",
                    value_json={
                        "energy": "low" if sleep_quality == "poor" else "medium",
                        "appetite": "normal",
                        "note": "模拟用户晨间反馈，用于后续 AI 解释日报。",
                    },
                    source="manual",
                    confidence=1,
                    privacy_level="normal",
                )
            )
            session.add(
                MediaAssetTable(
                    id=str(uuid4()),
                    profile_id=profile_id,
                    day_id=day.id,
                    media_type="meal_photo",
                    storage_key=f"mock/{profile_id}/{signal_date.isoformat()}/meal.jpg",
                    mime_type="image/jpeg",
                    byte_size=184320 + offset * 1024,
                    sha256=f"mock-{profile_id}-{signal_date.isoformat()}",
                    source="mock",
                    privacy_level="normal",
                )
            )


def _seed_knowledge(session) -> tuple[str, list[str]]:
    source = KnowledgeSourceTable(
        id=str(uuid4()),
        source_type="custom",
        title="SenseLoop 生活方式知识库 Mock",
        author="SenseLoop Team",
        source_uri="internal://mock-lifestyle-v1",
        version="v1",
        language="zh-CN",
        review_status="published",
        extra_metadata={"scope": "demo_rag", "medicalBoundary": "not_diagnosis"},
    )
    session.add(source)
    chunk_texts = [
        ("sleep", "睡眠恢复不足时，第二天应优先降低运动强度，选择快走、拉伸或轻力量。"),
        ("diet", "饮食拍照识别只能作为估算入口，应允许用户修正 kcal 和食物标签。"),
        ("tongue", "舌苔偏厚或舌面偏干只能作为生活方式观察信号，不应单独输出疾病判断。"),
        ("privacy", "排便、舌苔、口气等敏感信号默认保存结构化标签，不自动保存原始图片。"),
        ("agent", "AI Agent 解释日报时，应引用已审核知识切片和用户当天信号，不能绕过规则引擎。"),
    ]
    chunk_ids = []
    for index, (tag, content) in enumerate(chunk_texts):
        chunk = KnowledgeChunkTable(
            id=str(uuid4()),
            source_id=source.id,
            chunk_index=index,
            content=content,
            summary=content[:32],
            tags=[tag],
            applies_to=["all"],
            safety_level="normal",
            extra_metadata={"mock": True},
            embedding=[0.01 * (index + 1)] * 1536,
        )
        session.add(chunk)
        chunk_ids.append(chunk.id)
    return source.id, chunk_ids


def _seed_agent_trace(session, chunk_ids: list[str]) -> None:
    session_row = AgentSessionTable(
        id=str(uuid4()),
        profile_id="profile-weight-loss",
        session_type="report_explain",
        status="completed",
        model_name="mock-agent",
        system_prompt_version="rules-first-v1",
        extra_metadata={"reportId": "report-weight-loss-female-2026-09-18"},
    )
    session.add(session_row)
    session.add_all(
        [
            AgentMessageTable(id=str(uuid4()), session_id=session_row.id, role="user", content="为什么今天不建议高强度训练？"),
            AgentMessageTable(
                id=str(uuid4()),
                session_id=session_row.id,
                role="assistant",
                content="因为昨晚恢复不足且有夜间声音事件，今天建议快走、拉伸或轻力量，并结合饮食补水。",
                extra_metadata={"citations": chunk_ids[:2]},
            ),
            AgentToolCallTable(
                id=str(uuid4()),
                session_id=session_row.id,
                tool_name="retrieve_health_knowledge",
                input_json={"query": "恢复不足 运动强度"},
                output_json={"chunkIds": chunk_ids[:2]},
                status="succeeded",
            ),
        ]
    )
    for rank, chunk_id in enumerate(chunk_ids[:2], start=1):
        session.add(
            RagRetrievalLogTable(
                id=str(uuid4()),
                session_id=session_row.id,
                report_id="report-weight-loss-female-2026-09-18",
                query="恢复不足 运动强度",
                chunk_id=chunk_id,
                score=0.89 - rank * 0.05,
                rank=rank,
                used_in_answer=True,
            )
        )


if __name__ == "__main__":
    main()
