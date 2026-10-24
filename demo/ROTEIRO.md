# Roteiro da demo (4 minutos)

## Montagem da mesa (antes de subir)

- **Projetor**: navegador em tela cheia com o painel (`npm run painel` → http://localhost:4310), zoom 125% se a sala for grande. Uma segunda aba com o terminal/slides.
- **Câmera de mesa**: o celular com o Telegram do "analista", aberto no bot @hackaton_aprova_bot. No notebook: `env CIDADE=vale-verde npm run telegram` (sem `PROCESSO`, o bot abre o menu).
- `data/vale-verde/alvara/` e a pasta de Férias em `data/vale-verde/` limpas para a conversa ao vivo (o painel mostra os processos como "não iniciado" até a primeira mensagem).
- `npm run painel:data` rodado no último ensaio: `painel/data.json` atualizado para o fallback.

| Tempo | Projetor | Celular |
|---|---|---|
| 0:00 | Slide "a conta não fecha" | — |
| 0:30 | Terminal (`analyze`) | — |
| 1:00 | **Painel: visão da prefeitura** | — |
| 1:10 | **Painel: detalhe do Alvará**, conversa ao vivo | conversa com o agente |
| 2:20 | Painel: detalhe, `diff.md` e etapa "aplicar" | — |
| 3:00 | Painel: detalhe, cenários, conferir e gate | casos para conferir |
| 3:25 | **Painel: detalhe de Férias** | menu → Solicitação de Férias |
| 3:45 | **Painel: visão da prefeitura** (métricas) | — |

## 0:00 — O problema (30 s)
"100 processos, 60 dias, 4 prefeituras por implantador. Dez reuniões por dia. A conta não fecha." Mostrar a conta no slide.

## 0:30 — O que o template já sabe (30 s)
Terminal: `npm run analyze -- fixtures/templates/alvara-construcao.modeload.json > /dev/null` (o resumo sai no stderr; sem o redirecionamento a ficha inteira é despejada na tela)
Apontar: 11 etapas, 134 campos, 160 regras, e o analisador reduziu a **36 perguntas em 11 grupos**. Destacar o `'Cascavel'` achado dentro do template: "isso hoje só apareceria na homologação, depois de um cidadão de outra cidade reclamar".
E não é só o alvará: "Em 117 processos reais do Estúdio, 75% dos campos já vêm prontos do modelo e sobram em média 14 perguntas por processo. 28 modelos ainda apontam para setores de outra prefeitura." (`docs/forms-modelo-analise.md`)

## 1:00 — O painel do implantador (10 s)
**Projetor: visão da prefeitura.** "Isto é o que o implantador vê: 12 secretarias, 96 processos de Vale Verde. Cada linha tem as etapas, de analisar a homologar." Clicar em **Alvará de Construção**.

## 1:10 — A conversa (70 s)
**Projetor: detalhe do Alvará** (conversa no centro, etapas à esquerda). Celular na câmera. Quem opera lê as falas de Dona Marlene, protocolo de Obras (`fixtures/insumos/conversa-marlene.txt`).
Marlene manda `/start`; o bot pergunta "Sobre qual serviço vamos conversar?" e ela escolhe **Alvará de Construção**. Cada mensagem aparece no painel em até 2 s.
- **Pergunta aberta**: o agente se apresenta e pergunta uma coisa só: "o que acontece, do balcão até o documento sair?". Marlene conta do jeito dela; o agente devolve **uma lista numerada de passos** e pergunta se está certo.
- **Modelo primeiro**: o agente manda o resumo e o PDF do que já está pronto ("Olha como já está pronto…") e pergunta "o que é diferente aí?". As diferenças voltam como **plano de ação** numerado; Marlene confirma numa mensagem e o código aplica.
- **Foto do papel**: o agente pede o requerimento de papel. Marlene manda `requerimento-alvara-papel.png`; o agente diz o que leu (tipo de obra, quem pede, documentos) e pergunta só o item apagado.
- **Foto da tabela da lei**: `tabela-zoneamento.png`, "tá meio apagada". O agente confere um caso concreto: "casa na ZR1 com 3 m de recuo volta, certo?".
- **"Isso é com o Paulo"**: vira pendência com dono, sem insistir.
- **"Tenho balcão, depois continuo"**: o agente encerra com o que já ficou e o que falta, e espera.

Apontar no painel: nenhuma mensagem com mais de 2 perguntas (o código recusa); embaixo de cada resposta, **o que foi registrado na ficha**, com origem; "extrair" acende nas fotos; a barra "Ficha por grupo" enche.
Frase para a banca: "Antes eram 49 perguntas em 15 mensagens, até 6 por mensagem. Agora são no máximo 2, e ela nunca lê 'template' nem 'campo'."

**Sessão 2 (contar, não rodar ao vivo):** no dia seguinte ela manda "bom dia voltei"; o agente retoma dali, confirma o "pacote padrão" de uma vez e fecha com o próximo passo: "a Aprova monta a tela e eu volto com 3 ou 4 situações pra você conferir". Ficha: 30/36 respondidas, 6 pendências com dono, nenhuma sem resposta (`transcricao-marlene-sessao2.md`).

**Variação entre rodadas:** a mesma conversa já fechou 30/36 e, noutra rodada, 25/36. Ao vivo, o operador lê as falas da Marlene no Telegram; se algo sair do roteiro, mostrar a rodada guardada em `data/vale-verde/alvara-marlene/` (ou as transcrições).

Opcional (10 s, se sobrar tempo): **"Assumir conversa"**. O implantador escreve uma mensagem pelo painel, ela aparece cinza "enviando…" e depois como bolha amarela "Implantador" no celular e no painel. "Devolver ao agente" e a conversa segue.

## 2:20 — O formulário e o diff (40 s)
**Projetor: detalhe, rolar até `diff.md`.** Etapa "aplicar" concluída com critérios verdes (formulário gerado, nenhum placeholder `modeload`, origem em cada mudança). Cada mudança com a origem (a foto do requerimento, a tabela da lei, a mensagem da Marlene). "O implantador lê isso em dois minutos em vez de fazer uma reunião de uma hora."

## 3:00 — A validação sem clique (25 s)
**Projetor: detalhe, coluna "Cenários" e etapa "validar".**
Template cru: **12/15**, falha recuo, taxa de ocupação e cidade (terminal, se der tempo: `npm run validate -- fixtures/templates/alvara-construcao.modeload.json fixtures/cenarios/alvara.cenarios.json`).
Formulário de Vale Verde: **15/15** nos cenários base. Na rodada ao vivo (`alvara-demo`) o validador partiu desses 15 e escreveu mais 15: **30/30**, nenhuma expressão indeterminada nova, e o juiz confirmou que os cenários cobrem a ficha.
Gate de homologação aberto (card laranja no topo): ler a instrução em voz alta ("2 pendências, cenários 30/30, diff em diff.md") e clicar **aprovar**. "Cada cenário é uma frase que o analista entende. O que falhar por regra de negócio vira pergunta no WhatsApp ou decisão do implantador, não ticket."

**Conferir (se o processo chegou lá):** o código escolhe até 3 cenários que passam e os manda à analista em linguagem de balcão; ela confirma no celular antes da homologação. Ainda não visto ao vivo depois das correções: se não aparecer, só contar.

## 3:25 — Outro processo, mesmo chat (20 s)
**Celular:** o analista escreve `menu` e digita **Solicitação de Férias** (aceita o nome de qualquer um dos 112 processos ativos, não só os 10 da lista). **Projetor: detalhe de Férias.** O agente abre o processo em uma linha: 10 perguntas em vez de 28 campos, e a primeira é o setor, porque o modelo veio com o setor de outra prefeitura (`csimplantacao_implantacaoad`). "Mesmo analista, outra secretaria, sem reunião nova. E o Alvará continua de onde parou: se ele voltar, o agente diz quantas perguntas faltam."

## 3:45 — Métricas e fechamento (15 s)
**Projetor: voltar para a visão da prefeitura.** As 4 métricas do topo mudaram durante a demo: processos prontos, horas de reunião evitadas, perguntas respondidas sem reunião, cenários passando. Horas de reunião → 0 nos simples. Rodadas de homologação → 1. 4 projetos → 8 por implantador.

## Backup

### Fallback sem API (sem LLM, sem internet)
Se a API da Anthropic ou o canal cair, o painel continua contando a história com dados determinísticos:

```bash
npm run pipeline:offline                    # analisar → coletar → aplicar → validar sem LLM; apaga e regrava data/vale-verde/alvara/; para no gate de homologação
npm run painel                              # http://localhost:4310 → clicar em Alvará de Construção
npm run gate -- vale-verde alvara aprovar   # ou clicar "aprovar" no card do gate
```

Não há conversa nesse modo: o painel mostra os registros da ficha de exemplo (25 respostas, 11 pendências). Etapas, critérios, gate, diff e 15/15 cenários são reais.

### Fallback com API, sem celular
A conversa redesenhada está guardada em `data/vale-verde/alvara-marlene/` (transcrições `fixtures/insumos/transcricao-marlene.md` e `transcricao-marlene-sessao2.md`). Para reproduzir no terminal, num processo novo:

```bash
npm run chat -- --script fixtures/insumos/conversa-marlene.txt --processo alvara-marlene-ao-vivo --pausa 3000
npm run chat -- --script fixtures/insumos/conversa-marlene-sessao2.txt --processo alvara-marlene-ao-vivo --continuar
```

A rodada anterior (conversa "antes") vai até o fim do pipeline: está em `data/vale-verde/alvara-demo/` (linha extra na mesma secretaria do painel, com o slug no nome), parada no gate de homologação: 34 respostas (3 pela foto), 2 pendências com dono, 30/30 cenários. Transcrições: `fixtures/insumos/transcricao-demo-antes.md` e `transcricao-demo-fechamento.md`.

```bash
npm run gate -- vale-verde alvara-demo status
npm run gate -- vale-verde alvara-demo reexecutar validar   # mostra o validador ao vivo de novo (precisa de API)
npm run gate -- vale-verde alvara-demo aprovar              # só no fim: depois de aprovar o gate some
```

Para reproduzir a conversa antiga no terminal, num processo novo para não apagar a gravação:

```bash
npm run chat -- --script fixtures/insumos/conversa-demo.txt --processo alvara-ao-vivo --pausa 3000
npm run chat -- --script fixtures/insumos/conversa-demo-fechamento.txt --processo alvara-ao-vivo --continuar   # "dia seguinte": fecha a ficha e segue até homologar
```

### Fallback sem servidor
Se nem o Node subir: `painel/data.json` (gerado por `npm run painel:data` no ensaio) é lido pelo modo estático. Servir a pasta com qualquer servidor estático e abrir `index.html?static=1`:

```bash
python3 -m http.server 4310 -d painel   # http://localhost:4310/?static=1
```

O indicador no canto superior direito fica amarelo ("cópia estática") e os botões ficam desabilitados.

### Vídeo
Vídeo de 3 min gravado às 15h30 com o mesmo fluxo (celular + painel lado a lado).

## Perguntas prováveis da banca
- **"E quando o template não existe?"** O analisador funciona em qualquer Formly JSON; sem template, a ficha vira entrevista aberta guiada pelos tipos de ponto.
- **"Como garante que o agente não inventa regra?"** Toda resposta tem origem e confiança; abaixo de 0,8 não é aplicada; a ficha de exemplo tem 11 pendências explícitas. No painel, cada registro aparece embaixo da mensagem que o gerou.
- **"E se o cenário falhar por erro do próprio agente?"** A falha é classificada: cenário que esqueceu uma pré-condição ou escreveu num campo calculado volta ao validador; campo inexistente ou expressão indeterminada vai ao implantador; só divergência de regra chega ao analista, como frase de balcão de até 240 caracteres sem nome de campo.
- **"E se o agente se perder na conversa?"** O implantador assume a conversa pelo painel, responde como humano e devolve ao agente. Fica registrado como intervenção.
- **"Isso entra na operação?"** A saída é o mesmo JSON do configurador. O passo seguinte é um botão "importar ficha" no configurador e trocar o Telegram pelo WhatsApp oficial.
