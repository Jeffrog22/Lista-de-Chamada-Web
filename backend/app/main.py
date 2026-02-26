from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Response
from sqlmodel import Session, select, func
from app.database import create_db_and_tables, get_session
from app import crud, models
from typing import List, Optional, Dict, Any
import os
import json
import re
import uuid
import math
from datetime import datetime, timedelta, date
import unicodedata
import pandas as pd
import requests
from pydantic import BaseModel, conint, Field
import csv
from io import StringIO, BytesIO
from copy import copy
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Side
from openpyxl.utils import get_column_letter
from app.etl.import_excel import import_from_excel
from app.auth import get_password_hash, create_access_token, authenticate_user, get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False

app = FastAPI(title="Lista-de-Chamada - API")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")

load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "backend", ".env"))

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    os.makedirs(DATA_DIR, exist_ok=True)

@app.get("/health")
def health():
    return {"status": "ok"}

class PoolLogEntryModel(BaseModel):
    data: str
    turmaCodigo: str = ""
    turmaLabel: str = ""
    horario: str = ""
    professor: str = ""
    clima1: str
    clima2: str
    statusAula: str
    nota: str
    tipoOcorrencia: str
    tempExterna: Optional[str] = ""
    tempPiscina: Optional[str] = ""
    cloroPpm: Optional[float] = None

class AttendanceLogItem(BaseModel):
    aluno_nome: str
    attendance: Dict[str, str]
    justifications: Optional[Dict[str, str]] = None

class AttendanceLogPayload(BaseModel):
    turmaCodigo: str = ""
    turmaLabel: str = ""
    horario: str = ""
    professor: str = ""
    mes: str = ""
    registros: List[AttendanceLogItem]

class JustificationLogEntry(BaseModel):
    aluno_nome: str
    data: str
    motivo: str
    turmaCodigo: str = ""
    turmaLabel: str = ""
    horario: str = ""
    professor: str = ""

class ExclusionEntry(BaseModel):
    id: Optional[str] = None
    nome: Optional[str] = None
    turma: Optional[str] = None
    turmaCodigo: Optional[str] = None
    horario: Optional[str] = None
    professor: Optional[str] = None
    dataExclusao: Optional[str] = None
    motivo_exclusao: Optional[str] = None

    class Config:
        extra = "allow"

class ReportStudent(BaseModel):
    id: str
    nome: str
    presencas: int
    faltas: int
    justificativas: int
    frequencia: float
    historico: Dict[str, str]
    anotacoes: Optional[str] = None

class ReportClass(BaseModel):
    turma: str
    horario: str
    professor: str
    nivel: str
    alunos: List[ReportStudent]

class ReportsFilterOut(BaseModel):
    turmas: List[str]
    horarios: List[str]
    professores: List[str]
    meses: List[str]
    anos: List[str]


# --- Statistics models (per-student retention & per-level permanence) ---
class LevelHistoryOut(BaseModel):
    nivel: str
    firstDate: Optional[str]
    lastDate: Optional[str]
    days: int
    presencas: int
    faltas: int
    justificativas: int
    frequencia: float

class StudentStatisticsOut(BaseModel):
    id: Optional[str] = None
    nome: str
    firstPresence: Optional[str] = None
    lastPresence: Optional[str] = None
    exclusionDate: Optional[str] = None
    retentionDays: int = 0
    currentNivel: Optional[str] = None
    levels: List[LevelHistoryOut] = []

class ExportClassSelection(BaseModel):
    turma: str
    horario: str
    professor: str

class ExcelExportPayload(BaseModel):
    month: Optional[str] = None
    turma: Optional[str] = None
    horario: Optional[str] = None
    professor: Optional[str] = None
    classes: List[ExportClassSelection] = Field(default_factory=list)

class AcademicCalendarSettingsPayload(BaseModel):
    schoolYear: int
    inicioAulas: str
    feriasInvernoInicio: str
    feriasInvernoFim: str
    terminoAulas: str

class AcademicCalendarEventPayload(BaseModel):
    date: str
    type: str
    allDay: Optional[bool] = False
    startTime: Optional[str] = ""
    endTime: Optional[str] = ""
    description: Optional[str] = ""
    teacher: Optional[str] = ""

