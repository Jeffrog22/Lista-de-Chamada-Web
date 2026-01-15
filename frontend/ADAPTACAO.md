# Frontend - Lista de Chamada Web

Frontend React/TypeScript/Vite adaptado com base no template do repositório `https://github.com/Jeffrog22/Lista-de-Chamada`.

## ?? Funcionalidades Implementadas

### 1. **Página de Chamada (Attendance)**
- Filtros por turma, horário, professor, mês e ano
- Tabela interativa com alunos e datas
- Sistema de status (Presente, Ausente, Justificado)
- Salvar chamada
- Limpar chamada

### 2. **Página de Alunos (Students)**
- Visualização de lista de alunos com busca
- Adicionar novo aluno
- Editar aluno existente
- Deletar aluno
- Campos: Nome, Data de Nascimento, Gênero, WhatsApp, Turma, Horário, Professor, Nível, Categoria, ParQ

### 3. **Página de Turmas (Classes)**
- Visualização de lista de turmas
- Adicionar nova turma
- Editar turma existente
- Deletar turma
- Campos: Turma, Horário, Professor, Nível, Atalho, Data de Início

### 4. **Página de Relatórios (Reports)**
- Selecionar turmas para gerar relatórios
- Gerar relatório individual por turma (Excel)
- Gerar relatório consolidado (múltiplas turmas em um arquivo)
- Download automático dos arquivos

### 5. **Página de Exclusões (Exclusions)**
- Visualização de alunos excluídos
- Restaurar aluno para a lista ativa

## ?? Estrutura do Projeto

```
frontend/src/
??? pages/
?   ??? Attendance.tsx      # Página de Chamada
?   ??? Attendance.css
?   ??? Students.tsx        # Página de Alunos
?   ??? Students.css
?   ??? Classes.tsx         # Página de Turmas
?   ??? Classes.css
?   ??? Reports.tsx         # Página de Relatórios
?   ??? Reports.css
?   ??? Exclusions.tsx      # Página de Exclusões
?   ??? Exclusions.css
?   ??? Login.tsx           # Página de Login
??? api.ts                  # Client API com todos os endpoints
??? App.tsx                 # Componente principal com navegação
??? App.css
??? main.tsx

```

## ?? API Endpoints

Todos os endpoints são definidos em `src/api.ts`:

### Autenticação
- `POST /token` - Login

### Filtros
- `GET /api/filtros` - Retorna filtros disponíveis

### Alunos
- `GET /api/all-alunos` - Lista todos os alunos
- `GET /api/alunos` - Alunos filtrados por turma/mês
- `POST /api/aluno` - Adicionar aluno
- `PUT /api/aluno/{nome}` - Editar aluno
- `DELETE /api/aluno/{nome}` - Deletar aluno

### Turmas
- `GET /api/all-turmas` - Lista todas as turmas
- `POST /api/turma` - Adicionar turma
- `PUT /api/turma` - Editar turma
- `DELETE /api/turma` - Deletar turma
- `PUT /api/turma/nivel` - Atualizar nível da turma

### Chamada
- `POST /api/chamada` - Salvar registros de presença

### Justificativas
- `POST /api/justificativa` - Salvar justificativa

### Relatórios
- `GET /api/relatorio/excel` - Gerar relatório individual
- `POST /api/relatorio/excel_consolidado` - Gerar relatório consolidado
- `GET /api/relatorio/frequencia` - Relatório de frequência

### Exclusões
- `GET /api/exclusoes` - Lista alunos excluídos
- `POST /api/restaurar` - Restaurar aluno

## ?? Design e UI

- **Theme**: Material Design inspirado
- **Cores**: 
  - Primário: #007bff (Azul)
  - Sucesso: #28a745 (Verde)
  - Aviso: #ffc107 (Amarelo)
  - Erro: #dc3545 (Vermelho)
  - Info: #17a2b8 (Ciano)

- **Responsivo**: Layout adaptativo para desktop e mobile
- **Sidebar**: Navegação lateral com abas
- **Modais**: Formulários em modal overlay para adicionar/editar

## ?? Como Usar

### Instalação
```bash
cd frontend
npm install
```

### Desenvolvimento
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Configuração da API

Configure a URL da API no arquivo `.env.local`:
```env
VITE_API_URL=http://localhost:8000
```

Ou deixe o padrão que é `http://localhost:8000`.

## ?? Status de Presença

- **Vazio** ("") - Célula em branco
- **Presente** ("c") - ? Verde
- **Ausente** ("f") - ? Vermelho
- **Justificado** ("j") - ?? Amarelo

Clique nas células da tabela de chamada para alternar entre os status.

## ?? Autenticação

A autenticação é gerenciada via token JWT:
- Token armazenado em `localStorage` com a chave `access_token`
- Token é automaticamente enviado em todas as requisições via header `Authorization: Bearer <token>`
- Logout limpa o token e redireciona para a página de login

## ?? Dependências

- React 18+
- TypeScript
- Vite
- Axios
- CSS3

## ?? Contribuindo

Este frontend foi adaptado do repositório template [Jeffrog22/Lista-de-Chamada](https://github.com/Jeffrog22/Lista-de-Chamada) com foco em transformá-lo em uma aplicação web moderna.

## ?? Notas

- Todas as requisições à API incluem tratamento de erro
- O frontend trabalha com o backend FastAPI definido no diretório `backend/`
- As datas são formatadas como DD/MM/YYYY
- Horários são formatados como HHhMM (ex: 09h30)
