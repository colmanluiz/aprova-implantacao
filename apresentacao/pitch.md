# Pitch: Implantação sem reunião

Deck de apoio para projetar enquanto a demo roda ao lado (celular com o Telegram, painel do implantador no navegador). 8 slides, pouco texto, um número por slide.

- **Tempo**: 5 a 10 minutos com a demo ao vivo. A fala dos slides soma uns 3 minutos e meio; o resto é demo.
- **Quem fala**: Luiz nos slides técnicos (2, 5 e 6) e no terminal e no painel. Nos outros, a equipe se reveza.
- **Deck publicado**: https://claude.ai/artifact/B6JiX2Sd44ovH9Z8y9c92W

## Ordem sugerida (~7 minutos)

| Tempo | Projetor | Celular | Quem |
|---|---|---|---|
| 0:00 | Slide 1, a conta | — | equipe |
| 0:30 | Slide 2, depois terminal com `npm run analyze` | — | Luiz |
| 1:15 | Slide 3, o catálogo | — | equipe |
| 1:45 | Painel: visão da prefeitura, clicar no Alvará | — | Luiz |
| 2:00 | Painel: detalhe do Alvará | conversa da Marlene ao vivo | quem estiver no celular lê as falas |
| 3:30 | Slide 4, antes e depois | — | equipe |
| 4:00 | Slide 5, depois painel: etapa "Gerar formulário" e o diff | — | Luiz |
| 5:00 | Slide 6, depois painel: cenários e gate, clicar **aprovar** | — | Luiz |
| 5:45 | Painel: detalhe de Férias | `menu` → Solicitação de Férias | equipe |
| 6:15 | Slide 7, depois painel: visão da prefeitura (métricas) | — | equipe |
| 6:45 | Slide 8, fechamento | — | equipe |

Se a banca der 5 minutos, cortar o trecho de Férias e encurtar a conversa para a pergunta aberta e a foto do requerimento. Se der 10, mostrar "Assumir conversa" no painel depois da conversa.

---

## Slide 1 · A conta que não fecha

**Na tela**
- 4 prefeituras × 100 processos ÷ 40 dias úteis
- **10 processos por dia**
- 10 reuniões de 1 hora num dia de 8 horas

**Fala (equipe, ~25 s)**
> Começo com uma conta que vocês conhecem melhor do que a gente. Um implantador toca quatro prefeituras ao mesmo tempo. Cada uma tem uns cem processos, e o prazo é de 45 a 60 dias. Isso dá dez processos por dia. Hoje cada processo pede uma reunião de uma hora pra levantar as regras. Dez horas de reunião num dia de oito. A conta não fecha, e a gente nem contou as rodadas de homologação ainda.

## Slide 2 · O que o JSON do alvará contou

**Na tela**
- 134 campos · 160 regras · **36 pontos que mudam por cidade**
- 1 "Cascavel" esquecido numa regra de validação
- Alvará de Construção, modelo real da Aprova, lido por código

**Fala (Luiz, ~30 s)**
> A gente pegou o JSON real do Alvará de Construção, que é o processo mais pesado que vocês têm. São 134 campos e 160 regras em JavaScript. Um programa, sem IA nenhuma, percorre o formulário e separa o que é estrutura do que muda de cidade pra cidade. Sobram 36 pontos. E no meio apareceu um "Cascavel" escrito dentro de uma regra de validação. Hoje isso só aparece quando um cidadão de outra cidade reclama. Aqui ele já sai trocado pelo nome da cidade, antes de alguém perguntar qualquer coisa.

*Em seguida: terminal, `npm run analyze -- fixtures/templates/alvara-construcao.modeload.json > /dev/null`.*

## Slide 3 · Não é só o alvará

**Na tela**
- 117 modelos reais do Estúdio
- **75%** dos campos já vêm prontos
- **14** perguntas por processo, em média
- 28 modelos com setor de outra prefeitura

**Fala (equipe, ~25 s)**
> E não é só o alvará. Rodamos o mesmo analisador nos 117 modelos do Estúdio que têm conteúdo. Três quartos dos campos já vêm prontos do modelo. Sobram, em média, 14 perguntas por processo. E 28 modelos ainda apontam pra setor de outra prefeitura. Então o trabalho da implantação não é montar formulário. É descobrir essas 14 respostas sem tirar o servidor do balcão.

## Slide 4 · A conversa, antes e depois

**Na tela**
- Perguntas por mensagem: **3,3 → 1,3** (máximo 6 → 2)
- Palavras de sistema: **18 → 0**
- "tenho balcão, depois continuo" (Dona Marlene, protocolo de Obras)

