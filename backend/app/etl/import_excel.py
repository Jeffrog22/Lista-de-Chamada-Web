# ETL import (limpeza + heurística de mapeamento)
from typing import Dict, Optional, Any
import pandas as pd
from sqlmodel import Session, select
from app.models import Student, ClassModel, Attendance, Category
from datetime import datetime
import os

def _clean_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = list(df.columns)
    cols_to_drop = [c for c in cols if (str(c).strip() == "" or str(c).lower().startswith("unnamed"))]
    df = df.drop(columns=cols_to_drop, errors="ignore")
    seen = set()
    keep_cols = []
    for c in df.columns:
        key = str(c).strip()
        if key.lower() in seen:
            continue
        seen.add(key.lower())
        keep_cols.append(c)
    df = df.loc[:, keep_cols]
    non_empty = [c for c in df.columns if not df[c].isna().all() and not (df[c].astype(str).str.strip() == "").all()]
    df = df.loc[:, non_empty]
    df.columns = [str(c).strip() for c in df.columns]
    return df

def _normalize_col_map(cols):
    return {c.strip().lower(): c for c in cols}

def _match_column(mapping, candidates):
    for cand in candidates:
        key = cand.strip().lower()
        if key in mapping:
            return mapping[key]
    return None

def _col_candidates_for_sheet(sheet):
    if sheet.lower() == "alunos":
        return {
            "nome": ['nome', 'aluno', 'nome completo', 'nome_aluno'],
            "aniversario": ['aniversario', 'aniversário', 'data de nascimento', 'nascimento', 'data_nascimento', 'dt_nasc', 'data'],
            "whatsapp": ['whatsapp', 'celular', 'cel', 'telefone', 'tel', 'fone', 'contato'],
            "observacoes": ['observacoes', 'observações', 'obs', 'comentarios', 'comentário'],
            "genero": ['genero', 'gênero', 'sexo'],
            "nivel": ['nivel', 'nível', 'faixa'],
            "turma": ['turma', 'class', 'classe'],
            "horario": ['horario', 'horário', 'hora'],
            "professor": ['professor', 'prof', 'instrutor', 'monitor']
        }
    if sheet.lower() == "turmas":
        return {
            "nome": ['nome', 'turma', 'class', 'nome_turma'],
            "horario": ['horario', 'horário', 'hora'],
            "local": ['local', 'sala', 'endereco'],
            "instrutor": ['instrutor', 'professor', 'monitor'],
            "nivel": ['nivel', 'nível']
        }
    if sheet.lower() == "categorias":
        return {
            "nome": ['categoria', 'nome'],
            "idade_min": ['idade minima', 'idade mínima', 'idade_min', 'idade_minima'],
            "idade_max": ['idade maxima', 'idade máxima', 'idade_max', 'idade_maxima']
        }
    if sheet.lower() == "chamada":
        return {
            "student_id": ['student_id', 'id_aluno', 'aluno_id', 'id'],
            "student_name": ['nome', 'aluno', 'student', 'nome_aluno'],
            "class_id": ['class_id', 'id_turma', 'turma_id'],
            "class_name": ['turma', 'nome_turma', 'class', 'nome da turma'],
            "date": ['data', 'date'],
            "status": ['status', 'presenca', 'presença', 'presente'],
            "notas": ['notas', 'observacoes', 'observações', 'obs']
        }
    return {}

