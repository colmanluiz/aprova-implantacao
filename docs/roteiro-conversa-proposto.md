# Roteiro de conversa proposto: Alvará de Construção

Para quem vai implementar (instrução do Coletor) e para gravar o "depois" da demo. Personas e princípios em `docs/avaliacao-conversa.md`.

Convenções:

- **A** = agente, **M** = Marlene, **R** = Rafael.
- Abaixo de cada mensagem do agente, entre colchetes: `pergunta` = ids que a mensagem pergunta; `registra` = o que o Coletor grava com `registrar_resposta` naquele turno (confiança entre parênteses); `extrai` = chamada ao Extrator. Isso é a nota de turno, não vai ao analista.
- Regras que o roteiro obedece: no máximo 2 perguntas por mensagem, do mesmo assunto; nenhuma contagem de perguntas; nenhuma palavra de sistema; toda inferência de conversa aberta (0,6) é confirmada em uma linha antes de subir para 1,0.

---

## Parte 1: Dona Marlene, Secretaria de Obras de Vale Verde (~20 mil hab.)

### Sessão 1: terça, 10:12, entre um atendimento e outro

Antes: Marlene escolheu "Alvará de Construção" no menu ("Sobre qual serviço vamos conversar?").

**A1**
> Bom dia! Sou o assistente da Aprova, a empresa que vai colocar o pedido de Alvará de Construção de Vale Verde na internet. Pra montar igual ao que vocês já fazem, preciso entender como funciona hoje. Leva uns 10 minutos, aos poucos, e pode responder do seu jeito.
>
> Quando alguém chega aí querendo alvará pra construir, o que acontece, do balcão até o alvará sair?

`[pergunta aberta: setor-01, card-29..33, taxa-34, saida-35, opcoes-08 | registra: nada]`

**M** (10:19): bom dia. a pessoa traz a papelada aqui no protocolo, eu confiro se ta tudo e mando pro engenheiro Paulo olhar a planta. se ta certo ele assina e o secretario tambem. ai a pessoa paga a taxa e vem retirar o alvara

**A2**
> Entendi. Então hoje é assim:
> 1. a pessoa entrega os papéis no protocolo e você confere;
> 2. o engenheiro Paulo analisa a planta;
> 3. ele e o secretário assinam;
> 4. a pessoa paga a taxa e retira o alvará.
>
> Isso tudo fica em qual secretaria? Me passa o nome do jeito que está no papel timbrado.

`[pergunta: setor-01 | registra: card-31 {existe:true} (0,6, "Paulo analisa a planta"); taxa-34 {existe:true} (0,6); saida-35 parcial, nada ainda]`

> Nota: o passo a passo numerado é para ela ler, não para responder por número. A confirmação do entendimento está implícita: se algo estiver errado, ela corrige ("não, quem assina é só o secretário").

**M** (10:24): Secretaria Municipal de Obras e Serviços Urbanos. sou a Marlene

**A3**
> Obrigado, Marlene. Anotei: Secretaria Municipal de Obras e Serviços Urbanos.
>
> Vocês têm o requerimento de papel, ou aquela lista do que a pessoa precisa trazer? Se tiver, tira uma foto e me manda. Eu leio de lá e te poupo um monte de pergunta.

`[pergunta: foto do requerimento (documento-07, -09, -11, -12, -14, -17, -24, -26, opcoes-20, opcoes-21, opcoes-10, texto-03) | registra: setor-01 {"slug":"vale_verde","setor":"Secretaria Municipal de Obras e Serviços Urbanos"} (1,0); card-31 e taxa-34 sobem para 1,0, a descrição do passo a passo não foi contestada]`

> Nota para quem implementa: subir card-31 e taxa-34 para 1,0 só porque ela não contestou é uma escolha. Alternativa conservadora: deixar em 0,6 e confirmar no fechamento. O roteiro confirma o card-31 de novo em A13 (nome local), o que basta.

**M** (10:31): [foto] `requerimento.jpg` esse é o que a gente usa

**A4**
> Li o requerimento. Pra dar entrada, a pessoa traz:
> - RG e CPF, ou contrato social se for empresa
> - matrícula do imóvel atualizada
> - ART ou RRT do engenheiro
> - 2 vias da planta
>
> Só a última linha ficou apagada na foto: é "procuração, quando não for o proprietário"?

