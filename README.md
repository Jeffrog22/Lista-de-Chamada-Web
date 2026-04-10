# Lista-de-Chamada-Web

Scaffold mínimo para transformar o projeto "Lista-de-Chamada" em uma versão web.

Siga as instruções em docs/TUTORIAL.md (ou neste README) para rodar localmente.

## Deploy com Supabase (produção)

Para usar banco persistente (Supabase) no backend Render, siga o guia completo em `docs/SUPABASE_RENDER_PASSO_A_PASSO.md`.
Esse fluxo configura `DATABASE_URL` e `CORS_ORIGINS`, valida a conexão e confirma os headers CORS para o frontend da Vercel.

## Clima real no calendário

Para sair do fallback e usar clima real:

1. Copie `backend/.env.example` para `backend/.env`.
2. Preencha `CLIMATEMPO_TOKEN` e `CLIMATEMPO_BASE_URL`.
3. (Opcional) Ajuste `CLIMATEMPO_LAT` e `CLIMATEMPO_LON`.
4. Reinicie o backend.

Sem essas variáveis, o endpoint `/weather` retorna fallback (`26` e `Parcialmente Nublado`).

## Redeploy limpo (Render + Vercel)

Use este fluxo sempre que houver rollback, force-push ou ajuste sensível de persistência:

1. Confirmar `master` sincronizado com `origin/master`.
2. No Render, serviço oficial `lista-de-chamada-web`, acionar novo deploy (Clear build cache quando necessário).
3. Validar backend após deploy: `GET /health` deve retornar `{"status":"ok"}`.
4. Validar endpoint de exclusões no backend publicado (`/exclusions`) com credenciais admin quando aplicável.
5. No Vercel, acionar redeploy da build mais recente do frontend.
6. No frontend publicado, validar fluxo de exclusões (listar, restaurar, excluir) e confirmar ausência de fallback indevido.

Observação: não usar ambiente mirror em produção, salvo quando explicitamente solicitado para testes isolados.

## Validar importação CSV

Sempre que quiser verificar se o template oficial `data/templates/import-data.template.csv` continua compatível, execute o script de teste:

1. No diretório raiz rodar `cd backend && .venv/Scripts/python.exe scripts/run_import_test.py` (ou adapte para o Python ativo). Isso faz upload do CSV e imprime os contadores de unidades, classes e alunos atualizados.
2. O resultado deve ser `status 200` e valores como `classes_updated: 201`, o que confirma que o pipeline de importação funciona com o template atual.

Esse comando também é útil para garantir que a base persistente reflita o conteúdo do CSV sempre que ele for alterado.

## QA completo em um comando

Para executar a validação principal (backend + E2E smoke + E2E relatórios) de uma vez, rode na raiz do projeto:

1. `powershell -ExecutionPolicy Bypass -File .\scripts\qa_all.ps1`
2. (Windows / clique duplo) `.\scripts\qa_all.bat`

O script para na primeira falha e exibe a etapa que quebrou.

## Rollback rápido para base estável

Se uma nova solicitação falhar em produção e for necessário retornar para a base estável `v.003.00-00`, use:

1. `powershell -ExecutionPolicy Bypass -File .\scripts\rollback_v003_00_00.ps1`
2. (Windows / clique duplo) `.\scripts\rollback_v003_00_00.bat`

O script executa:

1. `git fetch --tags origin`
2. validação de existência da tag `v.003.00-00`
3. checkout de `master`
4. `git reset --hard v.003.00-00`
5. `git push --force-with-lease origin master`

Use apenas quando quiser realmente voltar o `master` para essa base.

## CI (GitHub Actions)

O pipeline de QA está em [.github/workflows/qa.yml](.github/workflows/qa.yml) e roda automaticamente em push/PR para `master`/`main`.

Ele é dividido em jobs paralelos (`backend` e `build_frontend`), com o job `e2e` executando após ambos concluírem com sucesso:

- build do frontend (`npm run build`)
- testes backend (`pytest`)
- E2E smoke (`npm run test:e2e:smoke`)
- E2E relatórios (`npm run test:e2e:reports`)

Se algum E2E falhar no CI, os artifacts do Playwright (`frontend/test-results` e `frontend/playwright-report`) são anexados automaticamente para facilitar diagnóstico.