def _safe_date(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        dt = pd.to_datetime(val, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.date()
    except Exception:
        return None

def calcular_idade(data_nascimento):
    if data_nascimento is None:
        return None
    try:
        if isinstance(data_nascimento, str):
            data_nascimento = pd.to_datetime(data_nascimento, errors="coerce")
        if pd.isna(data_nascimento):
            return None
        hoje = datetime.now()
        idade = hoje.year - data_nascimento.year - ((hoje.month, hoje.day) < (data_nascimento.month, data_nascimento.day))
        return idade
    except Exception:
        return None

def import_from_excel(path: str, session: Session, out_cleaned: Optional[str] = None) -> Dict[str, Any]:
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    xls = pd.ExcelFile(path)
    counts = {"students": 0, "classes": 0, "attendance": 0, "categories": 0}
    mapping_report = {}
    cleaned_sheets = {}
    for sheet in xls.sheet_names:
        try:
            df = pd.read_excel(xls, sheet_name=sheet)
        except Exception:
            continue
        df = _clean_dataframe_columns(df)
        cleaned_sheets[sheet] = df.copy()
        col_map = _normalize_col_map(df.columns)
        sheet_key = sheet.strip()
        mapping_report[sheet_key] = {"columns": list(df.columns)}
        candidates = _col_candidates_for_sheet(sheet)
        if sheet_key.lower() == "alunos":
            for _, row in df.fillna("").iterrows():
                nome_col = _match_column(col_map, candidates["nome"])
                aniversario_col = _match_column(col_map, candidates["aniversario"])
                whatsapp_col = _match_column(col_map, candidates["whatsapp"])
                email_col = _match_column(col_map, candidates["email"])
                obs_col = _match_column(col_map, candidates["observacoes"])
                genero_col = _match_column(col_map, candidates["genero"])
                nivel_col = _match_column(col_map, candidates["nivel"])
                turma_col = _match_column(col_map, candidates["turma"])
                horario_col = _match_column(col_map, candidates["horario"])
                prof_col = _match_column(col_map, candidates["professor"])

                nome = row.get(nome_col) if nome_col else ""
                data_aniversario = _safe_date(row.get(aniversario_col)) if aniversario_col else None
                whatsapp = row.get(whatsapp_col) if whatsapp_col else None
                email = row.get(email_col) if email_col else None
                observacoes = row.get(obs_col) if obs_col else None
                genero = row.get(genero_col) if genero_col else None
                nivel = row.get(nivel_col) if nivel_col else None
                turma_nome = row.get(turma_col) if turma_col else None
                horario = row.get(horario_col) if horario_col else None
                professor = row.get(prof_col) if prof_col else None

                statement = select(Student).where(Student.nome == str(nome).strip())
                existing = session.exec(statement).first()
                if not existing:
                    aluno = Student(
                        nome=str(nome).strip(),
                        aniversario=data_aniversario,
                        whatsapp=str(whatsapp).strip() if whatsapp not in (None, "") else None,
                        email=str(email).strip() if email not in (None, "") else None,
                        observacoes=str(observacoes).strip() if observacoes not in (None, "") else None,
                        genero=str(genero).strip() if genero not in (None, "") else None,
                        nivel=str(nivel).strip() if nivel not in (None, "") else None,
                        turma=str(turma_nome).strip() if turma_nome not in (None, "") else None,
                        horario=str(horario).strip() if horario not in (None, "") else None,
                        professor=str(professor).strip() if professor not in (None, "") else None
                    )
                    session.add(aluno)
                    counts['students'] += 1
            session.commit()

        elif sheet_key.lower() == "turmas":
            for _, row in df.fillna("").iterrows():
                nome_col = _match_column(col_map, candidates["nome"])
                horario_col = _match_column(col_map, candidates["horario"])
                local_col = _match_column(col_map, candidates["local"])
                instrutor_col = _match_column(col_map, candidates["instrutor"])
                nivel_col = _match_column(col_map, candidates["nivel"])
                nome = row.get(nome_col) if nome_col else ""
                horario = row.get(horario_col) if horario_col else None
                local = row.get(local_col) if local_col else None
                instrutor = row.get(instrutor_col) if instrutor_col else None
                nivel = row.get(nivel_col) if nivel_col else None
                statement = select(ClassModel).where(ClassModel.nome == str(nome).strip())
                existing = session.exec(statement).first()
                if not existing:
                    turma = ClassModel(
                        nome=str(nome).strip(),
                        horario=str(horario).strip() if horario not in (None, "") else None,
                        local=str(local).strip() if local not in (None, "") else None,
                        instrutor=str(instrutor).strip() if instrutor not in (None, "") else None,
                        nivel=str(nivel).strip() if nivel not in (None, "") else None
                    )
                    session.add(turma)
                    counts['classes'] += 1
            session.commit()

        elif sheet_key.lower() == "categorias":
            for _, row in df.fillna("").iterrows():
                nome_col = _match_column(col_map, candidates["nome"])
                imin_col = _match_column(col_map, candidates["idade_min"])
                imax_col = _match_column(col_map, candidates["idade_max"])
                nome = row.get(nome_col) if nome_col else ""
                imin = row.get(imin_col) if imin_col else None
                imax = row.get(imax_col) if imax_col else None
                statement = select(Category).where(Category.nome == str(nome).strip())
                existing = session.exec(statement).first()
                if not existing:
                    cat = Category(
                        nome=str(nome).strip(),
                        idade_min=int(imin) if pd.notna(imin) and imin != "" else None,
                        idade_max=int(imax) if pd.notna(imax) and imax != "" else None
                    )
                    session.add(cat)
                    counts['categories'] += 1
            session.commit()

        elif sheet_key.lower() == "chamada":
            for _, row in df.fillna("").iterrows():
                student_id_col = _match_column(col_map, candidates["student_id"])
                student_name_col = _match_column(col_map, candidates["student_name"])
                class_id_col = _match_column(col_map, candidates["class_id"])
                class_name_col = _match_column(col_map, candidates["class_name"])
                date_col = _match_column(col_map, candidates["date"])
                status_col = _match_column(col_map, candidates["status"])
                notas_col = _match_column(col_map, candidates["notas"])
                s_id = None
                s_name = None
                if student_id_col and row.get(student_id_col) not in (None, ""):
                    try:
                        s_id = int(row.get(student_id_col))
                        statement = select(Student).where(Student.id == s_id)
                        if not session.exec(statement).first():
                            s_id = None
                    except Exception:
                        s_id = None
                if not s_id and student_name_col and row.get(student_name_col):
                    s_name = str(row.get(student_name_col)).strip()
                    statement = select(Student).where(Student.nome == s_name)
                    found = session.exec(statement).first()
                    if found:
                        s_id = found.id
                if not s_id and s_name:
                    aluno = Student(nome=s_name)
                    session.add(aluno)
                    session.commit()
                    session.refresh(aluno)
                    s_id = aluno.id

                c_id = None
                c_name = None
                if class_id_col and row.get(class_id_col) not in (None, ""):
                    try:
                        c_id = int(row.get(class_id_col))
                        statement = select(ClassModel).where(ClassModel.id == c_id)
                        if not session.exec(statement).first():
                            c_id = None
                    except Exception:
                        c_id = None
                if not c_id and class_name_col and row.get(class_name_col):
                    c_name = str(row.get(class_name_col)).strip()
                    statement = select(ClassModel).where(ClassModel.nome == c_name)
                    found = session.exec(statement).first()
                    if found:
                        c_id = found.id
                if not c_id and c_name:
                    turma = ClassModel(nome=c_name)
                    session.add(turma)
                    session.commit()
                    session.refresh(turma)
                    c_id = turma.id

                data_val = _safe_date(row.get(date_col)) if date_col else None
                status = row.get(status_col) if status_col else None
                notas = row.get(notas_col) if notas_col else None

                attendance = Attendance(
                    student_id=int(s_id) if s_id is not None else None,
                    class_id=int(c_id) if c_id is not None else None,
                    student_name=s_name if s_name else None,
                    class_name=c_name if c_name else None,
                    data=data_val,
                    status=str(status).strip() if status not in (None, "") else None,
                    notas=str(notas).strip() if notas not in (None, "") else None
                )
                session.add(attendance)
                counts['attendance'] += 1
            session.commit()

    out_cleaned_path = None
    if out_cleaned:
        out_dir = os.path.dirname(out_cleaned) or os.getcwd()
        os.makedirs(out_dir, exist_ok=True)
        with pd.ExcelWriter(out_cleaned, engine="openpyxl") as writer:
            for sheet_name, dfc in cleaned_sheets.items():
                dfc.to_excel(writer, sheet_name=sheet_name, index=False)
        out_cleaned_path = out_cleaned

    return {
        "counts": counts,
        "mapping": {k: {"columns": v.columns.tolist()} for k, v in cleaned_sheets.items()},
        "cleaned_path": out_cleaned_path
    }
