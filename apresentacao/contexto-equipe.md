# Guia da apresentação: Implantação sem reunião

Só para a equipe. O fluxo completo, do primeiro slide ao último clique, com as frases para apoiar quem está falando.

- **Deck do guia**: https://claude.ai/artifact/VsXj9SUwVTWQFpWuMhQDtQ
- **Deck do pitch**: https://claude.ai/artifact/B6JiX2Sd44ovH9Z8y9c92W (falas completas em `apresentacao/pitch.md`)
- **Quem fala**: Luiz conduz a parte técnica (slide 4 e a demo no painel). O resto, a gente se reveza.

## A história em três frases

Se der branco, ou a banca interromper, volte para a frase da parte em que vocês estão.

- **O problema**: "Hoje cada processo de cada prefeitura precisa de uma reunião, e a conta não fecha."
- **A solução**: "Um assistente no WhatsApp mostra o que a Aprova já tem pronto e pergunta só o que é diferente."
- **Como funciona**: "Ele conversa, lê foto e PDF, monta e testa o formulário, e uma pessoa aprova no fim."

Evitem números que não estão nos slides: abrem pergunta que não precisa ser respondida.

## Antes de começar

**Notebook no projetor**
1. Aba 1: o deck do pitch em tela cheia.
2. Aba 2: o painel em http://localhost:4310, zoom 125%.
3. Terminal com o bot rodando:
   ```bash
   env CIDADE=vale-verde npm run telegram
   ```
4. Pasta do Alvará ao vivo limpa (`data/vale-verde/alvara`), para o processo começar do zero. Não apaguem `alvara-demo` nem `alvara-marlene`.

**Celular na câmera**
1. Telegram aberto no @hackaton_aprova_bot.
2. As duas fotos salvas na galeria: `fixtures/insumos/requerimento-alvara-papel.png` e `fixtures/insumos/tabela-zoneamento.png`.
3. As falas da Marlene abertas para copiar: `fixtures/insumos/conversa-marlene.txt`.

## Parte 1 · Abertura, slides 1 a 4 (~2 min)

| No projetor | Frase de apoio |
|---|---|
| Slide 1 · A conta não fecha | "Um implantador cuida de quatro prefeituras. Cada processo pede uma reunião. São dez reuniões por dia, num dia de oito horas." |
| Slide 2 · O que percebemos | "O formulário quase todo já existe no modelo da Aprova. O que muda de cidade para cidade é pouco." |
| Slide 3 · A solução | "Em vez de reunião, um assistente no WhatsApp que mostra o que já está pronto e pergunta só o que é diferente." |
| Slide 4 · Como funciona (Luiz) | "Mostra o modelo, conversa, monta e testa, e uma pessoa aprova. Vou mostrar isso funcionando agora." |

Depois do slide 4: trocar para a aba do painel.

## Parte 2 · A conversa ao vivo (~2 min)

Regra de ouro: o assistente pode mudar a ordem das perguntas. Leia o que ele perguntou e mande a fala da Marlene que responde aquilo. Espere cada mensagem aparecer no painel (até 2 s) antes de mandar a próxima.

| # | Faça | Fale |
|---|---|---|
| 1 | Painel: na visão da prefeitura, clicar na linha "Alvará de Construção". | "Este é o painel do implantador. Tudo o que acontece no WhatsApp aparece aqui." |
| 2 | Celular: mandar `/start` e responder "Alvará de Construção". | "Do outro lado está a Dona Marlene, do protocolo de Obras." |
| 3 | Esperar o assistente mandar o resumo e o PDF do modelo pronto. Mostrar o PDF no celular. | "Ele não começa com questionário: mostra o que a Aprova já tem e pergunta o que é diferente." |
| 4 | Mandar a fala do "olhei aqui" (abaixo). | "Ela responde do jeito dela, como falaria no balcão." |
| 5 | O assistente lista as mudanças. Mandar "isso, pode tirar". Painel: apontar o registro embaixo da mensagem. | "Ela confirma e o sistema aplica no formulário. Cada resposta fica registrada com a origem." |
| 6 | Pediu a secretaria: mandar a fala da secretaria. | — |
| 7 | Pediu o papel: mandar a foto do requerimento e depois a fala da procuração. | "Foto do papel em vez de pergunta. Ele lê e só pergunta o que ficou apagado." |
| 8 | Pediu a tabela: mandar "a tabela das zonas tem uma xerox…" e a foto da tabela. | "Ele lê a tabela, confere numa segunda leitura e confirma com um caso real." |
| 9 | Mandar a fala da ZC1. | — |
| 10 | Mandar a fala do Paulo. | "'É com o Paulo' vira pendência com dono. Ele não insiste." |
| 11 | Mandar "tenho balcão, depois continuo". | "Ela para quando chega gente. Amanhã ele retoma de onde parou." |

