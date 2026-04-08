#!/usr/bin/env python3
"""
Script de recuperação manual: Restaurar alunos para lista de exclusão.
Use este script se você tiver uma lista dos alunos que devem estar excluídos.
"""

import json
import os
from datetime import datetime
from pathlib import Path

def restore_exclusions(exclusion_list):
    """
    Restaurar alunos para a lista de exclusão.
    
    Args:
        exclusion_list: Lista de dicts com os alunos excluídos
                       Formato esperado:
                       [
                           {
                               "nome": "Nome do Aluno",
                               "turma": "Turma",
                               "turmaLabel": "Turma Rótulo",
                               "horario": "HH:MM",
                               "professor": "Professor",
                               "dataExclusao": "DD/MM/YYYY",
                               "motivo_exclusao": "Motivo"
                           },
                           ...
                       ]
    """
    
    data_dir = Path(__file__).parent.parent / "data"
    excluded_file = data_dir / "excludedStudents.json"
    backup_dir = data_dir / "archive"
    
    # Criar backup da versão atual (vazia)
    if excluded_file.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = backup_dir / f"excludedStudents_before_recovery_{timestamp}.json"
        backup_dir.mkdir(exist_ok=True)
        
        with open(excluded_file, "r", encoding="utf-8") as f:
            current_data = json.load(f)
        
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(current_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Backup da versão atual criado: {backup_path}")
    
    # Validar dados de entrada
    if not isinstance(exclusion_list, list):
        print("❌ Erro: exclusion_list deve ser uma lista")
        return False
    
    # Adicionar IDs e UIDs se não existirem
    for idx, item in enumerate(exclusion_list):
        if "id" not in item or not item["id"]:
            item["id"] = f"excl-{idx + 1}"
        if "student_uid" not in item or not item["student_uid"]:
            item["student_uid"] = f"uid-{idx + 1}"
    
    # Salvar novo arquivo
    try:
        with open(excluded_file, "w", encoding="utf-8") as f:
            json.dump(exclusion_list, f, indent=2, ensure_ascii=False)
        
        print(f"✅ {len(exclusion_list)} alunos restaurados para exclusão")
        print(f"✅ Arquivo salvo: {excluded_file}")
        return True
    
    except Exception as e:
        print(f"❌ Erro ao salvar: {e}")
        return False


if __name__ == "__main__":
    print("=" * 70)
    print("SCRIPT DE RECOVERY: Restaurar alunos para lista de exclusão")
    print("=" * 70)
    print()
    print("INSTRUÇÃO DE USO:")
    print("1. Prepare uma lista de alunos em JSON (arquivo ou manualmente)")
    print("2. Chame a função restore_exclusions(lista)")
    print()
    print("EXEMPLO:")
    print("""
from check_exclusions_db import restore_exclusions

alunos_excluidos = [
    {
        "nome": "João Santos",
        "turma": "Turma B",
        "turmaLabel": "Turma B",
        "horario": "19:00",
        "professor": "Prof. Silva",
        "dataExclusao": "08/04/2026",
        "motivo_exclusao": "Desistência"
    },
    {
        "nome": "Maria Oliveira",
        "turma": "Turma A",
        "turmaLabel": "Turma A",
        "horario": "18:30",
        "professor": "Prof. Silva",
        "dataExclusao": "08/04/2026",
        "motivo_exclusao": "Falta"
    },
    # ... adicione os outros 23-27 alunos
]

restore_exclusions(alunos_excluidos)
    """)
