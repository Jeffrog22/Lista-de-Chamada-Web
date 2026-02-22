#!/usr/bin/env python3
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / 'dev.db'
conn = sqlite3.connect(str(DB))
cur = conn.cursor()

def _normalize_horario_digits(value: str) -> str:
    raw = str(value or "").strip()
    digits = ''.join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 3:
        digits = "0" + digits
    digits = digits[:4]
    return digits.zfill(4)

def canonicalize_label(val):
    if not val:
        return None
    raw = str(val or '').strip()
    if raw == '':
        return None
    s = raw.lower()
    has_terca = 'terc' in s or 'terça' in raw or 'terca' in raw
    has_quinta = 'quint' in s or 'quinta' in raw
    has_quarta = 'quart' in s or 'quarta' in raw
    has_sexta = 'sext' in s or 'sexta' in raw
    if has_terca and has_quinta:
        return 'Terça e Quinta'
    if has_quarta and has_sexta:
        return 'Quarta e Sexta'
    for allowed in ('Terça e Quinta', 'Quarta e Sexta'):
        if allowed.lower() == raw.lower():
            return allowed
    return None

# gather import_classes
cur.execute("SELECT id, codigo, turma_label, horario, professor, nivel, capacidade FROM import_classes ORDER BY codigo, horario")
rows = cur.fetchall()
created = 0
updated = 0
for id_, codigo, turma_label, horario, professor, nivel, capacidade in rows:
    can = canonicalize_label(turma_label or codigo)
    if not can:
        continue
    nh = _normalize_horario_digits(horario or '')
    if not nh:
        continue
    cur.execute("SELECT id, nome, horario, instrutor FROM classmodel WHERE nome = ? AND horario = ?", (can, nh))
    found = cur.fetchone()
    if found:
        cid, nome, ch, instr = found
        # update instrutor if missing
        if (not instr or instr.strip()=='') and (professor and professor.strip()):
            cur.execute("UPDATE classmodel SET instrutor = ?, nivel = ?, capacidade_maxima = ? WHERE id = ?", (professor, nivel or None, capacidade or None, cid))
            updated += 1
        continue
    # insert missing classmodel
    cur.execute("INSERT INTO classmodel (nome, horario, local, instrutor, nivel, capacidade_maxima) VALUES (?, ?, ?, ?, ?, ?)", (can, nh, None, professor or None, nivel or None, capacidade or None))
    created += 1

# canonicalizar qualquer horario existente e remover duplicatas remanescentes
cur.execute("SELECT id, nome, horario FROM classmodel ORDER BY id")
seen = {}
to_delete = []
for cid, nome, horario in cur.fetchall():
    normalized = _normalize_horario_digits(horario or '')
    if not nome or not normalized:
        continue
    key = (nome.strip().lower(), normalized)
    if key in seen:
        to_delete.append(cid)
    else:
        seen[key] = cid
    if horario != normalized:
        cur.execute("UPDATE classmodel SET horario = ? WHERE id = ?", (normalized, cid))
for cid in to_delete:
    cur.execute("DELETE FROM classmodel WHERE id = ?", (cid,))

conn.commit()
print('created classmodel rows:', created)
print('updated classmodel rows:', updated)
print('normalized classmodel duplicates removed:', len(to_delete))
conn.close()
