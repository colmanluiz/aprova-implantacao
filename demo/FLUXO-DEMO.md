# Fluxo da demo (ensaiado às 16:50, replicar igual)

Dois monitores: **projetor** com o painel (`npm run painel` → http://localhost:4310) e os slides do pitch; **celular** no Telegram com `@hackaton_aprova_bot`. Terminal aberto na aba do bot (`env CIDADE=vale-verde npm run telegram`).

## Antes de começar (5 min)

```bash
cd ~/projects/aprova-implantacao
npm test                                  # 106 verdes
npm run gate -- vale-verde alvara-demo status   # gravação 30/30, gate de homologação
rm -rf data/vale-verde/.canais data/vale-verde/alvara-de-construcao data/vale-verde/solicitacao-de-ferias   # limpa chats de teste
```

Abrir duas abas de terminal: uma com `env CIDADE=vale-verde npm run telegram`, outra com `npm run painel`. No projetor, o painel na visão da prefeitura. As falas estão em `demo/falas-marlene.txt` e `demo/falas-rafael.txt`; as fotos em `fixtures/insumos/` (mandar do celular: `tabela-zoneamento.png`).

## Cena 1 · A conta e o template (1 min, slides 1 e 2)

Slide 1. Depois, no terminal: `npm run analyze -- fixtures/templates/alvara-construcao.modeload.json > /dev/null` e ler em voz alta a linha de resumo: 134 campos, 160 regras, 36 perguntas, e o `'Cascavel'` esquecido.

## Cena 2 · Dona Marlene no celular (3 min)

| Quem | O que faz | O que aparece |
|---|---|---|
| Celular | `/start`, depois `1` | Menu "Sobre qual serviço vamos conversar?", "Combinado: Alvará de Construção." |
| Agente | apresentação, resumo "Olha como já está pronto…", **PDF**, "o que é diferente aí?" | Projetor: nova linha "Alvará de Construção" em Planejamento Urbano, etapa Coletar |
| Celular | fala 1 (AutoCAD e elétrico/hidráulico) | Agente: "Então fica assim… Pode ser?" |
| Celular | `isso, pode tirar` | Agente: "Pronto, já tirei…" e pergunta a secretaria |
| Celular | fala da secretaria (Marlene, Paulo, secretário) | Agente pede a foto da tabela da lei |
| Celular | foto `tabela-zoneamento.png` | Agente lê as 4 zonas, fecha: "agora a Aprova monta e eu volto com 3 ou 4 casos" |
| Pipeline | sozinha: Gerar formulário → Validar (89 cenários) → Conferir | Projetor: faixa de etapas avançando; detalhe mostra os critérios passando |
| Agente | "Antes de liberar, confere estes casos pra mim: 1… 2… 3… Está certo assim?" | Celular recebe os 3 casos |
| Celular | `tá certo, pode liberar` | Projetor: etapa Homologar com gate para o implantador |

Falar enquanto a pipeline roda (uns 60 a 90 s): apontar no painel que cada etapa tem regra de saída, que a foto virou dataset com origem "Anexo II, Lei 1.204", que o `Cascavel` foi trocado pelo nome da cidade sem perguntar nada à Marlene.

## Cena 3 · O implantador decide (1 min)

No projetor, clicar no processo → cartão do gate → **Aprovar**. Mostrar o `diff.md` (cada mudança com origem) e o relatório de cenários. Se perguntarem "e se ele quiser mudar algo?": clicar **Ajustar**, mostrar o editor por tipo.

## Cena 4 · Rafael, outra secretaria (1 min)

Celular: `menu` → `6` (Solicitação de Férias). O agente mostra o modelo de RH e pergunta o que é diferente. Falas do Rafael (`demo/falas-rafael.txt`). Ponto a destacar: o modelo de Férias vem com um setor de outra prefeitura (`csimplantacao_implantacaoad`); o analisador acha e troca.

## Cena 5 · Métricas e fechamento (30 s, slides 7 e 8)

Painel na visão da prefeitura: processos prontos, horas de reunião evitadas, cenários passando. Slide final com o link do repositório.

## Se der errado

- **Sem rede ou API fora**: `npm run pipeline:offline` + `npm run gate -- vale-verde alvara aprovar` (nenhuma chamada de IA) e narrar a conversa pela transcrição `fixtures/insumos/transcricao-marlene.md`.
- **Bot não responde**: `Ctrl-C` na aba e `env CIDADE=vale-verde npm run telegram` de novo; o processo continua de onde parou.
- **O agente desviar do roteiro**: responder o que ele perguntou, com as falas como referência; as falas não dependem de ordem exata.
- **A conferência não aparecer**: abrir o detalhe no painel e mostrar a etapa "Conferir com a prefeitura" no diário; a gravação `alvara-ensaio` tem a conferência aprovada.
