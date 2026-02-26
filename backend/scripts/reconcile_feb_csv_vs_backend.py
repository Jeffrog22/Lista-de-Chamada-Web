import csv
import json
import os
import sys
import unicodedata
from collections import defaultdict
from typing import Dict, List, Tuple

from sqlmodel import Session

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import engine
from app.main import get_reports

JEFFERSON_CSV = r"e:\Users\jeffux\Documents\Vinhedo\Bela Vista\Relatórios\Automações\att jefferson.CSV"
DANIELA_CSV = r"e:\Users\jeffux\Documents\Vinhedo\Bela Vista\Relatórios\Automações\att daniela.CSV"
MONTH = "2026-02"

TARGET_MATHEUS = "matheus henrique de souza marciano"

OUT_DIR = os.path.join(BASE_DIR, "data", "exports")
OUT_COMPARE = os.path.join(OUT_DIR, "conferencia_fev_csv_vs_backend.csv")
OUT_MATHEUS = os.path.join(OUT_DIR, "conferencia_matheus_detalhe.csv")
EXCLUSIONS_PATH = os.path.join(BASE_DIR, "data", "excludedStudents.json")


def fold_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    text = " ".join(text.split())
    return text


def clean_status(value: str) -> str:
    token = fold_text(value)
    if token in {"c", "presente"}:
        return "c"
    if token in {"f", "falta"}:
        return "f"
    if token in {"j", "justificado"}:
        return "j"
    return ""


def parse_csv(path: str, source: str) -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []
    turma = ""
    horario = ""
    professor = ""
    days: List[str] = []

    with open(path, "r", encoding="cp1252", errors="replace") as f:
        reader = csv.reader(f, delimiter=";")
        for row in reader:
            if not row:
                continue
            first = (row[0] or "").strip()
            key = fold_text(first)

            if key.startswith("turma:"):
                turma = first.split(":", 1)[1].strip() if ":" in first else ""
                continue
            if key.startswith("horario:"):
                horario = first.split(":", 1)[1].strip() if ":" in first else ""
                continue
            if key.startswith("professor:"):
                professor = first.split(":", 1)[1].strip() if ":" in first else ""
                continue
            if key.startswith("alunos"):
                days = [str(col).strip() for col in row[1:] if str(col).strip()]
                continue

            if not turma or not horario or not professor or not days:
                continue

            nome = first.strip()
            if not nome or fold_text(nome) in {"", "alunos"}:
                continue

            statuses = [clean_status(value) for value in row[1:1 + len(days)]]
            events = []
            for day, status in zip(days, statuses):
                if status in {"c", "f", "j"}:
                    events.append((day, status))

            if not events:
                continue

            extra_turma = row[9].strip() if len(row) > 9 else ""
            extra_horario = row[10].strip() if len(row) > 10 else ""
            extra_professor = row[11].strip() if len(row) > 11 else ""

            is_matheus = fold_text(nome) == TARGET_MATHEUS and source == "jefferson"
            has_extra = bool(extra_turma and extra_horario and extra_professor)

            if is_matheus and has_extra:
                # Regra final validada manualmente pelo usuário:
                # Iniciação: 04/02 a 18/02 => 2C, 0F, 1J
                # Nível 1 A: 19/02 em diante => 2C, 0F, 0J
                records.extend([
                    {
                        "source": source,
                        "nome": nome,
                        "turma": extra_turma,
                        "horario": extra_horario,
                        "professor": extra_professor,
                        "dia": "04",
                        "status": "c",
                        "rule": "matheus_anterior_manual",
                    },
                    {
                        "source": source,
                        "nome": nome,
                        "turma": extra_turma,
                        "horario": extra_horario,
                        "professor": extra_professor,
                        "dia": "11",
                        "status": "j",
                        "rule": "matheus_anterior_manual",
                    },
                    {
                        "source": source,
                        "nome": nome,
                        "turma": extra_turma,
                        "horario": extra_horario,
                        "professor": extra_professor,
                        "dia": "18",
                        "status": "c",
                        "rule": "matheus_anterior_manual",
                    },
                    {
                        "source": source,
                        "nome": nome,
                        "turma": turma,
                        "horario": horario,
                        "professor": professor,
                        "dia": "19",
                        "status": "c",
                        "rule": "matheus_atual_manual",
                    },
                    {
                        "source": source,
                        "nome": nome,
                        "turma": turma,
                        "horario": horario,
                        "professor": professor,
                        "dia": "24",
                        "status": "c",
                        "rule": "matheus_atual_manual",
                    },
                ])
                continue

            for day, status in events:
                records.append({
                    "source": source,
                    "nome": nome,
                    "turma": turma,
                    "horario": horario,
                    "professor": professor,
                    "dia": day,
                    "status": status,
                    "rule": "default",
                })

    return records