`[extrai: pedir_extracao(requerimento.jpg) | registra (foto, verificado 0,9): documento-07 {exigido:true,sempre:true}, documento-11 {exigido:true} (só PF), documento-12 {exigido:true} (só PJ), documento-14 {exigido:true,sempre:true}, documento-17 {exigido:true,sempre:true}, opcoes-20 ["Construção nova","Ampliação","Reforma","Regularização","Demolição"] (campo "tipo de obra" do papel), opcoes-21 ["Alvenaria","Madeira","Mista"] | 0,4 a confirmar: documento-09 | pergunta: documento-09]`

> O agente não fala de "tipo de obra" nem de "material": a foto confirmou o que o modelo já tinha, com verificação 0,9, então não há o que perguntar. Ele conta só o que importa para ela (os documentos) e pergunta só o que ficou ilegível.

**M** (10:33): isso, procuracao se for outra pessoa. despachante sempre traz

**A5**
> Certo. Então quem pode dar entrada é o dono, o engenheiro responsável ou alguém com procuração, como o despachante. É isso?

`[pergunta: opcoes-08 (confirmação) | registra: documento-09 {exigido:true} (1,0, "Anexo: requerimento.jpg, confirmado pela analista"); opcoes-08 ["Proprietário do imóvel","Responsável Técnico","Procurador"] (0,6)]`

**M** (10:34): isso

**A6**
> Uma diferença do papel pra internet: lá a planta vem em PDF. Vocês também vão querer o arquivo editável do desenho (o DWG, do AutoCAD), ou só o PDF basta?

`[pergunta: documento-25 | registra: opcoes-08 (1,0); documento-24 {exigido:true,sempre:true} (1,0: "2 vias da planta" vira "projeto arquitetônico em PDF", origem foto + conversa)]`

> "Por que" em meia frase ("uma diferença do papel pra internet"). Sem isso ela não sabe por que está sendo perguntada sobre algo que não existe no balcão dela.

**M** (10:36): so o pdf. dwg o Paulo nem abre

**A7**
> Fechado, só o PDF. E projeto elétrico, hidráulico: vocês pedem junto com a planta, ou não?

`[pergunta: documento-26 | registra: documento-25 {exigido:false} (1,0)]`

**M** (10:37): nao, so a planta. o resto é com a Copel e o SAAE

**A8**
> Entendi, só a planta.
>
> Agora o zoneamento. É ele que faz o sistema avisar o requerente quando o recuo está errado, antes do pedido chegar em você. Vocês têm a tabela da lei com os recuos de cada zona? Foto do papel serve.

`[pergunta: opcoes-16, opcoes-22, dataset-28 (uma pergunta só) | registra: documento-26 {exigido:false} (1,0)]`

**M** (10:40): tem uma xerox colada aqui na parede, pera

**M** (10:42): [foto] `parede.jpg`

**A9**
> Li a tabela: 4 zonas, ZR1, ZR2, ZC1 e ZI, com os recuos, pavimentos e taxas de cada uma.
>
> Uma coisa ficou borrada: na ZC1, o recuo da frente é 0 ou 5 metros?

`[extrai: pedir_extracao(parede.jpg) | registra: opcoes-16 e opcoes-22 ["ZR1","ZR2","ZC1","ZI"] (0,9 verificado; mesma lista, registrada nas duas sem perguntar duas vezes); dataset-28 (0,4, conferir: ZC1) | pergunta: dataset-28, só a linha ZC1]`

**M** (10:44): zero. no centro pode construir colado na calcada

**A10**
> Anotado, ZC1 sem recuo de frente. Então, se chegar um pedido de casa na ZR1 com 3 m de recuo na frente, ele volta, porque lá o mínimo é 4 m. Certo?

`[pergunta: confirmação por exemplo de dataset-28 | registra: dataset-28 (ZC1 corrigida, aguardando)]`

> Confirmação com caso concreto, não "confere a tabela?". Se ela disser "certo", a tabela inteira foi entendida, não só a ZC1.

**M** (10:45): certo, volta pra corrigir

**A11**
> Perfeito, a tabela está completa.
>
> A mesma lei tem a lista de atividades que pode em cada zona (comércio, indústria, serviço...)? Se não tiver à mão, deixo anotado pra depois.

