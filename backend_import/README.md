# Backend Import (Multi-Unit)

Backend FastAPI focado em importacao via CSV.

## Rodar local

```bash
cd backend_import
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoint

`POST /api/import-data` (multipart/form-data com arquivo CSV)

## CSV esperado

Cabecalhos obrigatorios:
- unidade
- turma_codigo
- horario
- professor
- nivel
- capacidade
- dias_semana
- aluno_nome
- aluno_turma
- whatsapp
- data_nascimento
- data_atest
- categoria
- genero
- parq
- atestado

Exemplo (CSV):

unidade,turma_codigo,horario,professor,nivel,capacidade,dias_semana,aluno_nome,aluno_turma,whatsapp,data_nascimento,data_atest,categoria,genero,parq,atestado
Piscina Parque Municipal,Terca e Quinta,14:00,Joao Silva,Iniciante,8,"Terca;Quinta",Ana Souza,Terca e Quinta,(11) 99999-9999,10/05/2010,15/01/2025,Juvenil II,Feminino,Nao,true
