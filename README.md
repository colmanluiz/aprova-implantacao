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
| Coleta (ficha de exemplo de Vale Verde, fictícia) | 25 respostas, 11 pendências explícitas (ex.: "taxa: perguntar à Fazenda") |
| Aplicador (código) | 21 mudanças rastreáveis, `diff.md` com a origem de cada decisão |
| Validador | 15 cenários. Template cru: **12/15**. Formulário de Vale Verde: **15/15** |
| Pipeline sem LLM | analisar → coletar → aplicar → validar → gate de homologação → aprovar → `concluido` |
| Segundo processo: Solicitação de Férias (RH) | 3 etapas, 28 campos, **10 pontos**; carrega um setor de outra prefeitura (`csimplantacao_implantacaoad`) que o analisador acha e o aplicador troca. Cenários base: 8/8 no template cru |
| Catálogo real | 117 modelos do Estúdio analisados em lote (seção abaixo) |
| Testes | **106** (`npm test`), `npm run typecheck` limpo |

### Rodada ao vivo, de ponta a ponta (`data/vale-verde/alvara-demo`, `MODEL=claude-sonnet-5-5`)

| Etapa | O que aconteceu |
|---|---|
| Conversa | 16 falas do analista: 14 em `conversa-demo.txt` (com uma foto da tabela de zoneamento) e 2 no "dia seguinte" em `conversa-demo-fechamento.txt`. Transcrições: `fixtures/insumos/transcricao-demo-antes.md` e `transcricao-demo-fechamento.md` |
| `analisar` | 36 perguntas; o resíduo `'Cascavel'` já sai trocado por "Vale Verde" |
| `coletar` + `extrair` | 34 respondidas com confiança 1,0: 31 por mensagem e 3 pela foto (lista de zonas e a tabela 4 zonas × 8 parâmetros, lidas, conferidas contra a imagem e confirmadas pelo analista). 2 pendências com dono: taxa → Fazenda; atividades → planilha na segunda |
| `aplicar` | passou: nenhum placeholder, nenhum resíduo pendente |
| `validar` | o validador partiu dos 15 cenários base, escreveu mais 15: **30/30** passam, nenhuma expressão indeterminada nova, juiz LLM "cenários cobrem a ficha" aprovou |
| `homologar` | gate aberto para o implantador (`aguardando_implantador`) |
| Métricas | 19 mensagens enviadas, 16 recebidas, 35 perguntas feitas, 0,67 h de reunião evitada (houve uma pergunta de confirmação ao analista numa tentativa anterior) |

```bash
npm run gate -- vale-verde alvara-demo status
npm run gate -- vale-verde alvara-demo reexecutar validar   # roda a validação de novo com o validador ao vivo
npm run gate -- vale-verde alvara-demo aprovar
```

## Antes e depois da conversa

A conversa foi redesenhada depois de uma avaliação de UX (`docs/avaliacao-conversa.md`, roteiro em `docs/roteiro-conversa-proposto.md`). Contagem só das mensagens da Aprova:

| | Antes (`transcricao-demo-antes.md`) | Depois (`transcricao-marlene.md` + `-sessao2.md`) |
|---|---|---|
| Mensagens | 15 | 21 |
| Perguntas ("?") | 49 (máx. 6, média 3,3) | 28 (máx. 2, média 1,3) |
| Mensagens com mais de 2 perguntas | 9 | 0 |
| Palavras por mensagem | 108 em média (máx. 159) | ~45 em média (máx. 74) |
| Palavras de sistema | 18 | 0 |
| Ficha ao final | — | 30/36 respondidas + 6 pendências com dono (1 "é com o Paulo", 5 para o implantador), 0 sem resposta |

Princípios:

