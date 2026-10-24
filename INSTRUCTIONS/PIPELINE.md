# Pipeline validado

> Gerado por `npm run docs` a partir de `INSTRUCTIONS/pipeline.json`. Não edite à mão: o teste `docs` falha se este arquivo ficar desatualizado.

Cada etapa roda e só termina quando todos os seus critérios de saída passam, avaliados em ordem. `aguardando` mantém a etapa aberta sem gastar tentativa; `falhou` gasta uma tentativa e refaz a etapa com o motivo; sem tentativas, o critério segue a rota `ao_falhar`.

| # | Etapa | Tipo | Agente | Critérios de saída | Tentativas | Ao falhar |
|---|---|---|---|---|---|---|
| 1 | Analisar template (`analisar`) | código | — | ficha tem perguntas bloqueantes<br>nenhum placeholder sem pergunta | 0<br>0 | gate do implantador<br>gate do implantador |
| 2 | Coletar respostas (`coletar`) | agente | `coletor` | analista decidiu sobre o modelo<br>plano de ação confirmado<br>nenhuma pergunta em aberto | 0<br>1<br>1 | pergunta ao analista<br>gate do implantador<br>pergunta ao analista |
| 3 | Ler anexos (`extrair`, dentro de `coletar`) | agente | `extrator` | todo candidato cita trecho e confiança | 1 | pergunta ao analista |
| 4 | Gerar formulário (`aplicar`) | código | — | formulário sem placeholder de modelo<br>nenhum resíduo de outra cidade pendente | 0<br>0 | gate do implantador<br>gate do implantador |
| 5 | Validar com cenários (`validar`) | agente | `validador` | todos os cenários passam<br>nenhuma expressão indeterminada nova<br>cenários cobrem a ficha _(juiz LLM)_ | 1<br>1<br>2 | pergunta ao analista<br>gate do implantador<br>gate do implantador |
| 6 | Conferir com a prefeitura (`conferir`) | código + gate analista | — | analista conferiu os casos | 0 | gate do implantador |
| 7 | Homologar (`homologar`) | código + gate implantador | — | implantador aprovou | 0 | para o processo |

## Analisar template

O código lê o modelo de formulário da Aprova e lista só o que muda de uma cidade para outra, em forma de perguntas.

- **ficha tem perguntas bloqueantes**: 0 tentativas extra; depois, gate do implantador.
- **nenhum placeholder sem pergunta**: 0 tentativas extra; depois, gate do implantador.

## Coletar respostas

O agente pergunta como o serviço funciona hoje, devolve o passo a passo, mostra o que a Aprova já tem pronto (resumo e PDF) e pergunta o que é diferente; as diferenças viram um plano de ação que o analista confirma. Depois pergunta só o que o modelo não tem como saber (setor, fotos do requerimento e da tabela da lei, taxa).

- **analista decidiu sobre o modelo**: 0 tentativas extra; depois, pergunta ao analista.
- **plano de ação confirmado**: 1 tentativa extra; depois, gate do implantador.
- **nenhuma pergunta em aberto**: 1 tentativa extra; depois, pergunta ao analista.

## Ler anexos

Quando o analista manda foto, PDF ou planilha, o agente lê o arquivo e sugere respostas citando de onde tirou cada uma.

Roda dentro de `coletar`, cada vez que chega um anexo.

- **todo candidato cita trecho e confiança**: 1 tentativa extra; depois, pergunta ao analista.

## Gerar formulário

O código monta o formulário da cidade a partir das respostas, sem IA, e escreve um resumo do que mudou e por quê.

- **formulário sem placeholder de modelo**: 0 tentativas extra; depois, gate do implantador.
- **nenhum resíduo de outra cidade pendente**: 0 tentativas extra; depois, gate do implantador.

## Validar com cenários

O agente escreve situações de teste a partir das respostas e o código confere se o formulário se comporta como a prefeitura disse.

- **todos os cenários passam**: 1 tentativa extra; depois, pergunta ao analista.
- **nenhuma expressão indeterminada nova**: 1 tentativa extra; depois, gate do implantador.
- **cenários cobrem a ficha** (juiz LLM, falha fechada): 2 tentativas extra; depois, gate do implantador.
  - Rubrica: Para cada pergunta respondida da ficha existe pelo menos um cenário que exercita a resposta (um model que passa pelo campo afetado e uma expectativa sobre ele). Perguntas sem efeito testável no formulário (setor, cards internos, documento final) contam como cobertas se o formulário as reflete. Responda pass=false e liste em faltam os ids das perguntas sem cenário.

## Conferir com a prefeitura

O código escolhe alguns casos do formulário pronto, em linguagem de balcão, e o analista confere. Se algo estiver errado, a conversa volta ao plano de ação.

- **analista conferiu os casos**: 0 tentativas extra; depois, gate do implantador.

## Homologar

O implantador revisa o resumo das mudanças, as pendências e os cenários, e aprova antes de qualquer coisa ir para a prefeitura.

- **implantador aprovou**: 0 tentativas extra; depois, para o processo.
