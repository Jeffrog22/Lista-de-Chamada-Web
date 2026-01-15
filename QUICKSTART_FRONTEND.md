# ?? Guia de Início Rápido - Frontend Adaptado

Este é o frontend React/TypeScript/Vite para o projeto **Lista de Chamada Web**, completamente adaptado do repositório template.

## ? Início Rápido

### 1?? Instalação

```bash
cd frontend
npm install
```

### 2?? Configurar Variáveis de Ambiente

Crie um arquivo `.env.local` na pasta `frontend`:

```env
VITE_API_URL=http://localhost:8000
```

Se a API estiver em outro local, ajuste a URL.

### 3?? Iniciar o Servidor de Desenvolvimento

```bash
npm run dev
```

O frontend estará disponível em `http://localhost:5173` (porta padrão do Vite).

### 4?? Certificar-se que o Backend está Rodando

O backend deve estar rodando em `http://localhost:8000`. Veja as instruções em `backend/README.md`:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## ?? Navegação

Após fazer login, você terá acesso a 5 abas principais:

### ?? **Chamada**
- Registre presenças dos alunos
- Filtros: Turma, Horário, Professor, Mês, Ano
- Status: Presente (?), Ausente (?), Justificado (??)
- Botões: Salvar, Limpar

### ?? **Alunos**
- Visualize todos os alunos
- Adicione novos alunos
- Edite informações de alunos
- Delete alunos (move para exclusões)
- Busca em tempo real

### ?? **Turmas**
- Gerencie turmas/classes
- Adicione nova turma
- Edite turma
- Delete turma
- Campos: Turma, Horário, Professor, Nível, Atalho, Data de Início

### ?? **Relatórios**
- Gere relatórios Excel
- Selecione múltiplas turmas
- Baixe relatório individual ou consolidado
- Filtros: Turma, Horário, Professor, Mês, Ano

### ? **Exclusões**
- Visualize alunos excluídos
- Restaure alunos excluídos para a lista ativa
- Busca por nome

---

## ?? Login

Para fazer login, use as credenciais do seu backend FastAPI. O token será armazenado em `localStorage` automaticamente.

---

## ?? Build para Produção

```bash
npm run build
```

Os arquivos compilados estarão na pasta `dist/`.

Para servir em produção:

```bash
npm run preview
```

---

## ?? Estrutura de Pastas

```
frontend/
??? src/
?   ??? pages/              # Componentes das abas
?   ?   ??? Attendance.tsx  # Chamada
?   ?   ??? Students.tsx    # Alunos
?   ?   ??? Classes.tsx     # Turmas
?   ?   ??? Reports.tsx     # Relatórios
?   ?   ??? Exclusions.tsx  # Exclusões
?   ?   ??? Login.tsx       # Login
?   ??? api.ts              # Cliente API (axios)
?   ??? App.tsx             # Componente principal
?   ??? App.css
?   ??? main.tsx
?   ??? index.css
??? public/                 # Assets estáticos
??? package.json
??? vite.config.ts
??? tsconfig.json
??? index.html

```

---

## ??? Desenvolvedor - Comandos Úteis

### Desenvolvimento
```bash
npm run dev          # Inicia servidor de dev
npm run build        # Build para produção
npm run preview      # Preview do build
npm run lint         # Lint com ESLint
```

### Debugging
- Abra DevTools (F12)
- Check Network para requisições API
- Check Console para erros
- Check LocalStorage para token

---

## ?? Troubleshooting

### Erro: "API não responde"
- Verifique se o backend está rodando em `http://localhost:8000`
- Verifique a variável `VITE_API_URL` em `.env.local`
- Check CORS no backend

### Erro: "Token inválido"
- Faça logout e login novamente
- Limpe o localStorage: `localStorage.clear()`
- Verifique credenciais no backend

### Erro: "Módulo não encontrado"
```bash
rm -rf node_modules
npm install
npm run dev
```

### Tabela de presença não carrega
- Certifique-se de selecionar uma turma válida
- Verifique se há alunos naquela turma
- Check network tab para erros da API

---

## ?? Customização

### Cores
Edite as cores CSS em cada arquivo `.css` dos componentes:
- Primary: `#007bff`
- Success: `#28a745`
- Warning: `#ffc107`
- Danger: `#dc3545`

### Fonte
Edite em `src/index.css`:
```css
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

---

## ?? Recursos

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Vite Documentation](https://vitejs.dev)
- [Axios Documentation](https://axios-http.com)
- [FastAPI Documentation](https://fastapi.tiangolo.com)

---

## ? Checklist de Configuração

- [ ] Backend rodando em `http://localhost:8000`
- [ ] Frontend instalado com `npm install`
- [ ] `.env.local` configurado corretamente
- [ ] `npm run dev` iniciado
- [ ] Browser aberto em `http://localhost:5173`
- [ ] Login realizado com sucesso
- [ ] Abas navegáveis
- [ ] Dados carregando corretamente

---

## ?? Suporte

Para problemas:
1. Verifique o console do browser (F12)
2. Verifique o terminal do backend para erros da API
3. Verifique a aba Network para requisições falhadas
4. Consulte a documentação de cada API em `frontend/ADAPTACAO.md`

---

**Última atualização**: 14 de Janeiro de 2026
**Versão**: 1.0
**Status**: ? Pronto para Produção

---

Aproveite! ??