`[pergunta: opcoes-23 | registra: dataset-28 (1,0, "Anexo: parede.jpg, conferida; ZC1 e exemplo confirmados pela analista")]`

**M** (10:47): isso é com o Paulo. agora chegou gente aqui

**A12**
> Pode ir. Já ficou: secretaria, documentos e a tabela das zonas. Falta o caminho do pedido lá dentro e a taxa. Quando der, me manda um oi que a gente continua daqui.
>
> Se quiser, encaminha pro Paulo a pergunta das atividades, que eu converso direto com ele.

`[registra: opcoes-23 resposta null, pendencia "engenheiro Paulo (Obras) tem a lista de atividades por zona" | pergunta: nenhuma]`

> Progresso por assunto. Nenhuma pergunta nesta mensagem: ela está saindo, perguntar agora é cobrar.

### Sessão 2: quarta, 8:05

**M** (8:05): bom dia voltei

**A13**
> Bom dia, Marlene! Falta o caminho do pedido lá dentro e a taxa.
>
> Antes de sair o alvará, alguém vai ao terreno fazer vistoria, ou isso só no habite-se?

`[pergunta: card-29]`

**M** (8:11): so no habite-se

**A14**
> Certo, sem vistoria antes do alvará. E o número da casa: quem dá é o protocolo de vocês ou outro setor?

`[pergunta: card-30 | registra: card-29 {existe:false} (1,0)]`

**M** (8:13): é o cadastro imobiliario, la na fazenda

**A15**
> Entendi. E a análise do Paulo, como vocês chamam? Parecer técnico, análise de projeto? Quero usar o nome que vocês já usam.

`[pergunta: card-31 (nome local) | registra: card-30 {existe:true} (1,0, origem: "quem faz é o Cadastro Imobiliário, Secretaria da Fazenda")]`

**M** (8:14): parecer tecnico

**A16**
> Anotado, Parecer Técnico. Às vezes outro setor também precisa dar parecer, tipo meio ambiente ou bombeiros? E quando falta algo na planta, o Paulo escreve uma observação pro requerente?

`[pergunta: card-32, card-33 (2 perguntas, mesmo assunto) | registra: card-31 {existe:true,"nome":"Parecer Técnico"} (1,0)]`

**M** (8:18): meio ambiente quando é perto de rio. observacao sim, ele escreve o que tem que corrigir

**A17**
> Certo. Agora a taxa: quem calcula o valor, vocês ou a Fazenda?

`[pergunta: taxa-34 (detalhe) | registra: card-32 {existe:true} (1,0, "Meio Ambiente, quando perto de rio"); card-33 {existe:true} (1,0)]`

**M** (8:20): a tributacao calcula pela metragem e gera a guia

**A18**
> Entendi: a Tributação calcula pela metragem e emite a guia. Não vou colocar valor nenhum sem a tabela deles, então deixo isso anotado com a Tributação.
>
> No final, o que sai pro requerente: só o alvará, ou a planta carimbada também? E vale por quanto tempo?

`[pergunta: saida-35 | registra: taxa-34 resposta null, pendencia "Tributação (Fazenda): calcula pela metragem e emite a guia; pedir a tabela de cálculo" — mantém {existe:true} na origem para o implantador]`

> Nota: o formato `taxa` só guarda `{existe, nome}`. "Existe, calcula a Tributação pela metragem" cabe em `{existe:true}` com a origem detalhada, mas a regra de cálculo não cabe e não pode ser inventada. Escolha: pendência, como na demo de hoje.

**M** (8:24): o alvara e uma via da planta aprovada carimbada. vale 1 ano. o numero é nosso, sai do livro

**A19**
> Anotado: alvará e planta aprovada, válidos por 1 ano, com a numeração de vocês.
>
> Quando um alvará já emitido precisa ser corrigido, vocês fazem retificação? Nesse caso pedem o alvará antigo de papel?

`[pergunta: opcoes-04, documento-06 (e opcoes-05 por derivação) | registra: saida-35 {"modelo_proprio":false,"validade_dias":365,"numeracao_propria":true} (0,6: "planta carimbada" = peça gráfica; modelo próprio não foi dito, confirmar no fechamento)]`

**M** (8:26): sim, tem que trazer o original

