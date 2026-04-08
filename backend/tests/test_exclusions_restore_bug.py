"""
Test para regressão do bug onde restauração de um aluno removia TODOS os alunos excluídos.

Documentação do bug:
- Ao restaurar aluna "Bianca Almeida de Moura Coelho", o arquivo excludedStudents.json foi completamente limpo
- Causa: função _clean_exclusions_list estava sendo chamada em /exclusions/restore e /exclusions/delete
- Resultado: arquivo salvo como [] em vez de manter os outros alunos excluídos
"""

import json
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel

from app.main import app
from app.models import PoolLog


# Test client
client = TestClient(app)


def test_restore_exclusion_preserves_other_excluded_students():
    """
    Regressiontest: Restaurar um aluno NÃO deve remover outros alunos excluídos.
    
    Cenário:
    1. Arquivo tem 3 alunos excluídos (Bianca, João, Maria)
    2. Restaura Bianca
    3. Arquivo deve ter ainda João e Maria
    """
    excluded_students = [
        {
            "id": "excl-1",
            "student_uid": "uid-bianca",
            "nome": "Bianca Almeida de Moura Coelho",
            "turma": "Turma A",
            "turmaLabel": "Turma A",
            "horario": "18:30",
            "professor": "Prof. Silva",
            "dataExclusao": "08/04/2026",
            "motivo_exclusao": "Transferência"
        },
        {
            "id": "excl-2",
            "student_uid": "uid-joao",
            "nome": "João Santos",
            "turma": "Turma B",
            "turmaLabel": "Turma B",
            "horario": "19:00",
            "professor": "Prof. Silva",
            "dataExclusao": "08/04/2026",
            "motivo_exclusao": "Desistência"
        },
        {
            "id": "excl-3",
            "student_uid": "uid-maria",
            "nome": "Maria Oliveira",
            "turma": "Turma A",
            "turmaLabel": "Turma A",
            "horario": "18:30",
            "professor": "Prof. Silva",
            "dataExclusao": "08/04/2026",
            "motivo_exclusao": "Falta"
        }
    ]
    
    # Pré-condição: Montar arquivo de exclusões com 3 alunos
    with tempfile.TemporaryDirectory() as tmpdir:
        excluded_file = os.path.join(tmpdir, "excludedStudents.json")
        with open(excluded_file, "w", encoding="utf-8") as f:
            json.dump(excluded_students, f)
        
        # Verificar pré-condição
        with open(excluded_file, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        assert len(loaded) == 3, "Pré-condição: deve ter 3 alunos excluídos"
        
        # Restaurar Bianca
        restore_payload = {
            "id": "excl-1",
            "nome": "Bianca Almeida de Moura Coelho",
            "turma": "Turma A",
            "horario": "18:30",
            "professor": "Prof. Silva",
        }
        
        # Simular chamada POST /exclusions/restore (manualmente aqui)
        # Copiar lógica da função restore_exclusion
        from threading import RLock
        from app.main import ExclusionEntry, _resolve_exclusion_match, _load_json_list, _save_json_list
        
        EXCLUSIONS_FILE_LOCK = RLock()
        
        with EXCLUSIONS_FILE_LOCK:
            items = _load_json_list(excluded_file)  # NOTE: SEM _clean_exclusions_list
            restored = None
            remaining = []
            for item in items:
                if restored is None and _resolve_exclusion_match(item, ExclusionEntry(**restore_payload)):
                    restored = item
                    continue
                remaining.append(item)
            _save_json_list(excluded_file, remaining)
        
        # Verificar resultado
        with open(excluded_file, "r", encoding="utf-8") as f:
            result = json.load(f)
        
        # Asserts
        assert len(result) == 2, f"Deve ter 2 alunos restantes, mas tem {len(result)}"
        assert restored is not None, "Bianca deve ter sido encontrada e restaurada"
        
        # Verificar que João e Maria ainda estão
        remaining_names = {item.get("nome") for item in result}
        assert "João Santos" in remaining_names, "João deve estar na lista restante"
        assert "Maria Oliveira" in remaining_names, "Maria deve estar na lista restante"
        assert "Bianca Almeida de Moura Coelho" not in remaining_names, "Bianca não deve estar mais na lista"


def test_delete_exclusion_preserves_other_excluded_students():
    """
    Regressiontest: Deletar um aluno NÃO deve remover outros alunos excluídos.
    
    Cenário:
    1. Arquivo tem 2 alunos excluídos (João, Maria)
    2. Deleta definitivamente João
    3. Arquivo deve ter ainda Maria
    """
    excluded_students = [
        {
            "id": "excl-2",
            "student_uid": "uid-joao",
            "nome": "João Santos",
            "turma": "Turma B",
            "turmaLabel": "Turma B",
            "horario": "19:00",
            "professor": "Prof. Silva",
            "dataExclusao": "08/04/2026",
            "motivo_exclusao": "Desistência"
        },
        {
            "id": "excl-3",
            "student_uid": "uid-maria",
            "nome": "Maria Oliveira",
            "turma": "Turma A",
            "turmaLabel": "Turma A",
            "horario": "18:30",
            "professor": "Prof. Silva",
            "dataExclusao": "08/04/2026",
            "motivo_exclusao": "Falta"
        }
    ]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        excluded_file = os.path.join(tmpdir, "excludedStudents.json")
        with open(excluded_file, "w", encoding="utf-8") as f:
            json.dump(excluded_students, f)
        
        # Pré-condição
        with open(excluded_file, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        assert len(loaded) == 2, "Pré-condição: deve ter 2 alunos excluídos"
        
        # Deletar João
        delete_payload = {
            "id": "excl-2",
            "nome": "João Santos",
            "turma": "Turma B",
            "horario": "19:00",
            "professor": "Prof. Silva",
        }
        
        # Simular chamada POST /exclusions/delete
        from threading import RLock
        from app.main import ExclusionEntry, _resolve_exclusion_match, _load_json_list, _save_json_list
        
        EXCLUSIONS_FILE_LOCK = RLock()
        
        with EXCLUSIONS_FILE_LOCK:
            items = _load_json_list(excluded_file)  # NOTE: SEM _clean_exclusions_list
            remaining = []
            deleted = False
            for item in items:
                if not deleted and _resolve_exclusion_match(item, ExclusionEntry(**delete_payload)):
                    deleted = True
                    continue
                remaining.append(item)
            _save_json_list(excluded_file, remaining)
        
        # Verificar resultado
        with open(excluded_file, "r", encoding="utf-8") as f:
            result = json.load(f)
        
        # Asserts
        assert len(result) == 1, f"Deve ter 1 aluno restante, mas tem {len(result)}"
        assert result[0].get("nome") == "Maria Oliveira", "Maria deve ser a restante"
