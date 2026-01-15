# ?? Estrutura Completa do Projeto - Frontend Adaptado

## Visão Geral da Estrutura

```
Lista-de-Chamada-Web/
??? backend/                          # Backend FastAPI
?   ??? app/
?   ?   ??? __init__.py
?   ?   ??? main.py                   # API principal
?   ?   ??? auth.py                   # Autenticação
?   ?   ??? models.py                 # Modelos Pydantic
?   ?   ??? database.py               # Conexão com banco
?   ?   ??? crud.py                   # Operações CRUD
?   ?   ??? etl/
?   ?       ??? import_excel.py       # Importação de Excel
?   ??? create_admin.py
?   ??? Dockerfile
?   ??? requirements.txt
?   ??? README.md
?
??? frontend/                         # Frontend React/Vite ? NOVO
?   ??? src/
?   ?   ??? pages/
?   ?   ?   ??? Attendance.tsx        # Página de Chamada
?   ?   ?   ??? Attendance.css
?   ?   ?   ??? Students.tsx          # Página de Alunos
?   ?   ?   ??? Students.css
?   ?   ?   ??? Classes.tsx           # Página de Turmas ?
?   ?   ?   ??? Classes.css           # ?
?   ?   ?   ??? Reports.tsx           # Página de Relatórios ?
?   ?   ?   ??? Reports.css           # ?
?   ?   ?   ??? Exclusions.tsx        # Página de Exclusões ?
?   ?   ?   ??? Exclusions.css        # ?
?   ?   ?   ??? Login.tsx             # Página de Login
?   ?   ??? api.ts                    # ?? Cliente API (refatorado)
?   ?   ??? App.tsx                   # ?? Componente Principal (refatorado)
?   ?   ??? App.css                   # ?? (refatorado)
?   ?   ??? index.css                 # ?? (refatorado)
?   ?   ??? main.tsx
?   ?   ??? styles.css
?   ??? public/
?   ??? .env.local                    # Variáveis de ambiente
?   ??? .gitignore
?   ??? eslint.config.js
?   ??? index.html
?   ??? package.json
?   ??? package-lock.json
?   ??? tsconfig.json
?   ??? tsconfig.app.json
?   ??? tsconfig.node.json
?   ??? vite.config.ts
?   ??? README.md
?   ??? ADAPTACAO.md                  # ? Documentação da adaptação
?
??? frontend.backup/                  # Backup antigo (pode deletar)
?
??? data/                             # Dados (Excel, etc)
?
??? docker-compose.yml
??? README.md
??? CHANGELOG_FRONTEND.md             # ? Histórico de mudanças
??? QUICKSTART_FRONTEND.md            # ? Guia rápido
??? RESUMO_ADAPTACAO.md              # ? Resumo visual
??? discuss/                          # Discussões/notas

```

---

## ?? Árvore de Componentes React

