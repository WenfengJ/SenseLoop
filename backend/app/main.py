from contextlib import asynccontextmanager
import base64
import io
import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.adapters import llm_adapter
from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.db import engine, get_db, init_db, masked_database_url, open_session
from app.domain.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentContextResponse,
    AgentMessageCreate,
    AgentSessionCreate,
    DailyReport,
    DailySignals,
    DbStatus,
    EmailCodeRequest,
    EmailCodeResponse,
    EmailCodeVerifyRequest,
    GuestIdentityRequest,
    GuestIdentityResponse,
    EmailLoginRequest,
    HealthDocumentSummaryRequest,
    HealthDocumentSummaryResponse,
    KnowledgeSearchRequest,
    KnowledgeSourceCreate,
    ProfileType,
    SessionIdentityRequest,
    SignalObservationCreate,
    TongueAnalysisRequest,
    TongueAnalysisResponse,
    UserProfile,
    UserProfileWrite,
)
from app.repositories import senseloop_repo
from app.services import local_file_storage
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


@app.post("/api/identity/guest", response_model=GuestIdentityResponse)
def get_or_create_guest_identity(payload: GuestIdentityRequest, db: Session = Depends(get_db)):
    if not db_ready:
        return {
            "deviceId": payload.deviceId or "demo-device-local",
            "guestUserId": "guest-demo-local",
            "accountId": "acct-demo-local",
            "authMode": "guest",
            "displayName": "游客用户",
            "profileId": PROFILES[0]["id"],
            "profiles": PROFILES,
        }
    identity = senseloop_repo.get_or_create_guest_user(db, payload.deviceId)
    return identity


