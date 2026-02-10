from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Response
from sqlmodel import Session, select
from app.database import create_db_and_tables, get_session
from app import crud, models
from typing import List, Optional, Dict, Any
import os
import json
import pandas as pd
import requests
from pydantic import BaseModel, conint
import csv
from io import StringIO
from app.etl.import_excel import import_from_excel
from app.auth import get_password_hash, create_access_token, authenticate_user, get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lista-de-Chamada - API")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")

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
            "Temp. (C)": entry.tempExterna or "",
            "Piscina (C)": entry.tempPiscina or "",
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
            "tempExterna": str(row.get("Temp. (C)", "")),
            "tempPiscina": str(row.get("Piscina (C)", "")),
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

def parse_bool(value: str) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"true", "1", "sim", "yes", "y"}

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
            horario = (row.get("horario") or "").strip()
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

            student.whatsapp = (row.get("whatsapp") or "").strip()
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
