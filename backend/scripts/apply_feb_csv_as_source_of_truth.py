import csv
import json
import os
import shutil
import sys
import unicodedata
from datetime import datetime
from typing import Dict, List, Tuple

from sqlmodel import Session, select

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
BASE_CHAMADA = os.path.join(DATA_DIR, "baseChamada.json")
BACKUP_DIR = os.path.join(DATA_DIR, "archive")
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import models
from app.database import engine

JEFFERSON_CSV = r"e:\Users\jeffux\Documents\Vinhedo\Bela Vista\Relatórios\Automações\att jefferson.CSV"
DANIELA_CSV = r"e:\Users\jeffux\Documents\Vinhedo\Bela Vista\Relatórios\Automações\att daniela.CSV"

TARGET_MATHEUS = "matheus henrique de souza marciano"
YEAR = "2026"
MONTH = "02"


def fold_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    text = " ".join(text.split())
    return text


def normalize_horario(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 3:
        return f"0{digits}"
    if len(digits) >= 4:
        return digits[:4]
    return digits


def map_status(value: str) -> str:
    token = fold_text(value)
    if token in {"c", "presente"}:
        return "Presente"
    if token in {"f", "falta"}:
        return "Falta"
    if token in {"j", "justificado"}:
        return "Justificado"
    return ""


def parse_csv(path: str, source: str) -> Dict[Tuple[str, str, str, str], Dict[str, Dict[str, str]]]:
    grouped: Dict[Tuple[str, str, str, str], Dict[str, Dict[str, str]]] = {}

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
                horario = normalize_horario(first.split(":", 1)[1].strip() if ":" in first else "")
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
            if not nome:
                continue

            statuses = [map_status(v) for v in row[1:1 + len(days)]]
            events = [(day, st) for day, st in zip(days, statuses) if st]
            if not events:
                continue

            # Matheus regra especial no CSV do Jefferson:
            # 4 primeiros registros = turma anterior (colunas J/K/L),
            # 2 últimos = turma atual.
            extra_turma = row[9].strip() if len(row) > 9 else ""
            extra_horario = normalize_horario(row[10].strip()) if len(row) > 10 else ""
            extra_professor = row[11].strip() if len(row) > 11 else ""
            is_matheus = fold_text(nome) == TARGET_MATHEUS and source == "jefferson"
            has_extra = bool(extra_turma and extra_horario and extra_professor)

            def add_event(target_turma: str, target_horario: str, target_professor: str, day: str, status: str) -> None:
                date_key = f"{YEAR}-{MONTH}-{str(day).zfill(2)}"
                class_key = (target_turma, target_horario, target_professor, source)
                grouped.setdefault(class_key, {})
                grouped[class_key].setdefault(nome, {})
                grouped[class_key][nome][date_key] = status

            if is_matheus and has_extra:
                # Regra final validada manualmente pelo usuário:
                # Iniciação: 04/02 a 18/02 => 2C, 0F, 1J
                # Nível 1 A: 19/02 em diante => 2C, 0F, 0J
                add_event(extra_turma, extra_horario, extra_professor, "04", "Presente")
                add_event(extra_turma, extra_horario, extra_professor, "11", "Justificado")
                add_event(extra_turma, extra_horario, extra_professor, "18", "Presente")
                add_event(turma, horario, professor, "19", "Presente")
                add_event(turma, horario, professor, "24", "Presente")
                continue

            for day, status in events:
                add_event(turma, horario, professor, day, status)

    return grouped


def _load_student_class_index() -> Dict[str, List[Dict[str, str]]]:
    index: Dict[str, List[Dict[str, str]]] = {}
    with Session(engine) as session:
        classes = session.exec(select(models.ImportClass)).all()
        class_by_id = {cls.id: cls for cls in classes}
        students = session.exec(select(models.ImportStudent)).all()

    for student in students:
        cls = class_by_id.get(student.class_id)
        if not cls:
            continue
        key = fold_text(student.nome)
        index.setdefault(key, []).append(
            {
                "codigo": str(cls.codigo or "").strip(),
                "turma": str(cls.turma_label or cls.codigo or "").strip(),
                "horario": normalize_horario(cls.horario or ""),
                "professor": str(cls.professor or "").strip(),
            }
        )
    return index


def _load_class_tuple_index() -> Dict[Tuple[str, str, str], Dict[str, str]]:
    index: Dict[Tuple[str, str, str], Dict[str, str]] = {}
    with Session(engine) as session:
        classes = session.exec(select(models.ImportClass)).all()

    for cls in classes:
        index[(
            fold_text(cls.turma_label or cls.codigo or ""),
            normalize_horario(cls.horario or ""),
            fold_text(cls.professor or ""),
        )] = {
            "codigo": str(cls.codigo or "").strip(),
            "turma": str(cls.turma_label or cls.codigo or "").strip(),
            "horario": normalize_horario(cls.horario or ""),
            "professor": str(cls.professor or "").strip(),
        }
    return index


def _pick_target_class(
    nome: str,
    turma: str,
    horario: str,
    professor: str,
    student_index: Dict[str, List[Dict[str, str]]],
    class_tuple_index: Dict[Tuple[str, str, str], Dict[str, str]],
) -> Dict[str, str]:
    direct = class_tuple_index.get((fold_text(turma), normalize_horario(horario), fold_text(professor)))
    if direct:
        return direct

    candidates = student_index.get(fold_text(nome), [])
    if not candidates:
        return {
            "codigo": "",
            "turma": turma,
            "horario": horario,
            "professor": professor,
        }

    turma_n = fold_text(turma)
    horario_n = normalize_horario(horario)
    professor_n = fold_text(professor)

    exact = [
        c
        for c in candidates
        if fold_text(c["turma"]) == turma_n
        and normalize_horario(c["horario"]) == horario_n
        and fold_text(c["professor"]) == professor_n
    ]
    if exact:
        return exact[0]

    close = [
        c
        for c in candidates
        if normalize_horario(c["horario"]) == horario_n
        and (professor_n in fold_text(c["professor"]) or fold_text(c["professor"]) in professor_n)
    ]
    if close:
        return close[0]

    if len(candidates) == 1:
        return candidates[0]

    return {
        "codigo": "",
        "turma": turma,
        "horario": horario,
        "professor": professor,
    }


def backup_base_chamada() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"baseChamada_backup_{stamp}.json")
    shutil.copy2(BASE_CHAMADA, backup_path)
    return backup_path


