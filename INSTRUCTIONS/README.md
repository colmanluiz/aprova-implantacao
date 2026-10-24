# INSTRUCTIONS

Cada arquivo aqui é a instrução de um agente especializado. O código em `src/agents/run-agent.ts` carrega o arquivo como `system` e entrega as ferramentas de `src/core/` para aquele agente. O orquestrador decide qual agente chamar em cada etapa do processo.

| Arquivo | Agente | Quando é chamado | Responsável por | Ferramentas |
|---|---|---|---|---|
| `00-orquestrador.md` | Orquestrador | A cada mensagem recebida no canal e a cada evento do pipeline | Decidir a próxima etapa do processo e qual agente age | `estado_processo`, `avancar_etapa` |
| `01-analisador-template.md` | Analisador | Uma vez por processo, quando o implantador escolhe o template | Transformar os pontos de parametrização extraídos pelo código em perguntas de servidor, agrupadas por tema | `analisar_template` |
| `02-coletor.md` | Coletor | A cada mensagem do analista da prefeitura | Conduzir a ficha no WhatsApp em lotes curtos, registrar respostas com origem e confiança, nunca inventar regra | `ler_ficha`, `registrar_resposta`, `enviar_mensagem`, `pedir_extracao` |
| `03-extrator.md` | Extrator | Quando chega anexo (foto, PDF, planilha, print) | Ler o anexo e devolver candidatos de resposta para a ficha, com trecho de origem e confiança | nenhuma (recebe o anexo e devolve JSON estruturado) |
| `04-aplicador.md` | Aplicador | Quando a ficha fecha | Chamar o código que gera o formulário e escrever o diff legível para o implantador | `aplicar_ficha`, `gerar_diff` |
| `05-validador.md` | Validador | Após o aplicador, e a cada correção | Gerar cenários de teste a partir da ficha, rodar no avaliador e transformar falhas em perguntas de confirmação | `rodar_cenarios`, `enviar_mensagem` |

Regras comuns a todos os agentes:

- Português do Brasil, linguagem de servidor público, sem jargão de software.
- Nunca inventar regra de negócio. O que não está na ficha, no template ou na resposta do analista é pendência.
- Nenhum agente publica configuração na Aprova. O implantador revisa o diff antes de qualquer coisa ir para a prefeitura.
- Toda resposta registrada carrega `origem` (mensagem, anexo, template) e `confianca` (0 a 1).
