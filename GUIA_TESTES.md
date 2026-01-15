# ?? Guia de Testes - Frontend Adaptado

## ?? Casos de Teste

### 1?? Autenticação

#### Teste 1.1: Login com Credenciais Válidas
```
Pré-requisito: Backend rodando
1. Acesse http://localhost:5173
2. Insira username/password válidos
3. Clique em Login
? Esperado: Redireciona para Dashboard com sidebar visível
```

#### Teste 1.2: Login com Credenciais Inválidas
```
1. Acesse http://localhost:5173
2. Insira username/password inválidos
3. Clique em Login
? Esperado: Erro na tela ou alert
```

#### Teste 1.3: Logout
```
1. Após login, clique em Logout (top-right)
2. Verifique localStorage
? Esperado: 
   - Redireciona para login
   - Token removido do localStorage
```

---

### 2?? Página de Chamada (Attendance)

#### Teste 2.1: Carregar Presença
```
1. Vá para aba "Chamada"
2. Selecione: Turma, Horário, Professor, Mês, Ano
3. Clique em "Carregar"
? Esperado:
   - Tabela carrega com alunos
   - Datas aparecem no cabeçalho
   - Células clicáveis aparecem
```

#### Teste 2.2: Alternar Status de Presença
```
1. Após carregar presença
2. Clique em diferentes células
? Esperado:
   - Clique 1: Presente (? verde)
   - Clique 2: Ausente (? vermelho)
   - Clique 3: Justificado (?? amarelo)
   - Clique 4: Vazio (branco)
```

#### Teste 2.3: Salvar Chamada
```
1. Altere alguns status
2. Clique em "?? Salvar Chamada"
? Esperado:
   - Alert de sucesso
   - Dados salvos no backend
```

#### Teste 2.4: Limpar Chamada
```
1. Após alterações
2. Clique em "??? Limpar Chamada"
3. Confirme
? Esperado:
   - Todas as células ficam vazias
```

---

### 3?? Página de Alunos (Students)

#### Teste 3.1: Listar Alunos
```
1. Vá para aba "Alunos"
2. Aguarde carregamento
? Esperado:
   - Lista de alunos aparece em tabela
   - Campos visíveis: Nome, Aniversário, Turma, etc.
```

#### Teste 3.2: Buscar Aluno
```
1. Na aba "Alunos"
2. Digite nome no campo de busca
? Esperado:
   - Tabela filtra em tempo real
   - Apenas alunos matching aparecem
```

#### Teste 3.3: Adicionar Aluno
```
1. Clique em "? Adicionar Aluno"
2. Preencha formulário (mín: Nome)
3. Clique em "Salvar"
? Esperado:
   - Modal fecha
   - Novo aluno aparece na tabela
   - Alert de sucesso
```

#### Teste 3.4: Editar Aluno
```
1. Clique em "?? Editar" em um aluno
2. Altere dados
3. Clique em "Salvar"
? Esperado:
   - Alterações aplicadas
   - Tabela atualiza
   - Alert de sucesso
```

#### Teste 3.5: Deletar Aluno
```
1. Clique em "??? Deletar" em um aluno
2. Confirme
? Esperado:
   - Aluno move para exclusões
   - Desaparece da lista de alunos
   - Alert de sucesso
```

---

### 4?? Página de Turmas (Classes)

#### Teste 4.1: Listar Turmas
```
1. Vá para aba "Turmas"
? Esperado:
   - Lista de turmas em tabela
   - Colunas: Turma, Horário, Professor, Nível, Data
```

#### Teste 4.2: Buscar Turma
```
1. Digite "nome turma" no campo de busca
? Esperado:
   - Filtra por turma ou professor
   - Resultado em tempo real
```

#### Teste 4.3: Adicionar Turma
```
1. Clique em "? Adicionar Turma"
2. Preencha: Turma, Horário, Professor (obrigatórios)
3. Clique em "Salvar"
? Esperado:
   - Nova turma aparece na tabela
   - Modal fecha
```

