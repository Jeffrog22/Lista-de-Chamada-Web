# Resumo Técnico da Implementação - Persistência de Turmas

## Arquitetura da Solução

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + TypeScript)           │
├─────────────────────────────────────────────────────────────┤
│ Classes.tsx (Nova Turma Form)                                │
│   ↓                                                          │
│   handleSave() async {                                       │
│     if (editingClass) {                                      │
│       await updateClass(id, payload)  ──→ PUT /import-classes/{id}
│     } else {                                                 │
│       await addClass(payload)  ──→ POST /import-classes      │
│     }                                                        │
│     await getBootstrap()  ──→ GET /bootstrap (refetch)       │
│   }                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ (Axios HTTP)
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (FastAPI + SQLModel)                   │
├─────────────────────────────────────────────────────────────┤
│ POST /import-classes                                         │
│   ├─ Request: ImportClassCreate (body)                       │
│   ├─ Process: CREATE ImportClass record                      │
│   └─ Response: { id, codigo, turma_label, ... }             │
│                                                              │
│ PUT /import-classes/{class_id}                               │
│   ├─ Request: ImportClassUpdate (body)                       │
│   ├─ Process: UPDATE ImportClass record                      │
│   └─ Response: { id, codigo, turma_label, ... }             │
│                                                              │
│ GET /bootstrap                                               │
│   └─ Response: { classes: [ImportClass[]] }                 │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ (SQLModel ORM)
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE (PostgreSQL/SQLite)                │
├─────────────────────────────────────────────────────────────┤
│ Table: import_classes                                        │
│  ├─ id (PK)                                                 │
│  ├─ unit_id (FK)                                            │
│  ├─ codigo (UNIQUE with unit_id, horario)                   │
│  ├─ turma_label                                             │
│  ├─ horario                                                 │
│  ├─ professor                                               │
│  ├─ nivel                                                   │
│  ├─ faixa_etaria                                            │
│  ├─ capacidade                                              │
│  └─ dias_semana                                             │
└─────────────────────────────────────────────────────────────┘
```

## Arquivos Modificados

### 1. Frontend: `frontend/src/api.ts`
**Mudanças**: Atualizar endpoints de classes para usar `/import-classes`

```typescript
// ANTES:
export const addClass = (data: any) => API.post("/classes", data);
export const updateClass = (turma, horario, professor, data) => 
  API.put(`/classes/${turma}/${horario}/${professor}`, data);

// DEPOIS:
export const addClass = (data: any) => API.post("/import-classes", data);
export const updateClass = (class_id: number, data: any) => 
  API.put(`/import-classes/${class_id}`, data);
```

### 2. Frontend: `frontend/src/pages/Classes.tsx`
**Mudanças**: 
- Adicionar `id?: number` à interface Class
- Mapear `id` do bootstrap response
- Refatorar `handleSave()` para ser async
- Usar `class_id` em updates ao invés de (turma, horario, professor)

```typescript
interface Class {
  id?: number;  // ← NOVO
  Turma: string;
  // ... resto dos campos
}

const handleSave = async () => {
  if (editingClass) {
    await updateClass(editingClass.id, payload);  // ← ANTES: 3 parâmetros
  }
};
```

### 3. Backend: `backend/app/models.py`
**Mudanças**: Adicionar modelos para criar/atualizar turmas

```python
class ImportClassCreate(SQLModel):
    turma_label: str
    horario: str
    professor: str
    nivel: Optional[str] = None
    faixa_etaria: Optional[str] = None
    capacidade: Optional[int] = None
    dias_semana: Optional[str] = None

class ImportClassUpdate(SQLModel):
    turma_label: Optional[str] = None
    # ... todas as opções são opcionais
```

### 4. Backend: `backend/app/main.py`
**Mudanças**: Implementar endpoints POST/PUT para import-classes

```python
@app.post("/import-classes")
def create_import_class(data: models.ImportClassCreate, session: Session = Depends(get_session)):
    # Cria novo ImportClass
    # Retorna { id, codigo, turma_label, ... }

@app.put("/import-classes/{class_id}")
def update_import_class(class_id: int, data: models.ImportClassUpdate, session: Session = Depends(get_session)):
    # Atualiza ImportClass existente
    # Retorna { id, codigo, turma_label, ... }
```

## Garantias de Qualidade

### ✅ Build Validation
- Frontend: `npm run build` passes without errors
- Backend: `python -c "from app.main import app"` succeeds
- Python syntax: Valid (no IndentationError, SyntaxError)

### ✅ API Contracts
- POST payload matches `ImportClassCreate`
- PUT payload matches `ImportClassUpdate`
- Response format consistent between POST/PUT/GET bootstrap

### ✅ Data Flow
```
User Input (UI) 
  → handleSave calls addClass/updateClass
  → API sends JSON body (not query params!)
  → Backend creates/updates ImportClass in DB
  → Response includes ID for caching
  → Frontend refetches bootstrap
  → Tables reloaded from persistent DB
```

### ⚠️ Known Limitations
- Delete endpoint not yet implemented
- No form validation on frontend
- localStorage still populated for offline fallback (can be removed)
- Error messages from API not displayed to user

## Testing Checklist

- [ ] Start backend server: `python -m uvicorn app.main:app --reload`
- [ ] Start frontend: `npm run dev`
- [ ] Create new turma via UI
  - [ ] Check POST `/import-classes` in DevTools
  - [ ] Verify response includes `id`
- [ ] Refresh page
  - [ ] Turma still appears (loaded from DB)
  - [ ] GET `/bootstrap` contains new turma
- [ ] Edit turma
  - [ ] Check PUT `/import-classes/{id}` in DevTools
  - [ ] Verify changes persisted
- [ ] Refresh again
  - [ ] Updated data still there

## Notas de Implementação

1. **unit_id sempre é 1** - Hardcoded no POST endpoint
2. **codigo gerado automaticamente** - Formato: `{prof[:2]}{turma[:3]}`
3. **ID armazenado no frontend** - Necessário para updates
4. **Bootstrap refetch após create** - Garante ID correto no estado
5. **RequestBody obrigatório** - Não usando query params para POST/PUT
