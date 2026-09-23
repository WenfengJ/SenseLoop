import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import load_local_env
from app.models.tables import Base

load_local_env()


def _default_sqlite_url() -> str:
    data_dir = Path(__file__).resolve().parents[1] / ".local"
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{data_dir / 'senseloop.db'}"


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _normalize_database_url(os.environ.get("DATABASE_URL", _default_sqlite_url()))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def open_session() -> Session:
    return SessionLocal()


def masked_database_url() -> str:
    if "@" not in DATABASE_URL or "://" not in DATABASE_URL:
        return DATABASE_URL
    scheme, rest = DATABASE_URL.split("://", 1)
    if ":" not in rest.split("@", 1)[0]:
        return DATABASE_URL
    _, host = rest.split("@", 1)
    return f"{scheme}://***:***@{host}"
