#!/usr/bin/env python3
import sqlite3
from pathlib import Path
import unicodedata
from typing import Any, Dict, Optional

DB = Path(__file__).resolve().parent.parent / "dev.db"


def normalize_name(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", value)
    cleaned = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return cleaned.strip().lower()


def canonicalize_label(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    raw = str(val).strip()
    if raw == "":
        return None
    lowered = raw.lower()
    has_terca = "terc" in lowered or "terça" in raw or "terca" in raw
    has_quinta = "quint" in lowered or "quinta" in raw
    has_quarta = "quart" in lowered or "quarta" in raw
    has_sexta = "sext" in lowered or "sexta" in raw
    if has_terca and has_quinta:
        return "Terça e Quinta"
    if has_quarta and has_sexta:
        return "Quarta e Sexta"
    for allowed in ("Terça e Quinta", "Quarta e Sexta"):
        if allowed.lower() == raw.lower():
            return allowed
    return None


def format_horario(raw: Optional[str]) -> str:
    if not raw:
        return ""
    value = str(raw).strip()
    if value == "":
        return ""
    if ":" in value:
        parts = value.split(":")
        if len(parts) >= 2:
            hh = parts[0].zfill(2)[:2]
            mm = parts[1].zfill(2)[:2]
            return f"{hh}:{mm}"
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) == 3:
        digits = "0" + digits
    if len(digits) >= 4:
        return f"{digits[:2]}:{digits[2:4]}"
    return value


def build_class_map(cur: sqlite3.Cursor) -> Dict[int, Dict[str, Any]]:
    cur.execute(
        "SELECT id, codigo, turma_label, horario, professor FROM import_classes"
    )
    mapping: Dict[int, Dict[str, Any]] = {}
    for cid, codigo, turma_label, horario, professor in cur.fetchall():
        canonical = canonicalize_label(turma_label or codigo)
        horario_norm = format_horario(horario or "")
        mapping[cid] = {
            "codigo": codigo,
            "turma_label_raw": turma_label,
            "turma_label_canonical": canonical,
            "horario_norm": horario_norm,
            "professor": professor or "",
        }
    return mapping


def main() -> None:
    conn = sqlite3.connect(str(DB))
    cur = conn.cursor()
    class_map = build_class_map(cur)

    cur.execute(
        "SELECT id, class_id, nome, whatsapp, data_nascimento, data_atestado, genero, parq, atestado FROM import_students"
    )
    rows = cur.fetchall()

    cur.execute("SELECT id, nome, turma, horario, professor FROM student")
    prows = cur.fetchall()
    persistent: Dict[str, tuple] = {
        normalize_name(row[1]): row for row in prows
    }

    created = 0
    updated = 0
    for _, class_id, nome, whatsapp, _, _, genero, _, _ in rows:
        normalized_key = normalize_name(nome)
        mapping = class_map.get(class_id)
        turma_canonical = mapping.get("turma_label_canonical") if mapping else None
        horario_norm = mapping.get("horario_norm") if mapping else ""
        professor = mapping.get("professor") if mapping else None

        existing = persistent.get(normalized_key)
        if existing:
            sid, _, sturma, shorario, sprof = existing
            dirty = False
            if turma_canonical and (
                not sturma or sturma.strip().lower() != turma_canonical.strip().lower()
            ):
                cur.execute(
                    "UPDATE student SET turma = ? WHERE id = ?",
                    (turma_canonical, sid),
                )
                dirty = True
            if horario_norm and (
                not shorario or format_horario(shorario) != horario_norm
            ):
                cur.execute(
                    "UPDATE student SET horario = ? WHERE id = ?",
                    (horario_norm, sid),
                )
                dirty = True
            if professor and (
                not sprof or sprof.strip().lower() != (professor or "").strip().lower()
            ):
                cur.execute(
                    "UPDATE student SET professor = ? WHERE id = ?",
                    (professor, sid),
                )
                dirty = True
            if dirty:
                updated += 1
        else:
            cur.execute(
                "INSERT INTO student (nome, aniversario, whatsapp, email, observacoes, genero, nivel, turma, horario, professor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                (
                    nome,
                    None,
                    whatsapp or None,
                    None,
                    None,
                    genero or None,
                    None,
                    turma_canonical or None,
                    horario_norm or None,
                    professor or None,
                ),
            )
            created += 1
            persistent[normalized_key] = (
                cur.lastrowid,
                nome,
                turma_canonical or "",
                horario_norm or "",
                professor or "",
            )

    conn.commit()
    print("created persistent students:", created)
    print("updated persistent students:", updated)
    conn.close()


if __name__ == "__main__":
    main()
