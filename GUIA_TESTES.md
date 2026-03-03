# ?? Guia de Testes - Frontend Adaptado

## ?? Casos de Teste

### 1?? Autentica��o

#### Teste 1.1: Login com Credenciais V�lidas
```
Pr�-requisito: Backend rodando
1. Acesse http://localhost:5173
2. Insira username/password v�lidos
3. Clique em Login
? Esperado: Redireciona para Dashboard com sidebar vis�vel
```

#### Teste 1.2: Login com Credenciais Inv�lidas
```
1. Acesse http://localhost:5173
2. Insira username/password inv�lidos
3. Clique em Login
? Esperado: Erro na tela ou alert
```

#### Teste 1.3: Logout
```
1. Ap�s login, clique em Logout (top-right)
2. Verifique localStorage
? Esperado: 
   - Redireciona para login
   - Token removido do localStorage
```

---

### 2?? P�gina de Chamada (Attendance)

#### Teste 2.1: Carregar Presen�a
```
1. V� para aba "Chamada"
2. Selecione: Turma, Hor�rio, Professor, M�s, Ano
3. Clique em "Carregar"
? Esperado:
   - Tabela carrega com alunos
   - Datas aparecem no cabe�alho
   - C�lulas clic�veis aparecem
```

#### Teste 2.2: Alternar Status de Presen�a
```
1. Ap�s carregar presen�a
2. Clique em diferentes c�lulas
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
1. Ap�s altera��es
2. Clique em "??? Limpar Chamada"
3. Confirme
? Esperado:
   - Todas as c�lulas ficam vazias
```

---

### 3?? P�gina de Alunos (Students)

#### Teste 3.1: Listar Alunos
```
1. V� para aba "Alunos"
2. Aguarde carregamento
? Esperado:
   - Lista de alunos aparece em tabela
   - Campos vis�veis: Nome, Anivers�rio, Turma, etc.
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
2. Preencha formul�rio (m�n: Nome)
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
   - Altera��es aplicadas
   - Tabela atualiza
   - Alert de sucesso
```

#### Teste 3.5: Deletar Aluno
```
1. Clique em "??? Deletar" em um aluno
2. Confirme
? Esperado:
   - Aluno move para exclus�es
   - Desaparece da lista de alunos
   - Alert de sucesso
```

---

### 4?? P�gina de Turmas (Classes)

#### Teste 4.1: Listar Turmas
```
1. V� para aba "Turmas"
? Esperado:
   - Lista de turmas em tabela
   - Colunas: Turma, Hor�rio, Professor, N�vel, Data
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
2. Preencha: Turma, Hor�rio, Professor (obrigat�rios)
3. Clique em "Salvar"
? Esperado:
   - Nova turma aparece na tabela
   - Modal fecha
```

#### Teste 4.4: Editar Turma
```
1. Clique em "?? Editar" em uma turma
2. Altere dados (opcional: n�vel, atalho)
3. Clique em "Salvar"
? Esperado:
   - Turma atualiza na tabela
   - Confirma��o visual
```

#### Teste 4.5: Deletar Turma
```
1. Clique em "??? Deletar"
2. Confirme
? Esperado:
   - Turma desaparece da lista
   - Confirma��o visual
```

---

### 5?? P�gina de Relat�rios (Reports)

#### Teste 5.1: Selecionar e Adicionar Relat�rio
```
1. V� para aba "Relat�rios"
2. Selecione: Turma, Hor�rio, Professor, M�s, Ano
3. Clique em "? Adicionar ao Relat�rio"
? Esperado:
   - Relat�rio aparece no painel "Selecionados"
   - Contador atualiza
```

#### Teste 5.2: Gerar Relat�rio Individual
```
1. Ap�s adicionar relat�rio
2. Clique em "?? Baixar" em um relat�rio
? Esperado:
   - Download autom�tico de arquivo .xlsx
   - Nome: Relatorio_<turma>_<mes>_<ano>.xlsx
```

#### Teste 5.3: Remover Relat�rio da Sele��o
```
1. Clique em "?" em um relat�rio
? Esperado:
   - Desaparece do painel
   - Contador atualiza
```

#### Teste 5.4: Gerar Relat�rio Consolidado
```
1. Adicione m�ltiplos relat�rios (2+)
2. Clique em "?? Gerar Consolidado"
? Esperado:
   - Download autom�tico
   - Nome: Relatorio_Consolidado.xlsx
   - M�ltiplas abas (uma por turma)
```

---

### 6?? P�gina de Exclus�es (Exclusions)

#### Teste 6.1: Listar Alunos Exclu�dos
```
1. V� para aba "Exclus�es"
? Esperado:
   - Lista de alunos exclu�dos
   - Campos: Nome, Turma, Professor, Data
   - Contador no topo
```

#### Teste 6.2: Buscar Aluno Exclu�do
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
   - Desaparece de exclus�es
   - Confirma��o visual
```

---

### 7?? Navega��o e Layout

#### Teste 7.1: Sidebar Navigation
```
1. Clique em cada aba do sidebar
? Esperado:
   - Aba ativa fica destacada (fundo azul)
   - Conte�do muda dinamicamente
   - Sem reload de p�gina
```

#### Teste 7.2: Header
```
1. Verifique header
? Esperado:
   - Logo/t�tulo vis�vel
   - Bot�o logout funciona
   - Responsivo em mobile
```

#### Teste 7.3: Responsividade Desktop
```
1. Redimensione navegador para 1024px+
? Esperado:
   - Layout 2 colunas (sidebar + content)
   - Sem scroll horizontal
   - Tabelas vis�veis
```

#### Teste 7.4: Responsividade Tablet
```
1. Redimensione para 768px - 1023px
? Esperado:
   - Sidebar comprimida
   - Conte�do ajustado
   - UI funcional
