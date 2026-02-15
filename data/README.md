# Data Directory

## Estrutura

- `data/` (runtime ativo do backend)
  - `baseChamada.json`
  - `baseJustificativas.json`
  - `excludedStudents.json`
  - `logPiscina.xlsx`
- `data/templates/` (modelos para importação/migração SQL)
  - `import-data.template.csv`
  - `chamadaBelaVista.template.xlsx`
  - `baseChamada.template.json`
  - `baseJustificativas.template.json`
  - `excludedStudents.template.json`
- `data/archive/` (artefatos legados)
  - `relatorioChamada.legacy.xlsx`

## Regras práticas

1. Somente os 4 arquivos da raiz `data/` são usados em runtime pelo backend atual.
2. `templates/` deve ser versionado para servir de referência de layout.
3. `archive/` guarda histórico e não deve ser usado como fonte de produção.
4. Na migração SQL, os arquivos JSON/XLSX da raiz devem virar tabelas e podem ser aposentados.

## Importação SQL (CSV)

O template principal é `templates/import-data.template.csv`.

Colunas esperadas pelo endpoint `/api/import-data`:

- `unidade`
- `turma_codigo`
- `horario`
- `professor`
- `nivel`
- `capacidade`
- `dias_semana`
- `aluno_nome`
- `aluno_turma`
- `whatsapp`
- `data_nascimento`
- `data_atest`
- `categoria`
- `genero`
- `parq`
- `atestado`
- `faixa_etaria`
