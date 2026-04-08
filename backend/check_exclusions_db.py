#!/usr/bin/env python3
"""Script para verificar dados de exclusões no banco de dados"""

import os
import sys
from sqlmodel import Session, select, create_engine
from sqlalchemy import inspect, text

# Configurar DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
print(f"[INFO] DATABASE_URL: {DATABASE_URL}")

try:
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
    )
    
    # Listar tabelas
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"[INFO] Total de tabelas: {len(tables)}")
    
    # Procurar por tabelas de exclusão
    exclusion_tables = [t for t in tables if 'exclus' in t.lower()]
    print(f"[INFO] Tabelas de exclusão: {exclusion_tables}")
    
    # Se não houver tabela de exclusão, verificar PoolLog (pode ter histórico)
    if not exclusion_tables:
        print("[WARNING] Nenhuma tabela de exclusão encontrada no DB")
        print("[INFO] Tabelas disponíveis:", ", ".join(tables))
    else:
        # Tentar ler dados da tabela
        with Session(engine) as session:
            for table_name in exclusion_tables:
                print(f"\n[INFO] Verificando tabela: {table_name}")
                result = session.exec(text(f"SELECT COUNT(*) FROM {table_name}")).first()
                if result:
                    print(f"[INFO] Total de registros: {result[0]}")
                    
                    # Se houver registros, mostrar amostra
                    if result[0] > 0:
                        rows = session.exec(text(f"SELECT * FROM {table_name} LIMIT 5")).fetchall()
                        print(f"[INFO] Amostra (primeiras 5 linhas):")
                        for row in rows:
                            print(f"  {row}")

except Exception as e:
    print(f"[ERROR] {e}", file=sys.stderr)
    sys.exit(1)
