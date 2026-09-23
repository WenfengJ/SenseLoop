from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

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
    return senseloop_repo.add_agent_message(db, session_id, payload.message)


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
