#!/usr/bin/env python3
import argparse
import math
import os
import sys
from typing import Any

import pandas as pd
from sqlmodel import Session, SQLModel, create_engine, select

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import _normalize_database_url
from app.models import PoolLog

EXPECTED_COLUMNS = [
    "Data",
    "TurmaCodigo",
    "TurmaLabel",
    "Horario",
    "Professor",
    "Clima 1",
    "Clima 2",
    "Status_aula",
    "Nota",
    "Tipo_ocorrencia",
    "Temp. (C)",
    "Piscina (C)",
    "Cloro (ppm)",
]


def _norm_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def _norm_date(value: Any) -> str:
    raw = _norm_text(value)
    if not raw:
        return ""
    if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
        return raw[:10]
    dt = pd.to_datetime(raw, errors="coerce", dayfirst=True)
    if pd.isna(dt):
        return ""
    return dt.strftime("%Y-%m-%d")


def _norm_horario(value: Any) -> str:
    raw = _norm_text(value)
    if not raw:
        return ""

    if ":" in raw:
        hh, mm = raw.split(":", 1)
        return f"{hh.zfill(2)[:2]}:{mm.zfill(2)[:2]}"

    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 3:
        digits = "0" + digits
    if len(digits) >= 4:
        return f"{digits[:2]}:{digits[2:4]}"
    return raw


def _parse_float_or_none(value: Any) -> float | None:
    raw = _norm_text(value).replace(",", ".")
    if not raw or raw == "-":
        return None
    try:
        parsed = float(raw)
        return parsed if math.isfinite(parsed) else None
    except ValueError:
        return None


def _build_engine(target: str, database_url: str | None) -> tuple[Any, str]:
    if target == "local":
        resolved_url = "sqlite:///./dev.db"
    else:
        raw = database_url or os.getenv("DATABASE_URL")
        if not raw:
            raise RuntimeError("DATABASE_URL não definido para target=prod. Use --database-url ou exporte DATABASE_URL.")
        resolved_url = _normalize_database_url(raw)

    connect_args = {"check_same_thread": False} if resolved_url.startswith("sqlite") else {}
    return create_engine(resolved_url, echo=False, connect_args=connect_args), resolved_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Repopula pool_logs a partir de data/logPiscina.xlsx")
    parser.add_argument("--target", choices=["local", "prod"], default="local", help="Destino da carga")
    parser.add_argument("--database-url", default="", help="Obrigatório para prod quando DATABASE_URL não estiver no ambiente")
    parser.add_argument(
        "--excel",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "logPiscina.xlsx"),
        help="Caminho para logPiscina.xlsx",
    )
    parser.add_argument("--dry-run", action="store_true", help="Não grava no banco, apenas mostra contagem")
    args = parser.parse_args()

    excel_path = os.path.abspath(args.excel)
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Arquivo não encontrado: {excel_path}")

    engine, resolved_url = _build_engine(args.target, args.database_url.strip() or None)
    SQLModel.metadata.create_all(engine)

    df = pd.read_excel(excel_path).fillna("")
    for col in EXPECTED_COLUMNS:
        if col not in df.columns:
            df[col] = ""

    payloads: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        payload = {
            "data": _norm_date(row.get("Data", "")),
            "turma_codigo": _norm_text(row.get("TurmaCodigo", "")),
            "turma_label": _norm_text(row.get("TurmaLabel", "")),
            "horario": _norm_horario(row.get("Horario", "")),
            "professor": _norm_text(row.get("Professor", "")),
            "clima1": _norm_text(row.get("Clima 1", "")),
            "clima2": _norm_text(row.get("Clima 2", "")),
            "status_aula": _norm_text(row.get("Status_aula", "")),
            "nota": _norm_text(row.get("Nota", "")),
            "tipo_ocorrencia": _norm_text(row.get("Tipo_ocorrencia", "")),
            "temp_externa": _norm_text(row.get("Temp. (C)", "")),
            "temp_piscina": _norm_text(row.get("Piscina (C)", "")),
            "cloro_ppm": _parse_float_or_none(row.get("Cloro (ppm)", None)),
        }
        if payload["data"]:
            payloads.append(payload)

    created = 0
    skipped = 0

    with Session(engine) as session:
        existing = session.exec(select(PoolLog)).all()
        existing_keys = {
            (
                _norm_date(item.data),
                _norm_text(item.turma_codigo),
                _norm_text(item.turma_label),
                _norm_horario(item.horario),
                _norm_text(item.professor),
            )
            for item in existing
        }

        for payload in payloads:
            key = (
                payload["data"],
                payload["turma_codigo"],
                payload["turma_label"],
                payload["horario"],
                payload["professor"],
            )
            if key in existing_keys:
                skipped += 1
                continue

            if not args.dry_run:
                session.add(PoolLog(**payload, saved_at=pd.Timestamp.now("UTC").isoformat()))
            existing_keys.add(key)
            created += 1

        if not args.dry_run:
            session.commit()

    print(f"target={args.target}")
    print(f"database={resolved_url}")
    print(f"excel={excel_path}")
    print(f"valid_rows={len(payloads)}")
    print(f"created={created}")
    print(f"skipped_existing={skipped}")
    print(f"dry_run={args.dry_run}")


if __name__ == "__main__":
    main()
