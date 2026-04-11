# Rollout Sync Engine - Bela Vista First

## Objetivo
Ativar o Sync Engine colaborativo da tela de chamada com risco controlado, priorizando a unidade Bela Vista e bloqueando promocao para pilotos sem validacao explicita.

## Feature Flag
- Flag frontend: `VITE_ATTENDANCE_SYNC_ENGINE`
- Valores:
- `1`: habilita polling colaborativo + refresh de exclusoes no ciclo de sync.
- `0`: desabilita polling colaborativo (fluxo manual continua disponivel).

## Escopo da ativacao
- Fase 1 (obrigatoria): Lista de Chamada - unidade Bela Vista.
- Fase 2 (condicional): pilotos somente apos checklist completo e aprovacao explicita.

## Passo a passo operacional
1. Deploy backend e frontend com codigo novo, mantendo `VITE_ATTENDANCE_SYNC_ENGINE=0`.
2. Validar healthcheck e build em producao sem ativar polling.
3. Ativar `VITE_ATTENDANCE_SYNC_ENGINE=1` apenas para o frontend da operacao Bela Vista.
4. Executar smoke dirigido com professores da Bela Vista (2 abas + 2 dispositivos).
5. Coletar evidencias por 24h:
- convergencia entre abas,
- ausencia de regressao de merge,
- consistencia de exclusoes,
- ausencia de perda de historico.
6. Manter pilotos bloqueados ate aprovacao explicita.

## Checklist tecnico de aceite (Bela Vista)
- [ ] Edicao de celula (Presente/Falta/Justificado) entra em autosave imediatamente.
- [ ] Botao "Sincronizar agora" continua funcional como fallback manual.
- [ ] Em duas abas da mesma turma, atualizacao converge em ~1-2 segundos.
- [ ] Exclusao feita em uma aba aparece na outra sem reload completo.
- [ ] Historico de chamada permanece preservado apos exclusao/restore.
- [ ] Sem flicker perceptivel na grade durante polling.
- [ ] Sem reset de selecao (turma/horario/professor/data) durante rehidratacao incremental.

## Observabilidade minima recomendada
- Capturar latencia de polling no cliente (janela movel de ultimas 20 amostras).
- Monitorar volume de chamadas para:
- `POST /attendance-log/force-sync`
- `GET /exclusions`
- Alertar se erro de rede > 5% em janela de 15 minutos.

## Criterio de promocao para pilotos
Promover apenas se TODOS os itens abaixo forem verdadeiros:
- checklist tecnico Bela Vista completo,
- nenhuma perda de historico confirmada,
- taxa de erro dentro do limite,
- aprovacao explicita do responsavel operacional.
