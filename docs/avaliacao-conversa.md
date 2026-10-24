# Avaliação da conversa do Coletor com o analista da prefeitura

24/10/2026, 14:40. Base: `INSTRUCTIONS/02-coletor.md`, `03-extrator.md`, as transcrições da demo (`fixtures/insumos/transcricao-demo*.md`), as conversas de hoje pelo Telegram (`data/vale-verde/alvara-telegram/` e `alvara-de-construcao/`, campo `historico`) e a ficha do Alvará (`fixtures/fichas/alvara.vale-verde.json`, 36 perguntas em 11 grupos).

Veredito em uma linha: **a parte que estrutura (ficha, formato, extrator, pendência com dono) está certa; a conversa é um questionário com 36 itens lido em voz alta em lotes de 5.** O analista recebe o formato da ficha em vez de ser entrevistado sobre o trabalho dele. Quase tudo que precisa mudar até 17:00 é instrução e texto, não código.

---

## 1. Personas

### Dona Marlene Aparecida, 58 anos

- **Cargo:** agente administrativa concursada há 27 anos, Secretaria Municipal de Obras e Serviços Urbanos de Vale Verde (fictícia, ~20 mil habitantes, interior). Ela é o protocolo, o balcão e a conferência de papel. Quem analisa planta é o engenheiro Paulo, que vem três tardes por semana. A taxa é com a Tributação.
- **Tecnologia:** WhatsApp o dia todo (família, grupo da secretaria, áudio é o padrão dela). Fonte grande no celular. Usa o sistema de protocolo da prefeitura e mais nada no computador. Tira foto de papel sem pensar duas vezes. Tem medo de "apertar errado e estragar".
- **Quer desse chat:** que o alvará saia do papel sem dar trabalho a ela; entender o que muda no balcão; ser tratada como quem conhece o serviço (e conhece); poder parar quando chega gente.
- **Não quer:** prova, questionário, número de pergunta para lembrar, palavra em inglês, mensagem que precisa rolar a tela, sentir que está sendo avaliada, responder de memória o que está na lei pendurada na parede, ser cobrada.
- **O que ela faz quando não entende:** não pergunta. Responde "sim" para encerrar, ou some e pede para o colega responder depois.

### Rafael Nogueira, 26 anos

- **Cargo:** analista de TI da Secretaria de Planejamento (SEPLAN) de Serra Alta (fictícia, ~180 mil habitantes). Ponto focal da implantação: recebe as demandas da Aprova e distribui para as secretarias. Não é dono das regras de obra; quem é dona é a arquiteta Juliana, chefe da Divisão de Aprovação.
- **Tecnologia:** alta. Digita rápido, manda PDF e link, acha bot lento, lê na diagonal.
- **Quer desse chat:** velocidade; mandar o decreto em vez de digitar; ver o que já está resolvido e o que falta; saber o que acontece depois; não virar gargalo de regra que não é dele ("isso é com a Juliana").
- **Não quer:** pergunta óbvia ("o senhor confirma que ART é exigida?"), confirmar três vezes a mesma coisa, ser ensinado o que é alvará, simpatia de robô ("Que ótimo!"), ter que responder no formato do bot.
- **O que ele faz quando não entende:** responde rápido e errado, ou manda "me manda a lista toda de uma vez que eu respondo".

O desenho precisa servir aos dois sem dois produtos: **perguntar pouco e aberto, aceitar o que vier, e deixar o agente fazer o trabalho de encaixar na ficha.** Marlene se beneficia da pergunta de balcão; Rafael se beneficia de mandar documento e pular o que o documento responde.

---

## 2. Diagnóstico das conversas reais

### 2.1 Números

| Conversa | Msgs do agente | Itens numerados por msg | Palavras por msg | Respostas do analista no formato pedido ("1 sim, 2 não") |
|---|---|---|---|---|
| Demo, dia 1 (Marcos, roteirizado) | 15 | 4,5 em média (58 itens em 13 lotes); 4 a 5 em todas | ~120 (duas telas de celular) | **0 de 16** |
| Demo, dia 2 | 3 | a)/b) | ~60 | 0 de 2 |
| Telegram `alvara-telegram` (Arthur, hoje) | 1 | 5 itens, 7 pontos de interrogação | 139 | analista não respondeu |
| Telegram `alvara-de-construcao` (Arthur, depois Marcos) | 4 | 3, 5, 5, 5 | 85 a 114 | a única resposta curta foi "sim", ambígua para um lote de 5 |

