# Guia de Teste - Persistência de Turmas

## Status da Implementação

### ✅ Completado:
1. **Frontend API Integration** (`frontend/src/api.ts`)
   - `addClass(data)` → POST `/import-classes`
   - `updateClass(class_id, data)` → PUT `/import-classes/{class_id}`

2. **Frontend Classes Component** (`frontend/src/pages/Classes.tsx`)
   - Interface `Class` atualizada com campo `id`
   - `handleSave()` made async - awaits API calls
   - `handleEditClick()` armazena ID para updates
   - Bootstrap refetch após criação de turma nova

3. **Backend Models** (`backend/app/models.py`)
   - `ImportClassCreate` - modelo para criar turma
   - `ImportClassUpdate` - modelo para atualizar turma

4. **Backend Endpoints** (`backend/app/main.py`)
   - POST `/import-classes` - cria nova turma na BD
   - PUT `/import-classes/{class_id}` - atualiza turma existente

5. **Build Status**
   - ✓ Frontend: `npm run build` passa sem erros
   - ✓ Backend: Python imports funcionam corretamente

## Como Testar

### Passo 1: Iniciar Backend
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Esperado: Server listens on `http://localhost:8000`

### Passo 2: Iniciar Frontend (Dev Server)
```bash
cd frontend  
npm run dev
```
Esperado: Frontend disponível em `http://localhost:5173`

### Passo 3: Testar Criação de Turma

1. Navegue até **Classes** no frontend
2. Clique em **+ Nova Turma**
3. Preencha os campos:
   - Turma: "A1"
   - Horário: "0900"
   - Professor: "João"
   - Dias: Selecione "Segunda"
   - Nível: "1"
   - Faixa Etária: "6-8"
   - Capacidade: "30"

4. Clique em **Salvar**
5. **Esperado**: 
   - Alert "Turma adicionada com sucesso!"
   - POST `/import-classes` no network tab com payload correto
   - Turma aparece na lista com novo ID

### Passo 4: Testar Persistência (CRITICAL)
1. **Refresh da página** (F5)
2. **Esperado**: 
   - Turma criada continua visível
   - Dados carregados do endpoint `/bootstrap`
   - localStorage não é utilizado (BD é source of truth)

### Passo 5: Testar Atualização
1. Clique no **ícone de editar** em uma turma existente
2. Altere um campo (ex: Horário para "1000")
3. Clique em **Salvar**
4. **Esperado**:
   - PUT `/import-classes/{id}` enviado
   - Alert "Turma atualizada com sucesso!"
   - Dados atualizados sem reload necessário

## Possíveis Problemas & Soluções

### Problema: "Turma adicionada com sucesso!" mas não aparece após refresh
- **Causa**: TypeError no frontend durante API call
- **Solução**: Verificar Browser DevTools > Console > Network tab
  - Validar payload JSON enviado
  - Verificar status da resposta do servidor

### Problema: POST `/import-classes` retorna erro 422
- **Causa**: Campo obrigatório faltando no payload
- **Solução**: Verificar frontend payload vs. `ImportClassCreate` model no backend

### Problema: Server não inicia
- **Causa**: Erro de Python syntax/import
- **Solução**: Executar `python -c "from app.main import app; print('OK')"`

## Payload Esperado (Frontend → Backend)

```json
{
  "turma_label": "A1",
  "horario": "0900",
  "professor": "João",
  "nivel": "1",
  "faixa_etaria": "6-8",
  "capacidade": 30,
  "dias_semana": "Segunda"
}
```

## Resposta Esperada (Backend → Frontend)

```json
{
  "id": 1,
  "unit_id": 1,
  "codigo": "joa1",
  "turma_label": "A1",
  "horario": "0900",
  "professor": "João",
  "nivel": "1",
  "faixa_etaria": "6-8",
  "capacidade": 30,
  "dias_semana": "Segunda"
}
```

## Próximas Etapas (Futuros)

- [ ] Cleanup: Remover localStorage de turmas mock
- [ ] Error handling: Exibir erros do servidor ao usuário
- [ ] Delete endpoint: Implementar DELETE `/import-classes/{class_id}`
- [ ] Validação: Frontend validation de campos obrigatórios
