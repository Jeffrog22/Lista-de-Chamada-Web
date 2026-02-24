import csv
import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlmodel import Session, select

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import models
from app.database import engine
from app.main import (
    DATA_DIR,
    _load_json_list,
    _map_attendance_value,
    _normalize_text,
    get_reports_statistics,
)

EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
OUT_FILE = os.path.join(EXPORT_DIR, "statistics_diff_top10.csv")


def old_statistics_like_before_fix(session: Session) -> List[Dict[str, Any]]:
    classes = session.exec(select(models.ImportClass)).all()
    class_by_code = {str(c.codigo or ""): c for c in classes}
    class_by_label = {str(c.turma_label or ""): c for c in classes}

    items = _load_json_list(os.path.join(DATA_DIR, "baseChamada.json"))
    students: Dict[str, Dict[str, Any]] = {}

    def ensure_student(name: str):
        key = _normalize_text(name)
        if key not in students:
            students[key] = {
                "nome": name,
                "per_level": {},
                "first_presence": None,
                "last_presence": None,
                "exclusion_date": None,
            }
        return students[key]

    for item in items:
        turma_codigo = str(item.get("turmaCodigo") or "").strip()
        turma_label = str(item.get("turmaLabel") or "").strip()
        nivel = ""
        cls = None
        if turma_codigo and turma_codigo in class_by_code:
            cls = class_by_code.get(turma_codigo)
        elif turma_label and turma_label in class_by_label:
            cls = class_by_label.get(turma_label)
        if cls:
            nivel = str(cls.nivel or "")

        for record in item.get("registros") or []:
            nome = str(record.get("aluno_nome") or "").strip()
            if not nome:
                continue
            st = ensure_student(nome)
            attendance_map = record.get("attendance") or {}

            for date_key in sorted(attendance_map.keys()):
                raw = str(attendance_map.get(date_key) or "").strip()
                mapped = _map_attendance_value(raw)
                if not date_key or mapped == "":
                    continue

                try:
                    parsed = datetime.strptime(date_key, "%Y-%m-%d").date()
                except Exception:
                    parsed = None

                if mapped in {"c", "j"} and parsed:
                    if st["first_presence"] is None or parsed < st["first_presence"]:
                        st["first_presence"] = parsed
                    if st["last_presence"] is None or parsed > st["last_presence"]:
                        st["last_presence"] = parsed

                level_key = nivel or "(sem-nivel)"
                lvl = st["per_level"].setdefault(
                    level_key,
                    {
                        "first": None,
                        "last": None,
                        "presencas": 0,
                        "faltas": 0,
                        "justificativas": 0,
                    },
                )
                if parsed:
                    if lvl["first"] is None or parsed < lvl["first"]:
                        lvl["first"] = parsed
                    if lvl["last"] is None or parsed > lvl["last"]:
                        lvl["last"] = parsed

                if mapped == "c":
                    lvl["presencas"] += 1
                elif mapped == "f":
                    lvl["faltas"] += 1
                elif mapped == "j":
                    lvl["justificativas"] += 1

    excluded = _load_json_list(os.path.join(DATA_DIR, "excludedStudents.json"))
    for ex in excluded:
        nome = str(ex.get("nome") or "").strip()
        if not nome:
            continue
        key = _normalize_text(nome)
        if key not in students:
            students[key] = {
                "nome": nome,
                "per_level": {},
                "first_presence": None,
                "last_presence": None,
                "exclusion_date": None,
            }
        date_str = str(ex.get("dataExclusao") or "").strip()
        if date_str:
            try:
                students[key]["exclusion_date"] = datetime.strptime(date_str, "%d/%m/%Y").date()
            except Exception:
                pass

    out: List[Dict[str, Any]] = []
    today = datetime.utcnow().date()
    for _, st in students.items():
        first = st.get("first_presence")
        exclusion = st.get("exclusion_date")
        end_date = exclusion or today
        retention_days = max(0, (end_date - first).days) if first else 0

        current_nivel = None
        candidates = [(k, v["last"]) for k, v in st.get("per_level", {}).items() if v.get("last")]
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            current_nivel = candidates[0][0]
            if current_nivel == "(sem-nivel)":
                current_nivel = None

        levels = []
        for lvl_name, vals in st.get("per_level", {}).items():
            levels.append(
                {
                    "nivel": "" if lvl_name == "(sem-nivel)" else lvl_name,
                    "presencas": int(vals.get("presencas") or 0),
                    "faltas": int(vals.get("faltas") or 0),
                    "justificativas": int(vals.get("justificativas") or 0),
                }
            )

        out.append(
            {
                "nome": st.get("nome") or "",
                "retentionDays": retention_days,
                "currentNivel": current_nivel,
                "levels": levels,
            }
        )

    return out