Outras medidas da demo, dia 1:

- **Primeira resposta útil:** já na 1ª fala do analista ("Marcos, da SEPLAN, divisão de aprovação de projetos"). O agente registrou e **reenviou o lote inteiro** (mensagem 2 é a 1 repetida). Sintoma: a conversa anda no ritmo da ficha, não no do analista.
- **Repetição:** "Atividades" aparece em **11 das 15** mensagens do agente até o analista dizer que mandaria a planilha. "Documento do requerente" foi reenviado em **7** mensagens. A tabela de zoneamento foi pedida **3 vezes** antes do anexo.
- **"O sistema prevê / do sistema"** em **12 das 15** mensagens.
- **Pedidos de esclarecimento:** o analista, **0**, mas porque é roteirizado e fala a língua do template: *"Tipo de vínculo do requerente, vínculo do proprietário, responsabilidade do responsável técnico, tipos de solicitação e os tipos de alvará a retificar estão certos como estão."* Ninguém de balcão escreve isso. O agente precisou pedir esclarecimento **4 vezes** ("O 'confere' valeu também para a lista anterior?", duas vezes; "modelo padrão do sistema?", duas vezes). **A demo é otimista:** com uma Marlene, cada lote de 5 vira um "sim" ambíguo, como aconteceu de verdade às 17:43 no Telegram.
- O analista **nunca seguiu a ordem do agente**: respondeu logradouro e material quando o lote era documentos, e falou da taxa sem ter sido perguntado. O agente seguiu reenviando o lote dele.

### 2.2 Momentos de atrito, com citação

**a) Abertura que é um formulário.** Arthur mandou "oi" e recebeu:

> "Oi, Arthur! Sou o assistente que está montando, com você, a **parametrização** do Alvará de Construção de Vale Verde. **Faltam 35 perguntas.** [...] 1) Qual setor recebe [...]? Quem analisa e quem assina o alvará? 2) O sistema prevê as zonas Z1, Z2, Z3 e Z4 [...] 3) Tipos de solicitação para a edificação [...] 4) Tipos de vínculo do proprietário: Proprietário, Possuidor, Condomínio, Espólio, Massa Falida [...] 5) Existe taxa de aprovação do alvará?"

Marlene leria: "35 perguntas" (desânimo antes de começar), "parametrização" (não sabe o que é), cinco assuntos sem ligação (setor, zona, tipo de obra, espólio, taxa). Arthur não respondeu.

**b) Insistência sem resposta.** Arthur voltou pelo menu sem escrever nada e recebeu "faltam 35 perguntas" de novo e **mais 5** perguntas: 8 perguntas abertas em duas mensagens, nenhuma respondida. O agente não perguntou se era uma boa hora, não ofereceu atalho.

**c) "Responda com os números".**

> "Pode responder assim: \"1 sim, 2 sim, 3 sim, 4 confere, 5 exigido\"."

Ninguém respondeu assim em nenhuma conversa (0 de 18). Quando Marcos respondeu "sim", o agente teve que **interpretar com confiança 0,6** e mandar outro lote de 5, agora com a), b), c) dentro de cada número: "1) Projeto arquitetônico em dwg: a) opcional, b) sempre exigido, c) não exigido? 2) [...] a) opcional, b) sempre exigido, c) não exigido?". Para responder isso no celular, Marlene teria que escrever "1a 2c 3 sim 4 sim 5 sim".

**d) Jargão que escapou.**

