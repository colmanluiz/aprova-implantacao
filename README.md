# Implantação sem reunião

Hackathon Aprova, 24/10/2026 · Desafio 2: Implantação

## O problema

Um implantador toca 4 prefeituras ao mesmo tempo. Cada uma tem 12 a 13 secretarias e cerca de 100 processos, com prazo de 45 a 60 dias.
4 × 100 processos ÷ ~40 dias úteis (60 dias corridos) = **10 processos por dia**, e hoje cada um precisa de uma reunião de ~1 hora para levantar as regras.
10 reuniões de 1 hora não cabem num dia de 8 horas. A conta não fecha.

## A tese

O template da Aprova já sabe quase todo o formulário. O código descobre mecanicamente o pouco que varia por cidade; um agente pergunta só isso ao analista da secretaria pelo WhatsApp, no ritmo dele, aceitando foto e PDF; e o resultado é validado com cenários executados em código, não com cliques. Cada passo tem critérios de saída verificáveis, e o que o agente não resolve vira uma decisão explícita do analista ou do implantador.

## O que roda hoje

Contra o JSON real do **Alvará de Construção** (template `modeload`):

| Peça | Resultado |
|---|---|
| Template | 11 etapas, 134 campos, 160 expressões JS |
| Analisador (código) | **36 pontos de parametrização** em 11 grupos (22 bloqueiam), inclusive um `'Cascavel'` esquecido numa regra de validação, que já sai trocado pelo nome da cidade |
| Coleta (ficha de exemplo de Vale Verde, fictícia) | 25 respostas, 12 pendências explícitas (ex.: "taxa: perguntar à Fazenda") |
| Aplicador (código) | 21 mudanças rastreáveis, `diff.md` com a origem de cada decisão |
| Validador | 15 cenários. Template cru: **12/15**. Formulário de Vale Verde: **15/15** |
| Pipeline sem LLM | analisar → coletar → aplicar → validar → gate de homologação → aprovar → `concluido` |
| Conversa roteirizada com o agente real | 14 falas do analista e uma foto da tabela de zoneamento (4 zonas × 8 parâmetros lidos e confirmados). Ao fim: 23 respondidas, 6 a confirmar, 2 pendências com dono, 5 sem resposta; o agente resume e se despede (`fixtures/insumos/transcricao-demo.md`) |
| Testes | **60** (`npm test`), `npm run typecheck` limpo |

> A ficha de exemplo (`fixtures/fichas/alvara.vale-verde.json`) foi gerada antes de o analisador deixar de marcar `"Não permitido"` como resíduo de cidade; por isso ela tem 37 perguntas e o analisador atual gera 36. Não muda nenhum número acima.

## Como rodar

```bash
npm install
npm test                      # 60 testes, sem API
npm run typecheck
```

**Pipeline completo sem LLM** (plano B da demo; grava em `data/vale-verde/alvara/` e apaga o que havia lá):

```bash
npm run pipeline:offline                              # para no gate de homologação
npm run gate -- vale-verde alvara status              # etapas e critérios
npm run gate -- vale-verde alvara aprovar             # implantador aprova → concluido
```

**Painel do implantador** (lê `data/` a cada 2 s):

```bash
npm run painel                # http://localhost:4310
npm run painel:data           # grava painel/data.json para o modo estático (?static=1)
```

**Conversa com os agentes** (precisa de `ANTHROPIC_API_KEY` no `.env` ou `ant auth login`):

```bash
npm run chat                                          # você é o analista; /anexo foto.png manda arquivo; /estado; /sair
npm run chat -- --script fixtures/insumos/conversa-demo.txt --processo alvara-demo --transcricao saida.md
                                                      # replay da conversa da demo; sem --continuar apaga data/vale-verde/alvara-demo
TELEGRAM_BOT_TOKEN=... npm run telegram               # canal real (celular); ou ponha o token no .env
```

**Peças determinísticas isoladas**:

