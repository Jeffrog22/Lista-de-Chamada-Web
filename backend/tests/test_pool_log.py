from pathlib import Path
import os
from typing import Any, Dict

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import main as app_main


def _build_payload(overrides: Dict[str, str] | None = None) -> Dict[str, Any]:
    base_payload = {
        "data": "2026-02-23",
        "turmaCodigo": "TEST-POOL",
        "turmaLabel": "Teste Pool",
        "horario": "10:15",
        "professor": "Prof. Teste",
        "clima1": "Sol",
        "clima2": "Calor",
        "statusAula": "normal",
        "nota": "aula",
        "tipoOcorrencia": "",
        "tempExterna": "27",
        "tempPiscina": "25",
        "cloroPpm": 2.5,
    }
    if overrides:
        base_payload.update(overrides)
    return base_payload


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setattr(app_main, "DATA_DIR", str(tmp_path))
    os.makedirs(tmp_path, exist_ok=True)
    with TestClient(app_main.app) as client_instance:
        yield client_instance


def test_pool_log_roundtrip(client: TestClient, tmp_path: Path):
    payload = _build_payload()
    response = client.post("/pool-log", json=payload)
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["action"] == "created"

    saved_file = tmp_path / "logPiscina.xlsx"
    assert saved_file.exists()
    df = pd.read_excel(saved_file)
    assert not df.empty

    created_row = df.iloc[-1]
    assert created_row["Data"] == payload["data"]
    assert created_row["TurmaCodigo"] == payload["turmaCodigo"]
    assert created_row["Professor"] == payload["professor"]
    assert created_row["Clima 1"] == payload["clima1"]
    assert isinstance(created_row["Cloro (ppm)"], (float, int))
    assert float(created_row["Cloro (ppm)"]) == float(payload["cloroPpm"])
    assert float(created_row["Temp. (C)"]) == float(payload["tempExterna"])
    assert float(created_row["Piscina (C)"]) == float(payload["tempPiscina"])

    params = {
        "date": payload["data"],
        "turmaCodigo": payload["turmaCodigo"],
        "horario": payload["horario"],
        "professor": payload["professor"],
    }
    get_resp = client.get("/pool-log", params=params)
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["turmaCodigo"] == payload["turmaCodigo"]
    assert fetched["professor"] == payload["professor"]
    assert fetched["clima1"] == payload["clima1"]


def test_pool_log_defaults_temp_piscina(client: TestClient, tmp_path: Path):
    payload = _build_payload({"tempPiscina": "nan"})
    response = client.post("/pool-log", json=payload)
    assert response.status_code == 200

    params = {
        "date": payload["data"],
        "turmaCodigo": payload["turmaCodigo"],
        "horario": payload["horario"],
        "professor": payload["professor"],
    }
    get_resp = client.get("/pool-log", params=params)
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["tempPiscina"] == "28"


def test_pool_log_daywide_baseline_with_professor_override_priority(client: TestClient):
    morning = _build_payload(
        {
            "data": "2026-03-10",
            "turmaCodigo": "A1",
            "turmaLabel": "Grupo A",
            "horario": "06:00",
            "professor": "Daniela",
            "clima1": "Nublado",
            "clima2": "Frio",
            "tempExterna": "20",
        }
    )
    afternoon = _build_payload(
        {
            "data": "2026-03-10",
            "turmaCodigo": "B2",
            "turmaLabel": "Grupo B",
            "horario": "13:00",
            "professor": "Jefferson",
            "clima1": "Chuva",
            "clima2": "Abafado",
            "tempExterna": "26",
        }
    )

    assert client.post("/pool-log", json=morning).status_code == 200
    assert client.post("/pool-log", json=afternoon).status_code == 200

    resp_default_10h = client.get(
        "/pool-log",
        params={
            "date": "2026-03-10",
            "turmaCodigo": "QUALQUER",
            "turmaLabel": "Outro Grupo",
            "horario": "10:00",
            "professor": "Outro Prof",
        },
    )
    assert resp_default_10h.status_code == 200
    assert resp_default_10h.json()["clima1"] == "Nublado"
    assert resp_default_10h.json()["professor"] == "Daniela"

    resp_default_16h = client.get(
        "/pool-log",
        params={
            "date": "2026-03-10",
            "turmaCodigo": "QUALQUER",
            "turmaLabel": "Outro Grupo",
            "horario": "16:00",
            "professor": "Outro Prof",
        },
    )
    assert resp_default_16h.status_code == 200
    assert resp_default_16h.json()["clima1"] == "Nublado"
    assert resp_default_16h.json()["horario"] == "06:00"

    resp_prof_override = client.get(
        "/pool-log",
        params={
            "date": "2026-03-10",
            "turmaCodigo": "QUALQUER",
            "turmaLabel": "Outro Grupo",
            "horario": "16:00",
            "professor": "Jefferson",
        },
    )
    assert resp_prof_override.status_code == 200
    assert resp_prof_override.json()["clima1"] == "Chuva"
    assert resp_prof_override.json()["horario"] == "13:00"


def test_pool_log_noop_when_same_day_state_repeats(client: TestClient, tmp_path: Path):
    payload = _build_payload({"data": "2026-03-11", "horario": "13:00"})

    first = client.post("/pool-log", json=payload)
    second = client.post("/pool-log", json=payload)

    assert first.status_code == 200
    assert first.json()["action"] == "created"
    assert second.status_code == 200
    assert second.json()["action"] == "noop"

    saved_file = tmp_path / "logPiscina.xlsx"
    df = pd.read_excel(saved_file)
    same_day = df[df["Data"] == payload["data"]]
    assert len(same_day) == 1