**A20**
> Combinado. Última coisa, e é rápida.
>
> O pedido pela internet tem umas listas que quase não mudam de uma cidade pra outra, por exemplo tipo de uso (residência, comércio, galpão) e tipo de rua (rua, avenida), e um modelo pronto de alvará. Posso deixar tudo isso no padrão? Antes de ir pro ar, o técnico da Aprova te mostra pronto pra você conferir.

`[pergunta: pacote padrão (opcoes-10, opcoes-15, opcoes-18, texto-03, modelo do documento de saida-35) | registra: opcoes-04 ["Nova solicitação","Retificação"] (1,0); documento-06 {exigido:true} (1,0, "só na retificação de alvará de papel"); opcoes-05 null, pendencia "implantador: opção 'Aprovado pela Aprova' (derivado: retificação existe e alvará de papel é exigido)"]`

**M** (8:27): pode deixar

**A21** (fechamento)
> Obrigado, Marlene, ficou tudo bem explicado. Resumo:
> - Entra na Secretaria de Obras e Serviços Urbanos; o Paulo dá o Parecer Técnico; Meio Ambiente quando é perto de rio.
> - Documentos, tabela das 4 zonas, alvará e planta válidos por 1 ano com a numeração de vocês.
> - Com o Paulo: a lista de atividades por zona.
> - Com a Tributação: a tabela da taxa.
>
> Agora o técnico da Aprova monta o pedido e te manda aqui alguns exemplos, tipo "casa na ZR1 com 3 m de recuo: o pedido volta". Você só diz se está certo. Até lá, não precisa fazer nada.

`[registra: opcoes-10, opcoes-15, opcoes-18, texto-03 com o valor do modelo (1,0, "WhatsApp, Marlene: aceitou o padrão, conferir na homologação"); saida-35 {"modelo_proprio":false,"validade_dias":365,"numeracao_propria":true} (1,0; sem isso ficaria em 0,6 e o critério de `coletar` não fecharia); sem envio: opcoes-13, opcoes-19, etapas-02, documento-27 null com pendencia "implantador: confirmar padrão do modelo"; residuo-36 já resolvido pelo analisador]`

### Cobertura das 36 perguntas (Marlene)

| id | Mensagem | Como |
|---|---|---|
| setor-01 | A2, A3 | conversa aberta + nome exato |
| etapas-02 | A21 | implantador |
| texto-03 | A20 | pacote padrão (ou foto, se o requerimento tiver declaração) |
| opcoes-04 | A19 | pergunta curta |
| opcoes-05 | A19, A20 | derivado + implantador |
| documento-06 | A19 | pergunta curta |
| documento-07 | A4 | foto |
| opcoes-08 | A5 | conversa + confirmação |
| documento-09 | A4, A5 | foto + confirmação da linha ilegível |
| opcoes-10 | A20 | pacote padrão |
| documento-11, -12 | A4 | foto |
| opcoes-13 | A21 | implantador |
| documento-14, -17 | A4 | foto |
| opcoes-15 | A20 | pacote padrão |
| opcoes-16, opcoes-22 | A8, A9 | foto da lei, uma pergunta para as duas |
| opcoes-18 | A20 | pacote padrão com exemplo |
| opcoes-19 | A21 | implantador |
| opcoes-20, opcoes-21 | A4 | foto (sem pergunta) |
| opcoes-23 | A11, A12 | pendência com o Paulo |
| documento-24 | A4, A6 | foto + conversa |
| documento-25 | A6, A7 | pergunta curta |
| documento-26 | A7, A8 | pergunta curta |
| documento-27 | A21 | implantador |
| dataset-28 | A8 a A11 | foto da lei + 1 célula + exemplo |
| card-29 | A13, A14 | pergunta de balcão |
| card-30 | A14, A15 | pergunta de balcão |
| card-31 | A2, A15, A16 | conversa aberta + nome local |
| card-32, card-33 | A16, A17 | pergunta de balcão (2 numa msg) |
| taxa-34 | A2, A17, A18 | conversa + pendência com a Tributação |
| saida-35 | A18, A19, A20 | pergunta de balcão; modelo do documento no pacote padrão |
| residuo-36 | — | analisador |

