# Implantação sem reunião

Hackathon Aprova, 24/10/2026 · Desafio 2: Implantação

> Como coletar e validar as regras de negócio de ~100 processos por prefeitura sem depender de reunião?

Um implantador toca 4 prefeituras ao mesmo tempo, com 12 a 13 secretarias e cerca de 100 processos cada, em 45 a 60 dias. Isso dá 10 processos por dia, e hoje cada processo precisa de uma reunião para levantar as regras. A conta não fecha.

## A ideia em uma frase

O template da Aprova já sabe 85% do formulário. O agente descobre mecanicamente os 15% que variam por cidade, pergunta só isso ao analista da secretaria pelo WhatsApp, no ritmo dele, e valida o resultado com cenários em vez de cliques.

## O que mostramos

Rodado contra o JSON real do **Alvará de Construção** (template `modeload`, 11 etapas, 134 campos, 160 expressões):

| Etapa | Resultado |
|---|---|
| Analisador lê o template | 37 pontos de parametrização em 11 grupos, inclusive um `'Cascavel'` esquecido numa regra de validação |
| Coletor conversa com o analista (simulado em `fixtures/fichas/alvara.vale-verde.json`) | 25 respostas, 12 pendências explícitas (ex.: "Marcos não sabe a taxa; perguntar à Fazenda") |
| Aplicador gera o formulário de Vale Verde | 21 mudanças rastreáveis, `diff.md` com origem de cada decisão |
| Validador roda 15 cenários | Template cru: 12/15. Formulário parametrizado: **15/15** |

```
Cenários: 15 | passaram: 15 | falharam: 0
PASS  c11-recuo-abaixo-do-minimo  Zona ZR2 exige recuo frontal de 4 m; projeto com 3 m deve receber aviso
PASS  c15-obra-na-propria-cidade  Obra em Vale Verde/RS: o formulário não pode acusar cidade errada
```

## Rodar

```bash
npm install
npm test                                   # núcleo contra o template real

# pipeline sem LLM (determinístico)
npm run analyze -- fixtures/templates/alvara-construcao.modeload.json -o data/x/ficha.json
npm run apply   -- fixtures/templates/alvara-construcao.modeload.json fixtures/fichas/alvara.vale-verde.json -o data/vale-verde/alvara/form.json --diff data/vale-verde/alvara/diff.md
npm run validate -- data/vale-verde/alvara/form.json fixtures/cenarios/alvara.cenarios.json

# com os agentes (precisa de ANTHROPIC_API_KEY ou `ant auth login`)
npm run chat                                # você faz o papel do analista no terminal; /anexo foto.jpg manda imagem/PDF
TELEGRAM_BOT_TOKEN=... npx tsx src/channel/telegram.ts   # canal de mensageria real
```

## Arquitetura

```
template.json ─▶ [1 analisador] ─▶ ficha.json ─▶ [2 coletor] ◀──▶ WhatsApp / Telegram (analista)
                                                      │  ▲
                                               anexo  ▼  │ candidatos
                                                 [3 extrator]
                                                      │ ficha fechada
                                                      ▼
                                   [4 aplicador] ─▶ form.<cidade>.json + diff.md
                                                      │
                                   [5 validador] ◀─ cenários ─▶ relatório + perguntas de confirmação
```

- **Agente** (instruções em `INSTRUCTIONS/`): redige perguntas, conduz a conversa, lê anexos, escreve cenários e interpreta relatórios.
- **Código clássico** (`src/core/`): percorre o Formly JSON, aplica respostas de forma determinística e avalia as expressões JavaScript do formulário em sandbox (`node:vm`). Nada de LLM editando JSON.

| Pasta | O que tem |
|---|---|
| `INSTRUCTIONS/` | Uma instrução por agente e o `README.md` que diz quando cada uma é chamada e com quais ferramentas |
| `src/core/` | `template-analyzer`, `expression-evaluator`, `scenario-runner`, `patcher`. Testados contra o template real |
| `src/agents/` | `run-agent` (tool runner do SDK Anthropic), `tools` (ferramentas que embrulham o core), `extrator` (visão/PDF com saída estruturada), `orquestrador` |
| `src/channel/` | `mock-chat` (terminal) e `telegram` (long polling). Interface `Canal` de uma função: troque por Baileys/Evolution para WhatsApp |
| `fixtures/` | Template real do alvará, ficha respondida de exemplo (Vale Verde, dados fictícios), 15 cenários |
| `docs/plans/` | Documento de design |
| `demo/` | Roteiro da apresentação |

## Como as instruções são chamadas

| Instrução | Chamada por | Quando | Ferramentas |
|---|---|---|---|
| `00-orquestrador.md` | `src/agents/orquestrador.ts` (a máquina de estados está em código; o arquivo documenta e governa as transições) | a cada mensagem | `estado_processo`, `avancar_etapa` |
| `01-analisador-template.md` | `analisar_template` | ao abrir o processo | — |
| `02-coletor.md` | `runAgent({agente:"coletor"})` | a cada mensagem do analista | `ler_ficha`, `registrar_resposta`, `enviar_mensagem`, `pedir_extracao` |
| `03-extrator.md` | `extrair()` via `pedir_extracao` | ao chegar anexo | saída estruturada (Zod) |
| `04-aplicador.md` | `runAgent({agente:"aplicador"})` | ficha fechada | `aplicar_ficha`, `gerar_diff` |
| `05-validador.md` | `runAgent({agente:"validador"})` | após aplicar | `ler_ficha`, `rodar_cenarios`, `enviar_mensagem` |

## Métricas que a solução move

| Métrica | Hoje | Com o agente |
|---|---|---|
| Horas de reunião por processo | ~1 h | 0 para processo simples; ≤ 20 min para complexo (só o que o analista não sabe) |
| Rodadas de homologação por formulário | 3 a 5 | 1 (cenários confirmados antes de ir à prefeitura) |
| Processos prontos por implantador por dia | 10 (teórico) | 20+ (o implantador revisa diffs, não faz reuniões) |
| Projetos simultâneos por implantador | 4 | 8 |

## Limites conhecidos

- O avaliador cobre expressões puras sobre `model`. Expressões que dependem de funções globais do app Aprova são marcadas `indeterminado`, não falham.
- O aplicador escreve um JSON no formato Formly da Aprova, mas não publica no configurador. Integração é o próximo passo.
- Dados de Vale Verde são fictícios, para demonstração.
