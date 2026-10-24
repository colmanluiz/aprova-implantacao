# Quadro de tarefas — até 17h

Três trilhas em paralelo. Cada tarefa tem um critério de "pronto" verificável. Marque com `[x]` neste arquivo e dê push; é o nosso quadro.

Checkpoints: **13:30** (5 min, o que travou?), **14:30** integração, **15:30** vídeo, **16:00** congelar, **16:45** push final, **17:00** entrega.

## Contratos entre as trilhas (acertar antes de começar)

- **Estado por processo**: `data/<cidade>/<processo>/estado.json` no formato de `src/agents/store.ts` (`etapa`, `mensagens_enviadas`, `perguntas_feitas`, `historico`). Quem lê: painel (C). Quem escreve: ferramentas (A/B). Não mudar o formato sem avisar.
- **Dados do painel**: `painel/data.json` gerado por `scripts/painel-data.ts` a partir de `data/` + `fixtures/seed/processos.json`. Formato em `painel/README.md` (C escreve, B lê para as métricas).
- **Canal**: interface `Canal = { enviar(texto) }` em `src/agents/tools.ts`. Telegram, mock e um futuro WhatsApp implementam só isso.
- **Instruções**: cada pessoa edita só os arquivos de `INSTRUCTIONS/` da sua trilha. A: `02`, `03`. B: `00`, `04`, `05`. C: `README.md`, `01`.

---

## Trilha A — Canal e conversa

Objetivo: às 14:30, uma conversa real no celular, com foto, do "oi" até a ficha fechar.

- [ ] **A1 · Setup (15 min)** — `git clone`, `npm install`, `npm test` verde, `.env` com `ANTHROPIC_API_KEY`. Pronto quando `npm run chat` abre o prompt `[analista]`.
- [ ] **A2 · Primeira mensagem (20 min)** — No mock-chat, aperte Enter com o prompt vazio (inicia o processo). Pronto quando o Coletor se apresenta em 2 linhas e manda o primeiro lote de 3 a 5 perguntas numeradas, de prioridade `bloqueia`, sem jargão. Se vier longo ou técnico, ajuste `INSTRUCTIONS/02-coletor.md` e repita. Arquivos: `02-coletor.md`.
- [ ] **A3 · Registrar respostas (20 min)** — Responda 3 perguntas em texto corrido ("o setor é a SEPLAN, divisão de projetos"). Pronto quando `data/vale-verde/alvara/ficha.json` mostra `resposta`, `origem` e `confianca` preenchidos e a próxima mensagem do agente avança para o lote seguinte. Verifique que resposta vaga vira múltipla escolha, não chute.
- [ ] **A4 · Foto de verdade (30 min)** — Monte uma tabela de zoneamento numa planilha (4 zonas × 8 parâmetros, pode copiar de `scripts/ficha-exemplo.ts`), tire print ou foto. `/anexo foto.jpg`. Pronto quando o Coletor confirma em uma linha o que leu e a ficha recebe o `dataset` com `origem` apontando para o anexo e confiança ≥ 0,8. Se vier errado, ajuste `INSTRUCTIONS/03-extrator.md`. Teste também um PDF.
- [ ] **A5 · Telegram (30 min)** — BotFather → token → `.env`. `npx tsx src/channel/telegram.ts`. Repita A2–A4 pelo celular. Pronto quando a foto tirada pelo celular vira dataset na ficha. Arquivo: `src/channel/telegram.ts` (só se precisar).
- [ ] **A6 · "Não sei" (15 min)** — Responda "não sei a taxa, isso é com a Fazenda". Pronto quando a ficha registra `resposta: null` + `pendencia`, e o agente não inventa valor nem insiste.
- [ ] **A7 · Fechamento (15 min)** — Com a ficha fechada (B3 pronto), confira que o agente resume em até 5 linhas e avisa que o implantador vai montar o formulário. Depende de B3.
- [ ] **A8 · opcional · WhatsApp real** — Só se alguém já usou Baileys ou Evolution API. Mesma interface `Canal`. Não começar antes das 15:00 se A5 não estiver pronto.

## Trilha B — Núcleo, orquestração e validação

Objetivo: o ciclo fecha sozinho: ficha fechada → formulário → cenários → pergunta de confirmação no canal.

