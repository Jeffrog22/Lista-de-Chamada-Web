import json
import os
import sys
import unicodedata
from typing import Dict, List, Tuple

from sqlmodel import Session, select

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import models
from app.database import engine

BASE_CHAMADA = os.path.join(BASE_DIR, "data", "baseChamada.json")
EXCLUSIONS = os.path.join(BASE_DIR, "data", "excludedStudents.json")
MONTH = "2026-02"


def fold_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    return " ".join(text.split())


def normalize_horario(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[:4]


def to_proper_case(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = raw.split()
    lower_particles = {"da", "de", "do", "das", "dos", "e"}
    output = []
    for idx, part in enumerate(parts):
        p = part.lower()
        if idx > 0 and p in lower_particles:
            output.append(p)
        else:
            output.append(p[:1].upper() + p[1:])
    return " ".join(output)


def load_json(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, list) else []


def load_excluded_names() -> set[str]:
    items = load_json(EXCLUSIONS)
    names = set()
    for item in items:
        name = fold_text(item.get("nome") or item.get("Nome") or "")
        if name:
            names.add(name)
    return names


def main() -> None:
    snapshots = [item for item in load_json(BASE_CHAMADA) if str(item.get("mes") or "").strip() == MONTH]
    excluded = load_excluded_names()

    with Session(engine) as session:
        classes = session.exec(select(models.ImportClass)).all()
        students = session.exec(select(models.ImportStudent)).all()

        class_index: Dict[Tuple[str, str, str], models.ImportClass] = {}
        for cls in classes:
            class_index[(
                fold_text(cls.turma_label or cls.codigo or ""),
                normalize_horario(cls.horario or ""),
                fold_text(cls.professor or ""),
            )] = cls

        existing = set((fold_text(st.nome), st.class_id) for st in students)

        created = 0
        skipped_excluded = 0
        skipped_no_class = 0

        for item in snapshots:
            turma = fold_text(item.get("turmaLabel") or "")
            horario = normalize_horario(item.get("horario") or "")
            professor = fold_text(item.get("professor") or "")
            target_class = class_index.get((turma, horario, professor))
            if not target_class:
                skipped_no_class += len(item.get("registros") or [])
                continue

            for reg in item.get("registros") or []:
                nome_raw = str(reg.get("aluno_nome") or "").strip()
                nome = fold_text(nome_raw)
                if not nome:
                    continue
                if nome in excluded:
                    skipped_excluded += 1
                    continue
                key = (nome, target_class.id)
                if key in existing:
                    continue

                session.add(models.ImportStudent(nome=to_proper_case(nome_raw), class_id=target_class.id))
                existing.add(key)
                created += 1

        session.commit()

    print(f"Alunos criados: {created}")
    print(f"Ignorados por exclusão: {skipped_excluded}")
    print(f"Ignorados por turma não mapeada: {skipped_no_class}")


if __name__ == "__main__":
    main()
