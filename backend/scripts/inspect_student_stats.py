import json
import os
import sys
from sqlmodel import Session

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import engine
from app.main import get_reports_statistics

TARGET = "Matheus Henrique de Souza Marciano".lower()

with Session(engine) as session:
    stats = get_reports_statistics(session=session)

rows = [item.dict() if hasattr(item, "dict") else dict(item) for item in stats]
found = [row for row in rows if TARGET in str(row.get("nome", "")).lower()]

print("STATS_MATCHES=", len(found))
for row in found:
    print("---")
    print("nome=", row.get("nome"))
    print(
        "firstPresence=", row.get("firstPresence"),
        " lastPresence=", row.get("lastPresence"),
        " exclusionDate=", row.get("exclusionDate"),
        " retentionDays=", row.get("retentionDays"),
        " currentNivel=", row.get("currentNivel"),
    )
    for level in row.get("levels", []):
        print(
            "  level=", level.get("nivel"),
            " first=", level.get("firstDate"),
            " last=", level.get("lastDate"),
            " dias=", level.get("days"),
            " P/F/J=", level.get("presencas"), level.get("faltas"), level.get("justificativas"),
            " freq=", level.get("frequencia"),
        )

data_dir = os.path.join(BASE_DIR, "data")
with open(os.path.join(data_dir, "baseChamada.json"), "r", encoding="utf-8") as f:
    chamada = json.load(f)

raw_records = []
for item in chamada:
    turma = str(item.get("turmaLabel") or item.get("turmaCodigo") or "")
    horario = str(item.get("horario") or "")
    professor = str(item.get("professor") or "")
    for registro in item.get("registros") or []:
        nome = str(registro.get("aluno_nome") or "")
        if TARGET in nome.lower():
            attendance = registro.get("attendance") or {}
            non_empty = {k: v for k, v in attendance.items() if str(v or "").strip()}
            raw_records.append((nome, turma, horario, professor, non_empty))

print("RAW_REGISTROS=", len(raw_records))
for nome, turma, horario, professor, attendance in raw_records[:30]:
    print("---")
    print("nome=", nome, " turma=", turma, " horario=", horario, " professor=", professor, " eventos=", len(attendance))
    for date_key in sorted(attendance.keys())[:12]:
        print("   ", date_key, "=>", attendance[date_key])

with open(os.path.join(data_dir, "excludedStudents.json"), "r", encoding="utf-8") as f:
    exclusions = json.load(f)

matches = [entry for entry in exclusions if TARGET in str(entry.get("nome", "")).lower()]
print("EXCLUSIONS=", len(matches))
for entry in matches:
    print(entry)
