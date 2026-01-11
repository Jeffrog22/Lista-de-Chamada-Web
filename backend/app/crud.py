from sqlmodel import select
from sqlmodel import Session
from app.models import Student, ClassModel, Attendance
from typing import List

def get_students(session: Session, limit: int = 100):
    statement = select(Student).limit(limit)
    return session.exec(statement).all()

def create_student(session: Session, student: Student):
    session.add(student)
    session.commit()
    session.refresh(student)
    return student

def get_classes(session: Session):
    statement = select(ClassModel)
    return session.exec(statement).all()

def create_class(session: Session, class_model: ClassModel):
    session.add(class_model)
    session.commit()
    session.refresh(class_model)
    return class_model

def create_attendance(session: Session, attendance: Attendance):
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance
