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

    test_db_path = tmp_path / "attendance.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(db_module, "engine", test_engine)

    db_module.create_db_and_tables()

    with TestClient(app_main.app) as client_instance:
        yield client_instance


def _payload(status_value: str, client_saved_at: str):
    return {
        "turmaCodigo": "TQ-01",
        "turmaLabel": "Terça e Quinta",
        "horario": "18:30",
        "professor": "Daniela",
        "mes": "2026-03",
        "clientSavedAt": client_saved_at,
        "registros": [
            {
                "aluno_nome": "Aluno Teste",
                "attendance": {
                    "2026-03-10": status_value,
                },
                "justifications": {"2026-03-10": "Motivo inicial"},
                "notes": [],
            }
        ],
    }


def test_merge_does_not_erase_existing_status_when_incoming_is_empty(client: TestClient, tmp_path: Path):
    first = client.post("/attendance-log", json=_payload("Presente", "2026-03-31T10:00:00Z"))
    assert first.status_code == 200

    second = client.post("/attendance-log", json=_payload("", "2026-03-31T10:05:00Z"))
    assert second.status_code == 200

    output_file = tmp_path / "data" / "baseChamada.json"
    assert output_file.exists()

    items = json.loads(output_file.read_text(encoding="utf-8"))
    assert isinstance(items, list)
    assert len(items) >= 1

    latest = items[-1]
    registros = latest.get("registros") or []
    assert len(registros) == 1

    attendance_map = registros[0].get("attendance") or {}
    assert attendance_map.get("2026-03-10") == "Presente"


def test_merge_does_not_erase_existing_justification_when_incoming_is_empty(client: TestClient, tmp_path: Path):
    first = client.post("/attendance-log", json=_payload("Justificado", "2026-03-31T10:00:00Z"))
    assert first.status_code == 200

    payload = _payload("Justificado", "2026-03-31T10:05:00Z")
    payload["registros"][0]["justifications"] = {"2026-03-10": ""}
    second = client.post("/attendance-log", json=payload)
    assert second.status_code == 200

    output_file = tmp_path / "data" / "baseChamada.json"
    assert output_file.exists()

    items = json.loads(output_file.read_text(encoding="utf-8"))
    assert isinstance(items, list)
    latest = items[-1]
    registros = latest.get("registros") or []
    assert len(registros) == 1

    justifications_map = registros[0].get("justifications") or {}
    assert justifications_map.get("2026-03-10") == "Motivo inicial"