Se ele perguntar como funciona o pedido hoje, mande a fala da papelada.

**Falas da Marlene, na ordem do arquivo**
- Olhei aqui: `bom dia, olhei aqui. da planta so o pdf mesmo, arquivo de autocad o Paulo nem abre. projeto eletrico e hidraulico a gente nao pede, so a planta, o resto é com a Copel e o SAAE`
- Papelada (se ele perguntar): `bom dia. a pessoa traz a papelada aqui no protocolo, eu confiro se ta tudo e mando pro engenheiro Paulo olhar a planta. se ta certo ele assina e o secretario tambem. ai a pessoa paga a taxa e vem retirar o alvara`
- Confirma: `isso, pode tirar`
- Secretaria: `o nome da secretaria é Secretaria Municipal de Obras e Serviços Urbanos. sou a Marlene`
- Foto `requerimento-alvara-papel.png` com a legenda: `é esse o papel que a pessoa preenche, a lista dos documentos ta embaixo`
- Procuração: `isso, a procuracao é quando quem vem nao é o dono. despachante sempre traz. quem pode dar entrada é o dono, o engenheiro ou quem tem procuracao`
- Tabela: `a tabela das zonas tem uma xerox colada aqui na parede, pera`
- Foto `tabela-zoneamento.png` com a legenda: `essa é a tabela da lei, ta meio apagada`
- ZC1: `no centro (ZC1) o recuo da frente é zero, pode construir colado na calcada. e sim, casa na ZR1 com recuo de frente menor que 4 metros volta pra corrigir`
- Paulo: `a lista de atividades que pode em cada zona isso é com o Paulo, ele que sabe`
- Balcão: `tenho balcão, depois continuo`

Se o tempo estiver curto, pule do passo 8 direto para o 11.

## Parte 3 · Formulário, testes e aprovação (~1 min 30)

A conversa ao vivo para no "tenho balcão". O resto se mostra no Alvará gravado (`alvara-demo`), que já passou por todas as etapas e está esperando a aprovação do implantador.

| # | Faça, no painel | Fale |
|---|---|---|
| 12 | Voltar para a visão da prefeitura e abrir o Alvará gravado: a linha com "alvara-demo" no nome. | "Este alvará já terminou a conversa. Vamos ver o que sai dela." |
| 13 | Rolar até "O que mudou no formulário". | "Cada mudança mostra de onde veio: a foto, a tabela da lei, a mensagem da prefeitura." |
| 14 | Rolar até "Cenários de validação". | "O formulário foi testado com situações reais, sem ninguém clicar. Todas passaram." |
| 15 | No cartão "Sua decisão: liberar o formulário para homologação", clicar em **Aprovar**. | "No fim, quem decide é uma pessoa. O implantador revisa e aprova." |

Se sobrar tempo: no Alvará ao vivo, clicar em "Assumir conversa", escrever uma mensagem e depois "Devolver ao agente". Frase: "Se o assistente se perder, o implantador entra na conversa."

Não aprovem o `alvara-demo` durante os ensaios: depois de aprovado, o cartão some.

## Parte 4 · Outro processo e fechamento (~1 min)

| # | Faça | Fale |
|---|---|---|
| 16 | Opcional. Celular: mandar "menu" e digitar "Solicitação de Férias". Painel: abrir Férias. | "Mesma pessoa, outro processo, sem reunião nova." |
| 17 | Voltar para a aba do deck, slide 5 "O que muda". | "Sem reunião para levantar regra, formulário testado antes da homologação, implantador com fôlego." |
| 18 | Slide 6 "Próximo passo". | "Falta importar no configurador e ligar no WhatsApp oficial. Está tudo no repositório. Obrigado." |

Deixe o slide 6 na tela durante as perguntas: o link do repositório fica visível.

## Se algo der errado

**Na demo**
- Assistente fora da ordem: responda o que ele perguntou com a fala que combina.
- Telegram ou internet caiu: abrir no painel o Alvará gravado da Marlene (`alvara-marlene`) e contar a conversa.
- Painel não abre: servir a cópia estática e abrir http://localhost:4310/?static=1.
  ```bash
  python3 -m http.server 4310 -d painel
  ```
- Tudo caiu: passar o vídeo.

**Nas perguntas**
- "A IA pode inventar regra?" Não. O que ninguém disse vira pendência, e uma pessoa aprova no fim.
- "Isso entra na operação?" O formulário já sai no formato do configurador da Aprova.
- Algo que não medimos: "Ainda não medimos isso; é um próximo passo."
