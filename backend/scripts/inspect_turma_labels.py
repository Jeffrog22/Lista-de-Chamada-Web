import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parent / "../dev.db"
db = db.resolve()
print("DB:", db)
conn = sqlite3.connect(str(db))
cur = conn.cursor()
print('\nclassmodel (distinct nome, horario):')
try:
    for row in cur.execute('SELECT DISTINCT nome, horario FROM classmodel'):
        print(row)
except Exception as e:
    print('classmodel error', e)

print('\nimport_classes (distinct turma_label):')
try:
    for row in cur.execute('SELECT DISTINCT turma_label FROM import_classes'):
        print(row)
except Exception as e:
    print('import_classes error', e)

conn.close()
