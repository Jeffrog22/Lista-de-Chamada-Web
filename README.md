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