#### Teste 4.4: Editar Turma
```
1. Clique em "?? Editar" em uma turma
2. Altere dados (opcional: nível, atalho)
3. Clique em "Salvar"
? Esperado:
   - Turma atualiza na tabela
   - Confirmação visual
```

#### Teste 4.5: Deletar Turma
```
1. Clique em "??? Deletar"
2. Confirme
? Esperado:
   - Turma desaparece da lista
   - Confirmação visual
```

---

### 5?? Página de Relatórios (Reports)

#### Teste 5.1: Selecionar e Adicionar Relatório
```
1. Vá para aba "Relatórios"
2. Selecione: Turma, Horário, Professor, Mês, Ano
3. Clique em "? Adicionar ao Relatório"
? Esperado:
   - Relatório aparece no painel "Selecionados"
   - Contador atualiza
```

#### Teste 5.2: Gerar Relatório Individual
```
1. Após adicionar relatório
2. Clique em "?? Baixar" em um relatório
? Esperado:
   - Download automático de arquivo .xlsx
   - Nome: Relatorio_<turma>_<mes>_<ano>.xlsx
```

#### Teste 5.3: Remover Relatório da Seleção
```
1. Clique em "?" em um relatório
? Esperado:
   - Desaparece do painel
   - Contador atualiza
```

#### Teste 5.4: Gerar Relatório Consolidado
```
1. Adicione múltiplos relatórios (2+)
2. Clique em "?? Gerar Consolidado"
? Esperado:
   - Download automático
   - Nome: Relatorio_Consolidado.xlsx
   - Múltiplas abas (uma por turma)
```

---

### 6?? Página de Exclusões (Exclusions)

#### Teste 6.1: Listar Alunos Excluídos
```
1. Vá para aba "Exclusões"
? Esperado:
   - Lista de alunos excluídos
   - Campos: Nome, Turma, Professor, Data
   - Contador no topo
```

#### Teste 6.2: Buscar Aluno Excluído
```
1. Digite nome no campo de busca
? Esperado:
   - Lista filtra em tempo real
```

#### Teste 6.3: Restaurar Aluno
```
1. Clique em "?? Restaurar" em um aluno
2. Confirme
? Esperado:
   - Aluno volta para lista de alunos ativos
   - Desaparece de exclusões
   - Confirmação visual
```

---

### 7?? Navegação e Layout

#### Teste 7.1: Sidebar Navigation
```
1. Clique em cada aba do sidebar
? Esperado:
   - Aba ativa fica destacada (fundo azul)
   - Conteúdo muda dinamicamente
   - Sem reload de página
```

#### Teste 7.2: Header
```
1. Verifique header
? Esperado:
   - Logo/título visível
   - Botão logout funciona
   - Responsivo em mobile
```

#### Teste 7.3: Responsividade Desktop
```
1. Redimensione navegador para 1024px+
? Esperado:
   - Layout 2 colunas (sidebar + content)
   - Sem scroll horizontal
   - Tabelas visíveis
```

#### Teste 7.4: Responsividade Tablet
```
1. Redimensione para 768px - 1023px
? Esperado:
   - Sidebar comprimida
   - Conteúdo ajustado
   - UI funcional
```

#### Teste 7.5: Responsividade Mobile
```
1. Redimensione para < 768px
? Esperado:
   - Sidebar horizontal (scrollável)
   - Conteúdo full-width
   - Botões acessíveis
```

---

### 8?? API Integration

#### Teste 8.1: Requisições com Token
```
1. Faça login
2. Abra DevTools > Network
3. Navegue entre abas
? Esperado:
   - Todas requisições têm header Authorization
   - Token incluído em Bearer <token>
```

#### Teste 8.2: Tratamento de Erro 401
```
1. Limpe o token: localStorage.removeItem("access_token")
2. Tente fazer requisição manualmente
? Esperado:
   - Redireciona para login
   - Feedback claro
```

#### Teste 8.3: Tratamento de Erro 409 (Duplicado)
```
1. Tente adicionar aluno/turma duplicado
? Esperado:
   - Erro claro
   - Alert ou mensagem de erro
```

