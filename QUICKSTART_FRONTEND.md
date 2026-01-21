# ?? Guia de In?cio R?pido - Frontend Adaptado

Este ? o frontend React/TypeScript/Vite para o projeto **Lista de Chamada Web**, completamente adaptado do reposit?rio template.

## ? In?cio R?pido

### 1?? Instala??o

```bash
cd frontend
npm install
```

### 2?? Configurar Vari?veis de Ambiente

Crie um arquivo `.env.local` na pasta `frontend`:

```env
VITE_API_URL=http://localhost:8000
```

Se a API estiver em outro local, ajuste a URL.

### 3?? Iniciar o Servidor de Desenvolvimento

```bash
npm run dev
```

O frontend estar? dispon?vel em `http://localhost:5173` (porta padr?o do Vite).

### 4?? Certificar-se que o Backend est? Rodando

O backend deve estar rodando em `http://localhost:8000`. Veja as instru??es em `backend/README.md`:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## ?? Navega??o

Ap?s fazer login, voc? ter? acesso a 5 abas principais:

### ?? **Chamada**
- Registre presen?as dos alunos
- Filtros: Turma, Hor?rio, Professor, M?s, Ano
- Status: Presente (?), Ausente (?), Justificado (??)
- Bot?es: Salvar, Limpar

### ?? **Alunos**
- Visualize todos os alunos
- Adicione novos alunos
- Edite informa??es de alunos
- Delete alunos (move para exclus?es)
- Busca em tempo real

### ?? **Turmas**
- Gerencie turmas/classes
- Adicione nova turma
- Edite turma
- Delete turma
- Campos: Turma, Horrio, Professor, Nvel, Atalho, Data de Incio, Capacidade M?xima

### ?? **Relat?rios**
- Gere relat?rios Excel
- Selecione m?ltiplas turmas
- Baixe relat?rio individual ou consolidado
- Filtros: Turma, Hor?rio, Professor, M?s, Ano

### ? **Exclus?es**
- Visualize alunos exclu?dos
- Restaure alunos exclu?dos para a lista ativa
- Busca por nome

---

## ?? Login

Para fazer login, use as credenciais do seu backend FastAPI. O token ser? armazenado em `localStorage` automaticamente.

---

## ?? Build para Produ??o

```bash
npm run build
```

Os arquivos compilados estar?o na pasta `dist/`.

Para servir em produ??o:

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
?   ?   ??? Reports.tsx     # Relat?rios
?   ?   ??? Exclusions.tsx  # Exclus?es
?   ?   ??? Login.tsx       # Login
?   ??? api.ts              # Cliente API (axios)
?   ??? App.tsx             # Componente principal
?   ??? App.css
?   ??? main.tsx
?   ??? index.css
??? public/                 # Assets est?ticos
??? package.json
??? vite.config.ts
??? tsconfig.json
??? index.html

```

---

## ??? Desenvolvedor - Comandos ?teis

### Desenvolvimento
```bash
npm run dev          # Inicia servidor de dev
npm run build        # Build para produ??o
npm run preview      # Preview do build
npm run lint         # Lint com ESLint
```

### Debugging
- Abra DevTools (F12)
- Check Network para requisi??es API
- Check Console para erros
- Check LocalStorage para token

---

## ?? Troubleshooting

### Erro: "API n?o responde"
- Verifique se o backend est? rodando em `http://localhost:8000`
- Verifique a vari?vel `VITE_API_URL` em `.env.local`
- Check CORS no backend

### Erro: "Token inv?lido"
- Fa?a logout e login novamente
- Limpe o localStorage: `localStorage.clear()`
- Verifique credenciais no backend

### Erro: "M?dulo n?o encontrado"
```bash
rm -rf node_modules
npm install
npm run dev
```

### Tabela de presen?a n?o carrega
- Certifique-se de selecionar uma turma v?lida
- Verifique se h? alunos naquela turma
- Check network tab para erros da API

---

## ?? Customiza??o

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

## ? Checklist de Configura??o

- [ ] Backend rodando em `http://localhost:8000`
- [ ] Frontend instalado com `npm install`
- [ ] `.env.local` configurado corretamente
- [ ] `npm run dev` iniciado
- [ ] Browser aberto em `http://localhost:5173`
- [ ] Login realizado com sucesso
- [ ] Abas naveg?veis
- [ ] Dados carregando corretamente

---

## ?? Suporte

Para problemas:
1. Verifique o console do browser (F12)
2. Verifique o terminal do backend para erros da API
3. Verifique a aba Network para requisi??es falhadas
4. Consulte a documenta??o de cada API em `frontend/ADAPTACAO.md`

---

**?ltima atualiza??o**: 14 de Janeiro de 2026
**Vers?o**: 1.0
**Status**: ? Pronto para Produ??o

---

Aproveite! ??
