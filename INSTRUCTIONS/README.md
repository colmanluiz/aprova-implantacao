# INSTRUCTIONS

O processo de parametrização é um **pipeline validado**, declarado em `pipeline.json` e documentado em [`PIPELINE.md`](PIPELINE.md) (gerado por `npm run docs`; um teste falha se ficar desatualizado). Cada etapa é código ou agente, tem critérios de saída e uma rota para quando falha. O motor (`src/pipeline/motor.ts`) executa a etapa, avalia os critérios em ordem e decide: seguir, esperar, tentar de novo com o motivo, ou abrir um gate para o analista ou o implantador. As regras de transição estão em `00-orquestrador.md`.

Cada arquivo `.md` numerado é a instrução de um agente. `src/agents/run-agent.ts` carrega o arquivo como `system` e entrega as ferramentas daquele agente.

| Etapa (`pipeline.json`) | Tipo | Arquivo | Quando roda | Ferramentas |
|---|---|---|---|---|
| `analisar` | código | `01-analisador-template.md` (referência do formato da ficha) | Uma vez, ao abrir o processo | — |
| `coletar` | agente | `02-coletor.md` | A cada mensagem do analista | `ler_ficha`, `registrar_resposta`, `enviar_mensagem`, `pedir_extracao` |
| `extrair` (dentro de `coletar`) | agente | `03-extrator.md` | Quando chega anexo (via `pedir_extracao`) | nenhuma (saída estruturada) |
| `aplicar` | código | `04-aplicador.md` | Quando a coleta fecha | — |
| `validar` | agente + código | `05-validador.md` | Depois de aplicar, e a cada retentativa ou ajuste | `ler_ficha`, `rodar_cenarios` |
| `homologar` | gate do implantador | `00-orquestrador.md` | Depois de validar | `npm run gate` |

`00-orquestrador.md` não é instrução de agente: descreve as transições que o motor aplica (aguardando, falhou, retentativa, gates, modo humano).

Regras comuns a todos os agentes:

- Português do Brasil, linguagem de servidor público, sem jargão de software.
- Nunca inventar regra de negócio. O que não está na ficha, no template ou na resposta do analista é pendência.
- Nenhum agente publica configuração na Aprova. O implantador revisa o diff antes de qualquer coisa ir para a prefeitura.
- Toda resposta registrada carrega `origem` (mensagem, anexo, template) e `confianca` (0 a 1), e precisa respeitar o formato do tipo da pergunta; fora do formato, a ferramenta devolve `schema_invalido` e nada é gravado.
- Quando o pipeline devolver uma mensagem `[pipeline] O critério de saída "…" falhou`, corrija só o que o critério aponta.
