# Contexto da equipe: Implantação sem reunião

Para nós três, antes de subir. É o que a gente construiu, por que decidiu assim, o que aprendeu e quem fala o quê. Denso de propósito: lê no celular na fila.

Deck publicado: https://claude.ai/artifact/VsXj9SUwVTWQFpWuMhQDtQ

---

## 1. O problema: a conta que não fecha

- Um implantador toca **4 prefeituras** ao mesmo tempo.
- Cada uma tem **12 a 13 secretarias** e uns **100 processos**, com prazo de **45 a 60 dias**.
- 4 × 100 ÷ ~40 dias úteis = **10 processos por dia**.
- Cada processo pede uma reunião de ~1 hora para levantar as regras. **10 horas de reunião num dia de 8.**
- Quando a informação chega sem reunião, vem em PDF de decreto, foto de papel, planilha ou print.
- O formulário é clonado de um modelo e homologado na mão, em **3 a 5 rodadas**.

## 2. A tese

O modelo da Aprova já sabe a maior parte do formulário. O código descobre o pedaço que muda de cidade para cidade. O agente pergunta só isso ao analista da secretaria, pelo WhatsApp, no ritmo do balcão. E a validação é feita com cenários executados em código, não com cliques.

Sobre o número: a hipótese da manhã era "85% já vem pronto". O que medimos foi **81% no alvará** e **75% no catálogo inteiro**. No pitch, falamos 75% (três quartos), porque é o que está no repositório.

## 3. O que o modelo real revelou

**Alvará de Construção** (modelo `modeload`, o mais pesado):

| | |
|---|---|
| Etapas | 11 |
| Campos | 134 |
| Regras em JavaScript | 160 |
| Pontos que mudam por cidade | 36, em 11 grupos (22 bloqueiam) |
| Resíduo de outra cidade | 1 "Cascavel" numa regra de validação |

**Catálogo real**: 129 modelos do Estúdio, 117 com conteúdo.

- 75% dos campos já vêm prontos do modelo.
- 14 perguntas por processo em média (mediana 11).
- 28 modelos apontam para setor de outra prefeitura.
- 6 têm nome de outra cidade dentro de regra de validação.

## 4. Arquitetura: 7 etapas

Nomes e regras de saída exatamente como em `INSTRUCTIONS/PIPELINE.md` do fluxo unificado.

| # | Etapa | Quem faz | Regras de saída | Se falhar |
|---|---|---|---|---|
| 1 | Analisar template | código | ficha tem perguntas bloqueantes · nenhum placeholder sem pergunta | gate do implantador |
| 2 | Coletar respostas | agente Coletor | analista decidiu sobre o modelo · plano de ação confirmado · nenhuma pergunta em aberto | pergunta ao analista · gate do implantador · pergunta ao analista |
| 3 | Ler anexos (dentro de Coletar) | agente Extrator | todo candidato cita trecho e confiança | pergunta ao analista |
| 4 | Gerar formulário | código | formulário sem placeholder de modelo · nenhum resíduo de outra cidade pendente | gate do implantador |
| 5 | Validar com cenários | agente Validador + código + juiz | todos os cenários passam · nenhuma expressão indeterminada nova · cenários cobrem a ficha (juiz LLM) | pergunta ao analista · gate do implantador · gate do implantador |
| 6 | Conferir com a prefeitura | código + gate do analista | analista conferiu os casos | gate do implantador |
| 7 | Homologar | código + gate do implantador | implantador aprovou | para o processo |

Regra geral do motor: cada etapa só termina quando todas as regras passam, em ordem. "Aguardando" (o analista ainda não respondeu) não gasta tentativa. "Falhou" gasta uma tentativa e o agente refaz na mesma conversa, recebendo só o motivo. Sem tentativas, segue a rota de falha.

## 5. Coletar, em detalhe

