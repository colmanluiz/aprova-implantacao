# Quadro de tarefas — até 17h

Marque com `[x]` neste arquivo e dê push; é o nosso quadro. Cada tarefa tem um critério de "pronto" verificável.

Checkpoints: **13:30** (5 min, o que travou?), **14:30** integração, **15:30** vídeo, **16:00** congelar, **16:45** push final, **17:00** entrega.

## Contratos (valem para a tarde)

- **Processo**: `data/<cidade>/<processo>/run.json` (status, etapas, critérios, gate, métricas; `src/pipeline/tipos.ts`) e `estado.json` (conversa, registros, modo; `src/agents/store.ts`). Quem escreve: motor e ferramentas. Quem lê: painel.
- **Pipeline**: `INSTRUCTIONS/pipeline.json`. Mudou o JSON → `npm run docs` → commitar o `PIPELINE.md` junto (o teste `docs` falha se não).
- **Canal**: `Canal = { enviar(texto) }` em `src/agents/tools.ts`. Mensagens do implantador: `outbox.json` (`src/channel/outbox.ts`).
- **Ações do implantador**: `npm run gate -- <cidade> <processo> <aprovar|ajustar|rejeitar|assumir|devolver|status> [texto]`. O painel chama a mesma CLI.
- **Não apagar** nada em `data/vale-verde/alvara-demo/` (conversa gravada). `pipeline:offline` e `chat --script` sem `--continuar` apagam a pasta do processo que usam.

---

## Feito até 13:00

### Trilha A — Canal e conversa

- [x] **A1 · Setup** — `npm install`, `npm test` verde, `npm run chat` abre o prompt.
- [x] **A2 · Primeira mensagem** — Coletor se apresenta e manda lote numerado de prioridade `bloqueia`.
- [x] **A3 · Registrar respostas** — `resposta`, `origem`, `confianca` na ficha; resposta fora do formato recusada com `schema_invalido`.
- [x] **A4 · Foto de verdade** — `fixtures/insumos/tabela-zoneamento.png` vira dataset 4 zonas × 8 parâmetros, com conferência da foto e confirmação do analista.
- [x] **A5 · Telegram (código)** — `npm run telegram` com foto, PDF, texto e entrega do `outbox`. Falta o teste no celular (ver tarde).
- [x] **A6 · "Não sei"** — `resposta: null` + `pendencia` com dono ("perguntar à Fazenda"); agente não insiste.
- [x] **A7 · Fechamento** — resumo em até 5 linhas e aviso de que o implantador volta (visto em `fixtures/insumos/transcricao-demo.md`).
- [ ] **A8 · opcional · WhatsApp real** — mesma interface `Canal`. Só se sobrar alguém depois das 15:00.

### Trilha B — substituída pelo pipeline validado

B1–B6 deixaram de ser scripts avulsos: viraram etapas, critérios e gates de `INSTRUCTIONS/pipeline.json`, executados por `src/pipeline/motor.ts` (ver "Revisão 13:00" no design).

- [x] **B1 · Setup** — leitura do design.
- [x] **B2 · Validador** — executor `validar` roda o agente com `ler_ficha` e `rodar_cenarios`; critérios: todos passam, nenhuma indeterminada nova, juiz de cobertura.
- [x] **B3 · Fechar o ciclo** — `npm run pipeline:offline` vai de `analisar` até o gate de `homologar` sem LLM; `npm run gate -- vale-verde alvara aprovar` conclui.
- [x] **B4 · Falha de regra vira correção** — cenário falhando abre pergunta ao analista; `ajustar "<id>=<valor>"` corrige a ficha e refaz desde `aplicar` (teste em `motor.test.ts`).
- [x] **B5 · Lacunas do aplicador** — critérios "sem placeholder" e "nenhum resíduo pendente"; resíduo trocado já em `analisar`.
- [x] **B6 · Métricas** — `run.json.metricas` (perguntas, por mensagem/anexo, pendências, cenários, horas evitadas, intervenções), lido pelo painel.

### Trilha C — Painel e entrega

- [x] **C1 · Setup** — `npm test` verde, acesso ao repo. QR code foi para 16:45.
- [x] **C2 · Painel do implantador** — `npm run painel`: visão da prefeitura (seed de 96 processos + `data/`), detalhe com etapas, critérios, gate, conversa, assumir/devolver, ficha, cenários, diff.

---

## Tarde

- [ ] **T1 · Validador ao vivo (até 14:30)** — Rodar o pipeline com LLM até `validar`. A conversa gravada termina com 11 perguntas ainda abertas (6 a confirmar, 5 sem resposta), então `coletar` fica aguardando: acrescentar ao roteiro, numa cópia, as falas que respondem ou pendenciam essas perguntas e rodar num processo novo (`npm run chat -- --script <copia> --processo alvara-t1`), sem tocar em `alvara-demo`. Pronto quando o agente escreve ≥ 10 cenários com campos que existem, o juiz roda (passa, ou reprova com `faltam` e a retentativa corrige) e o gate de homologação aparece no painel. Testar com `MODEL` barato primeiro, rodar uma vez com o padrão.
- [ ] **T2 · Telegram no celular (até 14:30; precisa de um humano)** — Alguém cria o bot no BotFather e põe `TELEGRAM_BOT_TOKEN` no `.env`. `npm run telegram`. Pronto quando, pelo celular: "oi" → lote de perguntas, foto da tabela → dataset na ficha, "Assumir conversa" no painel → mensagem do implantador chega no celular, "Devolver" → agente segue sem repetir pergunta.
- [ ] **T3 · Segundo template (se der, até 15:15)** — Template simples (certidão, numeração predial) pedido à Aprova, ou derivado do alvará cortando etapas. `npm run analyze -- <template>`. Pronto quando a ficha sai coerente com poucas perguntas e `pipeline:offline`/`gate` funcionam com `TEMPLATE=...`, provando que nada é feito à mão para o alvará.
- [ ] **T4 · Vídeo de backup (15:30, 30 min)** — Celular + painel lado a lado, seguindo `demo/ROTEIRO.md`. Pronto quando toca do início ao fim sem depender de API; link no README.
- [ ] **T5 · Revisão de entrega (16:00, 30 min)** — Congelar código. README e `INSTRUCTIONS/` conferidos contra o código (nomes de ferramentas, quem chama o quê, números); `npm run docs` sem diff; `npm run painel:data` para o fallback estático. Ensaio cronometrado < 4 min.
- [ ] **T6 · Push final e QR (16:45)** — `npm test` e `npm run typecheck` verdes, nada de `data/` ou `.env` no git, repo abre em aba anônima, QR do link em `demo/qr.png`. Entrega às 17:00.

## Ordem

```
T1 ──┐
T2 ──┼── 14:30 integração ── T3 (opcional) ── T4 15:30 ── T5 16:00 ── T6 16:45 ── 17:00
```

Se T1 ou T2 não fecharem até 14:30, a demo usa o replay gravado (`alvara-demo`) e o pipeline offline no painel; a história continua inteira.