```
App
??? Header
?   ??? Logout Button
??? Sidebar Navigation
?   ??? Attendance Button
?   ??? Students Button
?   ??? Classes Button
?   ??? Reports Button
?   ??? Exclusions Button
??? Content Area (Dinâmico)
    ??? Attendance Component
    ?   ??? Filters Section
    ?   ?   ??? Select Turma
    ?   ?   ??? Select Horário
    ?   ?   ??? Select Professor
    ?   ?   ??? Select Mês
    ?   ?   ??? Select Ano
    ?   ?   ??? Button: Carregar
    ?   ??? Attendance Table
    ?       ??? Student Name Column (sticky)
    ?       ??? Date Columns (scrollable)
    ?           ??? Status Cells (clickable)
    ?
    ??? Students Component
    ?   ??? Header Actions
    ?   ?   ??? Search Input
    ?   ?   ??? Button: Adicionar
    ?   ?   ??? Button: Atualizar
    ?   ??? Modal Form (condicional)
    ?   ?   ??? Field: Nome
    ?   ?   ??? Field: Data Nascimento
    ?   ?   ??? Field: Gênero
    ?   ?   ??? Field: WhatsApp
    ?   ?   ??? Field: Turma
    ?   ?   ??? Field: Horário
    ?   ?   ??? Field: Professor
    ?   ?   ??? Field: Nível
    ?   ?   ??? Field: Categoria
    ?   ?   ??? Field: ParQ
    ?   ?   ??? Button: Salvar
    ?   ?   ??? Button: Cancelar
    ?   ??? Students Table
    ?       ??? Columns: Nome, Aniversário, Turma, etc.
    ?       ??? Row Actions: Editar, Deletar
    ?
    ??? Classes Component
    ?   ??? Header Actions
    ?   ??? Modal Form
    ?   ??? Classes Table
    ?
    ??? Reports Component
    ?   ??? Filters Section
    ?   ?   ??? Select Turma
    ?   ?   ??? Select Horário
    ?   ?   ??? Select Professor
    ?   ?   ??? Select Mês
    ?   ?   ??? Select Ano
    ?   ?   ??? Button: Adicionar
    ?   ??? Selected Reports
    ?       ??? Report Items (list)
    ?       ?   ??? Report Info
    ?       ?   ??? Button: Baixar
    ?       ?   ??? Button: Remover
    ?       ??? Button: Gerar Consolidado
    ?
    ??? Exclusions Component
        ??? Header Actions
        ?   ??? Search Input
        ?   ??? Button: Atualizar
        ??? Exclusions Table
            ??? Columns: Nome, Turma, Professor, Data
            ??? Row Actions: Restaurar
```

---

## ?? Arquivos por Tipo

### ?? Configuração
```
frontend/
??? package.json                 # Dependências npm
??? vite.config.ts              # Configuração Vite
??? tsconfig.json               # Configuração TypeScript
??? tsconfig.app.json           # TypeScript para app
??? tsconfig.node.json          # TypeScript para build
??? eslint.config.js            # ESLint config
??? .env.local                  # Variáveis de ambiente
??? index.html                  # HTML principal
```

### ?? Documentação ?
```
frontend/
??? README.md                   # Readme do frontend
??? ADAPTACAO.md               # Doc técnica completa
??? ../
   ??? CHANGELOG_FRONTEND.md   # Histórico de mudanças
   ??? QUICKSTART_FRONTEND.md  # Guia rápido
   ??? RESUMO_ADAPTACAO.md     # Resumo visual
```

### ?? Código Fonte
```
frontend/src/
??? api.ts                      # Client HTTP (Axios)
??? App.tsx                     # Componente principal
??? main.tsx                    # Entry point React
??? pages/
    ??? Login.tsx               # Autenticação
    ??? Attendance.tsx
    ??? Students.tsx
    ??? Classes.tsx
    ??? Reports.tsx
    ??? Exclusions.tsx
```

### ?? Estilos
```
frontend/src/
??? index.css                   # Global styles
??? App.css                     # App layout
??? pages/
    ??? Attendance.css
    ??? Students.css
    ??? Classes.css
    ??? Reports.css
    ??? Exclusions.css
```

### ?? Assets
```
frontend/
??? public/                     # Assets estáticos
??? dist/                       # Build output (gerado)
??? node_modules/              # Dependencies (gerado)
```

---

## ?? Fluxo de Dados

### 1?? Login
```
User ? Login.tsx
     ?
POST /token (api.ts)
     ?
Backend ? JWT Token
     ?
localStorage.setItem("access_token", token)
     ?
App.tsx ? Renderiza Sidebar + Content
```

### 2?? Carregamento de Dados
```
Component Mounted
     ?
useEffect ? loadData()
     ?
API Call (com token no header)
     ?
useState ? Atualiza estado
     ?
Re-render com dados
```

### 3?? Ação do Usuário
```
User Click/Input
     ?
Event Handler
     ?
Validação (opcional)
     ?
API Call (POST/PUT/DELETE)
     ?
Backend Processa
     ?
Response ? setState
     ?
Re-render + Feedback (alert/toast)
```

---

## ?? Endpoints por Página