**Modelo primeiro.** O agente manda um resumo curto e um PDF do formulário que a Aprova já tem e pergunta: "atende como está ou vocês querem mudar algumas coisas?". O que a prefeitura quer diferente vira um **plano de ação**: itens como "tirar a ART" ou "matrícula só para imóvel rural", cada um uma operação estruturada (remover campo, exigir quando, trocar opções...). O analista confirma, o **código aplica** e confere cada item. Depois o agente pergunta só o que o modelo não tem como saber: setor e tabelas da cidade.

**A conversa, do jeito do balcão** (redesenho das 15h, com a Dona Marlene):

- Uma pergunta aberta: "do balcão até o documento sair, o que acontece?". O agente devolve o que entendeu em passos.
- Foto antes de pergunta: pede cedo o requerimento de papel e a tabela da lei.
- No máximo 2 perguntas por mensagem, do mesmo assunto.
- Progresso por assunto, nunca "faltam 31 perguntas".
- "Isso é com o Paulo" vira pendência com dono.
- "Tenho balcão" encerra com o que ficou e o que falta.
- Imposto em código: a ferramenta de envio recusa mais de 2 "?", mensagem longa ou palavra de sistema.

Status honesto: a conversa da Marlene foi gravada na `main`. "Modelo primeiro", plano de ação e "Conferir com a prefeitura" vêm da branch do colega e estão entrando pelo merge.

## 6. Ler anexos: o agente desconfia da própria leitura

- PDF e texto são transcritos inteiros antes de interpretar.
- Todo candidato precisa citar um trecho literal, e o código procura esse trecho no documento. Não achou, descarta.
- Foto nasce com confiança no máximo 0,7. Uma segunda leitura independente confere valor por valor.
- Confere tudo: sobe para 0,9. Algo não bate: cai para 0,4 e o agente pergunta só aquela linha.
- Abaixo de 0,8 nada entra no formulário sem o analista confirmar.

## 7. Validar com cenários

- As regras do formulário são JavaScript. Rodamos num ambiente isolado com dados de exemplo e vemos o que aparece, o que fica obrigatório e o que é calculado.
- Cenário = dados de entrada + o que se espera. Exemplo: "casa na ZR1 com 3 m de recuo: o pedido volta".
- 12/15 no modelo cru (falha em recuo, taxa de ocupação e cidade), 15/15 no formulário de Vale Verde, 30/30 quando o Validador escreve mais 15 a partir das respostas.
- Juiz: um segundo modelo confere se toda resposta tem pelo menos um cenário. Saída ilegível reprova (falha fechada).
- Falha classificada: pré-condição e campo calculado voltam ao Validador; técnica vai ao implantador; só regra de negócio chega ao analista, em frase de balcão.

## 8. O humano manda

- **Conferir com a prefeitura**: o código escolhe até 4 casos do formulário pronto e o analista confere. Algo errado volta para o plano de ação.
- **Homologar**: o implantador vê o diff com a origem de cada mudança, as pendências e os cenários, e aprova, ajusta ou rejeita.
- **Assumir e devolver**: o implantador entra na conversa pelo painel, o agente pausa, e na devolução o agente recebe um resumo do que foi dito. Conta como intervenção.
- Painel, CLI e chat mostram o mesmo gate, descrito no próprio `run.json`.

## 9. Para o Luiz: a parte técnica em 1 minuto

**A imagem**: uma esteira com inspeção em cada posto. A peça só passa para o próximo posto quando cumpre o checklist dele. Se não cumpre, volta uma vez para o mesmo posto, com o motivo escrito. Se falhar de novo, chama uma pessoa.

**Três frases**:
1. O código faz o que precisa ser exato: ler o modelo, montar o formulário, rodar os testes.
2. A IA faz o que é conversa e leitura: perguntar, entender a foto, imaginar casos de teste.
3. Gente decide: o analista confirma a regra, o implantador aprova.

