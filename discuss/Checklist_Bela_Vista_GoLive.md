# Go Live - Espelho Bela Vista + 3 Pilotos Isolados

## Dados da Janela
- Data: 2026-03-29
- Janela: ENCERRADA (espelho + 3 pilotos concluidos)
- Responsável técnico: Jefferson de Melo
- Responsável operação: Jefferson de Melo
- Versão alvo: v.003.00-02zq
- Status geral: PRODUCAO ESTAVEL; MIRROR VALIDADO; 3 PILOTOS IMPLANTADOS E VALIDOS; JANELA ENCERRADA

## Ambientes Obrigatórios
- bela-vista-prod (produção atual, intocável)
- bela-vista-mirror (homologação)
- piloto-parque-municipal
- piloto-sao-matheus
- piloto-vila-joao-xxiii

## Unidades Oficiais por Ambiente
- bela-vista-mirror: Piscina Bela Vista
- piloto-parque-municipal: Parque Municipal
- piloto-sao-matheus: São Matheus
- piloto-vila-joao-xxiii: Vila João XXIII

## Gates de Confirmação (obrigatório)
- [x] Gate 1: confirmação explícita antes do primeiro deploy do espelho (bela-vista-mirror)
- [x] Gate 2: confirmação explícita antes de qualquer ação irreversível (ex.: troca de DNS, promoção final, remoção definitiva)

## Pré-Janela (todos os ambientes novos)
- [x] Confirmar que nenhum serviço novo aponta para db-bela-vista
- [x] Criar banco dedicado por ambiente (sem compartilhamento)
- [x] Definir UNIT_NAME e ENV_NAME por ambiente
- [x] Definir SECRET_KEY exclusivo por backend
- [x] Definir CORS_ORIGINS exclusivo por frontend
- [x] Definir VITE_API_URL correspondente ao backend do ambiente
- [x] Backup da produção atual concluído (db + arquivos runtime)
- [x] Rollback da versão anterior documentado

## Sequência de Implantação (sem tocar produção)
1. [x] Provisionar backend e banco do bela-vista-mirror.
2. [x] Provisionar frontend do bela-vista-mirror com VITE_API_URL do mirror.
3. [x] Validar login/unidade no mirror.
4. [x] Executar validação funcional completa no mirror.
5. [x] Promover correções validadas para produção (master).
6. [x] Replicar configuração para piloto-parque-municipal.
	- [x] Provisionar db-parque-municipal.
	- [x] Provisionar api-parque-municipal com DATABASE_URL dedicado.
	- [x] Provisionar parque-municipal-lista com VITE_API_URL do piloto.
	- [x] Validar /health e /environment do piloto.
	- [x] Validar login e smoke test completo do piloto.
7. [x] Replicar configuração para piloto-sao-matheus.
	- [x] Provisionar db-sao-matheus.
	- [x] Provisionar api-sao-matheus com DATABASE_URL dedicado.
	- [x] Provisionar sao-matheus-lista com VITE_API_URL do piloto.
	- [x] Validar /health e /environment do piloto.
	- [x] Validar login e smoke test completo do piloto.
8. [x] Replicar configuração para piloto-vila-joao-xxiii.
	- [x] Provisionar db-vila-joao-xxiii.
	- [x] Provisionar api-vila-joao-xxiii com DATABASE_URL dedicado.
	- [x] Provisionar vila-joao-xxiii-lista com VITE_API_URL do piloto.
	- [x] Validar URL publica correta de /health e /environment do piloto.
	- [x] Validar login e smoke test completo do piloto.

## Matriz Mínima de Variáveis (por ambiente)
- UNIT_NAME
- VITE_API_URL
- DATABASE_URL
- CORS_ORIGINS
- SECRET_KEY
- ENV_NAME

## Pacote de Configuração - 3 Pilotos (pronto para preenchimento)

### piloto-parque-municipal
- UNIT_NAME: Parque Municipal
- ENV_NAME: piloto-parque-municipal
- DATABASE_URL: DEFINIDO NO RENDER (db-parque-municipal / Neon)
- VITE_API_URL: DEFINIDO (api-parque-municipal.onrender.com)
- CORS_ORIGINS: DEFINIDO NO RENDER (somente frontend do piloto)
- SECRET_KEY: DEFINIDO NO RENDER (exclusivo deste backend)

### piloto-sao-matheus
- UNIT_NAME: São Matheus
- ENV_NAME: piloto-sao-matheus
- DATABASE_URL: DEFINIDO NO RENDER (db-sao-matheus / Neon)
- VITE_API_URL: DEFINIDO (api-sao-matheus.onrender.com)
- CORS_ORIGINS: DEFINIDO NO RENDER (somente frontend do piloto)
- SECRET_KEY: DEFINIDO NO RENDER (exclusivo deste backend)

### piloto-vila-joao-xxiii
- UNIT_NAME: Vila João XXIII
- ENV_NAME: piloto-vila-joao-xxiii
- DATABASE_URL: DEFINIDO NO RENDER (db-vila-joao-xxiii / Neon)
- VITE_API_URL: DEFINIDO (api-joao-xxiii.onrender.com)
- CORS_ORIGINS: DEFINIDO NO RENDER (somente frontend do piloto)
- SECRET_KEY: DEFINIDO NO RENDER (exclusivo deste backend)

## Testes de Aceite por Ambiente (mirror + pilotos)
- [x] Login com unidade correta: permitido
- [x] Login com unidade incorreta: bloqueado com mensagem clara
- [x] Header mostra unidade validada
- [x] Import executa e persiste no banco do próprio ambiente
- [x] Chamada salva e recarrega sem perda
- [x] Turmas carregam sem mistura
- [x] Alunos carregam sem mistura
- [x] Relatórios geram sem regressão

