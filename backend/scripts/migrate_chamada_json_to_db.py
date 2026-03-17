"""
Migra registros de baseChamada.json para a tabela attendance_logs no Supabase.
Uso: python scripts/migrate_chamada_json_to_db.py
"""
import os
import sys
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.database import engine, create_db_and_tables
from app.models import AttendanceLog
from sqlmodel import Session, select

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
CHAMADA_FILE = os.path.join(DATA_DIR, "baseChamada.json")

def _load_json(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []

def main():
    print("Criando tabelas se necessário...")
    create_db_and_tables()

    items = _load_json(CHAMADA_FILE)
    if not items:
        print("Nenhum registro encontrado em baseChamada.json.")
        return

    print(f"Encontrados {len(items)} registros no JSON.")

    # Agrupar por (turmaCodigo, horario, professor, mes) → manter o mais recente
    from app.main import _attendance_log_lookup_keys, _saved_at_sort_key, _normalize_horario_key
    latest = {}
    for item in items:
        item_norm = dict(item)
        item_norm["horario"] = _normalize_horario_key(item_norm.get("horario") or "")
        key = (
            str(item_norm.get("turmaCodigo") or "").strip(),
            str(item_norm.get("horario") or "").strip(),
            str(item_norm.get("professor") or "").strip(),
            str(item_norm.get("mes") or "").strip(),
        )
        existing = latest.get(key)
        if existing is None:
            latest[key] = item_norm
        else:
            if _saved_at_sort_key(item_norm.get("saved_at")) > _saved_at_sort_key(existing.get("saved_at")):
                latest[key] = item_norm

    print(f"Grupos únicos (turma/horario/professor/mês): {len(latest)}")

    inserted = 0
    updated = 0
    with Session(engine) as session:
        for (turma_codigo, horario, professor, mes), item in latest.items():
            registros = item.get("registros") or []
            registros_json = json.dumps(registros, ensure_ascii=False)
            saved_at = str(item.get("saved_at") or "")
            turma_label = str(item.get("turmaLabel") or "").strip()
            source = item.get("source")
            client_saved_at = str(item.get("clientSavedAt") or "")

            existing_row = session.exec(
                select(AttendanceLog).where(
                    AttendanceLog.turma_codigo == turma_codigo,
                    AttendanceLog.horario == horario,
                    AttendanceLog.professor == professor,
                    AttendanceLog.mes == mes,
                )
            ).first()

            if existing_row:
                existing_row.turma_label = turma_label
                existing_row.saved_at = saved_at
                existing_row.client_saved_at = client_saved_at
                existing_row.source = source
                existing_row.registros_json = registros_json
                session.add(existing_row)
                updated += 1
                print(f"  [UPDATE] {turma_codigo} | {horario} | {professor} | {mes} ({len(registros)} alunos)")
            else:
                row = AttendanceLog(
                    turma_codigo=turma_codigo,
                    turma_label=turma_label,
                    horario=horario,
                    professor=professor,
                    mes=mes,
                    saved_at=saved_at,
                    client_saved_at=client_saved_at,
                    source=source,
                    registros_json=registros_json,
                )
                session.add(row)
                inserted += 1
                print(f"  [INSERT] {turma_codigo} | {horario} | {professor} | {mes} ({len(registros)} alunos)")

        session.commit()

    print(f"\nMigração concluída: {inserted} inseridos, {updated} atualizados.")

if __name__ == "__main__":
    main()