| Onde | Texto | Problema |
|---|---|---|
| Telegram, abertura | "parametrização" | palavra de implantador |
| Demo, 12 de 15 msgs | "O sistema prevê as zonas Z1, Z2, Z3 e Z4" | assume que ela conhece "o sistema"; Z1 a Z4 não existem em cidade nenhuma, é placeholder |
| Demo | "Fiscalização in loco **offline**" | "offline" é nome técnico do card |
| Demo | "Tipo do alvará a retificar: Aprovado no modo físico, **Aprovado pela Aprova**" | opção que só existe para quem já usa a Aprova |
| Demo | "As 11 etapas do pedido (Declaração de Veracidade, Solicitação, [...] Quadro de áreas totais, Parâmetros Urbanísticos [...]): alguma não existe aí?" | são as telas do formulário online, que ela nunca viu |
| Demo | "Documentos emitidos: Alvará, Peça gráfica e Peça gráfica complementar" | "peça gráfica complementar" é nome de arquivo HTML do template |
| Demo, dia 2 (gate do validador, `motor.ts:318`) | "Preciso confirmar uma regra do Alvará de Construção: \"Diagnóstico: tipo de logradouro \"Rua\" (opção que já existia no modelo) também fica oculto?\"" | incompreensível: "diagnóstico", "opção", "modelo", "oculto". Para Marlene, é o pior momento da conversa toda |
| Ficha (texto-base que o agente parafraseia) | "No template, só aparece quando o requerente é 'Aprovado no modo físico'" | "template", e a frase está errada (é o tipo do alvará, não o requerente) |
| Menu (`roteador.ts`) | "Qual processo vamos **parametrizar**?" | primeira frase que o analista lê |

**e) Pergunta que é a ficha em voz alta.** "Uso complementar: Quadra esportiva e poliesportiva, Estacionamento térreo, Piscina, Área complementar de posto de gasolina. Confere?" e "Responsabilidade: Projeto, Execução". O analista não tem como saber se a lista está certa porque nunca pensou nela; vai dizer "confere" para passar. A confirmação não vale nada e custa uma leitura.

**f) Pergunta aberta demais ou dupla.** "Quem analisa e quem assina o alvará final?" (duas perguntas, e "quem assina" não alimenta nenhum campo). "A prefeitura tem modelo ou numeração própria?" (três perguntas: modelo, validade, numeração).

**g) Nenhum "por que".** Em nenhum momento o agente diz para que serve a tabela de zoneamento ("pro sistema já avisar o requerente quando o recuo está errado, antes de chegar em você"). Sem isso, o pedido de "pavimentos, recuo frontal, recuos laterais (maior e menor), recuo de fundos, índice de aproveitamento, taxa de ocupação e taxa de permeabilidade" é uma lista de prova.

**h) Contagem como progresso.** "Faltam 35 perguntas", "Faltam 31", "Faltam 28", "Faltam só 4 documentos". Contagem regressiva de 35 desanima no começo e engana no fim (as pendências não somem).

**i) Fechamento sem próximo passo dela.** "O implantador vai montar o formulário e voltar com alguns casos para você conferir." Quem é o implantador? Quando? Ela precisa fazer algo? E logo depois chega o gate do item (d), que contradiz o "terminamos".

**O que funcionou e deve ficar:** às 17:42, Marcos mandou um parágrafo corrido ditando o setor e as 4 zonas com os 8 parâmetros, e o agente registrou tudo de uma vez (setor-01, opcoes-16, opcoes-22, dataset-28). Isso é a prova de que **resposta livre + agente estruturando já funciona com o código de hoje**. Também funcionam: "não sei, é com a Fazenda" virando pendência com dono sem insistir; a confirmação de foto citando um valor ("Na ZR2 o recuo frontal é 4 m, confere?"); o resumo final com pendências e donos.

---

## 3. Princípios do redesenho

Cada um com antes (transcrição) e depois.

1. **Começar pelo que a pessoa faz todo dia, não pelo que o template precisa.**
   Antes: "1) Qual setor recebe o processo? 2) O sistema prevê as zonas Z1, Z2, Z3 e Z4..."
   Depois: "Quando alguém chega aí querendo alvará pra construir, o que acontece, do balcão até o alvará sair?"
   Uma resposta dessas cobre setor, quem analisa, se tem vistoria, taxa e o que sai no final.

2. **Uma coisa de cada vez.** No máximo 2 perguntas por mensagem, e as duas do mesmo assunto. Mensagem de até ~50 palavras.
   Antes: lote de 5 com a)/b)/c) dentro.
   Depois: "E o arquivo editável da planta (o DWG do AutoCAD): vocês pedem, ou só o PDF basta?"