```bash
npm run analyze  -- fixtures/templates/alvara-construcao.modeload.json -o /tmp/ficha.json
npm run apply    -- fixtures/templates/alvara-construcao.modeload.json fixtures/fichas/alvara.vale-verde.json -o /tmp/form.json --diff /tmp/diff.md
npm run validate -- fixtures/templates/alvara-construcao.modeload.json fixtures/cenarios/alvara.cenarios.json   # 12/15
npm run validate -- /tmp/form.json fixtures/cenarios/alvara.cenarios.json                                      # 15/15
npm run docs     # regenera INSTRUCTIONS/PIPELINE.md a partir de pipeline.json
```

Variáveis de ambiente (`.env` é lido por `chat`, `telegram`, `painel` e `gate`):

| Variável | Para quê | Padrão |
|---|---|---|
| `ANTHROPIC_API_KEY` | agentes, extrator e juiz | perfil do `ant auth login` |
| `MODEL` | modelo de todos os agentes e do juiz; use um modelo barato para testar | `claude-opus-5-5` |
| `TELEGRAM_BOT_TOKEN` | `npm run telegram` | — |
| `CIDADE`, `PROCESSO`, `TEMPLATE` | processo do Telegram (`TEMPLATE` também no `gate`) | `vale-verde`, `alvara`, template do alvará |
| `PAINEL_PORT` | porta do painel | `4310` |
| `APROVA_DATA` | pasta de dados (útil para rodar sem tocar em `data/`) | `data` |

## Arquitetura

O processo é um **pipeline validado**: a definição está em [`INSTRUCTIONS/pipeline.json`](INSTRUCTIONS/pipeline.json), a tabela legível em [`INSTRUCTIONS/PIPELINE.md`](INSTRUCTIONS/PIPELINE.md) (gerada; um teste falha se ficar desatualizada) e o motor em `src/pipeline/motor.ts`.

| # | Etapa | Quem faz | Critérios de saída (em ordem) | Ao esgotar tentativas |
|---|---|---|---|---|
| 1 | `analisar` | código (`analisarTemplate`) | ficha tem perguntas bloqueantes; nenhum placeholder sem pergunta | gate do implantador |
| 2 | `coletar` | agente Coletor, no canal | nenhuma pergunta em aberto (resposta com confiança ≥ 0,8 ou pendência explícita) | pergunta ao analista |
| 3 | `extrair` (dentro de `coletar`, a cada anexo) | agente Extrator + prova em código | todo candidato cita trecho e confiança | pergunta ao analista |
| 4 | `aplicar` | código (`aplicarFicha`, `gerarDiff`) | sem placeholder `modeload`; nenhum resíduo de outra cidade pendente | gate do implantador |
| 5 | `validar` | agente Validador escreve cenários; código os executa | todos os cenários passam; nenhuma expressão indeterminada nova; cenários cobrem a ficha (juiz LLM) | analista / implantador / implantador |
| 6 | `homologar` | gate do implantador | implantador aprovou | processo para |

Como o motor decide:

- **Critérios nomeados**, avaliados em ordem (`src/pipeline/criterios.ts`). Cada um devolve `passou`, `aguardando` (etapa fica aberta sem gastar tentativa, ex.: analista ainda não respondeu), `falhou` ou `nao_avaliado` (ex.: juiz sem LLM).
- **Orçamento de tentativas** por critério. Falhou com tentativa sobrando: o agente da etapa roda de novo **na mesma conversa**, recebendo só `[pipeline] O critério de saída "…" falhou: …`. Etapa de código tem 0 tentativas.
- **Rota de falha** (`ao_falhar`): `analista` (pergunta em linguagem de cenário pelo canal; "sim" aprova), `implantador` (gate em `run.json` e `pendencias.md`) ou `parar`.
- **Gates que se explicam sozinhos**: `{para, tipo, instrucao, resumo, acoes: [aprovar, ajustar, rejeitar], contexto}`. `ajustar "residuo-36=Vale Verde"` corrige a ficha (mesmo contrato de formato do `registrar_resposta`) e refaz desde `aplicar`.
- **Snapshot imutável**: ao abrir o processo, template e `pipeline.json` são copiados para `data/<cidade>/<processo>/snapshot/`. Mudar o pipeline não afeta processo aberto.
- **Grounding do Extrator** (`src/agents/extrator.ts`): PDF e texto são transcritos na íntegra antes; todo candidato precisa citar um `trecho` literal, e o código procura o trecho no documento — sem achar, o candidato é descartado. Foto nunca sai com confiança acima de 0,7; uma segunda leitura independente confere cada valor (zona por zona): tudo "sim" → 0,9 verificado; qualquer "não"/"ilegível" → 0,4 e o Coletor pergunta só aquelas linhas. Valor que precisa de confirmação fica travado em 0,79 até o analista confirmar por mensagem.
- **Contrato de formato**: `registrar_resposta` recusa (`schema_invalido`) resposta fora do formato do tipo (`src/core/respostas.ts`); nada fora do formato chega ao aplicador.
- **Modo humano**: o implantador assume a conversa pelo painel ou `npm run gate -- <cidade> <processo> assumir`. O agente pausa, nada é avaliado, as mensagens do analista ficam no histórico. O que o implantador escreve no painel vai para `outbox.json` e o processo do canal (Telegram ou terminal) entrega. Em `devolver`, o Coletor recebe uma nota com o que foi trocado. Cada assumida conta como intervenção humana.
- **Nenhum LLM edita o JSON do formulário.** O avaliador de expressões Formly roda em sandbox (`node:vm`).

| Pasta | O que tem |
|---|---|
| `INSTRUCTIONS/` | `pipeline.json`, `PIPELINE.md` (gerado), `00-orquestrador.md` (regras do motor) e uma instrução por agente |
| `src/pipeline/` | `motor` (laço, gates, modo humano), `criterios`, `juiz`, `run` (snapshot, `run.json`, métricas), `definicao`, `docs`, `offline` |
| `src/agents/` | `run-agent` (tool runner do SDK), `tools`, `extrator`, `orquestrador` (traduz "chegou mensagem" em passos do motor), `store` |
| `src/core/` | `template-analyzer`, `patcher`, `expression-evaluator`, `scenario-runner`, `respostas` (contrato de formato) |
| `src/channel/` | `mock-chat` (terminal e replay), `telegram` (long polling), `outbox` (mensagens do implantador) |
| `src/painel/`, `painel/` | servidor `node:http` sem dependências e front HTML/JS puro (ver `painel/README.md`) |
| `scripts/` | `gate`, `rodar-pipeline-offline`, `painel-data`, `gerar-pipeline-md`, `ficha-exemplo`, `canal-tabela-zoneamento` |
| `fixtures/` | template real, ficha de exemplo, 15 cenários, seed de 96 processos, roteiro e transcrição da conversa da demo, foto da tabela |
| `docs/`, `demo/` | design, quadro de tarefas, roteiro da apresentação |

## Como as instruções são chamadas

`src/agents/instructions.ts` é o único lugar que lê `INSTRUCTIONS/`: monta o `system` com o arquivo do agente mais as "Regras comuns" de `INSTRUCTIONS/README.md`.

