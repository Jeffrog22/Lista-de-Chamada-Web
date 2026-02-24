from typing import Optional
from datetime import date, datetime
from sqlmodel import SQLModel, Field
from sqlalchemy import UniqueConstraint
from pydantic import validator

def _normalize_horario(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if raw == "":
        return None

    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 3:
        digits = "0" + digits
    if len(digits) != 4:
        raise ValueError("horario must be 4 digits in HHMM format")

    hour = int(digits[:2])
    minute = int(digits[2:])
    if hour > 23 or minute > 59:
        raise ValueError("horario must be between 0000 and 2359")

    return digits

class Student(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str
    aniversario: Optional[date] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    observacoes: Optional[str] = None
    genero: Optional[str] = None
    nivel: Optional[str] = None
    turma: Optional[str] = None
    horario: Optional[str] = None
    professor: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    @validator("horario", pre=True)
    def validate_horario(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_horario(value)

class ClassModel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str
    horario: Optional[str] = None
    local: Optional[str] = None
    instrutor: Optional[str] = None
    nivel: Optional[str] = None
    capacidade_maxima: Optional[int] = None

    @validator("horario", pre=True)
    def validate_horario(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_horario(value)

class Attendance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: Optional[int] = None
    class_id: Optional[int] = None
    student_name: Optional[str] = None
    class_name: Optional[str] = None
    data: Optional[date] = None
    status: Optional[str] = None
    notas: Optional[str] = None

class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    password_hash: str
    role: Optional[str] = "operator"

class ImportUnit(SQLModel, table=True):
    __tablename__ = "import_units"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str

class ImportClass(SQLModel, table=True):
    __tablename__ = "import_classes"
    __table_args__ = (
        UniqueConstraint("unit_id", "codigo", "horario", name="uq_import_class_unit_codigo_horario"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    unit_id: int
    codigo: str
    turma_label: str = ""
    horario: str
    professor: str = ""
    nivel: str = ""
    faixa_etaria: str = ""
    capacidade: int = 0
    dias_semana: str = ""


class ImportClassCreate(SQLModel):
    """Model for creating a new ImportClass"""
    turma_label: str
    horario: str
    professor: str
    nivel: Optional[str] = None
    faixa_etaria: Optional[str] = None
    capacidade: Optional[int] = None
    dias_semana: Optional[str] = None


class ImportClassUpdate(SQLModel):
    """Model for updating an existing ImportClass"""
    turma_label: Optional[str] = None
    horario: Optional[str] = None
    professor: Optional[str] = None
    nivel: Optional[str] = None
    faixa_etaria: Optional[str] = None
    capacidade: Optional[int] = None
    dias_semana: Optional[str] = None

class ImportStudent(SQLModel, table=True):
    __tablename__ = "import_students"
    __table_args__ = (
        UniqueConstraint("class_id", "nome", name="uq_import_student_class_nome"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    class_id: int
    nome: str
    whatsapp: str = ""
    data_nascimento: str = ""
    data_atestado: str = ""
    categoria: str = ""
    genero: str = ""
    parq: str = ""
    atestado: bool = False