def sum_counts(records: List[Dict[str, str]]) -> Dict[str, Dict[str, int]]:
    out: Dict[str, Dict[str, int]] = defaultdict(lambda: {"c": 0, "f": 0, "j": 0})
    for rec in records:
        key = fold_text(rec["nome"])
        st = rec["status"]
        if st in {"c", "f", "j"}:
            out[key][st] += 1
    return out


def load_excluded_names() -> set[str]:
    if not os.path.exists(EXCLUSIONS_PATH):
        return set()
    with open(EXCLUSIONS_PATH, "r", encoding="utf-8") as f:
        items = json.load(f)
    names = set()
    for item in items if isinstance(items, list) else []:
        name = fold_text(item.get("nome") or item.get("Nome") or "")
        if name:
            names.add(name)
    return names


def load_backend_counts() -> Dict[str, Dict[str, int]]:
    with Session(engine) as session:
        reports = get_reports(month=MONTH, session=session)

    out: Dict[str, Dict[str, int]] = defaultdict(lambda: {"c": 0, "f": 0, "j": 0})
    for cls in reports:
        for aluno in cls.alunos:
            key = fold_text(aluno.nome)
            out[key]["c"] += int(aluno.presencas or 0)
            out[key]["f"] += int(aluno.faltas or 0)
            out[key]["j"] += int(aluno.justificativas or 0)
    return out


def export_comparison(csv_counts: Dict[str, Dict[str, int]], backend_counts: Dict[str, Dict[str, int]], excluded_names: set[str]) -> None:
    keys = sorted(set(csv_counts.keys()) | set(backend_counts.keys()))
    rows = []
    for key in keys:
        if key in excluded_names:
            continue
        c_csv = csv_counts.get(key, {"c": 0, "f": 0, "j": 0})
        c_bk = backend_counts.get(key, {"c": 0, "f": 0, "j": 0})
        dc = c_bk["c"] - c_csv["c"]
        df = c_bk["f"] - c_csv["f"]
        dj = c_bk["j"] - c_csv["j"]
        if dc == 0 and df == 0 and dj == 0:
            continue
        rows.append({
            "nome_normalizado": key,
            "csv_c": c_csv["c"],
            "backend_c": c_bk["c"],
            "delta_c": dc,
            "csv_f": c_csv["f"],
            "backend_f": c_bk["f"],
            "delta_f": df,
            "csv_j": c_csv["j"],
            "backend_j": c_bk["j"],
            "delta_j": dj,
            "impact_score": abs(dc) + abs(df) + abs(dj),
        })

    rows.sort(key=lambda x: x["impact_score"], reverse=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_COMPARE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "nome_normalizado",
                "csv_c", "backend_c", "delta_c",
                "csv_f", "backend_f", "delta_f",
                "csv_j", "backend_j", "delta_j",
                "impact_score",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def export_matheus_detail(records: List[Dict[str, str]], backend_counts: Dict[str, Dict[str, int]]) -> None:
    matheus_rows = [r for r in records if fold_text(r["nome"]) == TARGET_MATHEUS]
    by_class: Dict[Tuple[str, str, str], Dict[str, int]] = defaultdict(lambda: {"c": 0, "f": 0, "j": 0})
    for rec in matheus_rows:
        cls_key = (rec["turma"], rec["horario"], rec["professor"])
        by_class[cls_key][rec["status"]] += 1

    backend = backend_counts.get(TARGET_MATHEUS, {"c": 0, "f": 0, "j": 0})

    rows = []
    for (turma, horario, professor), counts in by_class.items():
        rows.append({
            "turma": turma,
            "horario": horario,
            "professor": professor,
            "csv_c": counts["c"],
            "csv_f": counts["f"],
            "csv_j": counts["j"],
            "obs": "regra manual aplicada (Iniciação 04-18 / Nível 1 A 19+)",
        })

    rows.append({
        "turma": "TOTAL_BACKEND_FEVEREIRO",
        "horario": "",
        "professor": "",
        "csv_c": backend["c"],
        "csv_f": backend["f"],
        "csv_j": backend["j"],
        "obs": "totais backend reports/2026-02",
    })

    with open(OUT_MATHEUS, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["turma", "horario", "professor", "csv_c", "csv_f", "csv_j", "obs"],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    records = []
    records.extend(parse_csv(JEFFERSON_CSV, "jefferson"))
    records.extend(parse_csv(DANIELA_CSV, "daniela"))

    csv_counts = sum_counts(records)
    backend_counts = load_backend_counts()
    excluded_names = load_excluded_names()

    export_comparison(csv_counts, backend_counts, excluded_names)
    export_matheus_detail(records, backend_counts)

    print(f"Registros CSV válidos: {len(records)}")
    print(f"Comparativo salvo em: {OUT_COMPARE}")
    print(f"Detalhe Matheus salvo em: {OUT_MATHEUS}")


if __name__ == "__main__":
    main()
