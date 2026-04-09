import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import main as app_main


def _write_json(path: Path, payload: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def _mk_exclusion(idx: int) -> dict:
    return {
        "id": f"excl-{idx}",
        "student_uid": f"uid-{idx}",
        "nome": f"Aluno {idx}",
        "turma": "Turma A",
        "horario": "18:30",
        "professor": "Prof. Teste",
        "dataExclusao": "08/04/2026",
        "motivo_exclusao": "Falta",
    }


def test_recover_exclusions_uses_largest_eligible_backup(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    archive_dir = data_dir / "archive"
    current_file = data_dir / "excludedStudents.json"

    _write_json(current_file, [])
    _write_json(archive_dir / "excludedStudents_backup_20260408_100000.json", [_mk_exclusion(1), _mk_exclusion(2)])
    _write_json(
        archive_dir / "excludedStudents_backup_20260408_103000.json",
        [_mk_exclusion(i) for i in range(1, 26)],
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))

    with TestClient(app_main.app) as client:
        recover_response = client.post(
            "/exclusions/recover",
            json={"expected_min_items": 20, "force": True, "merge": False},
        )
        assert recover_response.status_code == 200
        body = recover_response.json()
        assert body["ok"] is True
        assert body["after"] == 25
        assert body["backup_count"] == 25

        list_response = client.get("/exclusions")
        assert list_response.status_code == 200
        restored = list_response.json()
        assert len(restored) == 25
        assert any(item.get("nome") == "Aluno 25" for item in restored)


def test_recover_exclusions_requires_force_when_current_not_empty(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    archive_dir = data_dir / "archive"
    current_file = data_dir / "excludedStudents.json"

    _write_json(current_file, [_mk_exclusion(101)])
    _write_json(archive_dir / "excludedStudents_backup_20260408_103000.json", [_mk_exclusion(i) for i in range(1, 4)])

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))

    with TestClient(app_main.app) as client:
        recover_response = client.post(
            "/exclusions/recover",
            json={"expected_min_items": 1, "force": False, "merge": False},
        )
        assert recover_response.status_code == 409
        assert "Lista atual nao esta vazia" in recover_response.json().get("detail", "")
