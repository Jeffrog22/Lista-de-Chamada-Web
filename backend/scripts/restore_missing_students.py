#!/usr/bin/env python3
"""
Restore 6 missing students as unallocated (pending allocation)
These students will appear in the Students tab for manual re-allocation.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_session
from app import models
from sqlmodel import Session

MISSING_STUDENTS = [
    {"nome": "Benedito Aparecido Pereira"},
    {"nome": "Bruna Mendonça Fillol"},
    {"nome": "Jéssica Fernanda Frassi"},
    {"nome": "Francisco Carlos Schmidt"},
    {"nome": "Lucivaldo Faz de Lira"},
    {"nome": "Gisele Alves de Souza"},
]

def restore_students():
    """Re-add 6 missing students as unallocated (class_id=None)"""
    engine = __import__("app.database", fromlist=["engine"]).engine
    with Session(engine) as session:
        added = 0
        for data in MISSING_STUDENTS:
            nome = data["nome"].strip()
            
            # Check if already exists
            stmt = __import__("sqlmodel", fromlist=["select"]).select(
                models.ImportStudent
            ).where(models.ImportStudent.nome == nome)
            existing = session.exec(stmt).first()
            
            if existing:
                print(f"⊘ {nome} already exists (id={existing.id})")
                continue
            
            # Create as unallocated (class_id=None)
            student = models.ImportStudent(
                class_id=None,  # UNALLOCATED
                nome=nome,
                whatsapp="",
                data_nascimento="",
                data_atestado="",
                categoria="",
                genero="",
                parq="",
                atestado=False,
            )
            session.add(student)
            print(f"✓ Added {nome} as PENDING allocation")
            added += 1
        
        session.commit()
        print(f"\n✓ Restored {added} students. They will appear in Students tab as pending allocation.")
        return added > 0

if __name__ == "__main__":
    try:
        if restore_students():
            print("\nRun 'npm run deploy:pages:sao' to update frontend with restored students.")
        else:
            print("No students were added (all may already exist).")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