### Attendance.tsx
```
GET  /api/filtros                    # Load filters
GET  /api/alunos                     # Load students with attendance
POST /api/chamada                    # Save attendance
```

### Students.tsx
```
GET  /api/all-alunos                 # Load all students
POST /api/aluno                      # Add student
PUT  /api/aluno/{nome}               # Edit student
DELETE /api/aluno/{nome}             # Delete student
```

### Classes.tsx
```
GET  /api/all-turmas                 # Load all classes
POST /api/turma                      # Add class
PUT  /api/turma                      # Edit class
DELETE /api/turma                    # Delete class
PUT  /api/turma/nivel                # Update class level
```

### Reports.tsx
```
GET  /api/filtros                    # Load filters
GET  /api/relatorio/excel            # Generate single report
POST /api/relatorio/excel_consolidado # Generate consolidated report
```

### Exclusions.tsx
```
GET  /api/exclusoes                  # Load excluded students
POST /api/restaurar                  # Restore student
```

---

## ?? Autenticação

### Token Flow
```
1. Login
   ?? POST /token
      ?? Response: { access_token: "...", token_type: "bearer" }

2. Storage
   ?? localStorage.setItem("access_token", token)

3. Requisições
   ?? Axios Interceptor adiciona header:
      Authorization: Bearer <token>

4. Logout
   ?? localStorage.removeItem("access_token")
```

---

## ?? Layout Responsivo

### Desktop (1024px+)
- Sidebar width: 200px
- Content: flex (1)
- 2-column layout: Filters | Content

### Tablet (768px - 1023px)
- Sidebar width: 150px
- Content: flex (1)
- 2-column layout (comprimido)

### Mobile (< 768px)
- Sidebar: horizontal scroll
- Content: full width
- 1-column layout

---

## ?? Paleta de Cores CSS

```css
/* Primárias */
--primary: #007bff;          /* Azul */
--primary-hover: #0056b3;    /* Azul escuro */

/* Sucesso */
--success: #28a745;          /* Verde */
--success-hover: #218838;    /* Verde escuro */

/* Aviso */
--warning: #ffc107;          /* Amarelo */
--warning-hover: #e0a800;    /* Amarelo escuro */

/* Perigo */
--danger: #dc3545;           /* Vermelho */
--danger-hover: #c82333;     /* Vermelho escuro */

/* Info */
--info: #17a2b8;             /* Ciano */

/* Tema */
--header-bg: #2c3e50;        /* Azul escuro */
--sidebar-bg: #34495e;       /* Cinza azulado */
--border-color: #dee2e6;     /* Cinza claro */
--bg-light: #f9f9f9;         /* Fundo claro */
```

---

## ?? Conexões com Backend

### URL da API
- Padrão: `http://localhost:8000`
- Configurável via `.env.local`: `VITE_API_URL`

### Headers de Requisição
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Tratamento de Erros
- 401 ? Unauthorized (refaça login)
- 409 ? Conflict (item duplicado)
- 404 ? Not Found
- 500 ? Server Error

---

## ?? Arquivos de Referência

| Arquivo | Conteúdo |
|---------|----------|
| `frontend/ADAPTACAO.md` | ?? Documentação técnica completa |
| `QUICKSTART_FRONTEND.md` | ?? Guia de início rápido |
| `CHANGELOG_FRONTEND.md` | ?? Histórico de mudanças |
| `RESUMO_ADAPTACAO.md` | ?? Resumo visual |
| Este arquivo | ?? Estrutura de pastas |

---

## ? Checklist de Desenvolvimento

- [x] Frontend estrutura criada
- [x] Componentes principais implementados
- [x] API client configurado
- [x] Autenticação funcionando
- [x] CRUD de alunos
- [x] CRUD de turmas
- [x] Chamada interativa
- [x] Relatórios
- [x] Exclusões
- [x] Responsividade
- [x] Documentação
- [ ] Testes unitários (sugerido)
- [ ] Testes E2E (sugerido)
- [ ] Deploy em produção (sugerido)

---

**Última Atualização**: 14 de Janeiro de 2026
**Versão**: 1.0
**Status**: ? Completo
