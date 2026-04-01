from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine

from app import database as db_module
from app import main as app_main


def _csv_payload() -> str:
    return "\n".join(
        [
            "unidade,turma_codigo,horario,professor,nivel,capacidade,dias_semana,aluno_turma,aluno_nome,whatsapp,data_nascimento,data_atest,categoria,genero,parq,atestado",
            "Piscina Bela Vista,BV-001,08:30,Prof Teste,Iniciante,20,SEG/QUA,Turma Manha,Ana Teste,19999999999,01/01/2010,,A,F,PARQ-1,sim",
        ]
    )


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> Generator[TestClient, None, None]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    test_db_path = tmp_path / "import.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(db_module, "engine", test_engine)

    db_module.create_db_and_tables()

    with TestClient(app_main.app) as client_instance:
        yield client_instance


def test_import_data_and_bootstrap_return_units_classes_and_students(client: TestClient):
    content = _csv_payload().encode("utf-8")

    import_response = client.post(
        "/api/import-data",
        files={"file": ("import.csv", content, "text/csv")},
        data={"apply_overrides": "false"},
    )

    assert import_response.status_code == 200
    payload = import_response.json()
    assert payload["students_created"] == 1

    bootstrap_response = client.get("/api/bootstrap")
    assert bootstrap_response.status_code == 200

    bootstrap = bootstrap_response.json()
    assert len(bootstrap["units"]) == 1
    assert bootstrap["units"][0]["name"] == "Piscina Bela Vista"
    assert len(bootstrap["classes"]) == 1
    assert bootstrap["classes"][0]["codigo"] == "BV-001"
    assert len(bootstrap["students"]) == 1
    assert bootstrap["students"][0]["nome"] == "Ana Teste"
