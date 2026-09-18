from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.domain.types import ProfileType
from app.services.report_builder import build_daily_report

app = FastAPI(title="SenseLoop API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "anker-SenseLoop"}


@app.get("/api/profiles")
def get_profiles():
    return PROFILES


@app.get("/api/signals/{profile_type}")
def get_signals(profile_type: ProfileType):
    signals = MOCK_SIGNALS.get(profile_type)
    if signals is None:
        raise HTTPException(status_code=404, detail="profile_type not found")
    return signals


@app.get("/api/report/{profile_type}")
def get_report(profile_type: ProfileType):
    profile = next((item for item in PROFILES if item["profileType"] == profile_type), None)
    signals = MOCK_SIGNALS.get(profile_type)
    if profile is None or signals is None:
        raise HTTPException(status_code=404, detail="profile_type not found")
    return build_daily_report(profile, signals)
