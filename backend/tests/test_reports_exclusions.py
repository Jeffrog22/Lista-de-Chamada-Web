from pathlib import Path
import json
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from app import database as db_module
from app import main as app_main
from app import models


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> Generator[TestClient, None, None]:
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

    with Session(test_engine) as session:
        unit = models.ImportUnit(name="Unidade Teste")
        session.add(unit)
        session.commit()
        session.refresh(unit)

        class_a = models.ImportClass(
            unit_id=unit.id,
            codigo="INF-A",
            turma_label="Terça e Quinta",
            horario="18:30",
            professor="Professor A",
            nivel="Iniciante",
            capacidade=20,
        )
        class_b = models.ImportClass(
            unit_id=unit.id,
            codigo="INF-B",
            turma_label="Quarta e Sexta",
            horario="19:15",
            professor="Professor B",
            nivel="Intermediário",
            capacidade=20,
        )
        session.add(class_a)
        session.add(class_b)
        session.commit()
        session.refresh(class_a)
        session.refresh(class_b)

        ana_class_a = models.ImportStudent(class_id=class_a.id, nome="Ana Silva")
        bruno_class_a = models.ImportStudent(class_id=class_a.id, nome="Bruno Lima")
        ana_class_b = models.ImportStudent(class_id=class_b.id, nome="Ana Silva")
        session.add(ana_class_a)
        session.add(bruno_class_a)
        session.add(ana_class_b)
        session.commit()
        session.refresh(ana_class_a)
        session.refresh(bruno_class_a)
        session.refresh(ana_class_b)

        excluded_items = [
            {
                "id": str(ana_class_a.id),
                "turmaCodigo": "INF-A",
                "horario": "1830",
                "professor": "Professor A",
            }
        ]
        (data_dir / "excludedStudents.json").write_text(
            json.dumps(excluded_items, ensure_ascii=False),
            encoding="utf-8",
        )

    with TestClient(app_main.app) as client_instance:
        yield client_instance


def test_reports_respect_id_based_exclusion_without_affecting_other_class(client: TestClient):
    response = client.get("/reports", params={"month": "2026-03"})
    assert response.status_code == 200

    payload = response.json()
    assert len(payload) == 2

    class_a = next(item for item in payload if item["professor"] == "Professor A")
    class_b = next(item for item in payload if item["professor"] == "Professor B")

    class_a_names = [student["nome"] for student in class_a["alunos"]]
    class_b_names = [student["nome"] for student in class_b["alunos"]]

    assert class_a_names == ["Bruno Lima"]
    assert class_b_names == ["Ana Silva"]
    assert class_a["alunos"][0]["student_uid"]
    assert class_b["alunos"][0]["student_uid"]
