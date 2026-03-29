from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine

from app import database as db_module
from app import main as app_main


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> Generator[TestClient, None, None]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    test_db_path = tmp_path / "auth.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(app_main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(db_module, "engine", test_engine)

    db_module.create_db_and_tables()

    with TestClient(app_main.app) as client_instance:
        yield client_instance


def _register_user(client: TestClient) -> None:
    response = client.post(
        "/users/register",
        params={"username": "operator", "password": "123456"},
    )
    assert response.status_code == 200


def test_token_allows_matching_unit(client: TestClient, monkeypatch):
    monkeypatch.setattr(app_main, "UNIT_NAME", "São Matheus")
    monkeypatch.setattr(app_main, "ENV_NAME", "piloto-sao-matheus")
    _register_user(client)

    response = client.post(
        "/token",
        data={
            "username": "operator",
            "password": "123456",
            "unit_name": "Sao Matheus",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["unit_name"] == "São Matheus"
    assert payload["env_name"] == "piloto-sao-matheus"


def test_token_blocks_mismatched_unit(client: TestClient, monkeypatch):
    monkeypatch.setattr(app_main, "UNIT_NAME", "Piscina Bela Vista")
    _register_user(client)

    response = client.post(
        "/token",
        data={
            "username": "operator",
            "password": "123456",
            "unit_name": "Parque Municipal",
        },
    )

    assert response.status_code == 400
    assert "aceita apenas a unidade" in response.json()["detail"]


def test_token_requires_unit_when_environment_is_locked(client: TestClient, monkeypatch):
    monkeypatch.setattr(app_main, "UNIT_NAME", "Vila João XXIII")
    _register_user(client)

    response = client.post(
        "/token",
        data={
            "username": "operator",
            "password": "123456",
        },
    )

    assert response.status_code == 400
    assert "Unidade obrigatória" in response.json()["detail"]