3. **Linguagem de balcão, nunca de sistema.** Proibido: sistema prevê, template, modelo, parametrização, campo, etapa (no sentido de tela), card, oculto, opção, dataset, confiança, offline.
   Antes: "Fiscalização in loco offline: existe? Quem preenche?"
   Depois: "Antes de sair o alvará, alguém vai ao terreno fazer vistoria, ou isso só no habite-se?"

4. **Aceitar a resposta do jeito que vier.** Texto corrido, foto do requerimento de papel, foto da xerox da lei na parede, "manda o decreto", "isso é com o Paulo". O agente encaixa na ficha; nunca pede formato.
   Antes: "Pode responder assim: \"1 sim, 2 sim, 3 sim, 4 confere, 5 exigido\"."
   Depois: "Pode escrever do seu jeito. Se tiver o requerimento de papel ou a lista do que a pessoa precisa trazer, uma foto já me responde muita coisa."

5. **Uma frase de "por que" por bloco.**
   Antes: "Preciso, por zona, de: pavimentos, recuo frontal, recuos laterais (maior e menor)..."
   Depois: "Agora o zoneamento, que é o que faz o sistema avisar o requerente quando o recuo está errado, antes de chegar em você. Tem a tabela da lei com os recuos de cada zona? Foto do papel serve."

6. **Progresso por assunto, não por contagem.**
   Antes: "Faltam 31 perguntas."
   Depois: "Já ficou: secretaria, documentos e a tabela das zonas. Falta o caminho do pedido lá dentro e a taxa."

7. **Respeitar o tempo dela.** Dizer o tamanho no começo e oferecer parada.
   Antes: (nenhuma menção; 8 perguntas abertas sem resposta)
   Depois: "Leva uns 10 minutos, aos poucos. Quando chegar gente no balcão, pode largar que a gente continua depois."

8. **Confirmar com exemplo concreto, não com "confere?".**
   Antes: "Tipos de uso: Residencial unifamiliar, Residencial multifamiliar, Comercial salas e lojas [...]. Confere?"
   Depois: "Então, se chegar um pedido de casa na ZR1 com recuo de frente de 3 m, o pedido volta, porque lá o mínimo é 4 m. É isso?"

9. **Devolver o que entendeu em forma de passo a passo dela.** Depois da resposta aberta, o agente mostra o caminho em 3 a 5 linhas numeradas (aqui número é para ela ler, não para responder) e pergunta só o que faltou.

10. **Tom humano, sem servilismo.** Sem "Que ótimo!", sem abrir toda mensagem com "Obrigado, Marcos!", "Anotado, Marcos!", "Valeu, Marcos!" (14 das 15 mensagens da demo abrem assim). Agradecer quando ela fez algo (mandou foto, foi atrás de informação). Usar o nome dela uma vez a cada tanto. Tratar por "você".

11. **Quem responde nem sempre é quem sabe.** "Isso é com o Paulo / com a Tributação" é resposta completa: pendência com nome, e seguir. Oferecer: "Se quiser, encaminha esta mensagem pra ele, que eu converso direto."

---

## 4. O que a ficha permite: das 36 perguntas, quantas a pessoa precisa ver

A ficha continua sendo o contrato (formato por tipo, `registrar_resposta` recusando o que não cabe). O que muda é **de onde vem a resposta**. Quatro fontes:

- **Conversa aberta:** "me conta como funciona hoje, do balcão até o alvará sair" e 4 ou 5 perguntas de balcão em seguida.
- **Foto do requerimento de papel / checklist de documentos.** Quase toda prefeitura pequena tem um requerimento impresso com "documentos necessários" e "tipo de obra: ( ) construção ( ) ampliação...".
- **Lei / tabela de zoneamento** (foto ou PDF).
- **Implantador**, perguntas que o analista nunca deveria ver.

