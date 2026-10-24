# Implantação assistida por IA — design

Hackathon Aprova, 24/10/2026. Desafio 2: Implantação.

## O problema

Uma implantação cobre a prefeitura inteira: 12 a 13 secretarias, cerca de 100 processos, prazo de 45 a 60 dias. Cada implantador toca 4 projetos ao mesmo tempo, o que dá cerca de 10 processos por dia. A regra de negócio de cada processo é levantada em reunião, porque a prefeitura não para o balcão para escrever regras. Quando algo chega sem reunião, vem em PDF de decreto, foto de formulário de papel, planilha ou print. O formulário é montado a partir de um template da Aprova e validado na mão, um por vez, em várias rodadas de homologação via WhatsApp, ticket ou reunião semanal.

A conta não fecha: 10 reuniões de 1 hora por dia não cabem em 8 horas.

## O que o template real revela

O JSON do Alvará de Construção (template `modeload`, módulo Obras) é um schema ngx-formly:

| Medida | Valor |
|---|---|
| Etapas (stepper) | 11 |
| Campos | 134 |
| Expressões JS (hide, required, cálculo) | 151 |
| Cards internos de tramitação | 6 |
| Documentos de saída | 3 |

O que varia por prefeitura é um subconjunto pequeno e identificável mecanicamente:

- placeholders de setor e cidade (`planejamento_modeload`, `cidade: modeload`);
- listas de opções: zoneamentos, tipos de uso, atividades, tipos de logradouro, materiais;
- dataset de parâmetros urbanísticos por zona (recuos, TO, IA, TP, pavimentos);
- documentos exigidos e as condições em que são obrigatórios;
- textos legais (declaração de veracidade, base legal);
- taxas, pareceres e cards internos;
- resíduos de outra cidade (há um `'Cascavel'` hardcoded na validação de município).

Dos 134 campos, 15 a 20 pontos de decisão variam. O resto é estrutura.

## Tese

A coleta não precisa de reunião aberta. Ela pode ser uma **entrevista por diferença**, derivada do template: o agente sabe o que o template assume e pergunta só o que muda na cidade. E a validação não precisa de clique: como as regras são JavaScript sobre `model`, dá para avaliar visibilidade e obrigatoriedade em sandbox e confirmar regras de negócio com o analista por cenários concretos no WhatsApp.

## Arquitetura

Pipeline de cinco peças. Cada peça tem uma instrução em `INSTRUCTIONS/` e código clássico em `src/core/`. O agente decide e conversa; o código analisa, aplica e testa.

```
template.json ──▶ [1 analisador] ──▶ ficha.json (perguntas) ──▶ [2 coletor + 3 extrator] ◀──▶ WhatsApp (analista)
                                                                          │
                                                                          ▼ ficha respondida
                                             [4 aplicador] ──▶ form.<cidade>.json + diff.md
                                                                          │
                                             [5 validador] ◀── cenários ──┘ ──▶ relatório + perguntas de confirmação
                                                                          │
                                                                  painel do implantador
```

### 1. Analisador de template
Entrada: JSON do template. Saída: `ficha.json` com os pontos de parametrização, cada um com tipo (`opcoes`, `dataset`, `setor`, `texto`, `documento`, `taxa`, `residuo`), os campos que afeta e uma pergunta em linguagem de servidor. Código: caminhada na árvore Formly. Agente: só redige as perguntas e agrupa por tema.

### 2. Coletor
Conversa no canal do cliente. Envia perguntas em lotes de 3 a 5, aceita texto, foto, PDF e planilha, registra respostas na ficha com origem e confiança, e para quando a ficha fecha. Nunca inventa regra: o que não souber vira pendência. Estado persistido por processo.

### 3. Extrator
Recebe um anexo (foto, PDF, planilha, print) e devolve candidatos de resposta para a ficha: lista de zonas, parâmetros por zona, documentos exigidos, texto de base legal. Cada candidato com trecho de origem e confiança. O coletor confirma com o analista o que vier abaixo do limiar.