def sum_counts(levels: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    p = sum(int(level.get("presencas") or 0) for level in levels)
    f = sum(int(level.get("faltas") or 0) for level in levels)
    j = sum(int(level.get("justificativas") or 0) for level in levels)
    return p, f, j


def main() -> None:
    os.makedirs(EXPORT_DIR, exist_ok=True)

    with Session(engine) as session:
        old_stats = old_statistics_like_before_fix(session)
        new_stats_raw = get_reports_statistics(session=session)

    new_stats = [item.model_dump() if hasattr(item, "model_dump") else dict(item) for item in new_stats_raw]

    old_map = {_normalize_text(item.get("nome") or ""): item for item in old_stats}
    new_map = {_normalize_text(item.get("nome") or ""): item for item in new_stats}

    keys = sorted(set(old_map.keys()) | set(new_map.keys()))
    diffs = []
    for key in keys:
        old_item = old_map.get(key, {"nome": "", "retentionDays": 0, "currentNivel": "", "levels": []})
        new_item = new_map.get(key, {"nome": "", "retentionDays": 0, "currentNivel": "", "levels": []})

        old_p, old_f, old_j = sum_counts(old_item.get("levels") or [])
        new_p, new_f, new_j = sum_counts(new_item.get("levels") or [])

        delta_abs = abs(new_p - old_p) + abs(new_f - old_f) + abs(new_j - old_j) + abs(
            int(new_item.get("retentionDays") or 0) - int(old_item.get("retentionDays") or 0)
        )

        if delta_abs == 0:
            continue

        diffs.append(
            {
                "nome": new_item.get("nome") or old_item.get("nome") or "",
                "old_retention": int(old_item.get("retentionDays") or 0),
                "new_retention": int(new_item.get("retentionDays") or 0),
                "old_current_nivel": old_item.get("currentNivel") or "",
                "new_current_nivel": new_item.get("currentNivel") or "",
                "old_presencas": old_p,
                "new_presencas": new_p,
                "old_faltas": old_f,
                "new_faltas": new_f,
                "old_justificativas": old_j,
                "new_justificativas": new_j,
                "impact_score": delta_abs,
            }
        )

    diffs.sort(key=lambda item: item["impact_score"], reverse=True)
    top10 = diffs[:10]

    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "nome",
                "old_retention",
                "new_retention",
                "old_current_nivel",
                "new_current_nivel",
                "old_presencas",
                "new_presencas",
                "old_faltas",
                "new_faltas",
                "old_justificativas",
                "new_justificativas",
                "impact_score",
            ],
        )
        writer.writeheader()
        writer.writerows(top10)

    print(f"Diferenças encontradas: {len(diffs)}")
    print(f"Top 10 exportado em: {OUT_FILE}")
    for row in top10:
        print(
            f"- {row['nome']}: score={row['impact_score']} | "
            f"P {row['old_presencas']}->{row['new_presencas']} | "
            f"F {row['old_faltas']}->{row['new_faltas']} | "
            f"J {row['old_justificativas']}->{row['new_justificativas']}"
        )


if __name__ == "__main__":
    main()
