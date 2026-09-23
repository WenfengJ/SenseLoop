from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.adapters import llm_adapter
from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.db import engine, get_db, init_db, masked_database_url, open_session
from app.domain.schemas import (
    AgentMessageCreate,
    AgentSessionCreate,
    DailyReport,
    DailySignals,
    DbStatus,
    KnowledgeSearchRequest,
    KnowledgeSourceCreate,
    ProfileType,
    SignalObservationCreate,
    TongueAnalysisRequest,
    TongueAnalysisResponse,
    UserProfile,
)
from app.repositories import senseloop_repo
from app.services.report_builder import build_daily_report

db_ready = False
db_error: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_error, db_ready
    try:
        init_db()
        with open_session() as session:
            senseloop_repo.seed_demo_data(session)
        db_ready = True
    except Exception as exc:  # pragma: no cover - keeps demo API available if DB is unavailable.
        db_ready = False
        db_error = str(exc)
    yield


app = FastAPI(title="SenseLoop API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "anker-SenseLoop", "dbReady": db_ready}


@app.get("/api/db/status", response_model=DbStatus)
def get_db_status(db: Session = Depends(get_db)):
    vector_ready = None
    profile_count = None
    if db_ready:
        profile_count = senseloop_repo.count_profiles(db)
        if engine.dialect.name == "postgresql":
            vector_ready = bool(db.execute(text("select 1 from pg_extension where extname = 'vector'")).first())
    return {
        "enabled": db_ready,
        "url": masked_database_url(),
        "profileCount": profile_count,
        "vectorReady": vector_ready,
        "error": db_error,
    }


@app.get("/api/ai/status")
def get_ai_status():
    return llm_adapter.config_status()


@app.get("/api/profiles", response_model=list[UserProfile])
def get_profiles(db: Session = Depends(get_db)):
    if db_ready:
        profiles = senseloop_repo.list_profiles(db)
        if profiles:
            return profiles
    return PROFILES


@app.get("/api/signals/{profile_type}", response_model=DailySignals)
def get_signals(profile_type: ProfileType, db: Session = Depends(get_db)):
    if db_ready:
        signals = senseloop_repo.get_signals_by_profile_type(db, profile_type)
        if signals:
            return signals
    signals = MOCK_SIGNALS.get(profile_type)
    if signals is None:
        raise HTTPException(status_code=404, detail="profile_type not found")
    return signals


@app.get("/api/profiles/{profile_id}/signals", response_model=DailySignals)
def get_signals_by_profile(profile_id: str, date: str | None = None, db: Session = Depends(get_db)):
    if db_ready:
        signals = senseloop_repo.get_signals_by_profile_id(db, profile_id, date)
        if signals:
            return signals
    profile = _mock_profile_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    return MOCK_SIGNALS[profile["profileType"]]


@app.get("/api/report/{profile_type}", response_model=DailyReport)
def get_report(profile_type: ProfileType, db: Session = Depends(get_db)):
    profile, signals = _load_profile_and_signals(profile_type, db)
    return build_daily_report(profile, signals)


@app.post("/api/profiles/{profile_id}/reports/{date}/generate", response_model=DailyReport)
def generate_report(profile_id: str, date: str, db: Session = Depends(get_db)):
    profile = senseloop_repo.get_profile_by_id(db, profile_id) if db_ready else _mock_profile_by_id(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    signals = senseloop_repo.get_signals_by_profile_id(db, profile_id, date) if db_ready else MOCK_SIGNALS[profile["profileType"]]
    if signals is None:
        raise HTTPException(status_code=404, detail="signals not found")
    return build_daily_report(profile, signals)


@app.post("/api/profiles/{profile_id}/signals/{date}/observations")
def create_observation(profile_id: str, date: str, payload: SignalObservationCreate, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for observations")
    if not senseloop_repo.get_profile_by_id(db, profile_id):
        raise HTTPException(status_code=404, detail="profile not found")
    return senseloop_repo.create_observation(db, profile_id, date, payload.model_dump())


@app.get("/api/profiles/{profile_id}/signals/{date}/observations")
def list_observations(profile_id: str, date: str, signalType: str | None = None, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for observations")
    if not senseloop_repo.get_profile_by_id(db, profile_id):
        raise HTTPException(status_code=404, detail="profile not found")
    return {"observations": senseloop_repo.list_observations(db, profile_id, date, signalType)}


@app.post("/api/knowledge/sources")
def create_knowledge_source(payload: KnowledgeSourceCreate, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for knowledge sources")
    return senseloop_repo.create_knowledge_source(db, payload.model_dump())


@app.post("/api/knowledge/search")
def search_knowledge(payload: KnowledgeSearchRequest, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for knowledge search")
    return {
        "chunks": senseloop_repo.search_knowledge(
            db,
            query=payload.query,
            source_types=payload.sourceTypes,
            top_k=payload.topK,
        )
    }


@app.post("/api/agent/sessions")
def create_agent_session(payload: AgentSessionCreate, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for agent sessions")
    if not senseloop_repo.get_profile_by_id(db, payload.profileId):
        raise HTTPException(status_code=404, detail="profile not found")
    return senseloop_repo.create_agent_session(db, payload.model_dump())


@app.post("/api/agent/sessions/{session_id}/messages")
def send_agent_message(session_id: str, payload: AgentMessageCreate, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for agent messages")
    session = senseloop_repo.get_agent_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="agent session not found")

    assistant_message = None
    model_name = None
    metadata = {"aiEnabled": False}
    try:
        result = llm_adapter.chat_completion(_build_agent_messages(payload.message))
        assistant_message = result.content
        model_name = result.model
        metadata = {"aiEnabled": True, "provider": result.provider}
    except llm_adapter.LlmNotConfiguredError as exc:
        metadata = {"aiEnabled": False, "error": str(exc)}
    except llm_adapter.LlmCallError as exc:
        metadata = {"aiEnabled": False, "error": str(exc)[:500]}

    return senseloop_repo.add_agent_message(
        db,
        session_id,
        payload.message,
        assistant_message=assistant_message,
        model_name=model_name,
        metadata=metadata,
    )


@app.post("/api/profiles/{profile_id}/tongue-analysis", response_model=TongueAnalysisResponse)
def analyze_tongue(profile_id: str, payload: TongueAnalysisRequest, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for tongue analysis")
    profile = senseloop_repo.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")

    session = senseloop_repo.create_agent_session(
        db,
        {"profileId": profile_id, "sessionType": "tongue_analysis", "metadata": {"source": "tongue_report"}},
    )
    message = _build_tongue_prompt(profile, payload)
    analysis = _fallback_tongue_analysis(payload.tongue)
    model_name = None
    ai_enabled = False
    metadata = {"aiEnabled": False}

    try:
        result = llm_adapter.chat_completion(_build_tongue_messages(message), max_tokens=900)
        analysis = result.content
        model_name = result.model
        ai_enabled = True
        metadata = {"aiEnabled": True, "provider": result.provider}
    except llm_adapter.LlmNotConfiguredError as exc:
        metadata = {"aiEnabled": False, "error": str(exc)}
    except llm_adapter.LlmCallError as exc:
        metadata = {"aiEnabled": False, "error": str(exc)[:500]}

    senseloop_repo.add_agent_message(
        db,
        session["id"],
        message,
        assistant_message=analysis,
        model_name=model_name,
        metadata=metadata,
    )
    observation = senseloop_repo.create_observation(
        db,
        profile_id,
        payload.date,
        {
            "signalType": "tongue_analysis",
            "source": "ai_model" if ai_enabled else "local_fallback",
            "privacyLevel": "sensitive",
            "confidence": 0.78 if ai_enabled else 0.52,
            "valueJson": {
                "tongue": payload.tongue,
                "upload": payload.upload,
                "analysis": analysis,
                "model": model_name,
                "aiEnabled": ai_enabled,
            },
        },
    )
    return {
        "analysis": analysis,
        "aiEnabled": ai_enabled,
        "model": model_name,
        "sessionId": session["id"],
        "observation": observation,
    }


def _load_profile_and_signals(profile_type: str, db: Session) -> tuple[dict, dict]:
    if db_ready:
        profile = senseloop_repo.get_profile_by_type(db, profile_type)
        signals = senseloop_repo.get_signals_by_profile_type(db, profile_type)
        if profile and signals:
            return profile, signals
    profile = next((item for item in PROFILES if item["profileType"] == profile_type), None)
    signals = MOCK_SIGNALS.get(profile_type)
    if profile is None or signals is None:
        raise HTTPException(status_code=404, detail="profile_type not found")
    return profile, signals


def _mock_profile_by_id(profile_id: str) -> dict | None:
    return next((item for item in PROFILES if item["id"] == profile_id), None)


def _build_agent_messages(user_message: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 SenseLoop 的健康管理 AI 助手。"
                "回答要使用中文，简洁、可执行、偏生活方式建议。"
                "不要做疾病诊断，不要替代医生；涉及严重症状时提醒及时就医。"
                "当前阶段 RAG 和工具调用尚未正式接入，如缺少上下文，要明确说明需要补充哪些记录。"
            ),
        },
        {"role": "user", "content": user_message},
    ]


def _build_tongue_messages(user_message: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 SenseLoop 的中医健康管理助手，专门做舌象健康管理解读。"
                "只能基于用户提供的舌色、舌苔、津液、图片元信息做趋势分析和生活方式建议。"
                "不要宣称确诊疾病，不替代医生；遇到持续不适、疼痛、发热、出血等情况提醒就医。"
                "输出中文，结构固定为：辨证倾向、舌象要点、饮食调理、推荐食疗、起居建议、注意事项。"
                "每段尽量短，适合手机报告页展示。"
            ),
        },
        {"role": "user", "content": user_message},
    ]


def _build_tongue_prompt(profile: dict, payload: TongueAnalysisRequest) -> str:
    upload = payload.upload or {}
    return (
        f"用户：{profile['name']}，{profile['age']}岁，{profile['occupation']}。\n"
        f"分析日期：{payload.date}。\n"
        f"舌象结构化信息：{payload.tongue}。\n"
        f"图片元信息：文件名={upload.get('name', '未提供')}，类型={upload.get('type', '未知')}，大小={upload.get('size', '未知')}。\n"
        "请给出适合前端报告页展示的中医舌诊健康管理分析。"
    )


def _fallback_tongue_analysis(tongue: dict) -> str:
    moisture = tongue.get("moisture")
    color = tongue.get("tongueColor")
    coating = tongue.get("coatingThickness")
    if moisture == "dry" or coating in {"thin", "none"}:
        pattern = "阴液偏少，兼有胃阴不足倾向"
        diet = "多吃滋阴润燥食物，如银耳、百合、雪梨、山药；少吃辛辣煎炸。"
    elif color == "pale":
        pattern = "气血偏虚，脾胃运化不足倾向"
        diet = "饮食宜温和规律，可选山药、红枣、小米粥等健脾养胃食材。"
    else:
        pattern = "整体偏平稳，建议继续观察舌苔和口干变化"
        diet = "保持清淡均衡，避免连续熬夜和重油重辣。"
    return (
        f"辨证倾向：{pattern}。\n"
        "舌象要点：当前舌象仅基于上传标签和图片元信息做健康管理参考，需要结合问诊、睡眠、饮食一起判断。\n"
        f"饮食调理：{diet}\n"
        "推荐食疗：银耳、百合、山药、红枣可按体感少量搭配。\n"
        "起居建议：今晚尽量 23:00 前入睡，减少熬夜和情绪过度消耗。\n"
        "注意事项：若口干、疼痛、发热或其他不适持续加重，请及时咨询医生。"
    )