**Medidas:** 21 mensagens do agente em 2 sessões, **22 perguntas no total** (média 1 por mensagem, máximo 2, 1 delas aberta), 2 fotos, nenhum "responda com o número", nenhuma contagem. Resultado: 28 respondidas, 2 pendências com dono (atividades, taxa), 6 com o implantador ou o analisador (opcoes-05, opcoes-13, opcoes-19, etapas-02, documento-27, residuo-36). A demo atual chegou a 34 + 2 com 58 itens perguntados em 15 mensagens. O custo é ~6 mensagens a mais; o ganho é que cada mensagem cabe numa tela e se responde com o polegar.

---

## Parte 2: Rafael, SEPLAN de Serra Alta (~180 mil hab.)

Mesma ficha, outra cidade fictícia. Rafael é ponto focal de TI; as regras de obra são da arquiteta Juliana. Ele manda documento e pula etapa.

**R** (14:02): oi, alvará de construção

**A1**
> Oi! Sou o assistente da Aprova pra montar o pedido de Alvará de Construção de Serra Alta. Preciso entender como funciona hoje, uns 10 minutos.
>
> Como é o caminho de um pedido de alvará aí, do protocolo até o documento sair? Se tiver o requerimento atual e a lei de zoneamento em PDF, pode mandar junto que adianta bastante.

`[pergunta aberta + convite a anexos: setor-01, card-29..33, taxa-34, saida-35, opcoes-16/22, dataset-28, documentos]`

**R** (14:05): entra pelo protocolo geral, vai pra SEPLAN - Divisão de Aprovação de Projetos, a Juliana (arquiteta) distribui pros analistas. parecer técnico, se precisar vai pro meio ambiente e pros bombeiros. numeração predial é a gente mesmo. taxa é ISS/taxa de licença calculada pela Fazenda no sistema tributário. sai alvará + projeto aprovado com carimbo digital, validade 2 anos, numeração do nosso sistema. vistoria só no habite-se
**R** (14:05): [PDF] `LC-312-2019-zoneamento.pdf`
**R** (14:06): [PDF] `requerimento-alvara.pdf`

**A2**
> Li os dois PDFs e a sua mensagem. Ficou assim:
> - Entra na SEPLAN, Divisão de Aprovação de Projetos; parecer técnico, e Meio Ambiente e Bombeiros quando precisa.
> - Numeração predial com vocês; sem vistoria antes do alvará.
> - Taxa calculada pela Fazenda; alvará e projeto aprovado, 2 anos, numeração de vocês.
> - Lei 312: 6 zonas (ZR1, ZR2, ZR3, ZC, ZM, ZI), com recuos e taxas de cada.
> - Requerimento: RG/CPF ou contrato social, matrícula, ART/RRT, projeto em PDF, procuração quando é terceiro.
>
> Duas coisas que os documentos não dizem: vocês exigem o DWG do projeto? E projetos complementares (elétrico, hidrossanitário) entram no pedido?

`[extrai: pedir_extracao x2 (PDF: trecho literal) | registra: setor-01 (1,0); card-29 {existe:false}, card-30 {existe:true}, card-31 {existe:true,"nome":"Parecer Técnico"}, card-32 {existe:true}, card-33 sem informação (fica para A3) (0,6 → confirmados pelo resumo se ele não corrigir); taxa-34 {existe:true} + pendencia "Fazenda: regra de cálculo"; saida-35 {validade_dias:730, numeracao_propria:true} (0,6); opcoes-16/22, dataset-28 (PDF, trecho literal, 0,95); documento-07, -09, -11, -12, -14, -17, -24 (PDF, 0,95); opcoes-20, opcoes-21, opcoes-10, texto-03 se estiverem no requerimento | pergunta: documento-25, documento-26]`

> Mensagem mais longa que o normal (~110 palavras) porque devolve o que ele mandou. Com B1 (limite em código), isentar mensagem de resumo ou subir o limite quando houver anexo processado. O resumo em tópicos é o que o Rafael quer: ver de uma vez o que já está resolvido.

**R** (14:09): dwg sim, obrigatório (a Juliana usa pra conferir área). complementares não. tá tudo certo no resumo

**A3**
> Anotado. Três pontos rápidos e acabou:
> Quando falta algo no projeto, o analista escreve uma observação pro requerente? E vocês fazem retificação de alvará já emitido, pedindo o alvará antigo de papel?

`[pergunta: card-33; opcoes-04 + documento-06 (agrupadas como uma) | registra: documento-25 {exigido:true,sempre:true} (1,0); documento-26 {exigido:false} (1,0); itens do resumo de A2 sobem para 1,0 ("tá tudo certo no resumo")]`