@app.post("/api/auth/email", response_model=GuestIdentityResponse)
def login_with_email(payload: EmailLoginRequest, db: Session = Depends(get_db)):
    if not db_ready:
        return {
            "deviceId": payload.deviceId or "demo-device-local",
            "guestUserId": "",
            "accountId": "acct-email-demo",
            "authMode": "email",
            "email": payload.email.strip().lower(),
            "displayName": payload.displayName or payload.email.split("@", 1)[0],
            "profileId": PROFILES[0]["id"],
            "profiles": PROFILES,
        }
    try:
        return senseloop_repo.login_with_email(
            db,
            payload.email,
            display_name=payload.displayName,
            device_id=payload.deviceId,
            device_name=payload.deviceName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/auth/email/code", response_model=EmailCodeResponse)
def request_email_code(payload: EmailCodeRequest, db: Session = Depends(get_db)):
    if not db_ready:
        return {
            "email": payload.email.strip().lower(),
            "expiresInSeconds": 600,
            "delivery": "dev",
            "devCode": "000000",
        }
    try:
        return senseloop_repo.request_email_code(
            db,
            payload.email,
            display_name=payload.displayName,
            device_id=payload.deviceId,
            device_name=payload.deviceName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/auth/email/verify", response_model=GuestIdentityResponse)
def verify_email_code(payload: EmailCodeVerifyRequest, db: Session = Depends(get_db)):
    if not db_ready:
        if payload.code != "000000":
            raise HTTPException(status_code=400, detail="verification code is incorrect")
        return {
            "deviceId": payload.deviceId or "demo-device-local",
            "guestUserId": "",
            "accountId": "acct-email-demo",
            "authMode": "email",
            "email": payload.email.strip().lower(),
            "displayName": payload.displayName or payload.email.split("@", 1)[0],
            "profileId": PROFILES[0]["id"],
            "profiles": PROFILES,
            "sessionToken": "demo-session-token",
        }
    try:
        return senseloop_repo.verify_email_code(
            db,
            payload.email,
            payload.code,
            display_name=payload.displayName,
            device_id=payload.deviceId,
            device_name=payload.deviceName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/auth/session", response_model=GuestIdentityResponse)
def get_identity_from_session(payload: SessionIdentityRequest, db: Session = Depends(get_db)):
    if not db_ready:
        if payload.sessionToken != "demo-session-token":
            raise HTTPException(status_code=401, detail="session is invalid or expired")
        return {
            "deviceId": payload.deviceId or "demo-device-local",
            "guestUserId": "",
            "accountId": "acct-email-demo",
            "authMode": "email",
            "email": "demo@example.com",
            "displayName": "演示账号",
            "profileId": PROFILES[0]["id"],
            "profiles": PROFILES,
            "sessionToken": payload.sessionToken,
        }
    try:
        return senseloop_repo.get_identity_from_session(
            db,
            payload.sessionToken,
            device_id=payload.deviceId,
            device_name=payload.deviceName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/profiles", response_model=list[UserProfile])
def get_profiles(db: Session = Depends(get_db)):
    if db_ready:
        profiles = senseloop_repo.list_profiles(db)
        if profiles:
            return profiles
    return PROFILES


@app.post("/api/profiles", response_model=UserProfile)
def create_profile(payload: UserProfileWrite, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for profile creation")
    if not payload.accountId:
        raise HTTPException(status_code=400, detail="accountId is required")
    try:
        return senseloop_repo.create_profile_for_account(db, payload.accountId, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.put("/api/profiles/{profile_id}", response_model=UserProfile)
def update_profile(profile_id: str, payload: UserProfileWrite, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for profile updates")
    profile = senseloop_repo.update_profile(db, profile_id, payload.model_dump())
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return profile


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


@app.get("/api/profiles/{profile_id}/agent/context", response_model=AgentContextResponse)
def get_agent_context(profile_id: str, db: Session = Depends(get_db)):
    if not db_ready:
        profile = _mock_profile_by_id(profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="profile not found")
        signals = MOCK_SIGNALS[profile["profileType"]]
        report = build_daily_report(profile, signals)
        return {
            "profile": profile,
            "signals": signals,
            "report": report,
            "memory": None,
            "recentMessages": [],
            "knowledgeCards": _fallback_knowledge_cards("睡眠 舌诊 隐私"),
        }
    profile = senseloop_repo.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    signals = senseloop_repo.get_signals_by_profile_id(db, profile_id)
    report = build_daily_report(profile, signals) if signals else None
    memory = senseloop_repo.get_agent_memory(db, profile_id)
    recent_messages = senseloop_repo.list_recent_agent_messages(db, profile_id)
    knowledge_cards = senseloop_repo.search_knowledge(db, query="四诊 睡眠 舌诊 隐私", source_types=[], top_k=5)
    return {
        "profile": profile,
        "signals": signals,
        "report": report,
        "memory": memory,
        "recentMessages": recent_messages,
        "knowledgeCards": knowledge_cards,
    }


@app.post("/api/profiles/{profile_id}/agent/chat", response_model=AgentChatResponse)
def chat_with_qihuang_agent(profile_id: str, payload: AgentChatRequest, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for agent chat")
    profile = senseloop_repo.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")

    session = senseloop_repo.get_agent_session(db, payload.sessionId) if payload.sessionId else None
    if session is None:
        session = senseloop_repo.create_agent_session(
            db,
            {"profileId": profile_id, "sessionType": "qihuang_consultation", "metadata": {"source": "formal_agent_api"}},
        )
    if session["profileId"] != profile_id:
        raise HTTPException(status_code=403, detail="agent session does not belong to profile")

    context = _build_agent_context(db, profile_id, payload.message, profile)
    assistant_message = _fallback_agent_answer(payload.message, context)
    model_name = None
    ai_enabled = False
    metadata = {"aiEnabled": False, "contextToolCount": len(context["toolCalls"])}

    try:
        result = llm_adapter.chat_completion(_build_qihuang_messages(payload.message, context), max_tokens=1000)
        assistant_message = result.content
        model_name = result.model
        ai_enabled = True
        metadata = {"aiEnabled": True, "provider": result.provider, "contextToolCount": len(context["toolCalls"])}
    except llm_adapter.LlmNotConfiguredError as exc:
        metadata = {"aiEnabled": False, "error": str(exc), "contextToolCount": len(context["toolCalls"])}
    except llm_adapter.LlmCallError as exc:
        metadata = {"aiEnabled": False, "error": str(exc)[:500], "contextToolCount": len(context["toolCalls"])}

    saved = senseloop_repo.add_agent_message(
        db,
        session["id"],
        payload.message,
        assistant_message=assistant_message,
        model_name=model_name,
        metadata=metadata,
    )
    memory = _update_agent_memory(db, profile_id, profile, payload.message, assistant_message, context)
    return {
        "sessionId": session["id"],
        "answer": saved["answer"],
        "assistantMessage": saved["assistantMessage"],
        "model": model_name,
        "citations": context["citations"],
        "toolCalls": context["toolCalls"],
        "memory": memory,
        "aiEnabled": ai_enabled,
    }


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


@app.post("/api/profiles/{profile_id}/documents/summarize", response_model=HealthDocumentSummaryResponse)
def summarize_health_document(profile_id: str, payload: HealthDocumentSummaryRequest, db: Session = Depends(get_db)):
    if not db_ready:
        raise HTTPException(status_code=503, detail="database is required for document summaries")
    profile = senseloop_repo.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    payload = _enrich_document_payload(payload)
    knowledge_cards = senseloop_repo.search_knowledge(db, query="体检报告 隐私 医疗边界", source_types=[], top_k=3)
    structured_findings = _extract_document_findings(payload)
    summary = _fallback_document_summary(payload, structured_findings)
    ai_enabled = False
    model_name = None
    try:
        result = llm_adapter.chat_completion(
            _build_document_messages(profile, payload, knowledge_cards, structured_findings),
            max_tokens=1100,
            model=llm_adapter.vision_model() if _is_image_document(payload) and payload.fileBase64 else None,
        )
        summary = result.content
        ai_enabled = True
        model_name = result.model
    except (llm_adapter.LlmNotConfiguredError, llm_adapter.LlmCallError) as exc:
        if _is_image_document(payload):
            summary = _image_document_fallback_summary(payload, str(exc))
    payload_data = payload.model_dump()
    metadata = {**payload_data.get("metadata", {}), "structuredFindings": structured_findings}
    if payload.fileBase64:
        try:
            stored_file = local_file_storage.save_base64_upload(
                profile_id=profile_id,
                file_name=payload.fileName,
                mime_type=payload.mimeType,
                file_base64=payload.fileBase64,
                document_type=payload.documentType,
            )
            media_asset = senseloop_repo.create_media_asset(
                db,
                profile_id,
                {
                    **stored_file,
                    "date": payload.date,
                    "mediaType": payload.documentType,
                    "source": "upload",
                    "privacyLevel": "high_sensitive",
                },
            )
            metadata.update(
                {
                    "storageProvider": stored_file["storageProvider"],
                    "storageKey": stored_file["storageKey"],
                    "sha256": stored_file["sha256"],
                    "mediaAssetId": media_asset["id"],
                }
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload_data["metadata"] = metadata
    document = senseloop_repo.create_health_document(db, profile_id, payload_data, summary=summary)
    senseloop_repo.create_observation(
        db,
        profile_id,
        payload.date or MOCK_SIGNALS.get(profile["profileType"], {}).get("date", "2026-09-18"),
        {
            "signalType": "health_document_summary",
            "source": "ai_model" if ai_enabled else "local_fallback",
            "privacyLevel": "sensitive",
            "confidence": 0.74 if ai_enabled else 0.5,
            "valueJson": {
                "documentId": document["id"],
                "fileName": payload.fileName,
                "summary": summary,
                "structuredFindings": structured_findings,
                "aiEnabled": ai_enabled,
                "needsReupload": _is_image_document(payload) and not ai_enabled,
            },
        },
    )
    return {
        "document": document,
        "summary": summary,
        "aiEnabled": ai_enabled,
        "model": model_name,
        "structuredFindings": structured_findings,
        "citations": _knowledge_to_citations(knowledge_cards),
    }


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
        try:
            result = llm_adapter.chat_completion(_build_tongue_messages(message), max_tokens=900)
        except llm_adapter.LlmCallError:
            result = llm_adapter.chat_completion(_build_tongue_messages(_build_compact_tongue_prompt(profile, payload)), max_tokens=700)
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


def _build_agent_context(db: Session, profile_id: str, query: str, profile: dict) -> dict:
    signals = senseloop_repo.get_signals_by_profile_id(db, profile_id)
    report = build_daily_report(profile, signals) if signals else None
    memory = senseloop_repo.get_agent_memory(db, profile_id)
    recent_messages = senseloop_repo.list_recent_agent_messages(db, profile_id, limit=10)
    knowledge_cards = senseloop_repo.search_knowledge(db, query=query, source_types=[], top_k=4)
    if not knowledge_cards:
        knowledge_cards = senseloop_repo.search_knowledge(db, query="四诊 睡眠 舌诊 医疗边界", source_types=[], top_k=4)
    return {
        "profile": profile,
        "signals": signals,
        "report": report,
        "memory": memory,
        "recentMessages": recent_messages,
        "knowledgeCards": knowledge_cards,
        "citations": _knowledge_to_citations(knowledge_cards),
        "toolCalls": [
            {"toolName": "profile_context", "status": "succeeded", "profileId": profile_id},
            {"toolName": "recent_7_day_memory", "status": "succeeded" if memory else "empty"},
            {"toolName": "sleep_audio_context", "status": "succeeded" if signals else "empty"},
            {"toolName": "knowledge_search", "status": "succeeded", "count": len(knowledge_cards)},
        ],
    }


def _build_qihuang_messages(user_message: str, context: dict) -> list[dict[str, str]]:
    compact_context = {
        "profile": context["profile"],
        "sleep": context["signals"].get("sleep") if context.get("signals") else None,
        "audioEvents": _summarize_audio_events(context["signals"].get("audioEvents", [])) if context.get("signals") else [],
        "report": context.get("report"),
        "memory": context.get("memory"),
        "recentMessages": context.get("recentMessages", [])[-6:],
        "knowledgeCards": context.get("knowledgeCards", []),
    }
    return [
        {
            "role": "system",
            "content": (
                "你是 SenseLoop 的岐黄问诊助手，不是医生。"
                "你用中医望闻问切框架做健康管理问诊：望=舌图/饮食图/报告，闻=夜间声音/鼾声/咳嗽/口气，问=聊天症状，切=心率/步数/未来穿戴。"
                "必须优先解释 soundcore Work 夜间声音、鼾声、咳嗽、夜醒和今日恢复建议之间的关系。"
                "只能使用倾向、可能相关、建议观察等表达；不能诊断疾病，不能替代医生。"
                "缺少信息时要主动追问 1-2 个关键问题。"
                "回答要适合手机聊天窗口，分段简短，并在末尾列出依据来源。"
            ),
        },
        {"role": "user", "content": f"用户问题：{user_message}\n\n可用上下文 JSON：{compact_context}"},
    ]


def _fallback_agent_answer(user_message: str, context: dict) -> str:
    signals = context.get("signals") or {}
    sleep = signals.get("sleep") or {}
    events = signals.get("audioEvents") or []
    snore_count = len([event for event in events if event.get("type") == "snore"])
    cough_count = len([event for event in events if event.get("type") == "cough"])
    wake_count = sleep.get("wakeCount", 0)
    advice = [
        "我先按“闻诊 + 问诊”的方式看：昨晚夜间声音可以作为趋势观察，但不能直接诊断疾病。",
        f"当前记录里，睡眠约 {sleep.get('sleepDurationHours', '未知')} 小时，夜醒/起夜 {wake_count} 次，打鼾片段 {snore_count} 段，咳嗽片段 {cough_count} 段。",
        "如果今天醒来仍累，建议把运动强度放低，白天补水，晚间减少辛辣、酒精和过晚进食，并继续观察 2-3 晚趋势。",
    ]
    if "舌" in user_message or "口干" in user_message:
        advice.append("你提到的舌象或口干，需要和昨晚鼾声、睡眠时长、饮水、排便一起看，建议补一张光线稳定的舌图。")
    if wake_count >= 3 or snore_count >= 3 or cough_count >= 3:
        advice.append("如果这类异常连续多日出现，或伴随明显白天困倦、胸闷、发热、疼痛等不适，请及时咨询医生。")
    advice.append("依据来源：近 7 天记忆、昨晚睡眠声音摘要、四诊健康管理知识卡。")
    return "\n".join(advice)


def _update_agent_memory(db: Session, profile_id: str, profile: dict, user_message: str, assistant_message: str, context: dict) -> dict:
    previous = context.get("memory", {}) or {}
    signals = context.get("signals") or {}
    sleep = signals.get("sleep") or {}
    events = signals.get("audioEvents") or []
    snore_count = len([event for event in events if event.get("type") == "snore"])
    cough_count = len([event for event in events if event.get("type") == "cough"])
    summary = (
        f"{profile['name']}，{profile['age']}岁，目标：{','.join(profile.get('goals', []))}。"
        f"近 7 天重点按睡眠/闻诊、舌诊、饮食和问诊追踪。"
        f"最新睡眠：{sleep.get('sleepDurationHours', '未知')}小时，夜醒{sleep.get('wakeCount', '未知')}次，"
        f"打鼾{snore_count}段，咳嗽{cough_count}段。"
        f"本次用户关注：{user_message[:120]}。"
        f"本次建议摘要：{assistant_message[:180]}。"
    )
    if previous.get("summary"):
        summary = f"{previous['summary'][:260]} | 更新：{summary}"
    return senseloop_repo.upsert_agent_memory(
        db,
        profile_id,
        summary,
        metadata={"strategy": "rolling_7_day_then_summary", "updatedBy": "qihuang_agent"},
    )


def _summarize_audio_events(events: list[dict]) -> dict:
    counts: dict[str, int] = {}
    high_count = 0
    for event in events:
        counts[event.get("type", "unknown")] = counts.get(event.get("type", "unknown"), 0) + 1
        if event.get("intensity") == "high":
            high_count += 1
    return {"counts": counts, "highIntensityCount": high_count, "events": events[:8]}


def _knowledge_to_citations(chunks: list[dict]) -> list[dict]:
    return [
        {
            "title": item.get("title"),
            "chunkId": item.get("chunkId"),
            "content": item.get("content"),
            "safetyLevel": item.get("safetyLevel"),
        }
        for item in chunks
    ]


def _fallback_knowledge_cards(query: str) -> list[dict]:
    return [
        {
            "chunkId": "fallback-four-diagnosis",
            "title": "四诊 Agent 工作流",
            "content": "望闻问切用于组织多模态健康输入，回答只能做健康管理建议，不做疾病诊断。",
            "score": None,
            "safetyLevel": "medical_boundary",
            "tags": ["四诊", query],
        }
    ]


def _build_document_messages(
    profile: dict,
    payload: HealthDocumentSummaryRequest,
    knowledge_cards: list[dict],
    structured_findings: dict,
) -> list[dict[str, object]]:
    system_message = {
        "role": "system",
        "content": (
            "你是 SenseLoop 的健康资料解读 Agent。"
            "你的流程是：1读取资料说明和可提取文本，2提取指标或异常线索，3结合望闻问切提出追问，4给出生活方式观察建议。"
            "不要诊断疾病，不要替代医生；遇到明显异常或持续不适提醒咨询医生。"
            "如果资料是图片，你必须先描述图片里实际看见的内容，例如报告项目、数值、箭头、舌色舌苔、食物类型或画面质量。"
            "不能根据文件名、资料类型或常识假装看到了图片内容；看不清时要直接说“这张资料不够清晰，暂时不能判断具体内容”。"
            "不要暴露系统实现限制，不要说第一版、OCR、结构化未完成、后端、模型等词。"
            "输出中文，结构固定为：资料重点、看到的具体内容、需要追问、今日建议、注意事项。"
        ),
    }
    user_text = (
        f"用户：{profile['name']}，{profile['age']}岁，{profile['occupation']}。\n"
        f"文件：{payload.fileName}，类型：{payload.mimeType}，描述：{payload.userDescription or '无'}。\n"
        f"可提取文本：{payload.extractedText or '请直接阅读上传图片/PDF中的内容，整理指标和异常线索'}。\n"
        f"已识别线索：{structured_findings}。\n"
        f"知识卡：{knowledge_cards}\n"
        "请像健康资料 Agent 一样给出可执行解读。必须区分“已从资料中看到的内容”和“需要继续确认的信息”。"
    )
    if _is_image_document(payload) and payload.fileBase64:
        return [
            system_message,
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{payload.mimeType};base64,{payload.fileBase64}"},
                    },
                ],
            },
        ]
    return [
        system_message,
        {
            "role": "user",
            "content": user_text,
        },
    ]


def _extract_document_findings(payload: HealthDocumentSummaryRequest) -> dict:
    text = "\n".join([payload.userDescription or "", payload.extractedText or ""]).strip()
    indicator_patterns = [
        ("血糖", r"(血糖|空腹血糖|葡萄糖|GLU)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(mmol/L|mg/dL)?"),
        ("总胆固醇", r"(总胆固醇|TC)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(mmol/L|mg/dL)?"),
        ("甘油三酯", r"(甘油三酯|TG)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(mmol/L|mg/dL)?"),
        ("低密度脂蛋白", r"(低密度脂蛋白|LDL-C|LDL)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(mmol/L|mg/dL)?"),
        ("高密度脂蛋白", r"(高密度脂蛋白|HDL-C|HDL)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(mmol/L|mg/dL)?"),
        ("尿酸", r"(尿酸|UA)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(umol/L|μmol/L|mg/dL)?"),
        ("谷丙转氨酶", r"(谷丙转氨酶|ALT)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(U/L)?"),
        ("谷草转氨酶", r"(谷草转氨酶|AST)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(U/L)?"),
        ("血红蛋白", r"(血红蛋白|HGB|Hb)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(g/L)?"),
    ]
    indicators = []
    for canonical_name, pattern in indicator_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            indicators.append(
                {
                    "name": canonical_name,
                    "rawName": match.group(1),
                    "value": match.group(2),
                    "unit": match.group(3) or "",
                    "source": "text",
                }
            )
    abnormal_keywords = [
        item
        for item in ["升高", "偏高", "降低", "偏低", "异常", "阳性", "箭头", "↑", "↓", "+", "超标"]
        if item in text
    ]
    focus_areas = []
    if any(keyword in text for keyword in ["血脂", "胆固醇", "甘油三酯", "LDL", "HDL"]):
        focus_areas.append("血脂代谢")
    if any(keyword in text for keyword in ["血糖", "糖化", "葡萄糖", "GLU"]):
        focus_areas.append("血糖波动")
    if any(keyword in text for keyword in ["尿酸", "痛风", "UA"]):
        focus_areas.append("尿酸管理")
    if any(keyword in text for keyword in ["肝", "ALT", "AST", "转氨酶"]):
        focus_areas.append("肝功能线索")
    if any(keyword in text for keyword in ["贫血", "血红蛋白", "HGB"]):
        focus_areas.append("气血与疲劳线索")
    return {
        "indicators": indicators[:12],
        "abnormalKeywords": abnormal_keywords[:8],
        "focusAreas": focus_areas[:6],
        "hasReportText": bool(payload.extractedText and payload.extractedText.strip()),
        "fileName": payload.fileName,
    }


def _enrich_document_payload(payload: HealthDocumentSummaryRequest) -> HealthDocumentSummaryRequest:
    extracted_text = payload.extractedText or ""
    metadata = dict(payload.metadata or {})
    if payload.fileBase64 and _is_pdf_document(payload) and not extracted_text.strip():
        extracted_text = _extract_pdf_text(payload.fileBase64)
        if extracted_text:
            metadata["serverExtractedText"] = True
    return payload.model_copy(update={"extractedText": extracted_text or payload.extractedText, "metadata": metadata})


def _is_pdf_document(payload: HealthDocumentSummaryRequest) -> bool:
    return payload.mimeType == "application/pdf" or payload.fileName.lower().endswith(".pdf") or payload.documentType == "pdf"


def _is_image_document(payload: HealthDocumentSummaryRequest) -> bool:
    return payload.mimeType.startswith("image/") or payload.documentType in {"tongue_image", "diet_image", "other_image"}


def _decode_base64_file(file_base64: str) -> bytes:
    clean = file_base64.split(",", 1)[1] if "," in file_base64[:80] else file_base64
    return base64.b64decode(clean, validate=False)


def _extract_pdf_text(file_base64: str) -> str:
    data = _decode_base64_file(file_base64)
    text = _extract_pdf_text_with_pypdf(data)
    if text:
        return text[:12000]
    return _extract_pdf_text_fallback(data)[:12000]


def _extract_pdf_text_with_pypdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages[:8]:
            page_text = page.extract_text() or ""
            if page_text.strip():
                parts.append(page_text)
        return "\n".join(parts).strip()
    except Exception:
        return ""


def _extract_pdf_text_fallback(data: bytes) -> str:
    # Lightweight best-effort parser for simple text PDFs when pypdf is unavailable.
    raw = data.decode("latin-1", errors="ignore")
    chunks = []
    for match in re.finditer(r"\(([^()]{2,200})\)\s*Tj", raw):
        chunks.append(match.group(1))
    for array in re.finditer(r"\[((?:\([^()]{1,120}\)\s*)+)\]\s*TJ", raw):
        chunks.extend(re.findall(r"\(([^()]{1,120})\)", array.group(1)))
    text = "\n".join(_decode_pdf_literal(item) for item in chunks)
    return re.sub(r"\s{2,}", " ", text).strip()


def _decode_pdf_literal(value: str) -> str:
    value = value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
    return value.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore") or value


def _image_document_fallback_summary(payload: HealthDocumentSummaryRequest, error: str = "") -> str:
    retry_hint = "建议重新上传更清晰的原图或 PDF：尽量正对拍摄、不要裁掉表头和参考范围、避免压缩截图。"
    if payload.userDescription:
        retry_hint += f" 我已记录你的补充说明：{payload.userDescription[:120]}。"
    return (
        f"资料重点：已收到《{payload.fileName}》，但这次没有从图片中读出足够清晰的具体内容。\n"
        "看到的具体内容：暂时不能可靠判断图片里的指标、舌象或饮食细节，所以我不会根据文件名猜测结论。\n"
        f"需要追问：{retry_hint}\n"
        "今日建议：在资料重新识别前，先把它作为待确认资料保存；如果你近期有明显不适、报告上有红色箭头或异常标记，请优先带原始资料咨询医生。\n"
        "注意事项：健康资料解读只用于日常管理参考，不替代医生诊断。"
    )


def _fallback_document_summary(payload: HealthDocumentSummaryRequest, structured_findings: dict) -> str:
    basis = payload.extractedText or payload.userDescription or f"已收到 {payload.fileName}"
    indicators = structured_findings.get("indicators", [])
    focus_areas = structured_findings.get("focusAreas", [])
    abnormal_keywords = structured_findings.get("abnormalKeywords", [])
    indicator_text = "、".join(
        f"{item['name']} {item['value']}{item.get('unit', '')}" for item in indicators[:5]
    ) or "暂未识别到明确数值，可补充报告中的箭头项或关键指标"
    focus_text = "、".join(focus_areas) or "需要结合报告项目、睡眠、饮食和主观感受继续判断"
    abnormal_text = "、".join(abnormal_keywords) or "未看到明确异常标记"
    return (
        f"资料重点：{basis[:180]}。\n"
        f"识别到的线索：{indicator_text}；异常提示词：{abnormal_text}。\n"
        f"可能相关方向：{focus_text}。\n"
        "需要追问：报告日期、带箭头的指标名称和数值、近期睡眠质量、饮食油糖摄入、运动量，以及是否有口干、疲劳、疼痛或其他不适。\n"
        "今日建议：先保持清淡饮食、规律饮水和低到中等强度活动；如果报告里有连续异常或身体明显不适，请带原报告咨询医生。"
    )


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


def _build_compact_tongue_prompt(profile: dict, payload: TongueAnalysisRequest) -> str:
    tongue = payload.tongue
    upload = payload.upload or {}
    return (
        "请基于以下舌诊标签生成中文健康管理报告，必须返回正文，不要空回复。\n"
        f"用户={profile['name']}，年龄={profile['age']}，职业={profile['occupation']}，日期={payload.date}。\n"
        f"舌色={tongue.get('tongueColor')}，舌苔={tongue.get('coatingThickness')}，津液={tongue.get('moisture')}，图片={upload.get('name', '未提供')}。\n"
        "结构：辨证倾向、舌象要点、饮食调理、推荐食疗、起居建议、注意事项。"
        "只做健康管理参考，不做疾病诊断。"
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
