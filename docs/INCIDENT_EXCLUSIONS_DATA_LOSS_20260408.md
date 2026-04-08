# Análise Pós-Incidente: Perda de Dados de Exclusão (2026-04-08)

## Resumo Executivo
**Data:** 08 de Abril de 2026  
**Hora:** ~09:15  
**Severidade:** 🔴 CRÍTICA (perda de dados)  
**Status:** RESOLVIDO (bug corrigido, dados perdidos)  
**Causa:** Validação excessiva em função de limpeza de dados  
**Impacto:** ~N alunos excluídos reativados na chamada  

---

## Linha do Tempo

| Hora | Evento | Status |
|------|--------|--------|
| ~09:15 | Usuário restaura aluna "Bianca Almeida..." | 🔴 Incidente |
| 09:15 | Todos os alunos excluídos desaparecem | Descoberta |
| 09:18 | Root cause identificada em `_clean_exclusions_list()` | Análise |
| 09:20 | Correção implementada (remover validação nos endpoints) | Fix |
| 09:22 | Teste de regressão adicionado | Prevenção |
| 09:25 | Commit publicado em produção (aa63de8) | Deploy |
| 09:27 | Confirmação: dados NÃO recuperáveis | Aceitação |
| 09:28 | Bug corrigido, futuras operações seguras | Encerramento |

---

## Root Cause Analysis

### Código Problemático (linha 3126 do main.py - ANTES)
```python
@app.post("/exclusions/restore")
def restore_exclusion(entry: ExclusionEntry):
    file_path = os.path.join(DATA_DIR, "excludedStudents.json")
    with EXCLUSIONS_FILE_LOCK:
        # ❌ BUG: _clean_exclusions_list filtra registros "inválidos"
        items = _clean_exclusions_list(_load_json_list(file_path))
        
        # ... resto do código ...
        _save_json_list(file_path, remaining)
```

### Função Culpada: `_clean_exclusions_list()` (linhas 2050-2072)
```python
def _clean_exclusions_list(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for raw in items or []:
        if not isinstance(raw, dict):
            continue

        item = _normalize_exclusion_item(raw)
        uid = str(item.get("student_uid") or item.get("studentUid") or "").strip()
        item_id = str(item.get("id") or "").strip()
        nome = _normalize_text(item.get("nome") or item.get("Nome") or "")
        
        # ❌ PROBLEMA: Se nenhum desses 3 campos está preenchido, item é REMOVIDO
        if not uid and not item_id and not nome:
            continue
        
        # ... resto do código ...
```

### Por Que Isto Matou os Dados?

1. **Pré-condição:** Arquivo `excludedStudents.json` tinha N alunos excluídos
2. **Ação:** Usuário restaura 1 aluno via `POST /exclusions/restore`
3. **Execução:**
   - Carrega lista de exclusões ✓
   - Chama `_clean_exclusions_list()` ← **AQUI O PROBLEMA**
   - Função valida cada registro
   - Se `uid`, `id` ou `nome` normalizado estão vazios → registro descartado
   - Se TODOS os N registros falham a validação → lista fica `[]`
   - Salva arquivo vazio de volta → **PERDA PERMANENTE**

4. **Resultado:** Arquivo `excludedStudents.json = []`

### Por Que `_clean_exclusions_list()` Existe?
Originalmente foi criada para:
- Remover duplicatas de exclusões
- Validar integridade de dados

**Mas:** Não deveria ser usada em contextos de restauração/deleção onde queremos preservar dados existentes.

---

## Correções Implementadas

### 1. Correção Imediata (commits aa63de8 e 9900412)

**Arquivo:** `backend/app/main.py`

**Mudança 1:** `/exclusions/restore` (linha 3122)
```python
# ❌ ANTES:
items = _clean_exclusions_list(_load_json_list(file_path))

# ✅ DEPOIS:
items = _load_json_list(file_path)  # SEM limpeza
```

**Mudança 2:** `/exclusions/delete` (linha 3140)
```python
# ❌ ANTES:
items = _clean_exclusions_list(_load_json_list(file_path))

# ✅ DEPOIS:
items = _load_json_list(file_path)  # SEM limpeza
```

### 2. Teste de Regressão (novo arquivo)

**Arquivo:** `backend/tests/test_exclusions_restore_bug.py`

Cobre dois cenários:
1. ✅ `test_restore_exclusion_preserves_other_excluded_students` - Restaurar um aluno preserva os outros
2. ✅ `test_delete_exclusion_preserves_other_excluded_students` - Deletar um aluno preserva os outros

**Resultado:**
```
======================== 2 passed, 4 warnings ========================
```

---

## Impacto da Perda de Dados

### O Que Foi Perdido
- ❌ Registro de **todos** os alunos que estavam excluídos antes de 08/04/2026 ~09:15
- ❌ Motivos de exclusão documentados
- ❌ Datas de exclusão

### Alunos Afetados
- Todos os alunos com status `excluído` → agora aparecem como `ativo` na chamada
- Nenhum aluno foi de fato deletado do banco de dados
- Apenas a lista de exclusões (`excludedStudents.json`) foi zerada

### Impacto Operacional
- 🔴 **Critico:** Alunos que deveriam estar fora da chamada agora aparecem
- ⚠️ Necessário auditar quais alunos devem ser re-excluídos manualmente
- ⚠️ Relatórios de exclusão para este período estarão incompletos

---

## Prevenção Futura

### 1. Testes Adicionados
✅ Teste de regressão garante que este bug nunca se repita

### 2. Mudanças de Código
✅ `_clean_exclusions_list()` não é mais usada em contextos de restauração/deleção  
✅ Função ainda é usada em `GET /exclusions` e `POST /exclusions` (contextos seguros)

### 3. Recomendações
- [ ] Revisar outros endpoints que usam `_clean_exclusions_list()` para risco similar
- [ ] Considerar backup automático de `excludedStudents.json` antes de cada modificação
- [ ] Implementar soft-delete para registros de exclusão (histórico auditável)
- [ ] Adicionar logs de modificação com timestamp e usuário

---

## Checklist de Resolução

- [x] Bug identificado e root cause confirmada
- [x] Correção implementada
- [x] Testes de regressão adicionados e passando
- [x] Commit publicado em produção
- [x] Deploy automático acionado
- [x] Dados de perda confirmados como irreversíveis
- [x] Documentação pós-incidente criada
- [ ] Auditoria de 2ª camada / validação independente (PENDENTE)
- [ ] Re-exclusão manual de alunos que deveriam estar fora (PENDENTE AÇÃO OPERACIONAL)
- [ ] Implementação de backup automático (FUTURO)

---

## Conclusão

**Status:** 🟢 **RESOLVIDO**

O bug critério foi causado por validação excessiva em uma função de limpeza de dados. A correção foi imediata (remover a validação em contextos de restauração/deleção) e um teste de regressão foi adicionado para evitar repetição.

**Porém:** Os dados de exclusão foram **IRREVOGAVELMENTE PERDIDOS**. Conhecendo a história dessa aplicação, recomenda-se:
1. Auditoria manual de quais alunos devem estar excluídos
2. Re-exclusão manual desses alunos
3. Implementação imediata de backups automáticos para dados críticos

---

**Reportado por:** Jefferson de Melo  
**Data de Resolução:** 2026-04-08  
**Versão de Fix:** v.003.00-02zx  
