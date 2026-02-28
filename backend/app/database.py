from sqlmodel import create_engine, Session
import os


def _normalize_database_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if not url:
        return "sqlite:///./dev.db"

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if url.startswith("postgresql+psycopg2://") and "sslmode=" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}sslmode=require"

    return url


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./dev.db"))
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)

def create_db_and_tables():
    from app.models import (
        Student,
        ClassModel,
        Attendance,
        Category,
        User,
        ImportUnit,
        ImportClass,
        ImportStudent,
    )
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(engine)

def get_session():
    from sqlmodel import Session
    with Session(engine) as session:
        yield session