| id | Em linguagem de balcão | Fonte principal | Pergunta direta? |
|---|---|---|---|
| setor-01 | "Isso fica em qual secretaria, com o nome do papel timbrado?" | conversa aberta | sim, só o nome exato (setor nunca aceita "como está") |
| card-29 | "Tem vistoria no terreno antes do alvará?" | conversa aberta | só se a narrativa não disser |
| card-30 | "Quem dá o número da casa?" | conversa aberta | idem |
| card-31 | "Quem analisa a planta e como vocês chamam esse parecer?" | conversa aberta | idem (pegar o nome local) |
| card-32 | "Outro setor dá parecer às vezes (meio ambiente, bombeiros)?" | conversa aberta | idem |
| card-33 | "Quem analisa costuma escrever observação pro requerente?" | conversa aberta | idem |
| taxa-34 | "O requerente paga alguma coisa? Quem calcula?" | conversa aberta | sim se não aparecer; cálculo quase sempre vira pendência com a Fazenda |
| saida-35 | "No fim sai o quê? Vale quanto tempo? O número é de vocês?" | conversa aberta | sim, uma |
| opcoes-08 | "Quem pode dar entrada: o dono, o engenheiro, um despachante?" | conversa aberta | confirmação de uma linha |
| documento-09 | procuração quando é outra pessoa | conversa aberta / foto | junto com a anterior |
| opcoes-04 | "Quando o alvará precisa ser corrigido, vocês fazem retificação?" | pergunta curta | sim |
| documento-06 | "Nesse caso pedem o alvará antigo de papel?" | pergunta curta | junto com a anterior |
| documento-07, -11, -12 | RG/CPF de pessoa física, contrato social de empresa | foto do requerimento | não, se a foto mostrar |
| documento-14, -17, -24 | ART/RRT, matrícula, planta | foto do requerimento | não, se a foto mostrar |
| documento-25 | arquivo DWG | pergunta curta | sim (papel não tem DWG) |
| documento-26 | projetos complementares (elétrico, hidráulico) | foto / pergunta curta | se a foto não mostrar |
| opcoes-20 | tipo de obra (nova, ampliação, reforma, regularização, demolição) | foto do requerimento | não, se a foto mostrar |
| opcoes-16 + opcoes-22 | zonas da cidade | lei / tabela | pedir a foto uma vez; **nunca perguntar duas vezes** (são a mesma lista) |
| dataset-28 | recuos e taxas por zona | lei / tabela | pedir a foto; confirmar só a célula que o Extrator marcar |
| opcoes-23 | lista de atividades | lei de uso do solo | uma vez; quase sempre vira pendência com dono |
| opcoes-18 | tipo de uso (residencial, comercial, galpão) | lei / pacote padrão | confirmar com exemplo, no pacote do fim |
| opcoes-10 | vínculo com o imóvel (proprietário, possuidor, espólio...) | foto / pacote padrão | no pacote do fim |
| opcoes-15 | tipo de logradouro | pacote padrão | no pacote do fim |
| opcoes-21 | material (alvenaria, madeira, mista) | foto / pacote padrão | no pacote do fim |
| opcoes-19 | uso complementar (piscina, quadra...) | **implantador** / pacote padrão | não |
| opcoes-13 | responsabilidade técnica (projeto, execução) | **implantador** (padrão CREA/CAU) | não |
| opcoes-05 | "Aprovado no modo físico / pela Aprova" | **implantador**, derivado de opcoes-04 + documento-06 | não |
| etapas-02 | as 11 telas do pedido online | **implantador** | não |
| documento-27 | "Documento Complementar" genérico | **implantador** | não |
| texto-03 | declaração de veracidade | foto (rodapé do requerimento) ou padrão | não |
| residuo-36 | "Cascavel" esquecido no template | **implantador** (já resolvido pelo analisador) | nunca |

Resultado para o Alvará: **~12 perguntas saem da conversa aberta, ~12 da foto do requerimento, 4 da lei, 8 ficam com o implantador ou com o pacote padrão.** Perguntas diretas restantes: nome do setor, retificação, DWG, foto da tabela, atividades, taxa se não aparecer, e as confirmações pontuais que o Extrator pedir. **Cerca de 8 perguntas diretas em vez de 35**, sem perder nenhuma resposta estruturada.

