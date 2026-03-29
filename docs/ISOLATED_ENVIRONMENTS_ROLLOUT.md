# Plano de Implantação Isolada - Espelho Bela Vista + 3 Pilotos

## 1) Nomes padrão recomendados

### Frontend (Vercel)
- bela-vista-lista
- bela-vista-mirror-lista
- parque-municipal-lista
- sao-matheus-lista
- vila-joao-xxiii-lista

### Backend (Render ou equivalente)
- api-bela-vista
- api-bela-vista-mirror
- api-parque-municipal
- api-sao-matheus
- api-vila-joao-xxiii

### Banco
- db-bela-vista
- db-bela-vista-mirror
- db-parque-municipal
- db-sao-matheus
- db-vila-joao-xxiii

## 2) Matriz mínima de variáveis por ambiente

- UNIT_NAME
- VITE_API_URL
- DATABASE_URL
- CORS_ORIGINS
- SECRET_KEY
- ENV_NAME

### Valores de UNIT_NAME
- Piscina Bela Vista
- Parque Municipal
- São Matheus
- Vila João XXIII

## 3) Mapeamento obrigatório

| Ambiente | UNIT_NAME | ENV_NAME |
|---|---|---|
| bela-vista-mirror | Piscina Bela Vista | bela-vista-mirror |
| piloto-parque-municipal | Parque Municipal | piloto-parque-municipal |
| piloto-sao-matheus | São Matheus | piloto-sao-matheus |
| piloto-vila-joao-xxiii | Vila João XXIII | piloto-vila-joao-xxiii |

## 4) Sequência recomendada de rollout

1. Provisionar db-bela-vista-mirror.
2. Provisionar api-bela-vista-mirror apontando para db-bela-vista-mirror.
3. Provisionar bela-vista-mirror-lista apontando para api-bela-vista-mirror.
4. Executar bateria de testes no mirror.
5. Repetir o mesmo padrão para piloto-parque-municipal.
6. Repetir o mesmo padrão para piloto-sao-matheus.
7. Repetir o mesmo padrão para piloto-vila-joao-xxiii.

## 5) Regras de segurança operacional

- Não reutilizar DATABASE_URL entre ambientes.
- Não compartilhar SECRET_KEY entre backends.
- Não abrir CORS para frontends de outros ambientes.
- Não executar comandos destrutivos durante implantação.

## 6) Checklist técnico por ambiente

1. Backend responde /health com status ok.
2. Endpoint /environment retorna unit_name e env_name esperados.
3. Login com unidade correta funciona.
4. Login com unidade incorreta bloqueia com mensagem clara.
5. Header exibe unidade validada.
6. Import gera dados no banco do ambiente.
7. Chamada, turmas, alunos e relatórios funcionam sem mistura.

## 7) Rollback por ambiente

1. Redirecionar tráfego para manutenção/contingência do ambiente afetado.
2. Reimplantar backend na versão anterior estável do mesmo ambiente.
3. Reimplantar frontend na versão anterior estável do mesmo ambiente.
4. Restaurar variáveis do snapshot anterior.
5. Rodar smoke (login, chamada, relatórios).
6. Liberar tráfego novamente.

## 8) Comandos locais de validação (referência)

```powershell
# Backend tests (login unidade + chamada + relatórios)
Push-Location backend
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m pytest tests/test_login_unit_validation.py tests/test_pool_log.py tests/test_reports_exclusions.py -q
Pop-Location

# Build frontend
Push-Location frontend
npm run build
Pop-Location
```