**Frases de bolso**:
- "Nenhuma IA escreve no JSON do formulário."
- "O pipeline está num arquivo; a tabela que vocês leem no repositório é gerada dele, e um teste quebra se os dois divergirem."
- "Cada processo guarda uma cópia congelada do modelo e do pipeline; mudar o pipeline amanhã não quebra o que está aberto."
- "Pronto não é opinião do agente: é uma regra com nome que passou."

## 10. Linha do tempo de hoje

| Hora | O que aconteceu |
|---|---|
| Manhã | Analisador, avaliador de regras e aplicador contra o JSON real. 36 pontos, 12/15 → 15/15. Coletor e Extrator lendo a foto da tabela de zoneamento. |
| 12:54–12:58 | Conversa da demo gravada (Marcos, SEPLAN). Vira o "antes". |
| 13:00 | Revisão: da máquina de estados cheia de `if` para pipeline declarada com regras de saída, gates e CLI do implantador. |
| 13:10 | Primeiro ciclo completo, de analisar até o gate de homologação. |
| Início da tarde | Validador ao vivo: 30/30 com juiz. Telegram no ar. Painel redesenhado. Solicitação de Férias como segundo processo. |
| 13h–15h | 129 modelos do Estúdio analisados em lote. Menu de processos no chat. |
| 14:40 | Avaliação de UX: "a conversa é a ficha lida em voz alta". |
| 15:00–15:05 | Conversa redesenhada gravada com a Dona Marlene, em duas sessões. 30/36 + 6 pendências com dono. |
| Tarde | Branch do colega: modelo primeiro, plano de ação, conferência de casos, cobrança de prazo. Merge em andamento. |
| 16:00 | Congelar código, revisar README e INSTRUCTIONS. |
| 16:45 | Push final, repositório público, link pronto. |
| 17:00 | Entrega. |

## 11. Os números

| Medida | Valor |
|---|---|
| Rodada real com agente (alvará) | 34 de 36 respondidas (31 por mensagem, 3 pela foto), 2 pendências com dono |
| Validação | 12/15 → 15/15 → 30/30 com juiz |
| Conversa: perguntas por mensagem | 3,3 → 1,3 (máximo 6 → 2) |
| Conversa: palavras de sistema | 18 → 0 |
| Conversa: palavras por mensagem | 108 → ~45 |
| Marlene ao final | 30/36 respondidas + 6 pendências com dono, 0 sem resposta |
| Catálogo | 117 modelos, 75% dos campos prontos, 14 perguntas em média |
| Segundo processo (Férias) | 28 campos, 10 perguntas, setor de outra prefeitura achado; 8/8 cenários base |
| Testes | 91 na `main`, typecheck limpo |
| Reunião evitada (medida) | 0,67 h na rodada real |

Métricas de operação (estimativa nossa, não medida): reunião por processo ~1 h → 0 a 20 min; homologação 3–5 rodadas → 1; processos por implantador por dia 10 → 20+; projetos simultâneos 4 → 8.

## 12. Decisões de produto e por quê

| Decisão | O que é | Por quê |
|---|---|---|
| Pipeline declarada | Etapas e regras num arquivo; o motor executa; a doc é gerada dele | "Pronto" deixa de ser opinião do agente, e a banca lê o que o motor roda |
| Grounding com dupla checagem de foto | Trecho literal obrigatório; foto ≤ 0,7 até a segunda leitura | Leitura errada de anexo não entra como certa |
| Gates separados analista e implantador | Regra de negócio vai ao analista; técnica vai ao implantador | A Marlene nunca lê "campo oculto" |
| Assumir e devolver | O implantador entra na conversa e devolve ao agente | O agente pode se perder; uma pessoa precisa poder entrar sem quebrar nada |
| Limites de conversa em código | Máx. 2 "?", tamanho e palavras proibidas checados no envio | Instrução sozinha escorrega; o código não |
| Nenhuma IA edita o formulário | Aplicador e plano de ação são código | Determinístico e auditável: cada mudança tem origem |

## 13. O que aprendemos

