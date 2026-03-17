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
        AttendanceLog,
    )
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(engine)

def get_session():
    from sqlmodel import Session
    with Session(engine) as session:
        yield session


def migrate_db():
    """Run one-time schema migrations (idempotent)."""
    if DATABASE_URL.startswith("sqlite"):
        _migrate_sqlite_nullable_class_id()
    elif "postgresql" in DATABASE_URL:
        _migrate_postgresql_nullable_class_id()


def _migrate_sqlite_nullable_class_id():
    db_path = DATABASE_URL
    for prefix in ("sqlite:///./", "sqlite:///", "sqlite://"):
        if db_path.startswith(prefix):
            db_path = db_path[len(prefix):]
            break
    if not os.path.exists(db_path):
        return  # new DB — create_db_and_tables will build it with Optional already
    import sqlite3
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.execute("PRAGMA table_info(import_students)")
        columns = {row[1]: row for row in cursor.fetchall()}
        if "class_id" not in columns:
            return  # table not created yet
        if columns["class_id"][3] == 0:
            return  # notnull=0 means already nullable — nothing to do
        # Recreate table so class_id becomes nullable
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN TRANSACTION")
        conn.execute(
            """
            CREATE TABLE import_students_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER,
                nome TEXT NOT NULL DEFAULT '',
                whatsapp TEXT NOT NULL DEFAULT '',
                data_nascimento TEXT NOT NULL DEFAULT '',
                data_atestado TEXT NOT NULL DEFAULT '',
                categoria TEXT NOT NULL DEFAULT '',
                genero TEXT NOT NULL DEFAULT '',
                parq TEXT NOT NULL DEFAULT '',
                atestado INTEGER NOT NULL DEFAULT 0,
                UNIQUE(class_id, nome)
            )
            """
        )
        conn.execute(
            """
            INSERT INTO import_students_new
            SELECT id, class_id, nome, whatsapp, data_nascimento,
                   data_atestado, categoria, genero, parq, atestado
            FROM import_students
            """
        )
        conn.execute("DROP TABLE import_students")
        conn.execute("ALTER TABLE import_students_new RENAME TO import_students")
        conn.execute("COMMIT")
        conn.execute("PRAGMA foreign_keys = ON")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _migrate_postgresql_nullable_class_id():
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE import_students ALTER COLUMN class_id DROP NOT NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()
            # Already nullable or table doesn't exist yet — harmless
