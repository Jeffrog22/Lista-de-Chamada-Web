import sqlite3
from pathlib import Path
DB=Path(__file__).resolve().parent.parent / 'dev.db'
conn=sqlite3.connect(str(DB))
cur=conn.cursor()

cur.execute('SELECT COUNT(*) FROM import_students')
print('import_students_total:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM import_students s JOIN import_classes c ON s.class_id=c.id WHERE (c.turma_label NOT IN ('Terça e Quinta','Quarta e Sexta') OR c.turma_label IS NULL OR c.turma_label='')")
print('students_with_noncanonical_class:', cur.fetchone()[0])

cur.execute("SELECT DISTINCT c.id, c.codigo, c.turma_label, c.horario FROM import_classes c WHERE (c.turma_label NOT IN ('Terça e Quinta','Quarta e Sexta') OR c.turma_label IS NULL OR c.turma_label='') LIMIT 50")
rows = cur.fetchall()
print('noncanonical_classes_sample_count:', len(rows))
for r in rows:
    print(r)

conn.close()
