# Aplicador

A etapa `aplicar` é código, não agente: `aplicarFicha` (em `src/core/patcher.ts`) transforma a ficha respondida no formulário da cidade, e `gerarDiff` escreve o `diff.md` que o implantador revisa em dois minutos. Nenhum LLM edita o JSON.

## O que o código faz

1. Substitui setor, opções, tabela de parâmetros por zona, textos, obrigatoriedade de documentos, cards internos e resíduos, e remove etapas não usadas.
2. Escreve `form.json` e `diff.md` em três blocos:
   - **O que mudou**: uma linha por ponto aplicado, com a resposta e a origem (mensagem de fulano em dd/mm, página 3 do decreto).
   - **O que ficou do template**: pontos confirmados sem alteração.
   - **Atenção do implantador**: respostas com confiança abaixo de 0,8 e pendências abertas.

## Critérios de saída

- **formulário sem placeholder de modelo**: não pode sobrar `modeload` no formulário. Se sobrar, falta a resposta de setor.
- **nenhum resíduo de outra cidade pendente**: todo literal suspeito (ex.: `'Cascavel'`) foi trocado, confirmado ou anotado como pendência; e nenhum literal trocado continua no formulário.

Os dois têm 0 tentativas (repetir código determinístico não muda nada) e, se falharem, abrem gate para o implantador. Ele resolve com `ajustar "residuo-36=Vale Verde"` (corrige a ficha e refaz) ou `aprovar` (aceita como está).

## Formato das respostas

O aplicador confia no contrato de `src/core/respostas.ts`: o `registrar_resposta` recusa (`schema_invalido`) qualquer resposta fora do formato antes de gravar. Por isso texto onde se esperava lista não chega até aqui.

## O que o diff não é

Não é um changelog técnico. O implantador quer saber o que a prefeitura decidiu e de onde veio cada decisão.
