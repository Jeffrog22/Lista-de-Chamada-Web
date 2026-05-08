#!/usr/bin/env python3
"""
Inspect missing students status:
1. Check if they exist in import_students table with class_id=NULL
2. Check exclusions
3. Check baseChamada.json for references
"""

import sys
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_session
from app import models
from sqlmodel import Session, select

MISSING_STUDENTS = [
    "Benedito Aparecido Pereira",
    "Bruna Mendonça Fillol",
    "Jéssica Fernanda Frassi",
    "Francisco Carlos Schmidt",
    "Lucivaldo Faz de Lira",
    "Gisele Alves de Souza",
]

def inspect_db():
    """Check if students exist in DB"""
    print("=== Checking ImportStudent table ===")
    engine = __import__("app.database", fromlist=["engine"]).engine
    with Session(engine) as session:
        # Check if any of the 6 exist
        for nome in MISSING_STUDENTS:
            stmt = select(models.ImportStudent).where(models.ImportStudent.nome == nome)
            student = session.exec(stmt).first()
            if student:
                print(f"✓ {nome}: Found (class_id={student.class_id})")
            else:
                print(f"✗ {nome}: NOT FOUND")
        
        # Check total unallocated students
        unallocated = session.exec(
            select(models.ImportStudent).where(models.ImportStudent.class_id.is_(None))
        ).all()
        print(f"\nTotal unallocated students: {len(unallocated)}")
        if unallocated and len(unallocated) <= 20:
            for s in unallocated:
                print(f"  - {s.nome}")

def inspect_basechamada():
    """Check baseChamada.json for references"""
    print("\n=== Checking baseChamada.json ===")
    base_path = Path(__file__).parent.parent.parent / "data" / "baseChamada.json"
    if base_path.exists():
        with open(base_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                if isinstance(data, list):
                    for entry in data:
                        aluno = entry.get("aluno_nome", "")
                        for missing in MISSING_STUDENTS:
                            if missing.lower() in aluno.lower():
                                print(f"✓ Found '{aluno}' in baseChamada.json")
                                print(f"  Entry: {json.dumps(entry, ensure_ascii=False)[:100]}...")
                                break
                    print(f"Total entries in baseChamada.json: {len(data)}")
            except Exception as e:
                print(f"Error reading baseChamada.json: {e}")
    else:
        print(f"baseChamada.json not found at {base_path}")

if __name__ == "__main__":
    try:
        inspect_db()
        inspect_basechamada()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