def load_base_chamada() -> List[dict]:
    if not os.path.exists(BASE_CHAMADA):
        return []
    with open(BASE_CHAMADA, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, list) else []


def strip_february_from_existing(items: List[dict]) -> List[dict]:
    target_month = f"{YEAR}-{MONTH}"
    out: List[dict] = []
    for item in items:
        if str(item.get("mes") or "").strip() == target_month:
            continue
        out.append(item)
    return out


def build_snapshot_items(grouped: Dict[Tuple[str, str, str, str], Dict[str, Dict[str, str]]]) -> List[dict]:
    snapshots: List[dict] = []
    saved_at = datetime.now().astimezone().isoformat()
    student_index = _load_student_class_index()
    class_tuple_index = _load_class_tuple_index()

    reassigned: Dict[Tuple[str, str, str, str], Dict[str, Dict[str, str]]] = {}

    for (turma, horario, professor, source), students in grouped.items():
        for nome, attendance in students.items():
            target = _pick_target_class(nome, turma, horario, professor, student_index, class_tuple_index)
            key = (
                str(target.get("codigo") or "").strip(),
                str(target.get("turma") or turma).strip(),
                normalize_horario(target.get("horario") or horario),
                str(target.get("professor") or professor).strip(),
            )
            reassigned.setdefault(key, {})
            reassigned[key].setdefault(nome, {})
            reassigned[key][nome].update(attendance)

    for (turma_codigo, turma, horario, professor), students in reassigned.items():
        registros = []
        for nome in sorted(students.keys(), key=lambda x: fold_text(x)):
            attendance = students[nome]
            justifications = {k: "CSV import" for k, v in attendance.items() if v == "Justificado"}
            registros.append(
                {
                    "aluno_nome": nome,
                    "attendance": dict(sorted(attendance.items())),
                    "justifications": justifications,
                }
            )

        snapshots.append(
            {
                "turmaCodigo": turma_codigo,
                "turmaLabel": turma,
                "horario": horario,
                "professor": professor,
                "mes": f"{YEAR}-{MONTH}",
                "saved_at": saved_at,
                "source": "csv_reconciled",
                "registros": registros,
            }
        )

    return snapshots


def main() -> None:
    if not os.path.exists(JEFFERSON_CSV) or not os.path.exists(DANIELA_CSV):
        raise FileNotFoundError("CSV(s) não encontrado(s) nos caminhos esperados")

    original = load_base_chamada()
    backup = backup_base_chamada() if os.path.exists(BASE_CHAMADA) else "(sem backup: baseChamada não existia)"

    stripped = strip_february_from_existing(original)

    grouped = {}
    grouped.update(parse_csv(JEFFERSON_CSV, "jefferson"))
    grouped_daniela = parse_csv(DANIELA_CSV, "daniela")
    for key, value in grouped_daniela.items():
        if key not in grouped:
            grouped[key] = value
        else:
            for nome, attendance in value.items():
                grouped[key].setdefault(nome, {})
                grouped[key][nome].update(attendance)

    snapshots = build_snapshot_items(grouped)
    final_payload = stripped + snapshots

    with open(BASE_CHAMADA, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    total_students = sum(len(item.get("registros") or []) for item in snapshots)
    print(f"Backup: {backup}")
    print(f"Snapshots CSV inseridos: {len(snapshots)}")
    print(f"Alunos com registros CSV: {total_students}")
    print(f"Arquivo atualizado: {BASE_CHAMADA}")


if __name__ == "__main__":
    main()
