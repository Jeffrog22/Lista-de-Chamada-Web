import csv
from io import StringIO
from typing import Dict

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, conint
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import Base, Class, Student, Unit

app = FastAPI(title="Multi-Unit Import API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImportResult(BaseModel):
    units_created: int
    units_updated: int
    classes_created: int
    classes_updated: int
    students_created: int
    students_updated: int

class UnitOut(BaseModel):
    id: int
    name: str

class ClassOut(BaseModel):
    id: int
    unit_id: int
    codigo: str
    turma_label: str
    horario: str
    professor: str
    nivel: str
    capacidade: conint(ge=0)  # Ensure capacidade is non-negative
    dias_semana: str

class StudentOut(BaseModel):
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
    units: list[UnitOut]
    classes: list[ClassOut]
    students: list[StudentOut]


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


def parse_bool(value: str) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"true", "1", "sim", "yes", "y"}


def get_or_create_unit(db: Session, name: str) -> Unit:
    unit = db.query(Unit).filter(Unit.name == name).first()
    if unit:
        return unit
    unit = Unit(name=name)
    db.add(unit)
    db.flush()
    return unit


def get_or_create_class(db: Session, unit_id: int, codigo: str, horario: str) -> Class:
    return (
        db.query(Class)
        .filter(Class.unit_id == unit_id, Class.codigo == codigo, Class.horario == horario)
        .first()
    )


def get_or_create_student(db: Session, class_id: int, nome: str) -> Student:
    return (
        db.query(Student)
        .filter(Student.class_id == class_id, Student.nome == nome)
        .first()
    )


@app.post("/api/import-data", response_model=ImportResult)
async def import_data(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResult:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be .csv")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # Remove BOM if present
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")

    # Auto-detect delimiter (comma, semicolon, or tab)
    try:
        dialect = csv.Sniffer().sniff(text, delimiters=[",", ";", "\t"])
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ","

    reader = csv.DictReader(StringIO(text), delimiter=delimiter)
    # Fallback if header did not split correctly
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

            unit = db.query(Unit).filter(Unit.name == unidade).first()
            if unit:
                counters["units_updated"] += 1
            else:
                unit = Unit(name=unidade)
                db.add(unit)
                db.flush()
                counters["units_created"] += 1

            class_obj = get_or_create_class(db, unit.id, codigo, horario)
            if class_obj:
                counters["classes_updated"] += 1
            else:
                class_obj = Class(unit_id=unit.id, codigo=codigo, horario=horario)
                db.add(class_obj)
                db.flush()
                counters["classes_created"] += 1

            class_obj.professor = (row.get("professor") or "").strip()
            class_obj.nivel = (row.get("nivel") or "").strip()
            class_obj.capacidade = int((row.get("capacidade") or "0") or 0)
            class_obj.dias_semana = (row.get("dias_semana") or "").strip()
            class_obj.turma_label = (row.get("aluno_turma") or "").strip() or codigo

            student = get_or_create_student(db, class_obj.id, aluno_nome)
            if student:
                counters["students_updated"] += 1
            else:
                student = Student(class_id=class_obj.id, nome=aluno_nome)
                db.add(student)
                counters["students_created"] += 1

            student.whatsapp = (row.get("whatsapp") or "").strip()
            student.data_nascimento = (row.get("data_nascimento") or "").strip()
            student.data_atestado = (row.get("data_atest") or "").strip()
            student.categoria = (row.get("categoria") or "").strip()
            student.genero = (row.get("genero") or "").strip()
            student.parq = (row.get("parq") or "").strip()
            student.atestado = parse_bool(row.get("atestado") or "")

        db.commit()
        return ImportResult(**counters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"import error: {exc}")


@app.get("/api/units", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db)):
    units = db.query(Unit).order_by(Unit.name).all()
    return [UnitOut(id=u.id, name=u.name) for u in units]


@app.get("/api/classes", response_model=list[ClassOut])
def list_classes(unit_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Class)
    if unit_id is not None:
        query = query.filter(Class.unit_id == unit_id)
    classes = query.order_by(Class.codigo, Class.horario).all()
    return [
        ClassOut(
            id=c.id,
            unit_id=c.unit_id,
            codigo=c.codigo,
            turma_label=c.turma_label,
            horario=c.horario,
            professor=c.professor,
            nivel=c.nivel,
            capacidade=c.capacidade,
            dias_semana=c.dias_semana,
        )
        for c in classes
    ]


@app.get("/api/students", response_model=list[StudentOut])
def list_students(class_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Student)
    if class_id is not None:
        query = query.filter(Student.class_id == class_id)
    students = query.order_by(Student.nome).all()
    return [
        StudentOut(
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
    ]


@app.get("/api/bootstrap", response_model=BootstrapOut)
def get_bootstrap(unit_id: int | None = None, db: Session = Depends(get_db)):
    units = db.query(Unit).order_by(Unit.name).all()
    if unit_id is not None and not any(u.id == unit_id for u in units):
        raise HTTPException(status_code=404, detail="unit not found")

    classes_query = db.query(Class)
    if unit_id is not None:
        classes_query = classes_query.filter(Class.unit_id == unit_id)
    classes = classes_query.order_by(Class.codigo, Class.horario).all()
    class_ids = [c.id for c in classes]

    students = (
        db.query(Student)
        .filter(Student.class_id.in_(class_ids))
        .order_by(Student.nome)
        .all()
        if class_ids
        else []
    )

    return BootstrapOut(
        units=[UnitOut(id=u.id, name=u.name) for u in units],
        classes=[
            ClassOut(
                id=c.id,
                unit_id=c.unit_id,
                codigo=c.codigo,
                turma_label=c.turma_label,
                horario=c.horario,
                professor=c.professor,
                nivel=c.nivel,
                capacidade=c.capacidade,
                dias_semana=c.dias_semana,
            )
            for c in classes
        ],
        students=[
            StudentOut(
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