- **Começa aberto**: "quando alguém chega querendo o alvará, o que acontece, do balcão até o documento sair?"; o agente devolve o que entendeu como lista numerada de passos.
- **Modelo primeiro**: em seguida manda o resumo e o PDF do que já está pronto ("Olha como já está pronto…") e pergunta "o que é diferente aí?". As diferenças viram um **plano de ação** estruturado (operações validadas e aplicadas por código, `src/core/plano.ts`, `montar.ts`), confirmado numa mensagem só; depois vêm setor, fotos, taxa, pacote padrão e fechamento.
- **Foto antes de pergunta**: pede cedo a foto do requerimento de papel e da tabela da lei; lê de lá e pergunta só o que ficou apagado ou diferente.
- **No máximo 2 perguntas por mensagem, do mesmo assunto**, com progresso por assunto ("já ficou: secretaria, documentos…") e o "pacote padrão" (o que costuma ser igual em toda cidade) confirmado de uma vez no fim.
- **O que a analista não deveria ver vira pendência do implantador**, não pergunta; "é com o Paulo" vira pendência com dono.
- **Respeita o balcão**: "tenho balcão" encerra com o que já ficou e o que falta; a sessão seguinte retoma dali e fecha com o próximo passo.

Imposto em código, não só na instrução: toda saída para o analista (mensagens, PDF, gates, lembretes) passa por uma função só, `src/agents/envio.ts`, que recusa mensagem com mais de 2 "?", mais de 70 palavras com pergunta, mais de 160 sem pergunta, ou palavra de sistema (`src/core/mensagens.ts`); as perguntas de gate ao analista passam pela mesma checagem.

## Catálogo real (`forms_modelo/`)

129 modelos JSON raspados do Estúdio da Aprova, com `forms_modelo/_indice.csv` (112 ativos, 12 rascunhos vazios; 117 analisáveis).

> Em 117 processos reais do Estúdio, **75% dos campos já vêm prontos do modelo** e sobram em média **14 perguntas por processo** (mediana 11, 5 bloqueantes). 28 modelos ainda apontam para setores de outra prefeitura; 6 têm literais de outra cidade em regra de validação (Cascavel em 6, João Pessoa em 1).

| Totais | Mediana por modelo | Maior |
|---|---|---|
| 553 etapas, 4336 campos, 3830 expressões, 1641 pontos (1003 bloqueiam) | 4 etapas, 27 campos, 18 expressões, 11 pontos | 133 pontos (Compras e Licitação) |

```bash
npm run analyze:lote          # regrava docs/forms-modelo-analise.md e .json
```

Rodar o lote endureceu o analisador: setores de outra prefeitura (`*_umuaramapr`, `*_implantacaoad`) agora são detectados e trocados pelo aplicador, referências a dataset são reconhecidas, e os falsos positivos de resíduo caíram de 27 para 7, todos verdadeiros.

## Como rodar

```bash
npm install
npm test                      # 106 testes, sem API
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
npm run chat                                          # você é o analista; abre o menu de processos; /anexo foto.png; /estado; /sair
npm run chat -- --script fixtures/insumos/conversa-demo.txt --processo alvara-demo --transcricao saida.md
                                                      # replay da conversa da demo; sem --continuar apaga data/vale-verde/alvara-demo
npm run chat -- --script fixtures/insumos/conversa-demo-fechamento.txt --processo alvara-demo --continuar
                                                      # "dia seguinte": fecha a ficha e o pipeline segue até homologar
npm run chat -- --script fixtures/insumos/conversa-marlene.txt --processo alvara-marlene
npm run chat -- --script fixtures/insumos/conversa-marlene-sessao2.txt --processo alvara-marlene --continuar
                                                      # conversa redesenhada (Dona Marlene, protocolo de Obras), em duas sessões
env CIDADE=vale-verde npm run telegram                # canal real (celular); token em TELEGRAM_BOT_TOKEN no .env; sem PROCESSO abre o menu
```

**Menu de processos no chat** (`src/channel/roteador.ts`, terminal e Telegram): `/start`, `/processos`, `menu`, `trocar` ou `outro processo` listam 10 processos escolhidos; o analista também pode digitar o nome de qualquer um dos 112 ativos, ou `/processo <nome>` direto; `/ajuda` explica. O menu abre com "Sobre qual serviço vamos conversar?". Cada processo tem a sua pasta `data/<cidade>/<slug>/`; trocar não apaga nada e voltar retoma de onde parou ("Voltando ao Habite-se: faltam 4 perguntas"). Estado do chat em `data/<cidade>/.canais/<tipo>-<chat_id>.json`.

**Peças determinísticas isoladas**:

```bash
npm run analyze  -- fixtures/templates/alvara-construcao.modeload.json -o /tmp/ficha.json
npm run apply    -- fixtures/templates/alvara-construcao.modeload.json fixtures/fichas/alvara.vale-verde.json -o /tmp/form.json --diff /tmp/diff.md
npm run validate -- fixtures/templates/alvara-construcao.modeload.json fixtures/cenarios/alvara.cenarios.json   # 12/15
npm run validate -- /tmp/form.json fixtures/cenarios/alvara.cenarios.json                                      # 15/15
npm run analyze  -- forms_modelo/solicitacao_de_ferias__678172ef8989870008b47fde.json > /dev/null                                                    # Férias: 10 pontos
npm run validate -- forms_modelo/solicitacao_de_ferias__678172ef8989870008b47fde.json fixtures/cenarios/solicitacao_de_ferias__678172ef8989870008b47fde.cenarios.json   # 8/8
npm run docs     # regenera INSTRUCTIONS/PIPELINE.md a partir de pipeline.json
```

Variáveis de ambiente (`.env` é lido por `chat`, `telegram`, `painel` e `gate`):

| Variável | Para quê | Padrão |
|---|---|---|
| `ANTHROPIC_API_KEY` | agentes, extrator e juiz | perfil do `ant auth login` |
| `MODEL` | modelo de todos os agentes e do juiz; use um modelo barato para testar | `claude-opus-5-5` |
| `TELEGRAM_BOT_TOKEN` | `npm run telegram` | — |
| `CIDADE`, `PROCESSO`, `TEMPLATE` | cidade e processo do Telegram; sem `PROCESSO`, o analista escolhe no menu (`TEMPLATE` também no `gate`) | `vale-verde`, menu, template do alvará |
| `PAINEL_PORT` | porta do painel | `4310` |
| `APROVA_DATA` | pasta de dados (útil para rodar sem tocar em `data/`) | `data` |

## Arquitetura

O processo é um **pipeline validado**: a definição está em [`INSTRUCTIONS/pipeline.json`](INSTRUCTIONS/pipeline.json), a tabela legível em [`INSTRUCTIONS/PIPELINE.md`](INSTRUCTIONS/PIPELINE.md) (gerada; um teste falha se ficar desatualizada) e o motor em `src/pipeline/motor.ts`.

| # | Etapa | Quem faz | Critérios de saída (em ordem) | Ao esgotar tentativas |
|---|---|---|---|---|
| 1 | `analisar` | código (`analisarTemplate`) | ficha tem perguntas bloqueantes; nenhum placeholder sem pergunta | gate do implantador |
| 2 | `coletar` | agente Coletor, no canal | analista decidiu sobre o modelo; plano de ação confirmado; nenhuma pergunta em aberto (resposta com confiança ≥ 0,8 ou pendência explícita) | analista / implantador / analista |
| 3 | `extrair` (dentro de `coletar`, a cada anexo) | agente Extrator + prova em código | todo candidato cita trecho e confiança | pergunta ao analista |
| 4 | `aplicar` | código (`aplicarFicha`, `gerarDiff`) | sem placeholder `modeload`; nenhum resíduo de outra cidade pendente | gate do implantador |
| 5 | `validar` | agente Validador escreve cenários; código os executa | todos os cenários passam; nenhuma expressão indeterminada nova; cenários cobrem a ficha (juiz LLM) | analista / implantador / implantador |
| 6 | `conferir` | código escolhe até 3 cenários que passam, em linguagem de balcão; gate do analista | analista conferiu os casos | gate do implantador |
| 7 | `homologar` | gate do implantador | implantador aprovou | processo para |

Como o motor decide:

- **Critérios nomeados**, avaliados em ordem (`src/pipeline/criterios.ts`). Cada um devolve `passou`, `aguardando` (etapa fica aberta sem gastar tentativa, ex.: analista ainda não respondeu), `falhou` ou `nao_avaliado` (ex.: juiz sem LLM).
- **Orçamento de tentativas** por critério. Falhou com tentativa sobrando: o agente da etapa roda de novo **na mesma conversa**, recebendo só `[pipeline] O critério de saída "…" falhou: …`. Etapa de código tem 0 tentativas.
- **Rota de falha** (`ao_falhar`): `analista` (pergunta em linguagem de cenário pelo canal; "sim" aprova), `implantador` (gate em `run.json` e `pendencias.md`) ou `parar`.
- **Falhas de cenário classificadas** (`classificarFalhas`): `precondicao` (o cenário esqueceu de preencher a condição) e `calculado` (o cenário escreveu num campo calculado) voltam ao validador na retentativa; `tecnica` (campo inexistente, expressão indeterminada) vai ao implantador; só `regra` chega ao analista, e só se a pergunta for uma regra de balcão de até 240 caracteres sem nome de campo; senão, vai ao implantador.
- **Reexecutar**: `npm run gate -- <cidade> <processo> reexecutar <etapa>` reabre a etapa e as seguintes e roda de novo com os agentes.
- **Gates que se explicam sozinhos**: `{para, tipo, instrucao, resumo, acoes: [aprovar, ajustar, rejeitar], contexto}`. `ajustar "residuo-36=Vale Verde"` corrige a ficha (mesmo contrato de formato do `registrar_resposta`) e refaz desde `aplicar`.
- **Snapshot imutável**: ao abrir o processo, template e `pipeline.json` são copiados para `data/<cidade>/<processo>/snapshot/`. Mudar o pipeline não afeta processo aberto.
- **Grounding do Extrator** (`src/agents/extrator.ts`): PDF e texto são transcritos na íntegra antes; todo candidato precisa citar um `trecho` literal, e o código procura o trecho no documento — sem achar, o candidato é descartado. Foto nunca sai com confiança acima de 0,7; uma segunda leitura independente confere cada valor (zona por zona): tudo "sim" → 0,9 verificado; qualquer "não"/"ilegível" → 0,4 e o Coletor pergunta só aquelas linhas. Valor que precisa de confirmação fica travado em 0,79 até o analista confirmar por mensagem.
- **Contrato de formato**: `registrar_resposta` recusa (`schema_invalido`) resposta fora do formato do tipo (`src/core/respostas.ts`); nada fora do formato chega ao aplicador. Setor exige o nome do setor e recusa placeholder (`modeload`, `*_implantacaoad`); o Coletor nunca aceita "como está" para setor ou tabela por zona.
- **Cobrança de prazo** (`src/pipeline/cobranca.ts`): lembrete depois de 4 h parado, aviso de ritmo e escalonamento, só em horário comercial. Prazo pelo chat (`/prazo 29/10`) ou `npm run gate -- <cidade> <processo> prazo AAAA-MM-DD`. No Telegram o agente também manda o PDF e, para áudio, pede o texto.
- **Modo humano**: o implantador assume a conversa pelo painel ou `npm run gate -- <cidade> <processo> assumir`. O agente pausa, nada é avaliado, as mensagens do analista ficam no histórico. O que o implantador escreve no painel vai para `outbox.json` e o processo do canal (Telegram ou terminal) entrega. Em `devolver`, o Coletor recebe uma nota com o que foi trocado. Cada assumida conta como intervenção humana.
- **Nenhum LLM edita o JSON do formulário.** O avaliador de expressões Formly roda em sandbox (`node:vm`).

| Pasta | O que tem |
|---|---|
| `INSTRUCTIONS/` | `pipeline.json`, `PIPELINE.md` (gerado), `00-orquestrador.md` (regras do motor) e uma instrução por agente |
| `src/pipeline/` | `motor` (laço, gates, modo humano), `criterios`, `juiz`, `run` (snapshot, `run.json`, métricas), `definicao`, `docs`, `offline` |
| `src/agents/` | `run-agent` (tool runner do SDK), `tools`, `extrator`, `orquestrador` (traduz "chegou mensagem" em passos do motor), `store` |
| `src/core/` | `template-analyzer`, `patcher`, `expression-evaluator`, `scenario-runner`, `respostas` (contrato de formato) |
| `src/channel/` | `mock-chat` (terminal e replay), `telegram` (long polling), `roteador` (menu de processos), `outbox` (mensagens do implantador) |
| `src/painel/`, `painel/` | servidor `node:http` sem dependências e front HTML/JS puro (ver `painel/README.md`) |
| `scripts/` | `gate`, `rodar-pipeline-offline`, `analisar-lote`, `painel-data`, `gerar-pipeline-md`, `ficha-exemplo`, `canal-tabela-zoneamento` |
| `forms_modelo/` | 129 modelos reais do Estúdio + `_indice.csv`; análise em lote em `docs/forms-modelo-analise.md` |
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
| `05-validador.md` | executor `validar` (`motor.ts`) → `runAgent({agente: "validador"})`; conversa guardada em `conversas/validar.json` | depois de aplicar, a cada retentativa, `ajustar` ou `reexecutar validar` | `ler_ficha`, `rodar_cenarios` |
| rubrica do juiz (`pipeline.json`) | `julgarCobertura` (`src/pipeline/juiz.ts`) | critério "cenários cobrem a ficha" | saída estruturada `{pass, faltam}`; saída inválida reprova |