## Critério de Isolamento
- [x] DATABASE_URL único por ambiente
- [x] CORS_ORIGINS sem cross-ambiente indevido
- [x] Sem leitura/escrita cruzada entre bancos
- [x] Logs e evidências anexadas por ambiente

## Registro de Incidente e Correcao (2026-03-31)
- Contexto observado: chamadas feitas no celular em producao (dispositivos Daniela e Jefferson) estavam corretas; ao salvar no desktop, o estado era limpo/desfeito.
- Causa raiz identificada: merge de snapshot de chamada aceitava status vazio do payload de um dispositivo e removia marcacoes existentes do outro dispositivo.
- Correcao aplicada no backend: merge passou a ignorar status vazios recebidos no incoming snapshot, preservando marcacoes existentes.
- Teste automatizado adicionado: `backend/tests/test_attendance_merge_preserves_non_empty.py`.
- Evidencia de teste: `1 passed` no pytest focado para evitar apagamento por snapshot vazio.
- Commit da correcao: `7245a9c` (`'v.003.00-02x' fix: evita limpeza de chamada por snapshot vazio entre dispositivos`).
- Paridade operacional: fix confirmado em producao e tambem publicado no espelho (branch/PR ativa), mantendo regra de espelho fiel.

## Rollback por Ambiente
1. [ ] Pausar tráfego do ambiente afetado.
2. [ ] Reimplantar versão anterior do backend do mesmo ambiente.
3. [ ] Reimplantar versão anterior do frontend do mesmo ambiente.
4. [ ] Restaurar variáveis do snapshot anterior.
5. [ ] Revalidar login, import, chamada e relatórios.
6. [ ] Registrar causa raiz e horário de recuperação.

## Log de Execução
- 16:40 - Pré-check isolamento do espelho concluido - CONCLUIDO - Jefferson de Melo
- 16:56 - Gate 1 aprovado (deploy mirror) - CONCLUIDO - Jefferson de Melo
- 22:38 - Incidente de chamada multi-dispositivo registrado e analisado - CONCLUIDO - Jefferson de Melo
- 22:38 - Correcao anti-limpeza por snapshot vazio implementada e testada - CONCLUIDO - Jefferson de Melo
- 22:38 - Publicacao do fix no espelho (branch/PR) e alinhamento de paridade com producao - CONCLUIDO - Jefferson de Melo
- 16:58 - Deploy bela-vista-mirror - CONCLUIDO - Jefferson de Melo
- 17:05 - Frontend bela-vista-mirror-lista com VITE_API_URL do mirror - CONCLUIDO - Jefferson de Melo
- 17:12 - Validacao de login/unidade no mirror concluida (correta permite, incorreta bloqueia) - CONCLUIDO - Jefferson de Melo
- 17:20 - Testes funcionais mirror concluídos (header/import/chamada/turmas/alunos/relatorios) - CONCLUIDO - Jefferson de Melo
- 17:22 - Gate 2 aprovado (solicitacao explicita para disparar producao) - CONCLUIDO - Jefferson de Melo
- 18:10 - Correcao de vagas em PDF sem popup publicada no rollout (commit be758a3) - CONCLUIDO - Jefferson de Melo
- 18:14 - Promocao para producao concluida (merge commit 28f8ceb em master + push origin/master) - CONCLUIDO - Jefferson de Melo
- 09:42 - Relatorio de vagas ajustado para template detalhado (separacao por professor/turma com total agrupado por horario) e publicado em producao (commit 46cb1cb) - CONCLUIDO - Jefferson de Melo
- 2026-04-04 - Ajuste final dos botões de exportacao de vagas para "Exportar vagas (.xlsx)" e "Exportar vagas (.pdf)" - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Início da fase dos 3 pilotos das novas unidades - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Deploy piloto-parque-municipal (Neon + Render + Vercel) - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Deploy piloto-sao-matheus (Neon + Render + Vercel) - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Deploy piloto-vila-joao-xxiii (Neon + Render + Vercel) - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Validacao backend parque: /health ok e /environment com env_name=piloto-parque-municipal e unit_name=Parque Municipal - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:18 - Validacao backend sao-matheus: /health ok e /environment com env_name=piloto-sao-matheus e unit_name=São Matheus - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:27 - Validacao backend vila (URL correta): /health 200 com body {"status":"ok"}; /environment com env_name=piloto-vila-joao-xxiii e unit_name=Vila João XXIII - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:27 - Validacao frontend vila (URL informada): retorno HTTP 401 (protecao/autenticacao no Vercel), sem evidenciar erro de deploy - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:29 - Validacao final de login/smoke dos 3 pilotos concluida pela operacao - CONCLUIDO - Jefferson de Melo
- 2026-04-05 01:29 - Encerramento da janela - CONCLUIDO - Jefferson de Melo

## Encerramento
- Horário final: 2026-04-05 01:29
- Resultado: JANELA ENCERRADA COM PRODUCAO ESTAVEL, ESPELHO VALIDADO E 3 PILOTOS OPERACIONAIS
- Observações: incidente de limpeza de chamada entre dispositivos tratado com fix backend e teste automatizado; exportacao de vagas em PDF alterada para download direto sem popup e promovida para master; layout de vagas alinhado ao template detalhado com totais agrupados por horario; rotulos finais de exportacao ajustados para "Exportar vagas"; pilotos provisionados em Neon/Render/Vercel com isolamento por DATABASE_URL/SECRET_KEY/CORS e validacao final registrada.