1. **A conversa era a ficha lida em voz alta.** A estrutura estava certa, mas o agente mandava lotes de 5 perguntas com "o sistema prevê". Ninguém respondeu no formato "1 sim, 2 não" (0 de 18). Reescrevemos a conversa em uma hora e pusemos os limites em código.
2. **O Validador sem pré-condições.** Na primeira rodada ele escreveu cenários sem preencher as condições dos campos e mandou ao analista uma pergunta técnica ("Diagnóstico: ... fica oculto?"). Agora ele recebe a lista de campos com as condições, e cada falha é classificada antes de ir a alguém.
3. **O setor "como está".** "Pode deixar como está" vale como resposta, menos no setor: o modelo traz o setor de outra prefeitura. Aceitar gravaria o placeholder. Setor e tabela da lei nunca aceitam "como está", e o formato recusa placeholder. O catálogo mostrou 28 modelos com esse problema.

## 14. O que fica para depois

- Botão "importar ficha" no configurador da Aprova (a saída já está no formato dele).
- WhatsApp oficial no lugar do Telegram (trocar o adaptador).
- Áudio: hoje o agente pede para escrever.
- Planilha `.xlsx` (hoje só CSV).
- Encaminhar direto ao Paulo ("é com ele") sem passar pela Marlene.
- Regras que dependem de funções do app Aprova viram "indeterminado" e não falham.
- Ponta a ponta com agente só no alvará; os outros 115 modelos passaram só pela análise.
- A conversa varia entre rodadas: a mesma fala já fechou 30/36 e 25/36.
- Testar com uma prefeitura e um analista de verdade. Vale Verde é fictícia.

## 15. Perguntas prováveis da banca

- **E quando não há modelo?** O analisador roda em qualquer formulário Formly. Sem modelo, a conversa vira entrevista aberta guiada pelos tipos de ponto.
- **Como garante que o agente não inventa regra?** Toda resposta tem origem e confiança. Abaixo de 0,8 não entra. O que ninguém disse vira pendência com dono.
- **E se o cenário falhar por erro do agente?** A falha é classificada. Erro do cenário volta ao Validador; técnico vai ao implantador; só regra de negócio chega ao analista.
- **E se o agente se perder na conversa?** O implantador assume pelo painel, responde e devolve.
- **Isso entra na operação?** A saída é o JSON do configurador. Falta o botão de importar e o WhatsApp oficial.
- **Por que não um portal para a prefeitura preencher?** Porque a prefeitura não para o balcão para preencher nada. O ganho vem de perguntar pouco, no canal que ela já usa.

## 16. Quem fala o quê

| Parte | Quem |
|---|---|
| Slide 1, a conta | equipe |
| Slide 2 e terminal `analyze` | Luiz |
| Slide 3, o catálogo | equipe |
| Painel e conversa ao vivo | Luiz no painel; quem estiver no celular lê as falas da Marlene |
| Slide 4, antes e depois | equipe |
| Slide 5, pipeline, e o diff | Luiz |
| Slide 6, validação, e o gate | Luiz |
| Férias no celular | equipe |
| Slides 7 e 8, métricas e fechamento | equipe |
| Perguntas técnicas da banca | Luiz; o resto, quem souber |

Tempo: 5 a 10 minutos, demo ao vivo. Roteiro minuto a minuto em `apresentacao/pitch.md`.

## 17. Antes de subir

- [ ] Repositório público, abrindo numa aba anônima.
- [ ] Merge do "modelo primeiro" na `main`? Rodar a Marlene uma vez e ajustar a fala do slide 4 se a abertura mudou.
- [ ] `npm run painel` aberto, zoom 125%; Telegram com `env CIDADE=vale-verde npm run telegram`.
- [ ] `data/vale-verde/alvara/` e Férias limpos para a conversa ao vivo.
- [ ] Fallbacks: rodada gravada em `data/vale-verde/alvara-marlene/`, `npm run pipeline:offline`, painel estático (`?static=1`), vídeo.
- [ ] Link do repositório no último slide e no envio às 17:00.