Sem LLM (`pipeline:offline`), Coletor e Validador não rodam: a ficha vem de `fixtures/fichas/` e os cenários de `fixtures/cenarios/`; o juiz fica `nao_avaliado`.

## Métricas

| Métrica | Hoje | Com o pipeline |
|---|---|---|
| Horas de reunião por processo | ~1 h | 0 se a coleta fecha sem gate para o analista; ~20 min (0,67 h evitada) se precisou de um |
| Rodadas de homologação por formulário | 3 a 5 | 1 (cenários executados e confirmados antes de ir à prefeitura) |
| Processos prontos por implantador por dia | 10 (teórico, não cabe) | 20+ (o implantador revisa diffs e gates, não faz reunião) |
| Projetos simultâneos por implantador | 4 | 8 |

O que é medido de verdade, por processo, em `run.json.metricas`: perguntas feitas, respondidas por mensagem e por anexo, pendências abertas, cenários rodados/passando, horas de reunião evitadas, intervenções humanas. O painel soma isso na visão da prefeitura. Na rodada ao vivo (`alvara-demo`): 31 por mensagem, 3 por foto, 2 pendências, 30/30 cenários, 0,67 h evitada. No pipeline offline: 21 por mensagem, 3 por anexo, 11 pendências, 15/15, 1 h evitada.

## Limites conhecidos

- Fluxo unificado (merge com a branch `parametrizacao-wpp`) testado ao vivo uma vez: `fixtures/insumos/transcricao-merge-smoke.md`, 31/36 respondidas, 5 pendências, chegou a `validar` com pergunta ao analista. A etapa `conferir` ainda não foi vista ao vivo depois das correções.

- O avaliador cobre expressões puras sobre `model`. Expressões que dependem de funções globais do app Aprova viram `indeterminado` e não falham; o critério só barra as **novas**.
- O aplicador gera o JSON no formato do configurador, mas não publica. Importar é o próximo passo.
- Canal real hoje é Telegram. WhatsApp é trocar o adaptador (Baileys/Evolution/Cloud API) pela mesma interface `Canal = { enviar(texto) }`.
- Planilha só entra como texto (CSV); `.xlsx` não é lido.
- O juiz de cobertura depende de LLM; sem ele o critério fica `nao_avaliado` e não bloqueia.
- A conversa varia de uma rodada para outra: a mesma fala da Marlene já fechou 30/36 e, noutra rodada, 25/36. As transcrições guardadas são a referência.
- Ponta a ponta com agente: alvará. Férias tem análise e cenários base; os outros 115 modelos só passaram pela análise em lote. Dados de Vale Verde são fictícios.
- `ferramentas().aplicador` e `ferramentas().orquestrador` em `src/agents/tools.ts` ainda existem, mas o pipeline não os usa.

## Créditos

Da branch do Arthur (`parametrizacao-wpp`): fluxo modelo primeiro, plano de ação, etapa `conferir` e cobrança de prazo. Da `main`: abertura com entrevista aberta, limites de mensagem e classificação de falhas de cenário.

## Contratos de dados

- Por processo, em `data/<cidade>/<processo>/`: `run.json` (status, etapas, critérios, gate, métricas; tipos em `src/pipeline/tipos.ts`), `estado.json` (histórico da conversa, registros por turno, modo, intervenções; `src/agents/store.ts`), `ficha.json` (`Ficha` em `src/core/types.ts`), `form.json`, `diff.md`, `cenarios.json`, `relatorio.json`, `pendencias.md`, `extracao.json`, `outbox.json` e `canal.json` (`src/channel/outbox.ts`), `snapshot/`, `conversas/`.
- Formato das respostas por tipo de pergunta: `src/core/respostas.ts` e a tabela em `INSTRUCTIONS/02-coletor.md`.
- API e arquivos lidos pelo painel: `painel/README.md`.
- `data/` não vai para o git.