- [ ] **B1 · Setup (15 min)** — Igual a A1. Ler `docs/plans/2026-10-24-implantacao-design.md` e `src/agents/orquestrador.ts`.
- [ ] **B2 · Validador ao vivo (40 min)** — Criar `scripts/validar-agente.ts` que roda `runAgent({ agente: "validador", tools: ferramentas(ctx, canalConsole).validador })` sobre `data/vale-verde/alvara/form.json`. Pronto quando o agente gera ≥ 10 cenários com campos que existem, `rodar_cenarios` grava `cenarios.json` e `relatorio.json`, e o agente resume o resultado. Ajustar `INSTRUCTIONS/05-validador.md` (dar a ele a lista de `key`s do formulário via `ler_ficha` ou nova ferramenta `listar_campos`, se ele inventar nomes).
- [ ] **B3 · Fechar o ciclo (40 min)** — Script `scripts/fechar-ficha.ts` que copia `fixtures/fichas/alvara.vale-verde.json` para `data/vale-verde/alvara/ficha.json` e preenche as pendências com respostas plausíveis, para forçar `ficha_fechada`. Rodar `tratarMensagem` uma vez. Pronto quando: `form.json` e `diff.md` gravados, cenários rodados, e uma pergunta de confirmação em linguagem de cenário sai pelo canal. Arquivos: `src/agents/orquestrador.ts`, `04-aplicador.md`, `05-validador.md`.
- [ ] **B4 · Falha de regra vira correção (30 min)** — Simule o analista respondendo "não" a uma pergunta de confirmação. Pronto quando a ficha é corrigida, o aplicador reaplica e o cenário passa. Pode ser via mock-chat.
- [ ] **B5 · Lacunas do aplicador (30 min)** — `texto` (declaração legal), `saida` (documentos finais), `etapas` removidas. Teste de round-trip: aplicar e re-analisar não acha placeholder nem pendência resolvida. Arquivo: `src/core/patcher.ts`, `src/core/template-analyzer.test.ts`.
- [ ] **B6 · Métricas (20 min)** — Função `metricas(ctx)` em `src/agents/store.ts`: perguntas feitas, respondidas por mensagem vs por anexo, pendências, cenários rodados/passando, horas de reunião evitadas (1 h por processo fechado sem reunião; 20 min se houve pendência escalada). Gravar em `data/<cidade>/<processo>/metricas.json`. Pronto quando C2 consegue ler. Combinar o formato com C.
- [ ] **B7 · Segundo processo (30 min, se der)** — Pedir à Aprova um template simples (certidão, numeração predial). Rodar `npm run analyze`. Pronto quando a ficha sai coerente com poucas perguntas, provando que o analisador não é feito à mão para o alvará. Sem template novo, derivar um do alvará cortando etapas.

## Trilha C — Painel, pitch e entrega

Objetivo: a banca entende em 4 minutos e o repositório passa o checklist.

- [ ] **C1 · Setup e acesso (15 min)** — `npm test` verde. Tornar o repo público (ou adicionar colaboradores). Gerar QR code do link e salvar em `demo/qr.png`. Pronto quando o link abre em aba anônima.
- [ ] **C2 · Painel do implantador (75 min)** — `painel/index.html` estático + `scripts/painel-data.ts` que junta `fixtures/seed/processos.json` (12 secretarias, 96 processos, já no repo) com o que existe em `data/`. Mostra: por secretaria, processos com status (não iniciado, coletando, aguardando prefeitura, validado, pronto para homologação), pendências abertas, e no topo as 4 métricas. Pronto quando o alvará de Vale Verde aparece como "pronto para homologação" com os números reais e o resto vem do seed. Sem framework; HTML + um `fetch('data.json')`.
- [ ] **C3 · Slides (30 min)** — 5 telas seguindo `demo/ROTEIRO.md`: a conta que não fecha, a tese (85% / 15%), o que o template revelou (134 campos → 37 perguntas, o `Cascavel`), 12/15 → 15/15, métricas. Pronto quando ensaiado em menos de 4 minutos.
- [ ] **C4 · Vídeo de backup (15:30, 30 min)** — Gravar tela + celular: conversa, foto, diff, validate cru e parametrizado, painel. Subir em `demo/` ou link no README. Pronto quando toca do início ao fim sem depender de API.
- [ ] **C5 · Revisão de entrega (16:00, 30 min)** — README atualizado com o que de fato roda; `INSTRUCTIONS/README.md` conferido contra o código (nome das ferramentas, quando chama). Ensaio cronometrado com a demo real.
- [ ] **C6 · Push final (16:45)** — `git status` limpo, `npm test` verde, link e QR na mão. Entrega às 17:00.

## Ordem das dependências

```
A1 ─ A2 ─ A3 ─ A4 ─ A5 ─ A6 ─ A7
                               ▲
B1 ─ B2 ─ B3 ─ B4 ─ B5 ─ B6 ───┘  (A7 depende de B3; C2 depende de B6 só para os números reais)
                          │
C1 ─ C2 ───────────────── ┘ ─ C3 ─ C4 ─ C5 ─ C6
```

Integração 14:30: A5 + B3 juntos no celular. Se B3 atrasar, a demo mostra conversa (A) e a parte determinística (apply/validate) separadas; ainda conta a história.