def _append_json_list(file_path: str, items: List[Dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    payload: List[Dict[str, Any]] = []
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if not isinstance(payload, list):
                payload = []
        except Exception:
            payload = []
    payload.extend(items)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def _load_json_list(file_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(file_path):
        return []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        return payload if isinstance(payload, list) else []
    except Exception:
        return []

def _save_json_list(file_path: str, items: List[Dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

def _academic_calendar_file() -> str:
    return os.path.join(DATA_DIR, "academicCalendar.json")

def _load_academic_calendar_state() -> Dict[str, Any]:
    file_path = _academic_calendar_file()
    if not os.path.exists(file_path):
        return {"settings": None, "events": [], "bankHours": []}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return {"settings": None, "events": [], "bankHours": []}
        settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else None
        events = payload.get("events") if isinstance(payload.get("events"), list) else []
        bank_hours = payload.get("bankHours") if isinstance(payload.get("bankHours"), list) else []
        return {"settings": settings, "events": events, "bankHours": bank_hours}
    except Exception:
        return {"settings": None, "events": [], "bankHours": []}

def _save_academic_calendar_state(state: Dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    file_path = _academic_calendar_file()
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def _month_bounds(month: str) -> tuple[str, str]:
    year, month_num = month.split("-")
    start = datetime(int(year), int(month_num), 1)
    if int(month_num) == 12:
        next_month = datetime(int(year) + 1, 1, 1)
    else:
        next_month = datetime(int(year), int(month_num) + 1, 1)
    end = next_month - timedelta(days=1)
    return (start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))

def _hours_from_interval(start_time: str, end_time: str) -> float:
    try:
        start = datetime.strptime(start_time, "%H:%M")
        end = datetime.strptime(end_time, "%H:%M")
        minutes = (end - start).total_seconds() / 60
        if minutes <= 0:
            return 0.0
        return round(minutes / 60, 2)
    except Exception:
        return 0.0

POOL_LOG_COLUMNS = [
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

def _format_horario(value: str) -> str:
    raw = str(value or "").strip()
    if raw == "":
        return ""
    if ":" in raw:
        parts = raw.split(":")
        if len(parts) >= 2:
            hh = parts[0].zfill(2)[:2]
            mm = parts[1].zfill(2)[:2]
            return f"{hh}:{mm}"
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 3:
        digits = "0" + digits
    if len(digits) >= 4:
        return f"{digits[:2]}:{digits[2:4]}"
    return raw

def _format_whatsapp(value: Any) -> str:
    raw = str(value or "").strip()
    if raw == "":
        return ""
    if any(ch.isalpha() for ch in raw):
        return ""

    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return ""


def _coerce_numeric_value(value: Optional[str]) -> str | float:
    raw = str(value or "").replace(",", ".").strip()
    if raw == "":
        return ""
    try:
        num = float(raw)
        if math.isfinite(num):
            return num
    except ValueError:
        pass
    return raw


def _format_temperature_output(value: Any, fallback: str = "28") -> str:
    if value is None:
        return fallback
    try:
        num = float(value)
        if math.isfinite(num):
            return str(num)
    except Exception:
        pass
    return fallback

def _load_pool_log(file_path: str) -> pd.DataFrame:
    if os.path.exists(file_path):
        df = pd.read_excel(file_path)
    else:
        df = pd.DataFrame(columns=POOL_LOG_COLUMNS)

    for col in POOL_LOG_COLUMNS:
        if col not in df.columns:
            df[col] = ""
        df[col] = df[col].astype("object")
    return df

def _pool_log_mask(df: pd.DataFrame, entry: PoolLogEntryModel) -> pd.Series:
    def _norm(value: str) -> str:
        return str(value or "").strip()

    data_val = _norm(entry.data)
    turma_codigo = _norm(entry.turmaCodigo)
    turma_label = _norm(entry.turmaLabel)
    horario = _format_horario(entry.horario)
    professor = _norm(entry.professor)

    mask = df["Data"].astype(str).str.strip() == data_val
    if turma_codigo:
        mask = mask & (df["TurmaCodigo"].astype(str).str.strip() == turma_codigo)
    if turma_label:
        mask = mask & (df["TurmaLabel"].astype(str).str.strip() == turma_label)
    if horario:
        mask = mask & (df["Horario"].astype(str).str.strip() == horario)
    if professor:
        mask = mask & (df["Professor"].astype(str).str.strip() == professor)
    return mask

class ImportResult(BaseModel):
    units_created: int
    units_updated: int
    classes_created: int
    classes_updated: int
    students_created: int
    students_updated: int

class ImportUnitOut(BaseModel):
    id: int
    name: str

class ImportClassOut(BaseModel):
    id: int
    unit_id: int
    codigo: str
    turma_label: str
    horario: str
    professor: str
    nivel: str
    faixa_etaria: str
    capacidade: conint(ge=0)
    dias_semana: str

class ImportStudentOut(BaseModel):
    id: int
    class_id: int
    nome: str
    whatsapp: str
    data_nascimento: str
    data_atestado: str
    categoria: str
    genero: str
    parq: str
    atestado: bool

class BootstrapOut(BaseModel):
    units: list[ImportUnitOut]
    classes: list[ImportClassOut]
    students: list[ImportStudentOut]

class ImportStudentUpsertPayload(BaseModel):
    nome: str
    turma: str
    horario: str
    professor: str
    whatsapp: Optional[str] = ""
    data_nascimento: Optional[str] = ""
    data_atestado: Optional[str] = ""
    categoria: Optional[str] = ""
    genero: Optional[str] = ""
    parq: Optional[str] = ""
    atestado: bool = False

@app.get("/weather")
def get_weather(date: str):
    token = os.getenv("CLIMATEMPO_TOKEN")
    base_url = os.getenv("CLIMATEMPO_BASE_URL")
    lat = os.getenv("CLIMATEMPO_LAT", "-23.049194")
    lon = os.getenv("CLIMATEMPO_LON", "-47.007278")

    if not token or not base_url:
        return {"temp": "26", "condition": "Parcialmente Nublado"}

    try:
        resp = requests.get(
            base_url,
            params={"token": token, "lat": lat, "lon": lon, "date": date},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        temp = (
            data.get("temp")
            or data.get("temperature")
            or data.get("data", {}).get("temperature")
            or "26"
        )
        condition = (
            data.get("condition")
            or data.get("text")
            or data.get("data", {}).get("condition")
            or "Parcialmente Nublado"
        )
        return {"temp": str(temp), "condition": str(condition)}
    except Exception:
        return {"temp": "26", "condition": "Parcialmente Nublado"}

@app.post("/pool-log")
def append_pool_log(entry: PoolLogEntryModel):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        file_path = os.path.join(DATA_DIR, "logPiscina.xlsx")
        try:
            df = _load_pool_log(file_path)
        except PermissionError:
            raise HTTPException(status_code=423, detail="logPiscina.xlsx em uso. Feche o arquivo para salvar.")

        cloro_value = "-" if entry.nota in {"feriado", "ponte-feriado", "reuniao"} else ("-" if entry.cloroPpm is None else entry.cloroPpm)
        temp_externa_value = _coerce_numeric_value(entry.tempExterna)
        temp_piscina_value = _coerce_numeric_value(entry.tempPiscina)
        row = {
            "Data": entry.data,
            "TurmaCodigo": entry.turmaCodigo or "",
            "TurmaLabel": entry.turmaLabel or "",
            "Horario": _format_horario(entry.horario),
            "Professor": entry.professor or "",
            "Clima 1": entry.clima1,
            "Clima 2": entry.clima2,
            "Status_aula": entry.statusAula,
            "Nota": entry.nota,
            "Tipo_ocorrencia": entry.tipoOcorrencia,
            "Temp. (C)": temp_externa_value,
            "Piscina (C)": temp_piscina_value,
            "Cloro (ppm)": cloro_value,
        }

        mask = _pool_log_mask(df, entry)
        if mask.any():
            df.loc[mask, POOL_LOG_COLUMNS] = [
                row["Data"],
                row["TurmaCodigo"],
                row["TurmaLabel"],
                row["Horario"],
                row["Professor"],
                row["Clima 1"],
                row["Clima 2"],
                row["Status_aula"],
                row["Nota"],
                row["Tipo_ocorrencia"],
                row["Temp. (C)"],
                row["Piscina (C)"],
                row["Cloro (ppm)"],
            ]
            action = "updated"
        else:
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            action = "created"

        try:
            df.to_excel(file_path, index=False)
        except PermissionError:
            raise HTTPException(status_code=423, detail="logPiscina.xlsx em uso. Feche o arquivo para salvar.")
        return {"ok": True, "action": action, "file": file_path}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"pool-log error: {exc}")

@app.get("/pool-log")
def get_pool_log(
    date: str,
    turmaCodigo: Optional[str] = None,
    turmaLabel: Optional[str] = None,
    horario: Optional[str] = None,
    professor: Optional[str] = None,
):
    try:
        file_path = os.path.join(DATA_DIR, "logPiscina.xlsx")
        if not os.path.exists(file_path):
            return Response(status_code=204)

        df = _load_pool_log(file_path)
        if "Data" not in df.columns:
            return Response(status_code=204)

        entry = PoolLogEntryModel(
            data=date,
            turmaCodigo=turmaCodigo or "",
            turmaLabel=turmaLabel or "",
            horario=horario or "",
            professor=professor or "",
            clima1="",
            clima2="",
            statusAula="",
            nota="",
            tipoOcorrencia="",
        )
        match = df[_pool_log_mask(df, entry)]
        if match.empty:
            return Response(status_code=204)

        row = match.iloc[0].to_dict()
        return {
            "data": str(row.get("Data", "")),
            "turmaCodigo": str(row.get("TurmaCodigo", "")),
            "turmaLabel": str(row.get("TurmaLabel", "")),
            "horario": str(row.get("Horario", "")),
            "professor": str(row.get("Professor", "")),
            "clima1": str(row.get("Clima 1", "")),
            "clima2": str(row.get("Clima 2", "")),
            "statusAula": str(row.get("Status_aula", "")),
            "nota": str(row.get("Nota", "")),
            "tipoOcorrencia": str(row.get("Tipo_ocorrencia", "")),
            "tempExterna": _format_temperature_output(row.get("Temp. (C)", None), ""),
            "tempPiscina": _format_temperature_output(row.get("Piscina (C)", None), "28"),
            "cloroPpm": row.get("Cloro (ppm)", None),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"pool-log read error: {exc}")

@app.post("/attendance-log")
def append_attendance_log(payload: AttendanceLogPayload):
    try:
        file_path = os.path.join(DATA_DIR, "baseChamada.json")
        item = payload.dict()
        item["saved_at"] = pd.Timestamp.utcnow().isoformat()
        _append_json_list(file_path, [item])
        return {"ok": True, "file": file_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"attendance-log error: {exc}")

@app.post("/justifications-log")
def append_justifications_log(entries: List[JustificationLogEntry]):
    try:
        if not entries:
            return {"ok": True, "file": os.path.join(DATA_DIR, "baseJustificativas.json")}
        file_path = os.path.join(DATA_DIR, "baseJustificativas.json")
        items = [entry.dict() for entry in entries]
        for item in items:
            item["saved_at"] = pd.Timestamp.utcnow().isoformat()
        _append_json_list(file_path, items)
        return {"ok": True, "file": file_path, "count": len(items)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"justifications-log error: {exc}")

def _normalize_text(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _to_proper_case(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""

    lower_particles = {"da", "de", "do", "das", "dos", "e"}
    tokens = re.split(r"(\s+)", raw)
    words: List[str] = []
    word_index = 0

    for token in tokens:
        if token.isspace() or token == "":
            words.append(token)
            continue

        chunk_parts = re.split(r"([-'])", token)
        rebuilt: List[str] = []
        local_word = ""
        for part in chunk_parts:
            if part in {"-", "'"}:
                rebuilt.append(part)
                continue
            piece = part.strip()
            if not piece:
                rebuilt.append(part)
                continue
            p = piece.lower()
            if word_index > 0 and p in lower_particles:
                local_word = p
            else:
                local_word = p[:1].upper() + p[1:]
            rebuilt.append(local_word)
        words.append("".join(rebuilt))
        word_index += 1

    return "".join(words)


def _normalize_text_fold(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")


def _infer_schedule_group(turma_label: str, turma_codigo: str) -> str:
    label = _normalize_text_fold(turma_label)
    code = _normalize_text_fold(turma_codigo)
    if ("terca" in label and "quinta" in label) or "tq" in code:
        return "tq"
    if ("quarta" in label and "sexta" in label) or "qs" in code:
        return "qs"
    return "other"


def _load_allowed_schedule_days(today: date) -> Dict[str, set[str]]:
    allowed = {"tq": set(), "qs": set()}
    calendar_path = os.path.join(DATA_DIR, "academicCalendar.json")
    if not os.path.exists(calendar_path):
        return allowed

    try:
        with open(calendar_path, "r", encoding="utf-8") as handle:
            calendar_payload = json.load(handle)
    except Exception:
        return allowed

    settings = calendar_payload.get("settings") or {}
    events = calendar_payload.get("events") or []

    start_raw = str(settings.get("inicioAulas") or "").strip()
    if not start_raw:
        return allowed

    try:
        start_date = datetime.strptime(start_raw, "%Y-%m-%d").date()
    except Exception:
        return allowed

    closed_days = set()
    for event in events:
        day = str((event or {}).get("date") or "").strip()
        if day:
            closed_days.add(day)

    cursor = start_date
    while cursor <= today:
        key = cursor.isoformat()
        if key in closed_days:
            cursor += timedelta(days=1)
            continue
        weekday = cursor.weekday()  # mon=0 ... sun=6
        if weekday in {1, 3}:  # terça/quinta
            allowed["tq"].add(key)
        if weekday in {2, 4}:  # quarta/sexta
            allowed["qs"].add(key)
        cursor += timedelta(days=1)

    return allowed

def _exclusion_key(item: Dict[str, Any]) -> tuple[str, str, str]:
    nome = _normalize_text(item.get("nome") or item.get("Nome"))
    turma = _normalize_text(item.get("turma") or item.get("Turma"))
    horario = _normalize_text(item.get("horario") or "")
    return (nome, turma, horario)

def _resolve_exclusion_match(item: Dict[str, Any], payload: ExclusionEntry) -> bool:
    if payload.id and str(item.get("id")) == str(payload.id):
        return True
    return _exclusion_key(item) == _exclusion_key(payload.dict())

def _normalize_horario_key(value: Optional[str]) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 3:
        return f"0{digits}"
    if len(digits) >= 4:
        return digits[:4]
    return digits

def _exclusion_matches_class(entry: Dict[str, Any], cls: models.ImportClass) -> bool:
    cls_codigo = _normalize_text(cls.codigo or "")
    cls_label = _normalize_text(cls.turma_label or cls.codigo or "")
    cls_horario = _normalize_horario_key(cls.horario or "")
    cls_professor = _normalize_text(cls.professor or "")

    ex_codigo = _normalize_text(entry.get("turmaCodigo") or entry.get("TurmaCodigo") or "")
    ex_label = _normalize_text(
        entry.get("turmaLabel")
        or entry.get("TurmaLabel")
        or entry.get("turma")
        or entry.get("Turma")
        or ""
    )
    ex_horario = _normalize_horario_key(entry.get("horario") or entry.get("Horario") or "")
    ex_professor = _normalize_text(entry.get("professor") or entry.get("Professor") or "")

    if ex_codigo and ex_codigo not in {cls_codigo, cls_label}:
        return False
    if ex_label and ex_label not in {cls_label, cls_codigo}:
        return False
    if ex_horario and cls_horario and ex_horario != cls_horario:
        return False
    if ex_professor and cls_professor and ex_professor != cls_professor:
        return False
    return True

def _map_attendance_value(value: str) -> str:
    normalized = _normalize_text(value)
    if normalized == "presente":
        return "c"
    if normalized == "falta":
        return "f"
    if normalized == "justificado":
        return "j"
    return ""

def _report_day_key(date_value: str) -> str:
    if not date_value:
        return ""
    parts = str(date_value).split("-")
    if len(parts) >= 3:
        return parts[2].zfill(2)
    return str(date_value).strip()

def _sort_report_days(days: List[str]) -> List[str]:
    unique_days = {str(day).strip() for day in days if str(day).strip()}

    def _day_sort_key(day: str):
        if day.isdigit():
            return (0, int(day))
        return (1, day)

    return sorted(unique_days, key=_day_sort_key)

def _resolve_export_targets(payload: ExcelExportPayload, reports: List[ReportClass]) -> List[ReportClass]:
    requested: List[ExportClassSelection] = []
    if payload.classes:
        requested = payload.classes
    elif payload.turma and payload.horario and payload.professor:
        requested = [
            ExportClassSelection(
                turma=payload.turma,
                horario=payload.horario,
                professor=payload.professor,
            )
        ]

    if not requested:
        raise HTTPException(status_code=400, detail="No class selection informed")

    selected: List[ReportClass] = []
    seen_keys = set()
    for req in requested:
        key = (
            _normalize_text(req.turma),
            _normalize_text(req.horario),
            _normalize_text(req.professor),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)

        found = next(
            (
                cls
                for cls in reports
                if _normalize_text(cls.turma) == key[0]
                and _normalize_text(cls.horario) == key[1]
                and _normalize_text(cls.professor) == key[2]
            ),
            None,
        )
        if found:
            selected.append(found)

    if not selected:
        raise HTTPException(status_code=404, detail="Class report not found for selected filters")
    return selected

def _build_sheet_title(selected: ReportClass, existing_titles: set[str]) -> str:
    start = _format_horario(selected.horario or "")
    base = f"{start}|{selected.turma}"
    try:
        start_dt = datetime.strptime(start, "%H:%M")
        end_dt = start_dt + timedelta(minutes=45)
        base = f"{start_dt.strftime('%H:%M')}|{end_dt.strftime('%H:%M')}"
    except Exception:
        pass

    safe = re.sub(r"[\[\]:*?/\\]", "-", base).strip() or "Turma"
    safe = safe[:31]
    candidate = safe
    suffix = 1
    while candidate in existing_titles:
        suffix += 1
        label_suffix = f"_{suffix}"
        candidate = f"{safe[: max(1, 31 - len(label_suffix))]}{label_suffix}"
    return candidate

def _populate_attendance_sheet(ws, selected: ReportClass, month: Optional[str], session: Session) -> int:
    ws["A1"] = "Modalidade:"
    ws["B1"] = "Natação"
    ws["D1"] = "PREFEITURA MUNICIPAL DE VINHEDO"

    ws["A2"] = "Local:"
    ws["B2"] = "Piscina Bela Vista"
    ws["D2"] = "SECRETARIA DE ESPORTE E LAZER"

    ws["A3"] = "Professor:"
    ws["B3"] = selected.professor

    ws["A4"] = "Turma:"
    ws["B4"] = selected.turma
    ws["D4"] = "Nível:"
    ws["E4"] = selected.nivel

    ws["A5"] = "Horário:"
    ws["B5"] = _format_horario(selected.horario or "")
    ws["D5"] = "Mês:"
    ws["E5"] = _format_month_label(month)

    class_days = _sort_report_days([
        day for aluno in selected.alunos for day in (aluno.historico or {}).keys()
    ])
    header_row = 6
    data_start_row = 7
    date_col_start = 5

    notes_col = None
    for col in range(date_col_start, ws.max_column + 1):
        header_value = str(ws.cell(row=header_row, column=col).value or "").strip()
        header_norm = _normalize_text(header_value)
        if header_norm in {"observacoes", "anotacoes"}:
            notes_col = col
            break

    if notes_col is None:
        notes_col = date_col_start + max(1, len(class_days))

    date_columns = list(range(date_col_start, notes_col))
    visible_days = class_days[:len(date_columns)]

    ws.cell(row=header_row, column=1, value="Nome")
    ws.cell(row=header_row, column=2, value="Whatsapp")
    ws.cell(row=header_row, column=3, value="parQ")
    ws.cell(row=header_row, column=4, value="Aniversário")

    for idx, col in enumerate(date_columns):
        _copy_cell_style(ws, header_row, date_col_start, header_row, col)
        if idx < len(visible_days):
            day_raw = str(visible_days[idx]).strip()
            day_value: Any = int(day_raw) if day_raw.isdigit() else day_raw
            ws.cell(row=header_row, column=col, value=day_value)
        else:
            ws.cell(row=header_row, column=col, value="")

    _copy_cell_style(ws, header_row, date_col_start, header_row, notes_col)
    ws.cell(row=header_row, column=notes_col, value="Anotações")

    if ws.max_column > notes_col:
        ws.delete_cols(notes_col + 1, ws.max_column - notes_col)

    details_map = _build_import_student_details_map(
        session=session,
        turma=selected.turma,
        horario=selected.horario,
        professor=selected.professor,
    )

    students_sorted = sorted(selected.alunos, key=lambda item: item.nome)
    full_cell_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )
    for idx, aluno in enumerate(students_sorted):
        row = data_start_row + idx
        for col in range(1, notes_col + 1):
            _copy_cell_style(ws, data_start_row, min(col, date_col_start), row, col)
            ws.cell(row=row, column=col).border = full_cell_border

        student_meta = details_map.get(_normalize_text(aluno.nome), {})
        ws.cell(row=row, column=1, value=aluno.nome)
        ws.cell(row=row, column=2, value=student_meta.get("whatsapp") or "")
        if student_meta.get("atestado"):
            ws.cell(row=row, column=3, value=student_meta.get("data_atestado") or "Com Atestado")
        else:
            ws.cell(row=row, column=3, value=student_meta.get("parq") or "")
        ws.cell(row=row, column=4, value=student_meta.get("data_nascimento") or "")

        for day_idx, day in enumerate(visible_days):
            value = (aluno.historico or {}).get(day, "")
            ws.cell(row=row, column=date_col_start + day_idx, value=value)

        for col in date_columns[len(visible_days):]:
            ws.cell(row=row, column=col, value="")

        ws.cell(row=row, column=notes_col, value=aluno.anotacoes or "")

    name_col_letter = get_column_letter(1)
    notes_col_letter = get_column_letter(notes_col)
    max_name_len = max([len("Nome"), *[len(str(aluno.nome or "")) for aluno in students_sorted]]) if students_sorted else len("Nome")
    ws.column_dimensions[name_col_letter].width = min(50, max(18, max_name_len + 2))
    current_notes_width = ws.column_dimensions[notes_col_letter].width or 0
    ws.column_dimensions[notes_col_letter].width = max(40, current_notes_width)

    end_row = data_start_row + len(students_sorted) - 1
    if end_row < header_row:
        end_row = header_row

    for row in range(header_row, end_row + 1):
        for col in range(1, notes_col + 1):
            horizontal = "left" if col in (1, notes_col) else "center"
            ws.cell(row=row, column=col).alignment = Alignment(horizontal=horizontal, vertical="center")

    return len(students_sorted)

def _build_chamada_pdf(selected_reports: List[ReportClass], month: Optional[str], session: Session) -> bytes:
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(status_code=500, detail="PDF export unavailable: install reportlab")

    buffer = BytesIO()
    page_width, page_height = landscape(A4)
    pdf = canvas.Canvas(buffer, pagesize=(page_width, page_height))

    margin_left = 18
    margin_right = 18
    margin_top = 20
    margin_bottom = 20

    table_top = page_height - 120
    row_height = 16
    fixed_col_widths = [140, 88, 62, 72]
    notes_width = 168
    min_date_col_width = 18

    def _draw_header_block(selected: ReportClass):
        y = page_height - margin_top
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left, y, "Modalidade:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 58, y, "Natação")
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left + 250, y, "PREFEITURA MUNICIPAL DE VINHEDO")

        y -= 14
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left, y, "Local:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 58, y, "Piscina Bela Vista")
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left + 250, y, "SECRETARIA DE ESPORTE E LAZER")

        y -= 14
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left, y, "Professor:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 58, y, str(selected.professor or ""))

        y -= 14
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left, y, "Turma:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 58, y, str(selected.turma or ""))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left + 250, y, "Nível:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 295, y, str(selected.nivel or ""))

        y -= 14
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left, y, "Horário:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 58, y, _format_horario(selected.horario or ""))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(margin_left + 250, y, "Mês:")
        pdf.setFont("Helvetica", 9)
        pdf.drawString(margin_left + 295, y, _format_month_label(month))

    def _build_columns(day_chunk: List[str]) -> List[tuple[str, float]]:
        available_for_days = page_width - margin_left - margin_right - sum(fixed_col_widths) - notes_width
        dynamic_width = (available_for_days / len(day_chunk)) if day_chunk else available_for_days
        columns: List[tuple[str, float]] = [
            ("Nome", fixed_col_widths[0]),
            ("Whatsapp", fixed_col_widths[1]),
            ("parQ", fixed_col_widths[2]),
            ("Aniversário", fixed_col_widths[3]),
        ]
        for day in day_chunk:
            columns.append((day, dynamic_width))
        columns.append(("Anotações", notes_width))
        return columns

    def _draw_grid_page(selected: ReportClass, rows: List[Dict[str, Any]], day_chunk: List[str], day_range_label: str):
        _draw_header_block(selected)
        if day_range_label:
            pdf.setFont("Helvetica-Bold", 8)
            pdf.drawString(margin_left, table_top + 6, day_range_label)

        columns = _build_columns(day_chunk)
        x_positions = [margin_left]
        for _, col_width in columns:
            x_positions.append(x_positions[-1] + col_width)

        y_top = table_top
        y_bottom = margin_bottom
        y = y_top

        pdf.setFont("Helvetica-Bold", 7)
        for col_idx, (label, _) in enumerate(columns):
            x0 = x_positions[col_idx]
            x1 = x_positions[col_idx + 1]
            pdf.rect(x0, y - row_height, x1 - x0, row_height)
            text = str(label or "")
            if col_idx in (0, len(columns) - 1):
                pdf.drawString(x0 + 2, y - 11, text[:28])
            else:
                pdf.drawCentredString((x0 + x1) / 2, y - 11, text[:10])

        y -= row_height
        pdf.setFont("Helvetica", 7)

        for row in rows:
            if y - row_height < y_bottom:
                return False
            for col_idx, (label, _) in enumerate(columns):
                x0 = x_positions[col_idx]
                x1 = x_positions[col_idx + 1]
                pdf.rect(x0, y - row_height, x1 - x0, row_height)

                value = ""
                if label == "Nome":
                    value = str(row.get("nome") or "")
                elif label == "Whatsapp":
                    value = str(row.get("whatsapp") or "")
                elif label == "parQ":
                    value = str(row.get("parq") or "")
                elif label == "Aniversário":
                    value = str(row.get("data_nascimento") or "")
                elif label == "Anotações":
                    value = str(row.get("anotacoes") or "")
                elif label in day_chunk:
                    value = str((row.get("historico") or {}).get(label, ""))

                if col_idx in (0, len(columns) - 1):
                    pdf.drawString(x0 + 2, y - 11, value[:42])
                else:
                    pdf.drawCentredString((x0 + x1) / 2, y - 11, value[:16])

            y -= row_height

        return True

    for report_idx, selected in enumerate(selected_reports):
        details_map = _build_import_student_details_map(
            session=session,
            turma=selected.turma,
            horario=selected.horario,
            professor=selected.professor,
        )

        class_days = _sort_report_days([
            day for aluno in selected.alunos for day in (aluno.historico or {}).keys()
        ])
        available_for_days = page_width - margin_left - margin_right - sum(fixed_col_widths) - notes_width
        max_date_slots_fit = max(1, int(available_for_days // min_date_col_width))
        if class_days:
            day_chunks = [
                class_days[idx: idx + max_date_slots_fit]
                for idx in range(0, len(class_days), max_date_slots_fit)
            ]
        else:
            day_chunks = [[]]

        students_sorted = sorted(selected.alunos, key=lambda item: item.nome)
        rows: List[Dict[str, Any]] = []
        for aluno in students_sorted:
            meta = details_map.get(_normalize_text(aluno.nome), {})

            rows.append(
                {
                    "nome": aluno.nome or "",
                    "whatsapp": meta.get("whatsapp") or "",
                    "parq": (meta.get("data_atestado") or "Com Atestado") if meta.get("atestado") else (meta.get("parq") or ""),
                    "data_nascimento": meta.get("data_nascimento") or "",
                    "historico": aluno.historico or {},
                    "anotacoes": aluno.anotacoes or "",
                }
            )

        if not rows:
            rows = [{"nome": "", "whatsapp": "", "parq": "", "data_nascimento": "", "historico": {}, "anotacoes": ""}]

        rows_per_page = int((table_top - margin_bottom) // row_height) - 1
        first_page_global = report_idx == 0
        for chunk_idx, day_chunk in enumerate(day_chunks):
            remaining = rows
            range_label = ""
            if day_chunk:
                range_label = f"Datas: {day_chunk[0]} a {day_chunk[-1]}"
            while remaining:
                if not first_page_global:
                    pdf.showPage()
                current_rows = remaining[:rows_per_page]
                remaining = remaining[rows_per_page:]
                label = range_label
                if len(day_chunks) > 1:
                    label = f"Bloco {chunk_idx + 1}/{len(day_chunks)} - {range_label}" if range_label else f"Bloco {chunk_idx + 1}/{len(day_chunks)}"
                _draw_grid_page(
                    selected=selected,
                    rows=current_rows,
                    day_chunk=day_chunk,
                    day_range_label=label,
                )
                first_page_global = False

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()

def _format_month_label(month: Optional[str]) -> str:
    if not month or "-" not in month:
        return str(month or "")
    year, month_number = month.split("-", 1)
    month_names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    try:
        idx = max(1, min(12, int(month_number))) - 1
    except Exception:
        return str(month)
    return f"{month_names[idx]}/{year}"

def _copy_cell_style(ws, source_row: int, source_col: int, target_row: int, target_col: int) -> None:
    src = ws.cell(row=source_row, column=source_col)
    dst = ws.cell(row=target_row, column=target_col)
    dst._style = copy(src._style)
    dst.number_format = copy(src.number_format)
    dst.protection = copy(src.protection)
    dst.alignment = copy(src.alignment)
    dst.fill = copy(src.fill)
    dst.font = copy(src.font)
    dst.border = copy(src.border)

def _build_import_student_details_map(
    session: Session,
    turma: str,
    horario: str,
    professor: str,
) -> Dict[str, Dict[str, Any]]:
    classes = session.exec(select(models.ImportClass)).all()
    target = None
    turma_norm = _normalize_text(turma)
    horario_norm = _normalize_text(horario)
    professor_norm = _normalize_text(professor)
    for cls in classes:
        cls_label = cls.turma_label or cls.codigo or ""
        if (
            _normalize_text(cls_label) == turma_norm
            and _normalize_text(cls.horario or "") == horario_norm
            and _normalize_text(cls.professor or "") == professor_norm
        ):
            target = cls
            break

    details: Dict[str, Dict[str, Any]] = {}
    if not target:
        return details

    students = session.exec(
        select(models.ImportStudent).where(models.ImportStudent.class_id == target.id)
    ).all()
    for student in students:
        details[_normalize_text(student.nome)] = {
            "whatsapp": _format_whatsapp(student.whatsapp),
            "parq": student.parq or "",
            "atestado": bool(student.atestado),
            "data_nascimento": student.data_nascimento or "",
            "data_atestado": student.data_atestado or "",
        }
    return details

def _attendance_log_lookup_keys(item: Dict[str, Any]) -> List[str]:
    turma_codigo = str(item.get("turmaCodigo") or "").strip()
    turma_label = str(item.get("turmaLabel") or "").strip()
    horario = str(item.get("horario") or "").strip()
    professor = str(item.get("professor") or "").strip()

    def _horario_variants(value: str) -> List[str]:
        raw = str(value or "").strip()
        digits = "".join(ch for ch in raw if ch.isdigit())
        variants: List[str] = []
        for candidate in [raw, digits, f"{digits[:2]}:{digits[2:4]}" if len(digits) >= 4 else ""]:
            token = str(candidate or "").strip()
            if token and token not in variants:
                variants.append(token)
        return variants or [""]

    def _professor_variants(value: str) -> List[str]:
        raw = str(value or "").strip()
        normalized = _normalize_text(raw)
        variants: List[str] = []
        for candidate in [raw, normalized]:
            token = str(candidate or "").strip()
            if token and token not in variants:
                variants.append(token)
        return variants or [""]

    def _turma_variants(value: str) -> List[str]:
        raw = str(value or "").strip()
        normalized = _normalize_text(raw)
        variants: List[str] = []
        for candidate in [raw, normalized]:
            token = str(candidate or "").strip()
            if token and token not in variants:
                variants.append(token)
        return variants or [""]

    keys: List[str] = []
    key_fields: List[List[str]] = [_horario_variants(horario), _professor_variants(professor)]

    for horario_key in key_fields[0]:
        for professor_key in key_fields[1]:
            if turma_codigo:
                keys.append("|".join(["codigo", turma_codigo, horario_key, professor_key]))
            for turma_key in _turma_variants(turma_label):
                keys.append("|".join(["label", turma_key, horario_key, professor_key]))

    # retrocompatibilidade para registros antigos sem horario/professor
    if turma_codigo:
        keys.append(f"codigo|{turma_codigo}||")
    if turma_label:
        keys.append(f"label|{turma_label}||")
        keys.append(f"label|{_normalize_text(turma_label)}||")

    return keys

def _load_latest_attendance_logs(month: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    file_path = os.path.join(DATA_DIR, "baseChamada.json")
    items = _load_json_list(file_path)
    latest: Dict[str, Dict[str, Any]] = {}
    for item in items:
        if month and str(item.get("mes") or "") != month:
            continue
        keys = _attendance_log_lookup_keys(item)
        if not keys:
            continue
        saved_at = str(item.get("saved_at") or "")
        for key in keys:
            if key not in latest:
                latest[key] = item
                continue
            existing_saved = str(latest[key].get("saved_at") or "")
            if saved_at > existing_saved:
                latest[key] = item
    return latest

@app.get("/exclusions")
def list_exclusions():
    file_path = os.path.join(DATA_DIR, "excludedStudents.json")
    return _load_json_list(file_path)

@app.post("/exclusions")
def add_exclusion(entry: ExclusionEntry):
    file_path = os.path.join(DATA_DIR, "excludedStudents.json")
    items = _load_json_list(file_path)
    payload = entry.dict()
    if not payload.get("dataExclusao"):
        payload["dataExclusao"] = pd.Timestamp.utcnow().strftime("%d/%m/%Y")

    updated = False
    for idx, item in enumerate(items):
        if _resolve_exclusion_match(item, entry):
            items[idx] = {**item, **payload}
            updated = True
            break
    if not updated:
        items.append(payload)
    _save_json_list(file_path, items)
    return {"ok": True, "updated": updated}

@app.post("/exclusions/restore")
def restore_exclusion(entry: ExclusionEntry):
    file_path = os.path.join(DATA_DIR, "excludedStudents.json")
    items = _load_json_list(file_path)
    restored: Optional[Dict[str, Any]] = None
    remaining: List[Dict[str, Any]] = []
    for item in items:
        if restored is None and _resolve_exclusion_match(item, entry):
            restored = item
            continue
        remaining.append(item)
    _save_json_list(file_path, remaining)
    if restored is None:
        raise HTTPException(status_code=404, detail="Exclusion not found")
    return {"ok": True, "restored": restored}

@app.post("/exclusions/delete")
def delete_exclusion(entry: ExclusionEntry):
    file_path = os.path.join(DATA_DIR, "excludedStudents.json")
    items = _load_json_list(file_path)
    remaining: List[Dict[str, Any]] = []
    deleted = False
    for item in items:
        if not deleted and _resolve_exclusion_match(item, entry):
            deleted = True
            continue
        remaining.append(item)
    _save_json_list(file_path, remaining)
    if not deleted:
        raise HTTPException(status_code=404, detail="Exclusion not found")
    return {"ok": True}

@app.get("/filters", response_model=ReportsFilterOut)
def get_report_filters(session: Session = Depends(get_session)) -> ReportsFilterOut:
    classes = session.exec(select(models.ImportClass)).all()
    turmas = sorted({(c.turma_label or c.codigo or "").strip() for c in classes if (c.turma_label or c.codigo)})
    horarios = sorted({(c.horario or "").strip() for c in classes if c.horario})
    professores = sorted({(c.professor or "").strip() for c in classes if c.professor})

    months = sorted({str(item.get("mes") or "").strip() for item in _load_json_list(os.path.join(DATA_DIR, "baseChamada.json")) if item.get("mes")})
    years = sorted({m.split("-")[0] for m in months if "-" in m})
    return ReportsFilterOut(turmas=turmas, horarios=horarios, professores=professores, meses=months, anos=years)

@app.get("/academic-calendar")
def get_academic_calendar(month: Optional[str] = None):
    state = _load_academic_calendar_state()
    events = state.get("events") or []
    bank_hours = state.get("bankHours") or []

    if month:
        try:
            month_start, month_end = _month_bounds(month)
            events = [
                item
                for item in events
                if month_start <= str(item.get("date") or "") <= month_end
            ]
            bank_hours = [
                item
                for item in bank_hours
                if month_start <= str(item.get("date") or "") <= month_end
            ]
        except Exception:
            pass

    return {
        "settings": state.get("settings"),
        "events": events,
        "bankHours": bank_hours,
    }

@app.put("/academic-calendar/settings")
def save_academic_calendar_settings(payload: AcademicCalendarSettingsPayload):
    state = _load_academic_calendar_state()
    state["settings"] = {
        "schoolYear": payload.schoolYear,
        "inicioAulas": payload.inicioAulas,
        "feriasInvernoInicio": payload.feriasInvernoInicio,
        "feriasInvernoFim": payload.feriasInvernoFim,
        "terminoAulas": payload.terminoAulas,
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_academic_calendar_state(state)
    return {"ok": True, "settings": state["settings"]}

@app.post("/academic-calendar/events")
def save_academic_calendar_event(payload: AcademicCalendarEventPayload):
    if payload.type not in {"feriado", "ponte", "reuniao", "evento"}:
        raise HTTPException(status_code=400, detail="Tipo de evento inválido")

    if payload.type == "reuniao" and not payload.allDay:
        if not payload.startTime or not payload.endTime:
            raise HTTPException(status_code=400, detail="Reunião por período exige horário de início e término")

    if payload.type == "evento":
        if not payload.startTime or not payload.endTime:
            raise HTTPException(status_code=400, detail="Evento exige horário de início e término")

    state = _load_academic_calendar_state()
    events = state.get("events") or []
    bank_hours = state.get("bankHours") or []

    event_id = str(uuid.uuid4())
    event = {
        "id": event_id,
        "date": payload.date,
        "type": payload.type,
        "allDay": bool(payload.allDay),
        "startTime": payload.startTime or "",
        "endTime": payload.endTime or "",
        "description": payload.description or "",
        "teacher": payload.teacher or "",
        "created_at": datetime.utcnow().isoformat(),
    }
    events.append(event)

    if payload.type == "evento":
        hours = _hours_from_interval(payload.startTime or "", payload.endTime or "")
        if hours > 0:
            bank_hours.append(
                {
                    "id": str(uuid.uuid4()),
                    "eventId": event_id,
                    "date": payload.date,
                    "teacher": payload.teacher or "",
                    "description": payload.description or "Evento",
                    "startTime": payload.startTime or "",
                    "endTime": payload.endTime or "",
                    "hours": hours,
                    "created_at": datetime.utcnow().isoformat(),
                }
            )

    state["events"] = events
    state["bankHours"] = bank_hours
    _save_academic_calendar_state(state)
    return {"ok": True, "event": event}

@app.delete("/academic-calendar/events/{event_id}")
def delete_academic_calendar_event(event_id: str):
    state = _load_academic_calendar_state()
    events = state.get("events") or []
    bank_hours = state.get("bankHours") or []

    existing_len = len(events)
    state["events"] = [item for item in events if str(item.get("id")) != str(event_id)]
    if len(state["events"]) == existing_len:
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    state["bankHours"] = [item for item in bank_hours if str(item.get("eventId")) != str(event_id)]
    _save_academic_calendar_state(state)
    return {"ok": True}

@app.get("/reports", response_model=List[ReportClass])
def get_reports(month: Optional[str] = None, session: Session = Depends(get_session)) -> List[ReportClass]:
    classes = session.exec(select(models.ImportClass)).all()
    students = session.exec(select(models.ImportStudent)).all()
    excluded_items = _load_json_list(os.path.join(DATA_DIR, "excludedStudents.json"))

    students_by_class: Dict[int, List[models.ImportStudent]] = {}
    for student in students:
        students_by_class.setdefault(student.class_id, []).append(student)

    latest_logs = _load_latest_attendance_logs(month)
    report: List[ReportClass] = []

    for cls in classes:
        turma_key = (cls.codigo or cls.turma_label or "").strip()
        turma_label = (cls.turma_label or cls.codigo or "").strip()
        horario = (cls.horario or "").strip()
        professor = (cls.professor or "").strip()

        horario_digits = "".join(ch for ch in horario if ch.isdigit())
        horario_variants = [h for h in [horario, horario_digits, f"{horario_digits[:2]}:{horario_digits[2:4]}" if len(horario_digits) >= 4 else ""] if h]
        professor_variants = [p for p in [professor, _normalize_text(professor)] if p]
        if not horario_variants:
            horario_variants = [""]
        if not professor_variants:
            professor_variants = [""]

        turma_variants = [t for t in [turma_label, _normalize_text(turma_label)] if t]
        composite_keys: List[str] = []
        if turma_key:
            for h in horario_variants:
                for p in professor_variants:
                    composite_keys.append(f"codigo|{turma_key}|{h}|{p}")
        for turma_candidate in turma_variants:
            for h in horario_variants:
                for p in professor_variants:
                    composite_keys.append(f"label|{turma_candidate}|{h}|{p}")

        fallback_codigo = f"codigo|{turma_key}||" if turma_key else ""
        fallback_label = f"label|{turma_label}||" if turma_label else ""
        fallback_label_normalized = f"label|{_normalize_text(turma_label)}||" if turma_label else ""

        log_entry = None
        for key in composite_keys:
            log_entry = latest_logs.get(key)
            if log_entry:
                break
        if log_entry is None:
            log_entry = (
                (latest_logs.get(fallback_codigo) if fallback_codigo else None)
                or (latest_logs.get(fallback_label) if fallback_label else None)
                or (latest_logs.get(fallback_label_normalized) if fallback_label_normalized else None)
            )

        excluded_names = {
            _normalize_text(entry.get("nome") or entry.get("Nome") or "")
            for entry in excluded_items
            if _normalize_text(entry.get("nome") or entry.get("Nome") or "") and _exclusion_matches_class(entry, cls)
        }

        name_to_id = {
            _normalize_text(s.nome): str(s.id)
            for s in students_by_class.get(cls.id, [])
        }
        class_students: List[ReportStudent] = []

        if log_entry:
            registros = log_entry.get("registros") or []
            for record in registros:
                nome = str(record.get("aluno_nome") or "").strip()
                if _normalize_text(nome) in excluded_names:
                    continue
                attendance = record.get("attendance") or {}
                presencas = 0
                faltas = 0
                justificativas = 0
                historico: Dict[str, str] = {}
                for date_key, value in attendance.items():
                    mapped = _map_attendance_value(str(value))
                    if mapped == "c":
                        presencas += 1
                    elif mapped == "f":
                        faltas += 1
                    elif mapped == "j":
                        justificativas += 1
                    day_key = _report_day_key(date_key)
                    if day_key:
                        historico[day_key] = mapped

                total = presencas + faltas + justificativas
                frequencia = round(((presencas + justificativas) / total) * 100, 1) if total else 0.0
                class_students.append(
                    ReportStudent(
                        id=name_to_id.get(_normalize_text(nome), nome or "0"),
                        nome=_to_proper_case(nome),
                        presencas=presencas,
                        faltas=faltas,
                        justificativas=justificativas,
                        frequencia=frequencia,
                        historico=historico,
                    )
                )
        else:
            for student in students_by_class.get(cls.id, []):
                if _normalize_text(student.nome) in excluded_names:
                    continue
                class_students.append(
                    ReportStudent(
                        id=str(student.id),
                        nome=_to_proper_case(student.nome),
                        presencas=0,
                        faltas=0,
                        justificativas=0,
                        frequencia=0.0,
                        historico={},
                    )
                )

        class_students.sort(key=lambda s: s.nome)
        report.append(
            ReportClass(
                turma=turma_label or turma_key,
                horario=cls.horario or "",
                professor=cls.professor or "",
                nivel=cls.nivel or "",
                alunos=class_students,
            )
        )

    report.sort(key=lambda c: (c.turma, c.horario))
    return report

@app.post("/reports")
def generate_report(payload: Dict[str, Any], session: Session = Depends(get_session)):
    month = str(payload.get("month") or payload.get("mes") or "").strip() or None
    return get_reports(month=month, session=session)

@app.post("/reports/consolidated")
def generate_consolidated_report(payload: Dict[str, Any], session: Session = Depends(get_session)):
    return generate_report(payload, session=session)

@app.post("/reports/excel")
def generate_excel_report(payload: Dict[str, Any], session: Session = Depends(get_session)):
    return generate_report(payload, session=session)

@app.post("/reports/excel-file")
def generate_excel_report_file(payload: ExcelExportPayload, session: Session = Depends(get_session)):
    month = str(payload.month or "").strip() or None
    reports = get_reports(month=month, session=session)
    selected_reports = _resolve_export_targets(payload, reports)

    template_path = os.getenv(
        "REPORT_TEMPLATE_PATH",
        os.path.join(DATA_DIR, "archive", "relatorioChamada.legacy.xlsx"),
    )
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail=f"Template file not found: {template_path}")

    workbook = load_workbook(template_path)
    template_ws = workbook.active
    target_sheets = [workbook.copy_worksheet(template_ws) for _ in selected_reports]
    workbook.remove(template_ws)

    existing_titles: set[str] = set()
    for idx, selected in enumerate(selected_reports):
        ws = target_sheets[idx]
        _populate_attendance_sheet(ws=ws, selected=selected, month=month, session=session)
        sheet_title = _build_sheet_title(selected, existing_titles)
        ws.title = sheet_title
        existing_titles.add(sheet_title)

    export_dir = os.path.join(DATA_DIR, "exports")
    os.makedirs(export_dir, exist_ok=True)
    safe_month = (month or "sem-mes").replace("/", "-")
    output_name = f"Relatorio_Multiturmas_{safe_month}.xlsx"
    output_path = os.path.join(export_dir, output_name)
    workbook.save(output_path)

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=output_name,
    )

@app.post("/reports/chamada-pdf-file")
def generate_chamada_pdf_file(payload: ExcelExportPayload, session: Session = Depends(get_session)):
    month = str(payload.month or "").strip() or None
    reports = get_reports(month=month, session=session)
    selected_reports = _resolve_export_targets(payload, reports)

    pdf_bytes = _build_chamada_pdf(selected_reports=selected_reports, month=month, session=session)

    export_dir = os.path.join(DATA_DIR, "exports")
    os.makedirs(export_dir, exist_ok=True)
    safe_month = (month or "sem-mes").replace("/", "-")
    output_name = f"Relatorio_Multiturmas_{safe_month}.pdf"
    output_path = os.path.join(export_dir, output_name)
    with open(output_path, "wb") as f:
        f.write(pdf_bytes)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=output_name,
    )


# --- Statistics aggregation endpoint ---
@app.get("/reports/statistics", response_model=List[StudentStatisticsOut])
def get_reports_statistics(session: Session = Depends(get_session)):
    """Aggregate per-student retention and per-level permanence from attendance logs.

    - firstPresence: primeira data com registro de presença ('Presente' ou 'Justificado').
    - retention: dias entre firstPresence e data de exclusão (se houver) ou hoje.
    - levels: para cada nível onde o aluno teve registros, retorna período e frequência.

    Nota: identificação de aluno é por nome normalizado (mesmo critério usado em relatórios atuais).
    """
    # load classes to map turmaCodigo/turmaLabel -> nivel
    classes = session.exec(select(models.ImportClass)).all()
    class_by_code = {str(c.codigo or ""): c for c in classes}
    class_by_label = {str(c.turma_label or ""): c for c in classes}
    class_by_label_norm = {_normalize_text_fold(c.turma_label or ""): c for c in classes if str(c.turma_label or "").strip()}

    # load all attendance log entries (sorted to let the newest snapshot win)
    items = _load_json_list(os.path.join(DATA_DIR, "baseChamada.json"))
    items = sorted(items, key=lambda item: str((item or {}).get("saved_at") or ""))

    today = datetime.utcnow().date()
    allowed_schedule_days = _load_allowed_schedule_days(today)
    min_allowed_day: Dict[str, str] = {}
    for group_name in {"tq", "qs"}:
        values = sorted(allowed_schedule_days.get(group_name, set()))
        if values:
            min_allowed_day[group_name] = values[0]

    students: Dict[str, Dict[str, Any]] = {}
    matheus_manual_key = _normalize_text_fold("Matheus Henrique de Souza Marciano")

    def _ensure_student(name: str):
        key = _normalize_text(name)
        if key not in students:
            students[key] = {
                "nome": _to_proper_case(name),
                "ids": set(),
                "attendance_by_date": {},  # date -> { status, nivel, turmaCodigo }
                "per_level": {},
                "event_by_key": {},  # deduped event map
                "first_presence": None,
                "last_presence": None,
                "exclusion_date": None,
            }
        return students[key]

    # iterate logs (order not guaranteed) — process dates in each registro
    for item in items:
        turma_codigo = str(item.get("turmaCodigo") or "").strip()
        turma_label = str(item.get("turmaLabel") or "").strip()
        turma_horario = _normalize_horario_key(item.get("horario") or "")
        turma_professor = _normalize_text(item.get("professor") or "")
        source_tag = _normalize_text(item.get("source") or "")
        schedule_group = _infer_schedule_group(turma_label, turma_codigo)
        # resolve nivel from import classes
        nivel = ""
        cls = None
        if turma_codigo and turma_codigo in class_by_code:
            cls = class_by_code.get(turma_codigo)
        elif turma_label and turma_label in class_by_label:
            cls = class_by_label.get(turma_label)
        elif turma_label:
            cls = class_by_label_norm.get(_normalize_text_fold(turma_label))
        if cls:
            nivel = str(cls.nivel or "")

        registros = item.get("registros") or []
        for record in registros:
            nome = str(record.get("aluno_nome") or "").strip()
            if not nome:
                continue
            st = _ensure_student(nome)
            is_matheus_manual = _normalize_text_fold(nome) == matheus_manual_key and "csv" in source_tag
            attendance_map = record.get("attendance") or {}
            # iterate dates in chronological order
            for date_key in sorted(attendance_map.keys()):
                raw = str(attendance_map.get(date_key) or "").strip()
                mapped = _map_attendance_value(raw)
                # keep records for frequency calculation even if empty (we'll skip empty)
                if not date_key:
                    continue
                # ignore empty markers
                if mapped == "":
                    continue
                try:
                    parsed_d = datetime.strptime(date_key, "%Y-%m-%d").date()
                except Exception:
                    continue

                # enforce expected class days for known schedules (T/Q and Q/S)
                if schedule_group in {"tq", "qs"} and not is_matheus_manual:
                    group_days = allowed_schedule_days.get(schedule_group, set())
                    if group_days:
                        group_min = min_allowed_day.get(schedule_group)
                        if date_key not in group_days and (group_min is None or date_key >= group_min):
                            continue

                # dedupe snapshots: same student/day/schedule should count once (latest wins)
                if schedule_group in {"tq", "qs"}:
                    event_key = (date_key, schedule_group)
                else:
                    event_key = (
                        date_key,
                        _normalize_text(turma_codigo or turma_label),
                        turma_horario,
                        turma_professor,
                    )

                st["event_by_key"][event_key] = {
                    "date": parsed_d,
                    "status": mapped,
                    "nivel": nivel or "(sem-nivel)",
                }

    # build per-student aggregates from deduped events
    for _, st in students.items():
        st["attendance_by_date"] = {}
        st["per_level"] = {}
        st["first_presence"] = None
        st["last_presence"] = None

        deduped_events = sorted(
            st.get("event_by_key", {}).values(),
            key=lambda event: event.get("date") or date.min,
        )

        for event in deduped_events:
            parsed_d = event.get("date")
            if not parsed_d:
                continue
            date_key = parsed_d.isoformat()
            mapped = str(event.get("status") or "")
            level_key = str(event.get("nivel") or "(sem-nivel)")

            st["attendance_by_date"][date_key] = {
                "status": mapped,
                "nivel": level_key,
                "turmaCodigo": "",
            }

            if mapped in {"c", "j"}:
                if st["first_presence"] is None or parsed_d < st["first_presence"]:
                    st["first_presence"] = parsed_d
                if st["last_presence"] is None or parsed_d > st["last_presence"]:
                    st["last_presence"] = parsed_d

            lvl = st["per_level"].setdefault(level_key, {
                "first": None,
                "last": None,
                "presencas": 0,
                "faltas": 0,
                "justificativas": 0,
            })

            if lvl["first"] is None or parsed_d < lvl["first"]:
                lvl["first"] = parsed_d
            if lvl["last"] is None or parsed_d > lvl["last"]:
                lvl["last"] = parsed_d

            if mapped == "c":
                lvl["presencas"] += 1
            elif mapped == "f":
                lvl["faltas"] += 1
            elif mapped == "j":
                lvl["justificativas"] += 1

    # load exclusions
    excluded = _load_json_list(os.path.join(DATA_DIR, "excludedStudents.json"))
    for ex in excluded:
        nome = str(ex.get("nome") or "").strip()
        if not nome:
            continue
        key = _normalize_text(nome)
        if key not in students:
            students[key] = {"nome": _to_proper_case(nome), "ids": set(), "attendance_by_date": {}, "per_level": {}, "event_by_key": {}, "first_presence": None, "last_presence": None, "exclusion_date": None}
        date_str = str(ex.get("dataExclusao") or "").strip()
        if date_str:
            try:
                parsed = datetime.strptime(date_str, "%d/%m/%Y").date()
                students[key]["exclusion_date"] = parsed
            except Exception:
                # keep as None on parse failure
                pass

    # build output list
    out: List[Dict[str, Any]] = []
    for key, st in sorted(students.items(), key=lambda t: t[1]["nome"].lower()):
        first = st.get("first_presence")
        last = st.get("last_presence")
        exclusion = st.get("exclusion_date")
        end_date = exclusion or today
        retention_days = 0
        if first and end_date:
            retention_days = max(0, (end_date - first).days)
        # determine current nivel: use per_level with latest 'last' date
        current_nivel = None
        if st.get("per_level"):
            candidates = [(k, v["last"]) for k, v in st["per_level"].items() if v.get("last")]
            if candidates:
                candidates.sort(key=lambda x: x[1], reverse=True)
                current_nivel = candidates[0][0]
                if current_nivel == "(sem-nivel)":
                    current_nivel = None
        # build levels array
        levels_out: List[LevelHistoryOut] = []
        for lvl_name, vals in st.get("per_level", {}).items():
            first_d = vals.get("first")
            last_d = vals.get("last")
            pres = int(vals.get("presencas") or 0)
            falt = int(vals.get("faltas") or 0)
            just = int(vals.get("justificativas") or 0)
            total = pres + falt + just
            freq = round(((pres + just) / total) * 100, 1) if total else 0.0
            days = 0
            if first_d and last_d:
                days = max(0, (last_d - first_d).days + 1)
            name_out = None if lvl_name == "(sem-nivel)" else lvl_name
            levels_out.append(LevelHistoryOut(
                nivel=name_out or "",
                firstDate=first_d.isoformat() if first_d else None,
                lastDate=last_d.isoformat() if last_d else None,
                days=days,
                presencas=pres,
                faltas=falt,
                justificativas=just,
                frequencia=freq,
            ))
        out.append(StudentStatisticsOut(
            id=None,
            nome=_to_proper_case(st.get("nome") or key),
            firstPresence=first.isoformat() if first else None,
            lastPresence=last.isoformat() if last else None,
            exclusionDate=exclusion.isoformat() if exclusion else None,
            retentionDays=retention_days,
            currentNivel=current_nivel,
            levels=levels_out,
        ))
    return out

@app.post("/reports/parq-pdf-file")
def generate_parq_pdf_file_compat(payload: ExcelExportPayload, session: Session = Depends(get_session)):
    return generate_chamada_pdf_file(payload=payload, session=session)

def parse_bool(value: str) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"true", "1", "sim", "yes", "y"}


def _normalize_horario_value(raw: str) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 3:
        digits = f"0{digits}"
    if len(digits) > 4:
        digits = digits[:4]
    return digits.zfill(4)

def get_or_create_import_unit(session: Session, name: str) -> models.ImportUnit:
    stmt = select(models.ImportUnit).where(models.ImportUnit.name == name)
    unit = session.exec(stmt).first()
    if unit:
        return unit
    unit = models.ImportUnit(name=name)
    session.add(unit)
    session.flush()
    return unit

def get_or_create_import_class(session: Session, unit_id: int, codigo: str, horario: str) -> models.ImportClass | None:
    stmt = select(models.ImportClass).where(
        models.ImportClass.unit_id == unit_id,
        models.ImportClass.codigo == codigo,
        models.ImportClass.horario == horario,
    )
    return session.exec(stmt).first()

def get_or_create_import_student(session: Session, class_id: int, nome: str) -> models.ImportStudent | None:
    stmt = select(models.ImportStudent).where(
        models.ImportStudent.class_id == class_id,
        models.ImportStudent.nome == nome,
    )
    return session.exec(stmt).first()

def _find_import_class_by_triple(
    session: Session,
    turma: str,
    horario: str,
    professor: str,
) -> Optional[models.ImportClass]:
    turma_norm = _normalize_text(turma)
    horario_key = _normalize_horario_value(horario)
    professor_norm = _normalize_text(professor)
    if not turma_norm or not horario_key or not professor_norm:
        return None

    classes = session.exec(select(models.ImportClass)).all()
    for cls in classes:
        cls_horario = _normalize_horario_value(cls.horario or "")
        cls_professor = _normalize_text(cls.professor or "")
        cls_codigo = _normalize_text(cls.codigo or "")
        cls_label = _normalize_text(cls.turma_label or cls.codigo or "")
        turma_matches = turma_norm in {cls_codigo, cls_label}
        if turma_matches and cls_horario == horario_key and cls_professor == professor_norm:
            return cls
    return None

def _import_student_out(student: models.ImportStudent) -> ImportStudentOut:
    return ImportStudentOut(
        id=student.id or 0,
        class_id=student.class_id,
        nome=student.nome,
        whatsapp=student.whatsapp or "",
        data_nascimento=student.data_nascimento or "",
        data_atestado=student.data_atestado or "",
        categoria=student.categoria or "",
        genero=student.genero or "",
        parq=student.parq or "",
        atestado=bool(student.atestado),
    )

@app.post("/api/import-data", response_model=ImportResult)
async def import_data(file: UploadFile = File(...), session: Session = Depends(get_session)) -> ImportResult:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be .csv")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")

    try:
        dialect = csv.Sniffer().sniff(text, delimiters=[",", ";", "\t"])
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ","

    reader = csv.DictReader(StringIO(text), delimiter=delimiter)
    if reader.fieldnames and len(reader.fieldnames) == 1:
        header_line = reader.fieldnames[0]
        if ";" in header_line:
            delimiter = ";"
        elif "\t" in header_line:
            delimiter = "\t"
        if delimiter != ",":
            reader = csv.DictReader(StringIO(text), delimiter=delimiter)

    required = {
        "unidade",
        "turma_codigo",
        "horario",
        "professor",
        "nivel",
        "capacidade",
        "dias_semana",
        "aluno_nome",
        "aluno_turma",
        "whatsapp",
        "data_nascimento",
        "data_atest",
        "categoria",
        "genero",
        "parq",
        "atestado",
    }

    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV header not found")

    missing = required.difference({name.strip() for name in reader.fieldnames})
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(sorted(missing))}")

    counters: Dict[str, int] = {
        "units_created": 0,
        "units_updated": 0,
        "classes_created": 0,
        "classes_updated": 0,
        "students_created": 0,
        "students_updated": 0,
    }

    try:
        for row in reader:
            unidade = (row.get("unidade") or "").strip()
            codigo = (row.get("turma_codigo") or "").strip()
            raw_horario = (row.get("horario") or "").strip()
            horario = _normalize_horario_value(raw_horario)
            aluno_nome = (row.get("aluno_nome") or "").strip()

            if not unidade or not codigo or not horario or not aluno_nome:
                continue

            unit = get_or_create_import_unit(session, unidade)
            if unit.id:
                counters["units_updated"] += 1
            else:
                counters["units_created"] += 1

            class_obj = get_or_create_import_class(session, unit.id, codigo, horario)
            if class_obj:
                counters["classes_updated"] += 1
            else:
                class_obj = models.ImportClass(unit_id=unit.id, codigo=codigo, horario=horario)
                session.add(class_obj)
                session.flush()
                counters["classes_created"] += 1

            class_obj.horario = horario
            class_obj.professor = (row.get("professor") or "").strip()
            class_obj.nivel = (row.get("nivel") or "").strip()
            class_obj.faixa_etaria = (row.get("faixa_etaria") or "").strip()
            class_obj.capacidade = int((row.get("capacidade") or "0") or 0)
            class_obj.dias_semana = (row.get("dias_semana") or "").strip()
            class_obj.turma_label = (row.get("aluno_turma") or "").strip() or codigo

            student = get_or_create_import_student(session, class_obj.id, aluno_nome)
            if student:
                counters["students_updated"] += 1
            else:
                student = models.ImportStudent(class_id=class_obj.id, nome=aluno_nome)
                session.add(student)
                counters["students_created"] += 1

            student.whatsapp = _format_whatsapp(row.get("whatsapp"))
            student.data_nascimento = (row.get("data_nascimento") or "").strip()
            student.data_atestado = (row.get("data_atest") or "").strip()
            student.categoria = (row.get("categoria") or "").strip()
            student.genero = (row.get("genero") or "").strip()
            student.parq = (row.get("parq") or "").strip()
            student.atestado = parse_bool(row.get("atestado") or "")

        session.commit()
        return ImportResult(**counters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"import error: {exc}")

@app.get("/api/bootstrap", response_model=BootstrapOut)
def bootstrap(unit_id: Optional[int] = None, session: Session = Depends(get_session)) -> BootstrapOut:
    units_stmt = select(models.ImportUnit).order_by(models.ImportUnit.name)
    units = session.exec(units_stmt).all()

    classes_stmt = select(models.ImportClass)
    if unit_id is not None:
        classes_stmt = classes_stmt.where(models.ImportClass.unit_id == unit_id)
    classes_stmt = classes_stmt.order_by(models.ImportClass.codigo, models.ImportClass.horario)
    classes = session.exec(classes_stmt).all()

    class_ids = [c.id for c in classes]
    students_stmt = select(models.ImportStudent)
    if class_ids:
        students_stmt = students_stmt.where(models.ImportStudent.class_id.in_(class_ids))
    students = session.exec(students_stmt).all()

    return BootstrapOut(
        units=[ImportUnitOut(id=u.id, name=u.name) for u in units],
        classes=[
            ImportClassOut(
                id=c.id,
                unit_id=c.unit_id,
                codigo=c.codigo,
                turma_label=c.turma_label,
                horario=c.horario,
                professor=c.professor,
                nivel=c.nivel,
                faixa_etaria=c.faixa_etaria,
                capacidade=c.capacidade,
                dias_semana=c.dias_semana,
            )
            for c in classes
        ],
        students=[
            ImportStudentOut(
                id=s.id,
                class_id=s.class_id,
                nome=s.nome,
                whatsapp=s.whatsapp,
                data_nascimento=s.data_nascimento,
                data_atestado=s.data_atestado,
                categoria=s.categoria,
                genero=s.genero,
                parq=s.parq,
                atestado=bool(s.atestado),
            )
            for s in students
        ],
    )

@app.post("/api/import-students", response_model=ImportStudentOut)
def create_import_student(payload: ImportStudentUpsertPayload, session: Session = Depends(get_session)) -> ImportStudentOut:
    target_class = _find_import_class_by_triple(
        session=session,
        turma=payload.turma,
        horario=payload.horario,
        professor=payload.professor,
    )
    if not target_class:
        raise HTTPException(status_code=404, detail="Class not found for turma/horario/professor")

    nome = str(payload.nome or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="nome is required")

    student = get_or_create_import_student(session, target_class.id, nome)
    if not student:
        student = models.ImportStudent(class_id=target_class.id, nome=nome)
        session.add(student)

    student.class_id = target_class.id
    student.nome = nome
    student.whatsapp = _format_whatsapp(payload.whatsapp)
    student.data_nascimento = str(payload.data_nascimento or "").strip()
    student.data_atestado = str(payload.data_atestado or "").strip()
    student.categoria = str(payload.categoria or "").strip()
    student.genero = str(payload.genero or "").strip()
    student.parq = str(payload.parq or "").strip()
    student.atestado = bool(payload.atestado)

    session.commit()
    session.refresh(student)
    return _import_student_out(student)

@app.put("/api/import-students/{student_id}", response_model=ImportStudentOut)
def update_import_student(student_id: int, payload: ImportStudentUpsertPayload, session: Session = Depends(get_session)) -> ImportStudentOut:
    student = session.get(models.ImportStudent, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Import student not found")

    target_class = _find_import_class_by_triple(
        session=session,
        turma=payload.turma,
        horario=payload.horario,
        professor=payload.professor,
    )
    if not target_class:
        raise HTTPException(status_code=404, detail="Class not found for turma/horario/professor")

    nome = str(payload.nome or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="nome is required")

    existing_target = get_or_create_import_student(session, target_class.id, nome)
    target_student = student
    if existing_target and existing_target.id != student.id:
        target_student = existing_target
        session.delete(student)

    target_student.class_id = target_class.id
    target_student.nome = nome
    target_student.whatsapp = _format_whatsapp(payload.whatsapp)
    target_student.data_nascimento = str(payload.data_nascimento or "").strip()
    target_student.data_atestado = str(payload.data_atestado or "").strip()
    target_student.categoria = str(payload.categoria or "").strip()
    target_student.genero = str(payload.genero or "").strip()
    target_student.parq = str(payload.parq or "").strip()
    target_student.atestado = bool(payload.atestado)

    session.add(target_student)
    session.commit()
    session.refresh(target_student)
    return _import_student_out(target_student)

# Users endpoints (bootstrap)
@app.post("/users/register")
def register_user(username: str, password: str, session: Session = Depends(get_session)):
    stmt = select(models.User).where(models.User.username == username)
    existing = session.exec(stmt).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    user = models.User(username=username, password_hash=get_password_hash(password), role="admin")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"username": user.username, "id": user.id}

@app.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# Data endpoints
@app.get("/students", response_model=List[models.Student])
def list_students(limit: int = 100, session: Session = Depends(get_session)):
    return crud.get_students(session, limit)

@app.post("/students", response_model=models.Student)
def add_student(student: models.Student, session: Session = Depends(get_session)):
    return crud.create_student(session, student)

@app.delete("/students/{student_id}")
def delete_student(student_id: int, session: Session = Depends(get_session)):
    student = session.get(models.Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    session.delete(student)
    session.commit()
    return {"ok": True}

@app.get("/classes", response_model=List[models.ClassModel])
def list_classes(session: Session = Depends(get_session)):
    return crud.get_classes(session)

@app.post("/classes", response_model=models.ClassModel)
def add_class(class_model: models.ClassModel, session: Session = Depends(get_session)):
    return crud.create_class(session, class_model)

# Import classes endpoints (for turma management via UI)
@app.post("/import-classes")
def create_import_class(
    data: models.ImportClassCreate,
    session: Session = Depends(get_session),
):
    """Create a new import class (turma) - default unit_id is 1"""
    unit_id = 1  # Default unit
    # Generate codigo from turma components
    codigo = f"{data.professor[:2].lower()}{data.turma_label[:3].lower()}".replace(" ", "")
    
    new_class = models.ImportClass(
        unit_id=unit_id,
        codigo=codigo or f"t{session.exec(select(func.count(models.ImportClass.id))).first() or 0}",
        turma_label=data.turma_label,
        horario=data.horario,
        professor=data.professor,
        nivel=data.nivel or "",
        faixa_etaria=data.faixa_etaria or "",
        capacidade=data.capacidade or 0,
        dias_semana=data.dias_semana or "",
    )
    session.add(new_class)
    session.commit()
    session.refresh(new_class)
    return {
        "id": new_class.id,
        "unit_id": new_class.unit_id,
        "codigo": new_class.codigo,
        "turma_label": new_class.turma_label,
        "horario": new_class.horario,
        "professor": new_class.professor,
        "nivel": new_class.nivel,
        "faixa_etaria": new_class.faixa_etaria,
        "capacidade": new_class.capacidade,
        "dias_semana": new_class.dias_semana,
    }

@app.put("/import-classes/{class_id}")
def update_import_class(
    class_id: int,
    data: models.ImportClassUpdate,
    session: Session = Depends(get_session),
):
    """Update an existing import class (turma)"""
    import_class = session.exec(select(models.ImportClass).where(models.ImportClass.id == class_id)).first()
    if not import_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    if data.turma_label is not None:
        import_class.turma_label = data.turma_label
    if data.horario is not None:
        import_class.horario = data.horario
    if data.professor is not None:
        import_class.professor = data.professor
    if data.nivel is not None:
        import_class.nivel = data.nivel
    if data.faixa_etaria is not None:
        import_class.faixa_etaria = data.faixa_etaria
    if data.capacidade is not None:
        import_class.capacidade = data.capacidade
    if data.dias_semana is not None:
        import_class.dias_semana = data.dias_semana
    
    session.add(import_class)
    session.commit()
    session.refresh(import_class)
    return {
        "id": import_class.id,
        "unit_id": import_class.unit_id,
        "codigo": import_class.codigo,
        "turma_label": import_class.turma_label,
        "horario": import_class.horario,
        "professor": import_class.professor,
        "nivel": import_class.nivel,
        "faixa_etaria": import_class.faixa_etaria,
        "capacidade": import_class.capacidade,
        "dias_semana": import_class.dias_semana,
    }

@app.get("/attendance", response_model=List[models.Attendance])
def list_attendance(session: Session = Depends(get_session)):
    statement = session.exec(select(models.Attendance))
    return statement.all()

@app.post("/attendance", response_model=models.Attendance)
def add_attendance(attendance: models.Attendance, session: Session = Depends(get_session)):
    return crud.create_attendance(session, attendance)

# Import endpoint (protected) - accepts uploaded file or file param (file must be in data/)
@app.post("/import")
def import_excel(
    file: Optional[str] = Query(None, description="Nome do arquivo em /app/data/"),
    out_clean: Optional[bool] = Query(False, description="Salvar arquivo cleaned em data/"),
    upload: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
):
    os.makedirs(DATA_DIR, exist_ok=True)

    if upload:
        dest_path = os.path.join(DATA_DIR, upload.filename)
        with open(dest_path, "wb") as f:
            f.write(upload.file.read())
        file_path = dest_path
    elif file:
        file_path = os.path.join(DATA_DIR, file)
    else:
        raise HTTPException(status_code=400, detail="No file provided")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    out_cleaned_path = None
    if out_clean:
        base = os.path.basename(file_path)
        out_cleaned_path = os.path.join(DATA_DIR, f"{base}.cleaned.xlsx")

    result = import_from_excel(file_path, session, out_cleaned=out_cleaned_path)
    response = {"imported": result["counts"], "mapping": result["mapping"]}
    if result.get("cleaned_path"):
        response["cleaned_path"] = os.path.basename(result["cleaned_path"])
    return response

# File download endpoint
@app.get("/files/{filename}")
def download_file(filename: str):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)