```

#### Teste 7.5: Responsividade Mobile
```
1. Redimensione para < 768px
? Esperado:
   - Sidebar horizontal (scroll�vel)
   - Conte�do full-width
   - Bot�es acess�veis
```

---

### 8?? API Integration

#### Teste 8.1: Requisi��es com Token
```
1. Fa�a login
2. Abra DevTools > Network
3. Navegue entre abas
? Esperado:
   - Todas requisi��es t�m header Authorization
   - Token inclu�do em Bearer <token>
```

#### Teste 8.2: Tratamento de Erro 401
```
1. Limpe o token: localStorage.removeItem("access_token")
2. Tente fazer requisi��o manualmente
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
   - Mensagem de erro gen�rica
   - N�o trava aplica��o
   - Retry poss�vel
```

---

### 9?? Performance

#### Teste 9.1: Carregamento Inicial
```
1. Acesse http://localhost:5173
2. Medir tempo at� interativo
? Esperado: < 3 segundos
```

#### Teste 9.2: Listagem com Muitos Registros
```
1. Adicione 1000+ registros
2. Carregue a lista
? Esperado:
   - N�o trava
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

#### Teste 10.1: Valida��o de Formul�rio
```
1. Tente salvar aluno sem nome
? Esperado:
   - Erro de valida��o
   - Campo destacado
   - Mensagem clara
```

#### Teste 10.2: Conex�o com API Offline
```
1. Desligue internet
2. Tente carregar dados
? Esperado:
   - Erro de conex�o claro
   - N�o trava UI
```

#### Teste 10.3: Logout e Acesso Protegido
```
1. Fa�a logout
2. Tente acessar URL protegida
? Esperado:
   - Redireciona para login
```

---

## ?? Checklist de Testes

### Autentica��o
- [ ] Login com credenciais v�lidas
- [ ] Login com credenciais inv�lidas
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

### Relat�rios
- [ ] Sele��o de filtros
- [ ] Adicionar relat�rio
- [ ] Remover relat�rio
- [ ] Download individual
- [ ] Download consolidado

### Exclus�es
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
- [ ] Requisi��es com token
- [ ] Tratamento de erros
- [ ] CORS funcionando
- [ ] Endpoints corretos

### Performance
- [ ] Carregamento r�pido
- [ ] Sem lag em intera��es
- [ ] Listas grandes funcionam

---

## Testes focados - Vercel (Persistencia e Retroativo)

### A) Exclusoes - Persistencia no vercel.app

#### Cen�rio A1: exclus�o continua ap�s reload sem backend dispon�vel
1. Acesse a aplica��o publicada no `vercel.app`.
2. Na tela de alunos, exclua 1 aluno com motivo.
3. Abra a tela de exclus�es e confirme que o aluno aparece.
4. Recarregue a p�gina (F5) e volte para exclus�es.

Esperado:
- Aluno continua na lista de exclus�es.
- N�o ocorre "reset" para lista vazia ap�s reload.

#### Cen�rio A2: exclus�o permanente persiste ap�s reload
1. Na tela de exclus�es, use "Excluir definitivamente" no aluno do cen�rio A1.
2. Recarregue a p�gina (F5).

Esperado:
- Aluno removido continua removido.

#### Cen�rio A3: restaura��o persiste ap�s reload
1. Exclua novamente um aluno qualquer.
2. Na tela de exclus�es, clique em "Restaurar".
3. Recarregue a p�gina (F5).

Esperado:
- Aluno restaurado n�o volta a aparecer em exclus�es.

### B) Relat�rios - Aulas registradas x previstas com registro retroativo

#### Cen�rio B1: registro retroativo entra no total de registradas
1. Em Chamada, ative modo retroativo e selecione um m�s anterior.
2. Marque presen�a/falta/justificada em um dia v�lido desse m�s e salve.
3. Abra Relat�rios no mesmo m�s e turma/grupo correspondente.
4. Observe o bloco "Aulas registradas x previstas".

Esperado:
- O dia lan�ado retroativamente entra no total de "Registradas".
- O valor aparece tanto por hor�rio quanto no total consolidado.

#### Cen�rio B2: n�o contar registros fora do m�s selecionado
1. Mantendo o mesmo contexto, troque para outro m�s sem esse lan�amento.
2. Reavalie o bloco "Aulas registradas x previstas".

Esperado:
- O registro retroativo do m�s anterior n�o � contado no novo m�s.

Checklist r�pido:
- [ ] A1 passou
- [ ] A2 passou
- [ ] A3 passou
- [ ] B1 passou
- [ ] B2 passou

---

## ?? Reporte de Bugs

### Template
```
**T�tulo**: [BUG] Descri��o breve

**Severidade**: ?? Critical / ?? High / ?? Medium / ?? Low

**Componente**: P�gina ou Componente

**Passos para Reproduzir**:
1. Passo 1
2. Passo 2
3. Passo 3

**Comportamento Esperado**:
Descreva o que deveria acontecer

**Comportamento Atual**:
Descreva o que est� acontecendo

**Environment**:
- Browser: Chrome/Firefox/etc
- OS: Windows/Mac/Linux
- Device: Desktop/Tablet/Mobile

**Screenshots/Logs**:
Cole aqui se houver
```

---

## ? Conclus�o de Testes

Quando todos os testes passarem:

- [ ] Todos 10 grupos de testes executados
- [ ] Nenhum bug cr�tico encontrado
- [ ] Performance aceit�vel
- [ ] Responsividade OK em todos devices
- [ ] Documenta��o atualizada
- [ ] Pronto para produ��o

---

**Data**: 14 de Janeiro de 2026
**Vers�o**: 1.0
**Escopo**: Frontend Adaptado
