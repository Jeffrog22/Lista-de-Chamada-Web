import os
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), "..", "dev.db")
conn = sqlite3.connect(os.path.abspath(db_path))
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE import_classes ADD COLUMN faixa_etaria TEXT DEFAULT ''")
    conn.commit()
    print("Coluna faixa_etaria adicionada.")
except Exception as exc:
    print("Aviso:", exc)
finally:
    conn.close()