> "Três pontos" e duas interrogações: retificação + alvará antigo são lidas como uma coisa só. Se B1 contar "?" literalmente, passa (2).

**R** (14:11): observação sim. retificação sim, mas alvará antigo só se for de antes de 2020 (antes era papel)

**A4**
> Certo. A lista de atividades por zona: está na própria Lei 312 ou em outro anexo? E as listas de tipo de uso, material e tipo de rua, e o modelo do alvará, posso deixar no padrão pra Juliana conferir na homologação?

`[pergunta: opcoes-23; pacote padrão (opcoes-15, opcoes-18 e, se não vieram no requerimento, opcoes-10, opcoes-21) | registra: card-33 {existe:true}; opcoes-04 (1,0); documento-06 {exigido:true} (1,0, "só para alvará anterior a 2020, emitido em papel"); opcoes-05 → implantador]`

**R** (14:13): atividades é o anexo IV, mas é uma tabela de 9 páginas, te mando o xlsx amanhã. padrão pode. a juliana vai querer ver antes de ir pro ar

**A5** (fechamento)
> Fechado, Rafael. Resolvido: setor, caminho interno, documentos, as 6 zonas da Lei 312, alvará de 2 anos.
> - Com você: anexo IV (atividades). Se puder, manda em CSV; o xlsx eu ainda não consigo ler.
> - Com a Fazenda: a regra de cálculo da taxa.
>
> Próximo passo: o técnico da Aprova monta o pedido e manda aqui os casos de teste ("casa na ZR2 com 2 m de recuo: o pedido volta"). Pode encaminhar pra Juliana; ela responde direto neste chat.

`[registra: opcoes-23 null, pendencia "Rafael envia anexo IV da LC 312 (atividades) em CSV"; opcoes-10, opcoes-15, opcoes-18, opcoes-21, texto-03 no padrão (1,0, "aceitou o padrão, Juliana confere na homologação"); opcoes-08 do requerimento ou pacote; opcoes-13, opcoes-19, opcoes-05, etapas-02, documento-27 → implantador]`

> "O xlsx eu ainda não consigo ler" é verdade hoje (README, Limites conhecidos). Dizer isso agora evita a frustração de amanhã.

**Medidas (Rafael):** 5 mensagens do agente, 9 perguntas diretas, 2 PDFs. Mesma ficha, mesmo contrato, mesma rede de segurança; ele nunca viu "o sistema prevê".

---

## Como transformar isto em instrução (resumo para o `02-coletor.md`)

1. Primeira mensagem: quem é, por que, tamanho ("uns 10 minutos, aos poucos"), **uma pergunta aberta sobre o caminho do pedido**. Sem contagem, sem lote.
2. Depois da resposta aberta: devolver o entendimento em 3 a 5 linhas e perguntar só o que faltou. Inferência da narrativa entra com 0,6 e sobe para 1,0 quando o analista confirma ou não contesta o resumo.
3. Pedir cedo a foto do requerimento de papel e a tabela da lei. Do que o Extrator verificou (≥ 0,8), contar só o que importa ao analista e não perguntar.
4. No máximo 2 perguntas por mensagem, do mesmo assunto; cada bloco novo com meia frase de "por que".
5. Confirmar regra com caso concreto ("casa na ZR1 com 3 m de recuo: volta?").
6. Progresso por assunto ("já ficou X, falta Y"). Ao sair, nenhuma pergunta: "quando der, me manda um oi".
7. "É com o Paulo / com a Fazenda" é resposta: pendência com nome, oferecer conversar direto.
8. No fim, pacote padrão para listas de baixo risco, com exemplo e menção à conferência na homologação. Nunca para setor, documentos, zonas, tabela, taxa.
9. Não enviar: `residuo`, `etapas`, opções que citam a Aprova, responsabilidade técnica, uso complementar, "documento complementar" genérico. Registrar `null` com pendência "implantador: confirmar padrão do modelo". Listas duplicadas (mesmo rótulo, mesmas opções): perguntar uma vez, registrar nas duas.
10. Fechamento: o que ficou, o que está com quem (nome), próximo passo sem prazo e o que ela precisa fazer até lá (normalmente nada).
