from pathlib import Path
from typing import Generator
import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine

from app import database as db_module
from app import main as app_main


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> Generator[TestClient, None, None]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    test_db_path = tmp_path / "integration.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(db_module, "engine", test_engine)

    db_module.create_db_and_tables()

    with TestClient(app_main.app) as client_instance:
        yield client_instance


def _attendance_payload():
    return {
        "turmaCodigo": "TQ-01",
        "turmaLabel": "Terça e Quinta",
        "horario": "18:30",
        "professor": "Daniela",
        "mes": "2026-03",
        "clientSavedAt": "2026-03-31T10:00:00Z",
        "registros": [
            {
                "aluno_nome": "Aluno Integracao",
                "attendance": {
                    "2026-03-10": "Falta",
                },
                "justifications": {},
                "notes": [],
            }
        ],
    }


def _exclusion_payload():
    return {
        "id": "excl-1",
        "nome": "Aluno Integracao",
        "turma": "Terça e Quinta",
        "turmaCodigo": "TQ-01",
        "horario": "18:30",
        "professor": "Daniela",
        "dataExclusao": "31/03/2026",
        "motivo_exclusao": "Falta",
    }


def test_exclusion_does_not_remove_attendance_history(client: TestClient, tmp_path: Path):
    save_resp = client.post("/attendance-log", json=_attendance_payload())
    assert save_resp.status_code == 200

    exclusion_resp = client.post("/exclusions", json=_exclusion_payload())
    assert exclusion_resp.status_code == 200

    attendance_file = tmp_path / "data" / "baseChamada.json"
    assert attendance_file.exists()

    items = json.loads(attendance_file.read_text(encoding="utf-8"))
    assert isinstance(items, list)
    assert len(items) >= 1

    latest = items[-1]
    registros = latest.get("registros") or []
    assert len(registros) == 1

    attendance_map = registros[0].get("attendance") or {}
    assert attendance_map.get("2026-03-10") == "Falta"