| Instrução | Quem chama (código) | Quando | Ferramentas / saída |
|---|---|---|---|
| `pipeline.json` | `carregarPipeline` → `motor.ts` (via snapshot) | ao abrir o processo e a cada passo | — |
| `00-orquestrador.md` | ninguém carrega como prompt: documenta as regras que `motor.ts` aplica | — | — |
| `01-analisador-template.md` | ninguém carrega como prompt: `analisar` é código (`analisarTemplate`); o arquivo é a referência do formato da ficha | uma vez, ao abrir | — |
| `02-coletor.md` | `rodarColetor` (`motor.ts`) → `runAgent({agente: "coletor"})` | cada mensagem do analista em `coletar`, e retentativa | `ler_ficha`, `registrar_resposta`, `enviar_mensagem`, `pedir_extracao` |
| `03-extrator.md` | `pedir_extracao` → `lerAnexo` (`motor.ts`, critérios de `extrair`) → `extrair()` → `propor()` | cada anexo | sem ferramentas; saída estruturada Zod. Transcrição de PDF e conferência de foto usam prompts fixos em `extrator.ts` |
| `04-aplicador.md` | ninguém carrega como prompt: `aplicar` é código (`aplicarFicha`, `gerarDiff`) | coleta fechada | — |
| `05-validador.md` | executor `validar` (`motor.ts`) → `runAgent({agente: "validador"})`; conversa guardada em `conversas/validar.json` | depois de aplicar, a cada retentativa ou `ajustar` | `ler_ficha`, `rodar_cenarios` |
| rubrica do juiz (`pipeline.json`) | `julgarCobertura` (`src/pipeline/juiz.ts`) | critério "cenários cobrem a ficha" | saída estruturada `{pass, faltam}`; saída inválida reprova |

Sem LLM (`pipeline:offline`), Coletor e Validador não rodam: a ficha vem de `fixtures/fichas/` e os cenários de `fixtures/cenarios/`; o juiz fica `nao_avaliado`.

## Métricas

| Métrica | Hoje | Com o pipeline |
|---|---|---|
| Horas de reunião por processo | ~1 h | 0 se a coleta fecha sem gate para o analista; ~20 min (0,67 h evitada) se precisou de um |
| Rodadas de homologação por formulário | 3 a 5 | 1 (cenários executados e confirmados antes de ir à prefeitura) |
| Processos prontos por implantador por dia | 10 (teórico, não cabe) | 20+ (o implantador revisa diffs e gates, não faz reunião) |
| Projetos simultâneos por implantador | 4 | 8 |

O que é medido de verdade, por processo, em `run.json.metricas`: perguntas feitas, respondidas por mensagem e por anexo, pendências abertas, cenários rodados/passando, horas de reunião evitadas, intervenções humanas. O painel soma isso na visão da prefeitura. No pipeline offline do alvará: 21 por mensagem, 3 por anexo, 12 pendências, 15/15 cenários, 1 h evitada.

## Limites conhecidos

- O avaliador cobre expressões puras sobre `model`. Expressões que dependem de funções globais do app Aprova viram `indeterminado` e não falham; o critério só barra as **novas**.
- O aplicador gera o JSON no formato do configurador, mas não publica. Importar é o próximo passo.
- Canal real hoje é Telegram. WhatsApp é trocar o adaptador (Baileys/Evolution/Cloud API) pela mesma interface `Canal = { enviar(texto) }`.
- Planilha só entra como texto (CSV); `.xlsx` não é lido.
- Na transcrição da demo, o Coletor ainda perguntou o nome da cidade; a instrução `02-coletor.md` foi corrigida depois, sem nova rodada gravada.
- O juiz de cobertura depende de LLM; sem ele o critério fica `nao_avaliado` e não bloqueia.
- Um template testado (alvará). Dados de Vale Verde são fictícios.
- `ferramentas().aplicador` e `ferramentas().orquestrador` em `src/agents/tools.ts` ainda existem, mas o pipeline não os usa.

## Contratos de dados

- Por processo, em `data/<cidade>/<processo>/`: `run.json` (status, etapas, critérios, gate, métricas; tipos em `src/pipeline/tipos.ts`), `estado.json` (histórico da conversa, registros por turno, modo, intervenções; `src/agents/store.ts`), `ficha.json` (`Ficha` em `src/core/types.ts`), `form.json`, `diff.md`, `cenarios.json`, `relatorio.json`, `pendencias.md`, `extracao.json`, `outbox.json` e `canal.json` (`src/channel/outbox.ts`), `snapshot/`, `conversas/`.
- Formato das respostas por tipo de pergunta: `src/core/respostas.ts` e a tabela em `INSTRUCTIONS/02-coletor.md`.
- API e arquivos lidos pelo painel: `painel/README.md`.
- `data/` não vai para o git.
