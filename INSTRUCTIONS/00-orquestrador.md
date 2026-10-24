# Orquestrador

O orquestrador não é um agente que decide no improviso. É o motor do pipeline validado (`src/pipeline/motor.ts`), que segue a definição declarativa em `pipeline.json` (tabela em `PIPELINE.md`). Este arquivo descreve as regras que o código aplica. Se um dia o código e este texto divergirem, o código está errado.

## Etapas

`analisar` → `coletar` (com `extrair` dentro, a cada anexo) → `aplicar` → `validar` → `homologar`

Cada etapa tem critérios de saída, avaliados em ordem. A avaliação para no primeiro critério que não passou.

## Resultado de um critério

- **passou**: segue para o próximo critério; se todos passaram, a etapa fica `concluida` e o processo vai para a próxima.
- **aguardando**: ainda não terminou, e isso não é erro. A etapa fica aberta (`aguardando`), nenhuma tentativa é gasta. Exemplo: a ficha ainda tem perguntas sem resposta porque o analista não respondeu.
- **falhou**: gasta uma tentativa. A etapa roda de novo **na mesma conversa** do agente, com uma mensagem curta dizendo qual critério falhou e por quê (sem reenviar a instrução inicial). Etapa de código determinístico tem 0 tentativas: repetir não muda o resultado.
- **nao_avaliado**: não deu para avaliar (ex.: o juiz quando o pipeline roda sem LLM). Não bloqueia.

## Sem tentativas: para onde vai (`ao_falhar`)

- `analista`: abre um gate para o analista. A pergunta sai pelo canal (WhatsApp/Telegram) em linguagem de cenário, por exemplo: "Se o requerente for empresa e não anexar contrato social, o sistema deve barrar o protocolo?" A próxima mensagem do analista resolve o gate: "sim" aprova; qualquer outra resposta vira ajuste e volta para o agente da etapa.
  Antes de sair, o motor confere a pergunta: ela precisa ser a `descricao` de um cenário que falhou por **regra** (não por pré-condição esquecida nem por falha técnica), escrita como regra de balcão: sem "Diagnóstico", sem nome de campo (`tipo_logradouro`, `tipoLogradouro`, `model.x`), sem chaves ou colchetes e com até 240 caracteres. Se não passar, o gate vai para o implantador.
- `implantador`: abre um gate para o implantador, gravado em `run.json` (campo `gate`) e anotado em `pendencias.md`.
- `parar`: o processo fica `parado`.

## Gates

Todo gate se explica sozinho: `{ para, tipo, instrucao, resumo, acoes: ["aprovar","ajustar","rejeitar"], aberto_em, contexto }`.

- **aprovar**: aceita como está. O critério que falhou passa a contar como aprovado por quem decidiu, e o processo segue.
- **ajustar**: exige texto. Linhas no formato `pergunta_id=valor` corrigem a ficha (o valor passa pelo mesmo contrato de formato do `registrar_resposta`); se o formulário já tinha sido gerado, o processo refaz a partir de `aplicar`. Texto livre volta como orientação para o agente da etapa (em `homologar`, vai para o validador).
- **rejeitar**: o processo para.

Comando: `npm run gate -- <cidade> <processo> <aprovar|ajustar|rejeitar> [texto]`. No código: `resolverGate(ctx, acao, texto?)`.

Para testar de novo uma etapa sem refazer a conversa: `npm run gate -- <cidade> <processo> reexecutar <etapa>` (`reexecutarEtapa` no código). Reabre a etapa e as seguintes (critérios não avaliados, tentativas zeradas, aprovações antigas descartadas), apaga a conversa do agente daquela etapa (e, em `validar`, os cenários e o relatório) e roda o pipeline dali para a frente.

## Coletar é uma etapa longa

A cada mensagem do analista, o Coletor roda com as suas ferramentas e, em seguida, os critérios de `coletar` são reavaliados. Uma pergunta está "em aberto" quando não tem resposta com confiança de pelo menos 0,8 e ainda não virou pendência explícita ("analista não sabe"). Resíduos de outra cidade nunca são perguntados à prefeitura: são assunto do implantador.

Resposta fora do formato (`schema_invalido`) só conta como falha na segunda rejeição seguida da mesma pergunta. A primeira é uma chance para o Coletor corrigir sozinho.

Mensagem ao analista fora dos limites da conversa (`mensagem_recusada`: mais de 2 perguntas, mais de 70 palavras com pergunta, mais de 160 sem pergunta, ou palavra de sistema como "template" e "parametrização") não sai pelo canal e volta ao Coletor para reescrever; nunca conta como falha do analista. O mesmo limite vale para a pergunta de um gate ao analista: se não passar, o gate vai ao implantador.

Quando chega anexo, a sub-etapa `extrair` roda dentro de `coletar`, com o seu próprio critério ("todo candidato cita trecho e confiança"). Se não chegar nenhum anexo, `extrair` é fechada junto com `coletar`.

## Modo humano

O implantador pode assumir a conversa com o analista a qualquer momento (`npm run gate -- <cidade> <processo> assumir`). Enquanto isso:

- o agente não responde e nenhum critério é avaliado; as mensagens do analista ficam guardadas no histórico;
- a etapa continua onde estava (normalmente `coletar` segue aberta);
- as mensagens que o implantador manda pelo canal entram no histórico como dele.

Ao devolver (`... devolver`), a próxima mensagem do analista chega ao Coletor com uma nota: "Enquanto o agente estava pausado, o implantador trocou estas mensagens com o analista: …". Assim o Coletor continua a ficha sem repetir perguntas. Cada vez que o implantador assume, `run.json` conta uma intervenção humana.

## Status do processo (`run.json`)

- `executando`: o motor está trabalhando.
- `aguardando_prefeitura`: esperando o analista (coleta aberta ou gate para o analista).
- `aguardando_implantador`: gate aberto para o implantador (falha ou homologação).
- `concluido`: o implantador aprovou na homologação.
- `parado`: alguém rejeitou ou um critério com `ao_falhar: parar` falhou.

## Snapshot

Ao abrir o processo, o template e o `pipeline.json` são copiados para `data/<cidade>/<processo>/snapshot/`. O processo sempre roda a partir dessa cópia: mudar o pipeline no meio não afeta processos já abertos.

## Métrica de horas evitadas

Quando o processo chega a `aplicar` sem nenhum gate para o analista, conta 1 hora de reunião evitada. Se houve gate para o analista, conta 0,67 (cerca de 20 minutos de ligação em vez de 1 hora de reunião).

## O que o orquestrador nunca faz

- Pular o Validador.
- Fechar a coleta com pergunta em aberto.
- Mandar mensagem para a prefeitura sem passar pelo Coletor ou por um gate.
- Publicar qualquer coisa sem a aprovação do implantador em `homologar`.