**"Pacote padrão", com cuidado:** no fim, uma mensagem só oferece deixar as listas que quase não mudam entre cidades (tipo de uso, material, tipo de rua, vínculo com o imóvel) como estão, com dois exemplos e a promessa verdadeira de que ela vai conferir tudo pronto na homologação. Se ela disser "pode", vale a regra já existente do Coletor ("pode deixar como está" sobre o que o modelo assume é resposta direta, confiança 1,0, origem "WhatsApp, Marlene: aceitou o padrão"). Isso não é inventar regra: é consentimento informado, e os cenários do validador mais a homologação são a rede. O que **não** entra no pacote: setor, documentos, zonas, tabela, taxa.

**O que fica só com o implantador** (opcoes-05, opcoes-13, opcoes-19, etapas-02, documento-27, residuo-36): o Coletor registra `resposta: null` com `pendencia: "implantador: confirmar padrão do modelo"`. Isso fecha o critério de `coletar` (pendência explícita), e o aplicador já mantém o valor do template para pergunta pendente (`patcher.ts:16`), listando-a em `diff.md` e `pendencias.md`. Efeito colateral: o contador de pendências sobe de 2 para ~8 no painel. Na demo, apresentar isso como "decisões técnicas que o analista nunca precisou ver".

---

## 5. Viabilidade até 17:00

Tempo útil real: ~2 h, com ensaio da demo no meio. Regra: **o que mexe só em texto entra; o que mexe no motor ou no extrator, não.**

### (A) Só instrução e texto, sem lógica nova

| # | Mudança | Onde | Esforço | Risco para a demo |
|---|---|---|---|---|
| A1 | Reescrever "Como conduzir" do Coletor: abertura com pergunta aberta, máximo 2 perguntas por mensagem, devolver o entendimento em passo a passo, pedir foto do requerimento cedo, pacote padrão no fim, progresso por assunto, sem contagem, sem "responda com números", sem "o sistema prevê" | `INSTRUCTIONS/02-coletor.md` | 30 min | **médio**: muda o comportamento ao vivo; a transcrição da demo não reproduz mais igual. Ensaiar 2 vezes com `npm run chat` |
| A2 | Lista de palavras proibidas ampliada: sistema prevê, template, modelo, parametrização, campo, etapa (como tela), card, oculto, opção, offline, confiança, "peça gráfica complementar" | `02-coletor.md`, seção Tom | 5 min | baixo |
| A3 | Regra das perguntas do implantador: não enviar etapas-02, opções que citam "Aprova", listas duplicadas (mesmo rótulo e mesmas opções → perguntar uma vez, registrar nas duas), responsabilidade técnica, uso complementar; registrar como pendência do implantador | `02-coletor.md` | 10 min | baixo; pendências sobem no painel (explicar na fala) |
| A4 | Fechamento com próximo passo concreto: o que ficou, o que está com quem (nome), e "o técnico da Aprova monta e te manda aqui alguns exemplos pra você dizer se está certo; até lá não precisa fazer nada". Sem prazo | `02-coletor.md` | 5 min | baixo |
| A5 | Áudio: "ainda não consigo ouvir áudio; escreve do seu jeito, mesmo curto, ou manda foto" | `02-coletor.md` | 2 min | baixo (verificar o que o adaptador do Telegram faz hoje com voz) |
| A6 | Texto do menu e da ajuda: "Sobre qual serviço vamos conversar? Responda com o número ou o nome." em vez de "Qual processo vamos parametrizar?" | `src/channel/roteador.ts` (string) + `roteador.test.ts:77` | 5 min | baixo; **atualizar o teste**, senão `npm test` quebra |
| A7 | Gatilho do primeiro turno e da retomada, hoje "apresente-se e envie o primeiro lote de perguntas prioritárias" e "me diga quantas perguntas faltam e mande o próximo lote" | `src/pipeline/motor.ts:621`, `src/channel/roteador.ts:266` (strings) | 5 min | baixo; manter o prefixo "Esta é a primeira interação", que `painel/visao.ts:213` usa para classificar a mensagem |

A6 e A7 tocam arquivos `.ts`, mas são troca de string. Sem elas, a instrução nova briga com um gatilho que manda "envie o primeiro lote" a cada abertura, e o modelo tende a obedecer o gatilho.

Exemplos de mensagens com a instrução nova:

- Abertura: "Boa tarde! Sou o assistente da Aprova, a empresa que vai colocar o pedido de Alvará de Construção de Vale Verde na internet. Pra montar igual ao que vocês fazem, preciso entender como funciona hoje. Uns 10 minutos, aos poucos. Quando alguém chega aí querendo alvará pra construir, o que acontece, do balcão até o alvará sair?"
- Retomada: "Oi de novo! Já temos a secretaria, os documentos e as zonas. Falta o caminho do pedido lá dentro e a taxa. Antes do alvará, alguém vai ao terreno fazer vistoria?"
- Resposta a "sim" ambíguo: não acontece mais, porque nunca há 5 perguntas na mesa.

### (B) Pequena mudança de código

| # | Mudança | Onde | Esforço | Risco |
|---|---|---|---|---|
| B1 | **Limite imposto em código**: `enviar_mensagem` recusa texto com mais de 2 "?" ou mais de ~70 palavras e devolve "mensagem longa: mande no máximo 2 perguntas, até 70 palavras". Mesmo padrão do `schema_invalido`; o modelo reformula sozinho | `src/agents/tools.ts:141` + 1 teste | 20 min | **baixo** e é a mudança que segura A1 quando o modelo escorrega. Cuidado: o resumo final não tem pergunta, mas pode passar de 70 palavras; isentar mensagem sem "?" do limite de palavras ou subir para 90 |
| B2 | Retomada sem contagem: `retomada()` devolve "faltam N perguntas"; trocar por assuntos (grupos com pergunta aberta) | `src/channel/roteador.ts:247-266` | 20 min | baixo |
| B3 | Gate do validador para o analista em linguagem de balcão: hoje o texto do cenário vai cru ("Diagnóstico: ... oculto?"). Passar a descrição por uma reescrita com exemplo ("Se o requerente escolher Rua como tipo de logradouro, o campo X some. Está certo?") ou mandar ao implantador quando a descrição tiver palavra técnica | `src/pipeline/motor.ts:318` e classificação em `classificarFalhas` | 40 min | **médio**: mexe no caminho do validador logo antes da demo. Alternativa segura: ampliar a lista de palavras que mandam a pergunta para o implantador (já existe a regra "sem nome de campo, até 240 caracteres") |
| B4 | Marcar na ficha quem vê cada pergunta (`publico: "analista" | "implantador"`) no analisador, em vez de depender da instrução | `src/core/template-analyzer.ts`, tipos, testes | 1 h+ | médio; não cabe com segurança hoje |
| B5 | Reordenar grupos para a ordem do balcão (quem atende → documentos → zoneamento → caminho interno → taxa → documento final → listas) | ordem de `ler_ficha` | 15 min | baixo, mas com A1 o Coletor já escolhe a ordem pela conversa; dispensável |
| B6 | "Modo entrevista aberta" como estado explícito antes da ficha | motor + Coletor | 1 h+ | **não fazer**: a instrução A1 já produz isso, e a extração de resposta aberta para a ficha **já funciona** (Marcos às 17:42) |

**Cabe até 17:00:** A1 a A7 + B1. B2 se sobrar 20 minutos. B3 só na versão segura (mandar ao implantador). B4 a B6 ficam.

### (C) Depois do hackathon

| Item | Por quê | Esforço |
|---|---|---|
| Áudio (transcrição de voz do WhatsApp) | é como a Marlene fala; resposta longa de balcão cabe num áudio de 1 minuto | 1 a 2 dias (transcrição + passar o texto pelo mesmo caminho do Extrator com `trecho` literal) |
| Ritmo adaptativo | quem manda parágrafo e PDF (Rafael) recebe mensagens mais densas e um checklist de assuntos; quem responde curto recebe uma por vez | 2 a 3 dias + avaliação com conversas reais |
| Encaminhamento a terceiros | "isso é com o Paulo": o agente gera um link/mensagem para o Paulo responder só a tabela, sem passar pela Marlene | 2 dias |
| `publico` na ficha (B4) e textos de pergunta da ficha em linguagem de balcão gerados pelo analisador | hoje o texto-base da ficha diz "o template prevê"; o Coletor parafraseia, mas o vício vaza | 1 dia |
| Leitura de requerimento de papel como tipo de anexo próprio | o Extrator lê bem tabela; checklist de documentos com "( ) sempre / ( ) quando" é outro problema | 1 a 2 dias + fixtures de requerimentos reais |
| Lembrete automático ("um por dia, no máximo dois") | a instrução promete, o código não faz | meio dia |
| Medir atrito de verdade | perguntas por mensagem, "sim" ambíguo, abandono, tempo até a 1ª resposta, em `run.json.metricas` | meio dia |

