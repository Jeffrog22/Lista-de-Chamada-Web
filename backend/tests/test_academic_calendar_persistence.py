from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, select

from app import database as db_module
from app import main as app_main
from app.models import AcademicCalendarState


def _build_settings_payload() -> dict[str, object]:
    return {
        "schoolYear": 2026,
        "inicioAulas": "2026-01-01",
        "feriasInvernoInicio": "2026-07-01",
        "feriasInvernoFim": "2026-07-31",
        "terminoAulas": "2026-12-31",
    }


def _build_event_payload() -> dict[str, object]:
    return {
        "date": "2026-02-23",
        "type": "feriado",
        "allDay": True,
        "startTime": "",
        "endTime": "",
        "description": "Carnaval",
        "teacher": "",
    }


def _calendar_state_rows(engine) -> list[AcademicCalendarState]:
    with Session(engine) as session:
        return session.exec(select(AcademicCalendarState)).all()


def test_academic_calendar_persists_in_database_and_survives_json_loss(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    test_db_path = tmp_path / "reports.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(db_module, "engine", test_engine)

    db_module.create_db_and_tables()

    with TestClient(app_main.app) as client:
        settings_response = client.put("/academic-calendar/settings", json=_build_settings_payload())
        assert settings_response.status_code == 200
        assert settings_response.json()["ok"] is True

        event_response = client.post("/academic-calendar/events", json=_build_event_payload())
        assert event_response.status_code == 200
        assert event_response.json()["ok"] is True

        rows = _calendar_state_rows(test_engine)
        assert len(rows) == 1
        assert "Carnaval" in rows[0].state_json

        saved_file = data_dir / "academicCalendar.json"
        assert saved_file.exists()
        saved_file.unlink()

        refresh_response = client.get("/academic-calendar", params={"month": "2026-02"})
        assert refresh_response.status_code == 200
        payload = refresh_response.json()
        assert payload["settings"]["schoolYear"] == 2026
        assert len(payload["events"]) == 1
        assert payload["events"][0]["description"] == "Carnaval"