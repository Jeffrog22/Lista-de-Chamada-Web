import os
import sys
from sqlmodel import Session, select
import re

# ensure backend package is on path
script_dir = os.path.dirname(__file__)
backend_dir = os.path.abspath(os.path.join(script_dir, '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import database
from app import models

pattern = re.compile(r"(?i)\b(demo|default|teste|sample|exemplo)\b")

print('Opening DB...')
with Session(database.engine) as sess:
    # show counts
    import_units = sess.exec(select(models.ImportUnit)).all()
    import_classes = sess.exec(select(models.ImportClass)).all()
    import_students = sess.exec(select(models.ImportStudent)).all()
    classes = sess.exec(select(models.ClassModel)).all()
    students = sess.exec(select(models.Student)).all()

    print(f'import units: {len(import_units)}')
    print(f'import classes: {len(import_classes)}')
    print(f'import students: {len(import_students)}')
    print(f'classes (persistent): {len(classes)}')
    print(f'students (persistent): {len(students)}')

    # Clear import_* tables entirely (safe – these are transient)
    if import_units or import_classes or import_students:
        print('Deleting all rows from import_* tables...')
        for u in import_units:
            sess.delete(u)
        for c in import_classes:
            sess.delete(c)
        for s in import_students:
            sess.delete(s)
        sess.commit()
        print('import_* tables cleared')
    else:
        print('No rows in import_* tables')

    # Find and delete candidate demo/default rows in persistent tables
    del_class_ids = []
    for c in sess.exec(select(models.ClassModel)).all():
        if c.nome and pattern.search(c.nome):
            del_class_ids.append(c.id)
        elif c.instrutor and pattern.search(str(c.instrutor)):
            del_class_ids.append(c.id)
        elif c.horario and pattern.search(str(c.horario)):
            del_class_ids.append(c.id)
    if del_class_ids:
        print(f'Deleting {len(del_class_ids)} candidate class rows (demo/default/test)...')
        for cid in del_class_ids:
            obj = sess.get(models.ClassModel, cid)
            if obj:
                sess.delete(obj)
        sess.commit()
    else:
        print('No candidate demo/default classes found')

    del_student_ids = []
    for s in sess.exec(select(models.Student)).all():
        if s.nome and pattern.search(s.nome):
            del_student_ids.append(s.id)
        elif s.turma and pattern.search(str(s.turma)):
            del_student_ids.append(s.id)
        elif s.whatsapp and pattern.search(str(s.whatsapp)):
            del_student_ids.append(s.id)
    if del_student_ids:
        print(f'Deleting {len(del_student_ids)} candidate student rows (demo/default/test)...')
        for sid in del_student_ids:
            obj = sess.get(models.Student, sid)
            if obj:
                sess.delete(obj)
        sess.commit()
    else:
        print('No candidate demo/default students found')

    # Final counts
    classes2 = sess.exec(select(models.ClassModel)).all()
    students2 = sess.exec(select(models.Student)).all()
    print(f'Final classes (persistent): {len(classes2)}')
    print(f'Final students (persistent): {len(students2)}')

print('Done')
