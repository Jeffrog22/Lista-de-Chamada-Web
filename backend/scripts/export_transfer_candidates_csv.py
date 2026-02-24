import csv
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlmodel import Session
from app.database import engine
from app.main import get_reports_statistics

EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
EXPORT_FILE = os.path.join(EXPORT_DIR, "transfer_candidates.csv")


def normalize_text(value: str) -> str:
    return str(value or "").strip().lower()


def parse_iso_date(value: Optional[str]) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except Exception:
        return None


def format_br_date(value: Optional[str]) -> str:
    parsed = parse_iso_date(value)
    if not parsed:
        return ""
    return parsed.strftime("%d/%m/%Y")


def canonical_stage(level_name: str) -> Tuple[Optional[int], Optional[str]]:
    normalized = normalize_text(level_name)
    if not normalized:
        return None, None

    if "inici" in normalized:
        return 0, "Iniciação"

    match = re.search(r"nivel\s*([1-4])", normalized)
    if match:
        value = int(match.group(1))
        return value, f"Nível {value}"

    return None, None


def aggregate_stages(levels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[int, Dict[str, Any]] = {}

    for level in levels:
        rank, canonical = canonical_stage(str(level.get("nivel") or ""))
        if rank is None or canonical is None:
            continue

        first = parse_iso_date(level.get("firstDate"))
        last = parse_iso_date(level.get("lastDate"))

        row = grouped.get(rank)
        if not row:
            grouped[rank] = {
                "rank": rank,
                "canonical": canonical,
                "firstDate": level.get("firstDate") or "",
                "lastDate": level.get("lastDate") or "",
                "first_dt": first,
                "last_dt": last,
                "presencas": int(level.get("presencas") or 0),
                "faltas": int(level.get("faltas") or 0),
                "justificativas": int(level.get("justificativas") or 0),
                "labels": set([str(level.get("nivel") or "").strip()]),
            }
            continue

        if first and (row["first_dt"] is None or first < row["first_dt"]):
            row["first_dt"] = first
            row["firstDate"] = first.strftime("%Y-%m-%d")

        if last and (row["last_dt"] is None or last > row["last_dt"]):
            row["last_dt"] = last
            row["lastDate"] = last.strftime("%Y-%m-%d")

        row["presencas"] += int(level.get("presencas") or 0)
        row["faltas"] += int(level.get("faltas") or 0)
        row["justificativas"] += int(level.get("justificativas") or 0)
        row["labels"].add(str(level.get("nivel") or "").strip())

    stages = list(grouped.values())
    stages.sort(key=lambda item: (item["first_dt"] is None, item["first_dt"] or datetime.max, item["rank"]))
    return stages


def build_transfer_rows(statistics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    for student in statistics:
        nome = str(student.get("nome") or "").strip()
        levels = student.get("levels") or []
        if not nome or not isinstance(levels, list):
            continue

        stages = aggregate_stages(levels)
        if len(stages) < 2:
            continue

        for idx in range(1, len(stages)):
            origin = stages[idx - 1]
            destination = stages[idx]

            # Only real stage changes (Iniciação <-> Nível 1..4)
            if origin["rank"] == destination["rank"]:
                continue

            rows.append({
                "nome": nome,
                "dataTransferencia": format_br_date(destination.get("firstDate")),
                "nivelOrigem": origin.get("canonical") or "",
                "nivelDestino": destination.get("canonical") or "",
                "turmaOrigem": " | ".join(sorted([x for x in origin.get("labels", set()) if x])) or "",
                "turmaDestino": " | ".join(sorted([x for x in destination.get("labels", set()) if x])) or "",
                "horarioDestino": "",
                "professorDestino": "",
                "presencasOrigem": origin.get("presencas", 0),
                "faltasOrigem": origin.get("faltas", 0),
                "justificativasOrigem": origin.get("justificativas", 0),
                "presencasDestino": destination.get("presencas", 0),
                "faltasDestino": destination.get("faltas", 0),
                "justificativasDestino": destination.get("justificativas", 0),
                "presencasOrigemReal": "",
                "faltasOrigemReal": "",
                "justificativasOrigemReal": "",
                "presencasDestinoReal": "",
                "faltasDestinoReal": "",
                "justificativasDestinoReal": "",
                "observacao": "Transferência real por nível (A/B da mesma etapa ignorado)",
            })

    rows.sort(key=lambda item: (normalize_text(item["nome"]), item["dataTransferencia"]))
    return rows


def main() -> None:
    os.makedirs(EXPORT_DIR, exist_ok=True)

    with Session(engine) as session:
        stats = get_reports_statistics(session=session)

    normalized = [item.dict() if hasattr(item, "dict") else dict(item) for item in stats]
    rows = build_transfer_rows(normalized)

    fieldnames = [
        "nome",
        "dataTransferencia",
        "nivelOrigem",
        "nivelDestino",
        "turmaOrigem",
        "turmaDestino",
        "horarioDestino",
        "professorDestino",
        "presencasOrigem",
        "faltasOrigem",
        "justificativasOrigem",
        "presencasDestino",
        "faltasDestino",
        "justificativasDestino",
        "presencasOrigemReal",
        "faltasOrigemReal",
        "justificativasOrigemReal",
        "presencasDestinoReal",
        "faltasDestinoReal",
        "justificativasDestinoReal",
        "observacao",
    ]

    with open(EXPORT_FILE, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Export concluído: {EXPORT_FILE}")
    print(f"Transferências reais encontradas: {len(rows)}")


if __name__ == "__main__":
    main()