---

## 6. Riscos de exagerar

- **Agente simpático demais cansa igual.** Mensagem com "Que bom ter você aqui, Marlene! Fico muito feliz em ajudar" antes da pergunta é o mesmo atrito do lote de 5, com outra cara. Regra: uma frase de contexto no máximo, depois a pergunta.
- **Aberto demais não fecha nada.** A pergunta aberta serve para a primeira rodada. Depois dela, o agente **tem que** fechar com perguntas curtas e objetivas o que faltou. Sem isso, a conversa vira bate-papo e a coleta não termina. Critério: depois da resposta aberta, devolver o entendimento e ir para pergunta fechada.
- **Inferir demais vira inventar.** Da narrativa "o Paulo olha a planta" sai card-31 existe; não sai "parecer exigido em 5 dias". O que não foi dito é pendência. Toda inferência de conversa aberta com confiança 0,6 precisa da confirmação em uma linha (regra que já existe).
- **Pacote padrão sem consentimento** é o atalho perigoso. Só com a pergunta explícita e só para listas de baixo risco.
- **Esconder progresso** também frustra o Rafael. Progresso por assunto, sim; sumir com o progresso, não.

**O que NÃO mudar:**

- A ficha, o contrato de formato e o `schema_invalido`.
- O Extrator desconfiado (trecho literal, foto ≤ 0,7, segunda leitura, confirmação só das células duvidosas). É o que permite pedir foto em vez de pergunta.
- Pendência com dono ("taxa: Tributação") sem insistir.
- Setor nunca aceita "como está".
- O implantador assumindo pelo painel.
- A nota de turno do Coletor com os ids (é o que o painel mostra e o que permite saber a que a resposta se refere). Com no máximo 2 perguntas por mensagem, ela fica mais simples.
- O replay da demo: guardar a transcrição atual como "antes" e gravar uma nova como "depois". Contraste antes/depois é um ótimo minuto de apresentação.

---

## Resumo

1. Veredito: a estrutura (ficha, formato, Extrator, pendência com dono) está certa; a conversa é a ficha lida em lotes de 5 e não serve a uma Marlene.
2. Evidência: 4,5 perguntas por mensagem, ~120 palavras, 0 de 18 respostas no formato "1 sim, 2 não", "o sistema prevê" em 12 de 15 mensagens, "Atividades" repetida em 11.
3. No Telegram de hoje: "oi" recebeu 5 perguntas e "parametrização"; um "sim" para um lote de 5 virou interpretação com 0,6 e mais 5 perguntas.
4. O que já funciona e prova o caminho: parágrafo corrido do analista (setor + 4 zonas × 8 parâmetros) registrado de uma vez.
5. Das 36 perguntas, ~8 precisam de pergunta direta; o resto sai da conversa aberta, da foto do requerimento, da lei ou fica com o implantador.
6. Mudança 1 até 17:00: reescrever o `02-coletor.md` (abertura aberta, devolver entendimento, foto cedo, 2 perguntas no máximo, pacote padrão, fechamento com próximo passo).
7. Mudança 2: impor em código o limite em `enviar_mensagem` (≤ 2 "?", ~70 palavras), 20 min.
8. Mudança 3: trocar as strings que puxam lote e contagem (menu "parametrizar", gatilho do 1º turno, retomada), atualizando `roteador.test.ts`.
9. Depois: áudio, ritmo adaptativo, encaminhar ao Paulo, `publico` na ficha, gate do validador em linguagem de balcão, leitura de requerimento de papel.
10. Não mudar: ficha, contrato de formato, Extrator desconfiado, setor sem "como está", modo humano. Guardar a transcrição atual como "antes" para a demo.
