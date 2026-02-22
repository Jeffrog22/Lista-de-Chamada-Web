# Lista-de-Chamada-Web

Scaffold mínimo para transformar o projeto "Lista-de-Chamada" em uma versão web.

Siga as instruções em docs/TUTORIAL.md (ou neste README) para rodar localmente.

## Clima real no calendário

Para sair do fallback e usar clima real:

1. Copie `backend/.env.example` para `backend/.env`.
2. Preencha `CLIMATEMPO_TOKEN` e `CLIMATEMPO_BASE_URL`.
3. (Opcional) Ajuste `CLIMATEMPO_LAT` e `CLIMATEMPO_LON`.
4. Reinicie o backend.

Sem essas variáveis, o endpoint `/weather` retorna fallback (`26` e `Parcialmente Nublado`).

## Validar importação CSV

Sempre que quiser verificar se o template oficial `data/templates/import-data.template.csv` continua compatível, execute o script de teste:

1. No diretório raiz rodar `cd backend && .venv/Scripts/python.exe scripts/run_import_test.py` (ou adapte para o Python ativo). Isso faz upload do CSV e imprime os contadores de unidades, classes e alunos atualizados.
2. O resultado deve ser `status 200` e valores como `classes_updated: 201`, o que confirma que o pipeline de importação funciona com o template atual.

Esse comando também é útil para garantir que a base persistente reflita o conteúdo do CSV sempre que ele for alterado.