#### Teste 8.4: Tratamento de Erro 500
```
1. (Induzir erro no backend)
? Esperado:
   - Mensagem de erro genérica
   - Não trava aplicação
   - Retry possível
```

---

### 9?? Performance

#### Teste 9.1: Carregamento Inicial
```
1. Acesse http://localhost:5173
2. Medir tempo até interativo
? Esperado: < 3 segundos
```

#### Teste 9.2: Listagem com Muitos Registros
```
1. Adicione 1000+ registros
2. Carregue a lista
? Esperado:
   - Não trava
   - Scroll funciona
```

#### Teste 9.3: Busca em Tempo Real
```
1. Digite rapidamente em campo de busca
? Esperado:
   - Responde instantaneamente
   - Sem lag
```

---

### ?? Casos de Erro

#### Teste 10.1: Validação de Formulário
```
1. Tente salvar aluno sem nome
? Esperado:
   - Erro de validação
   - Campo destacado
   - Mensagem clara
```

#### Teste 10.2: Conexão com API Offline
```
1. Desligue internet
2. Tente carregar dados
? Esperado:
   - Erro de conexão claro
   - Não trava UI
```

#### Teste 10.3: Logout e Acesso Protegido
```
1. Faça logout
2. Tente acessar URL protegida
? Esperado:
   - Redireciona para login
```

---

## ?? Checklist de Testes

### Autenticação
- [ ] Login com credenciais válidas
- [ ] Login com credenciais inválidas
- [ ] Logout funciona
- [ ] Token em localStorage
- [ ] Acesso protegido

### Chamada
- [ ] Filtros carregam dados
- [ ] Tabela exibe corretamente
- [ ] Click alterna status
- [ ] Salvar funciona
- [ ] Limpar funciona

### Alunos
- [ ] Lista carrega
- [ ] Busca funciona
- [ ] Adicionar funciona
- [ ] Editar funciona
- [ ] Deletar funciona

### Turmas
- [ ] Lista carrega
- [ ] Busca funciona
- [ ] Adicionar funciona
- [ ] Editar funciona
- [ ] Deletar funciona

### Relatórios
- [ ] Seleção de filtros
- [ ] Adicionar relatório
- [ ] Remover relatório
- [ ] Download individual
- [ ] Download consolidado

### Exclusões
- [ ] Lista carrega
- [ ] Busca funciona
- [ ] Restaurar funciona

### Layout
- [ ] Sidebar navigation
- [ ] Responsive desktop
- [ ] Responsive tablet
- [ ] Responsive mobile
- [ ] Header/Footer

### API
- [ ] Requisições com token
- [ ] Tratamento de erros
- [ ] CORS funcionando
- [ ] Endpoints corretos

### Performance
- [ ] Carregamento rápido
- [ ] Sem lag em interações
- [ ] Listas grandes funcionam

---

## ?? Reporte de Bugs

### Template
```
**Título**: [BUG] Descrição breve

**Severidade**: ?? Critical / ?? High / ?? Medium / ?? Low

**Componente**: Página ou Componente

**Passos para Reproduzir**:
1. Passo 1
2. Passo 2
3. Passo 3

**Comportamento Esperado**:
Descreva o que deveria acontecer

**Comportamento Atual**:
Descreva o que está acontecendo

**Environment**:
- Browser: Chrome/Firefox/etc
- OS: Windows/Mac/Linux
- Device: Desktop/Tablet/Mobile

**Screenshots/Logs**:
Cole aqui se houver
```

---

## ? Conclusão de Testes

Quando todos os testes passarem:

- [ ] Todos 10 grupos de testes executados
- [ ] Nenhum bug crítico encontrado
- [ ] Performance aceitável
- [ ] Responsividade OK em todos devices
- [ ] Documentação atualizada
- [ ] Pronto para produção

---

**Data**: 14 de Janeiro de 2026
**Versão**: 1.0
**Escopo**: Frontend Adaptado
