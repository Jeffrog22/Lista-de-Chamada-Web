import calendar
import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from sqlmodel import Session

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from app.database import engine
from app.main import get_reports, DATA_DIR

month = "2026-02"
year, mon = map(int, month.split("-"))

parser = argparse.ArgumentParser()
parser.add_argument("--today", type=str, default=None)
args = parser.parse_args()

with Session(engine) as session:
    classes = get_reports(month=month, session=session)

with open(Path(DATA_DIR) / "academicCalendar.json", "r", encoding="utf-8") as f:
    payload = json.load(f)

events = payload.get("events") or []
closed = {
    str((item or {}).get("date") or "").strip()
    for item in events
    if str((item or {}).get("date") or "").strip()
}

last_day = calendar.monthrange(year, mon)[1]
all_days = [dt.date(year, mon, day) for day in range(1, last_day + 1)]
planned_days = [day for day in all_days if day.isoformat() not in closed]

month_start = dt.date(year, mon, 1)
month_end = dt.date(year, mon, last_day)
today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
effective_end = min(today, month_end) if today >= month_start else None
planned_until = [day for day in planned_days if effective_end and day <= effective_end]


def schedule_group(turma: str) -> str:
    value = (turma or "").lower()
    if "terça" in value or "terca" in value:
        return "tq"
    if "quarta" in value:
        return "qs"
    return "other"


def weekdays_for(group: str) -> set[int]:
    if group == "tq":
        return {1, 3}
    if group == "qs":
        return {2, 4}
    return set()


previstas_total = 0
dadas_total = 0
per_class = []
for cls in classes:
    weekdays = weekdays_for(schedule_group(cls.turma))
    if not weekdays:
        continue

    previstas = sum(1 for day in planned_until if day.weekday() in weekdays)
    recorded = set()

    for aluno in cls.alunos:
        for raw_day, status in (aluno.historico or {}).items():
            st = str(status or "").lower()
            if st not in {"c", "f", "j"}:
                continue
            try:
                d = dt.date(year, mon, int(raw_day))
            except Exception:
                continue
            if effective_end and d > effective_end:
                continue
            if d not in planned_until:
                continue
            if d.weekday() not in weekdays:
                continue
            recorded.add(d)

    previstas_total += previstas
    dadas_total += len(recorded)
    per_class.append(
        {
            "turma": cls.turma,
            "professor": cls.professor,
            "previstas": previstas,
            "dadas": len(recorded),
            "missing": max(0, previstas - len(recorded)),
        }
    )

keywords = ["climaticas", "cloro", "ocorrencia", "feriado", "ponte"]
eligible_dates = set()
for event in events:
    date_key = str((event or {}).get("date") or "").strip()
    if not date_key.startswith(f"{month}-"):
        continue
    if effective_end and date_key > effective_end.isoformat():
        continue

    event_type = str((event or {}).get("type") or "").strip().lower()
    description = str((event or {}).get("description") or "").strip().lower()

    if event_type in {"feriado", "ponte"} or any(k in description for k in keywords):
        eligible_dates.add(date_key)

cancelamentos = 0
for cls in classes:
    weekdays = weekdays_for(schedule_group(cls.turma))
    if not weekdays:
        continue
    for day in planned_until:
        key = day.isoformat()
        if key in eligible_dates and day.weekday() in weekdays:
            cancelamentos += 1

previstas_validas = max(0, previstas_total - cancelamentos)
aproveitamento = round((dadas_total / previstas_validas) * 100, 2) if previstas_validas > 0 else 0

print("today:", today.isoformat())
print("effective_end:", effective_end.isoformat() if effective_end else None)
print("planned_until:", len(planned_until))
print("previstas_total:", previstas_total)
print("dadas_total:", dadas_total)
print("cancelamentos_elegiveis:", cancelamentos)
print("previstas_validas:", previstas_validas)
print("aproveitamento:", aproveitamento)
print("eligible_dates:", sorted(eligible_dates))
print("per_class_missing:")
for item in sorted(per_class, key=lambda x: (x["missing"], x["previstas"]), reverse=True):
    if item["missing"] <= 0:
        continue
    print(
        f"- {item['turma']} | {item['professor']} => {item['dadas']}/{item['previstas']}"
    )
