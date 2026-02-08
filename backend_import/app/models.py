from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    classes = relationship("Class", back_populates="unit", cascade="all, delete-orphan")


class Class(Base):
    __tablename__ = "classes"
    __table_args__ = (
        UniqueConstraint("unit_id", "codigo", "horario", name="uq_class_unit_codigo_horario"),
    )

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    codigo = Column(String, nullable=False)
    turma_label = Column(String, default="")
    horario = Column(String, nullable=False)
    professor = Column(String, default="")
    nivel = Column(String, default="")
    capacidade = Column(Integer, default=0)
    dias_semana = Column(String, default="")

    unit = relationship("Unit", back_populates="classes")
    students = relationship("Student", back_populates="class_ref", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("class_id", "nome", name="uq_student_class_nome"),
    )

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    nome = Column(String, nullable=False)
    whatsapp = Column(String, default="")
    data_nascimento = Column(String, default="")
    data_atestado = Column(String, default="")
    categoria = Column(String, default="")
    genero = Column(String, default="")
    parq = Column(String, default="")
    atestado = Column(Boolean, default=False)

    class_ref = relationship("Class", back_populates="students")