### 4. Aplicador
Código puro. Ficha respondida + template = formulário parametrizado. Substitui opções, dataset, setor, textos; remove etapas não usadas; ajusta obrigatoriedade de documentos. Gera `diff.md` legível para revisão do implantador. Não passa por LLM: determinístico e auditável.

### 5. Validador
Avaliador de expressões Formly em sandbox (`node:vm`): dado um `model`, calcula para cada campo visível/oculto, obrigatório/opcional, valores computados. Cenários em JSON (`model` + expectativas). O agente gera cenários a partir da ficha; o código roda e reporta. Cenários cuja expectativa depende de regra de negócio viram perguntas de confirmação ao analista: "Pessoa jurídica sem contrato social: bloquear?".

### Painel do implantador
Lista de secretarias e processos com status (não iniciado, coletando, aguardando prefeitura, validado, pronto para homologação), pendências abertas e métricas.

## Métricas que a solução move

| Métrica | Hoje | Alvo da demo |
|---|---|---|
| Horas de reunião por processo | ~1h | 0 para processo simples, ≤ 20 min para complexo |
| Rodadas de homologação por formulário | 3 a 5 | 1 |
| Processos prontos por implantador por dia | ~10 (teórico, não fecha) | 20+ |
| Projetos simultâneos por implantador | 4 | 8 |

## Fluxo de dados e estado

- `fixtures/templates/*.json`: templates Aprova (entrada).
- `data/<cidade>/<processo>/ficha.json`: ficha com perguntas, respostas, origem e confiança.
- `data/<cidade>/<processo>/form.json` e `diff.md`: saída do aplicador.
- `data/<cidade>/<processo>/cenarios.json` e `relatorio.json`: saída do validador.
- Estado da conversa por `(cidade, processo, telefone)` em JSON no disco. Sem banco no hackathon.

## Erros e limites

- Anexo ilegível: o extrator devolve zero candidatos e o coletor pede foto melhor ou pergunta direto.
- Resposta ambígua: o coletor reformula como múltipla escolha com as opções do template.
- Expressão que não avalia (função global do app Aprova): o avaliador marca `indeterminado` em vez de falhar, e o relatório lista.
- Toda escrita de configuração passa pelo implantador antes de ir à prefeitura. O agente não publica nada.

## Testes

- Unitários do analisador contra o JSON real do alvará: encontra setor, 7 listas de opções, dataset de zoneamento, 11 uploads, o resíduo `Cascavel`.
- Avaliador: cenários conhecidos do alvará (retificação esconde/mostra campos, procurador exige procuração, área final soma).
- Aplicador: round-trip ficha → form → analisador não encontra mais placeholders.

## Fora de escopo (hoje)

Integração com o configurador da Aprova, autenticação, multiusuário, histórico de versões, WhatsApp oficial (Cloud API). Canal real via Telegram ou Baileys se houver tempo; senão, simulador de chat.

## Entrega

Repositório com `INSTRUCTIONS/`, `README.md`, `demo/ROTEIRO.md`, vídeo de backup. Entrega por QR code até 17h.

---

## Revisão 13:00 (24/10) — de orquestrador imperativo a pipeline validado

### O que mudou

De manhã, a orquestração era uma máquina de estados escrita à mão em `src/agents/orquestrador.ts`: um `switch` por etapa que chamava o agente certo e decidia quando avançar. Funcionava no caminho feliz, mas cada caso de erro (agente que inventa cenário, extrator que lê errado, analista que some) virava mais um `if`, e a regra de transição só existia no código.

Trocamos por um **pipeline declarativo e validado**:

- `INSTRUCTIONS/pipeline.json` declara as etapas (`analisar`, `coletar`, `extrair` dentro de `coletar`, `aplicar`, `validar`, `homologar`), se cada uma é código ou agente, e os critérios de saída de cada uma, com tentativas e rota de falha.
- `INSTRUCTIONS/PIPELINE.md` é gerado desse JSON (`npm run docs`); um teste falha se os dois divergirem. A banca lê a mesma coisa que o motor executa.
- `src/pipeline/motor.ts` executa: roda a etapa, avalia os critérios em ordem, e decide avançar, esperar, tentar de novo ou abrir gate. `orquestrador.ts` ficou só como porta de entrada do canal.
- `npm run gate` é a CLI do implantador (`aprovar`, `ajustar`, `rejeitar`, `assumir`, `devolver`, `status`); o painel chama a mesma CLI.
- `npm run pipeline:offline` roda tudo sem LLM, com a ficha e os cenários de `fixtures/`, até o gate de homologação.

### Por quê

O modelo veio de um motor Run/Step que o time já conhece em produção. Trouxemos as ideias que resolvem os problemas que apareceram de manhã:

| Ideia | Como ficou aqui | Problema que resolve |
|---|---|---|
| Snapshot imutável do run | template e `pipeline.json` copiados para `data/<cidade>/<processo>/snapshot/` ao abrir | mudar o pipeline durante o dia não quebra processo já aberto |
| Critérios nomeados | `src/pipeline/criterios.ts`, um por nome do JSON; resultado `passou`, `aguardando`, `falhou`, `nao_avaliado` | "pronto" deixa de ser opinião do agente; esperar o analista não é erro |
| Orçamento de tentativas | `tentativas` por critério; a retentativa volta para a mesma conversa do agente só com o motivo | o agente corrige o que falhou sem loop infinito; código determinístico tem 0 |
| Rota ao falhar | `ao_falhar`: `analista`, `implantador` ou `parar` | falha vira pergunta em linguagem de cenário ou decisão do implantador, não exceção |
| Grounding | o extrator só entrega candidato com trecho literal encontrado no documento; foto passa por segunda leitura independente | leitura errada de anexo não entra na ficha como certa |
| Gates que se descrevem | `{para, tipo, instrucao, resumo, acoes, contexto}` em `run.json` | painel, CLI e WhatsApp mostram o mesmo gate sem código específico |
| Juiz com falha fechada | critério "cenários cobrem a ficha" avaliado por LLM; saída ilegível reprova | o validador não declara pronto com metade da ficha sem cenário |

### O que veio junto

- **Extrator endurecido**: PDF transcrito antes de interpretar; confiança de foto limitada a 0,7 até a conferência (0,9 se confere tudo, 0,4 se não); candidato a confirmar fica em 0,79 até o analista confirmar por mensagem.
- **Contrato de formato** (`src/core/respostas.ts`): `registrar_resposta` recusa resposta fora do formato do tipo; a primeira recusa não conta como falha.
- **Resíduo de outra cidade** (`'Cascavel'`) é trocado pelo nome da cidade já na etapa `analisar`; nunca é perguntado à prefeitura. O analisador deixou de marcar `"Não permitido"` como resíduo: a ficha agora tem 36 pontos, não 37.
- **Painel do implantador** (`npm run painel`, `src/painel/`, `painel/`), lendo `run.json` e `estado.json`.
- **Modo humano**: o implantador assume e devolve a conversa; mensagens dele saem por `outbox.json`; o Coletor recebe nota do que foi trocado; cada assumida conta como intervenção.
- **Conversa roteirizada** (`fixtures/insumos/conversa-demo.txt`) e replay pelo `npm run chat -- --script`, com transcrição gravada.
- **`MODEL`** por variável de ambiente, para testar com modelo barato.

### O que não mudou

As cinco peças, a tese e o fluxo de dados acima continuam valendo. O aplicador continua código puro; a instrução `04-aplicador.md` agora descreve os critérios dessa etapa em vez de um agente. A contagem de expressões do template, medida pelo código (`resumoTemplate`), é 160, não 151.