**Fala (equipe, ~30 s)**
> A primeira versão da conversa funcionava, mas era a ficha lida em voz alta: lote de cinco perguntas, "o sistema prevê", "template". A gente leu as conversas com os olhos da Dona Marlene, 58 anos, 27 de protocolo, que responde entre um atendimento e outro. E reescreveu. Hoje o agente começa perguntando como funciona hoje, pede a foto do papel, faz no máximo duas perguntas por mensagem e respeita o "tenho balcão". Isso não é só instrução: mensagem com mais de duas perguntas nem sai, o código barra.

*Se o merge com "modelo primeiro" já estiver na demo, trocar "começa perguntando como funciona hoje" por "começa mostrando o que já está pronto e pergunta o que é diferente".*

## Slide 5 · Uma esteira com regras de saída

**Na tela**
- 7 etapas: Analisar template · Coletar respostas · Ler anexos · Gerar formulário · Validar com cenários · Conferir com a prefeitura · Homologar
- Cada uma marcada como código, agente ou pessoa
- Se falhar: pergunta ao analista ou decisão do implantador

**Fala (Luiz, ~30 s)**
> Por baixo, é uma esteira de sete etapas, declarada num arquivo que vocês podem ler no repositório. O código analisa o modelo e gera o formulário. Os agentes conversam, leem anexos e escrevem testes. Nenhuma IA mexe no JSON do formulário. Cada etapa tem regras de saída com nome, tipo "nenhuma pergunta em aberto" ou "todos os cenários passam". Falhou, o agente tenta de novo uma vez, sabendo o motivo. Falhou de novo, vira pergunta pro analista ou decisão do implantador. No fim, quem aprova é sempre uma pessoa.

*Em seguida: painel, etapa "Gerar formulário" verde e o diff com a origem de cada mudança.*

## Slide 6 · Validar sem clicar

**Na tela**
- **12/15** modelo cru
- **15/15** formulário de Vale Verde
- **30/30** com os cenários do agente e o juiz

**Fala (Luiz, ~30 s)**
> As regras do formulário são JavaScript, então dá pra executar sem abrir a tela. Escrevemos 15 cenários. O modelo cru passa em 12 e falha justamente em recuo, taxa de ocupação e cidade. O formulário de Vale Verde passa nos 15. Aí o agente validador lê o que a prefeitura respondeu e escreve mais 15. Trinta de trinta. E um segundo modelo, o juiz, confere se todo ponto respondido tem pelo menos um cenário; se não tiver, não passa. Antes do implantador aprovar, a prefeitura ainda confere três ou quatro casos em linguagem de balcão.

*Em seguida: painel, coluna de cenários e o cartão do gate; ler a instrução e clicar **aprovar**.*

## Slide 7 · O que muda na operação

**Na tela**

| | Hoje | Com a esteira |
|---|---|---|
| Reunião por processo | ~1 h | 0 a 20 min |
| Rodadas de homologação | 3 a 5 | 1 |
| Processos por implantador por dia | 10, não cabe | 20+ |
| Projetos simultâneos | 4 | 8 |

Rodapé: estimativa da equipe. Medido na rodada real: 34 de 36 respostas sem reunião, 0,67 h evitada.

**Fala (equipe, ~25 s)**
> O que isso move na operação. Reunião por processo: de uma hora pra zero nos simples, uns vinte minutos nos complicados. Homologação: de três a cinco rodadas pra uma, porque o formulário chega na prefeitura já testado. E o implantador para de fazer reunião e passa a revisar o que mudou e decidir. Por isso a gente acha que dá pra dobrar a carteira. Esses dois últimos são estimativa nossa; o que foi medido está ali no painel.

## Slide 8 · Próximo passo

**Na tela**
- Importar a ficha no configurador da Aprova
- Trocar o Telegram pelo WhatsApp oficial
- Rodar com uma prefeitura de verdade
- github.com/colmanluiz/aprova-implantacao

**Fala (equipe, ~25 s)**
> Pra isso entrar na operação, falta pouco. A saída já é o JSON no formato do configurador; o próximo passo é um botão "importar ficha". O canal hoje é Telegram e vira WhatsApp oficial trocando uma peça só. E o que a gente mais quer agora é rodar com um analista de verdade, numa prefeitura de verdade. Está tudo no repositório, inclusive as instruções que cada agente segue. Obrigado.

---

## Antes de subir

- Repositório público e abrindo numa aba anônima (quando este deck foi feito, ainda estava privado).
- Se o merge do "modelo primeiro" entrar na `main`, rodar a conversa da Marlene uma vez e conferir a fala do slide 4.
- Fallbacks do `demo/ROTEIRO.md` à mão: rodada gravada em `data/vale-verde/alvara-marlene/`, `npm run pipeline:offline`, painel estático, vídeo.
