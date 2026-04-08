# Análise: Recuperação de Dados de Exclusão (2026-04-08)

## Situação Confirmada

**Dados perdidos:** SIM ❌  
**Possibilidade de recuperação:** DEPENDE DE BACKUP EXTERNO

---

## Buscas Realizadas

### 1. ✅ Arquivo JSON Local
- **Status:** Vazio `[]`
- **Backup mais recente:** 2 registros apenas (15:44 e 15:48 hoje)
- **Conclusão:** Dados não recuperáveis localmente

### 2. ✅ Git History
- **Status:** Arquivo não versionado (dados runtime)
- **Conclusão:** Git não tem histórico

### 3. ✅ Banco de Dados Local
- **Status:** Nenhuma tabela de exclusões
- **Tabelas:** academic_calendar_state, attendance, pool_logs, student, etc.
- **Conclusão:** Dados nunca foram persistidos em DB localmente

---

## Opções de Recuperação

### Opção 1: Render (Servidor de Produção) 🟡
**Se Bela Vista (produção) tem backup automático:**
- Render pode ter daily snapshots do filesystem
- Precisa acessar painel de Render → Backups
- Se disponível, pode ter cópia de `excludedStudents.json` de ontem ou hoje de manhã

**Ação:** Contactar Render Support para recovery

---

### Opção 2: Restauração Manual ✅
**Se você tem registro dos 25-29 alunos que devem estar excluídos:**

Criei script em `backend/restore_exclusions_manual.py`:

```python
from restore_exclusions_manual import restore_exclusions

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
```

**Tempo:** ~5 minutos para montar a lista  
**Risco:** Baixo (cria backup antes de restaurar)

---

### Opção 3: Auditar Relatórios Anteriores 📋
**Se você imprimiu/consultou relatórios com a lista de exclusões:**
- Relatórios em PDF/Excel de dias anteriores
- Consultar histórico de email/mensagens
- Listar manualmente baseado em memória operacional

**Tempo:** ~30 minutos

---

## Recomendação

**Melhor caminho:**
1. ✅ Verificar se Render tem backup (5 min)
2. ⏳ Se sim → Restaurar de lá
3. 🔄 Se não → Usar Opção 2 (restauração manual)

**Qual é sua preferência?**

---

## Prevenção Futura

### Implementações Necessárias:
- [ ] Adicionar tabela `exclusions` no PostgreSQL para persistência DB
- [ ] Implementar backup automático de `excludedStudents.json` (daily)
- [ ] Adicionar auditing/logs de mudanças em exclusões
- [ ] Webhook de notificação se arquivo de exclusões é zerado

