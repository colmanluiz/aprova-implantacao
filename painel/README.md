# Painel do implantador

O que o implantador olha para supervisionar dezenas de processos ao mesmo tempo, e o que a banca vê ao lado do celular na demo. Atualiza sozinho a cada 2 s enquanto a conversa acontece.

```bash
npm run painel        # http://localhost:4310  (PAINEL_PORT muda a porta)
npm run painel:data   # grava painel/data.json (cópia estática para o vídeo e para o fallback)
```

- `src/painel/server.ts`: `node:http` puro. Lê `data/` a cada requisição, sem cache.
- `src/painel/visao.ts`: monta o modelo de visão (seed + `data/<cidade>/*/`). Todo arquivo é opcional; JSON corrompido ou pela metade conta como ausente.
- `painel/index.html`, `app.js`, `styles.css`: HTML + JS puro, sem build e sem CDN obrigatório (a fonte Inter vem do Google Fonts e cai para a fonte do sistema quando não há internet). Tokens de design no espírito do shadcn/ui, nas cores da Aprova (`aprova-wordmark.svg` é o wordmark do site).
- `APROVA_DATA=<pasta> npm run painel` lê outra pasta de dados (a mesma variável do pipeline); serve para ensaiar com `data/` vazia sem apagar nada.

## Telas

- **Visão da prefeitura** (`#/`), de cima para baixo: as 4 métricas do roteiro (processos prontos, horas de reunião evitadas, perguntas respondidas sem reunião, cenários passando); a fila **Precisa de você** (gate para o implantador, processo parado, etapa que falhou, conversa assumida, analista sem responder há 24 h ou mais) e **Esperando a prefeitura** (pergunta ao analista, coleta aberta, sem resposta há menos de 24 h); depois as 12 secretarias com todos os processos, uma linha por processo com a faixa de etapas (7; processos abertos antes da conferência mostram as 6 do snapshot deles), o status e, para quem tem dados, uma linha de números em palavras ("24 de 33 respondidas · 11 pendências · 15/15 cenários · sem resposta há 2 h"). Dentro da secretaria as linhas vêm na ordem: precisa de você › esperando a prefeitura › com dados › não iniciados. Linha não iniciada também abre o detalhe (estado vazio), pelo `slug_previsto`.
- **Detalhe do processo** (`#/p/<cidade>/<slug>`): faixa grande com as etapas nomeadas; o gate como cartão de decisão (resumo, pendências e cenários do `contexto`, instrução completa dobrada, Aprovar / Ajustar com caixa de texto / Rejeitar com confirmação inline); etapas como texto corrido com critérios, detalhe e tentativas; conversa com três vozes (analista à direita em verde, agente à esquerda em branco, implantador à esquerda em ciano) e, sob cada mensagem do agente, o que ele registrou na ficha com a pergunta por extenso, o valor legível, a confiança e a origem; notas internas do agente (texto final do turno, que não vai ao canal) ocultas por padrão, com botão para mostrar; Assumir / Devolver com confirmação inline e caixa de envio só no modo humano; ficha por grupo com as perguntas dobráveis; cenários com os que falharam explicados em linguagem de balcão; `diff.md` e `pendencias.md` como listas, não como markdown cru.
- **Estados sem dados**: `data/` vazia (fila vazia com explicação, todas as linhas apagadas), processo sem pasta (tela "ainda não tem dados"), pasta sem `run.json` (etapas deduzidas, com aviso no cartão), API fora do ar (faixa de aviso e últimos dados na tela; se não há nada, tela única explicando como subir o painel).
- **Estático** (`?static=1`, ou automático se a API não responder): lê `painel/data.json`. Ações ficam desabilitadas. Precisa ser servido por HTTP (o próprio `npm run painel`, ou `python3 -m http.server -d painel`), porque `file://` bloqueia o `fetch`.

## API

| Rota | O que faz |
|---|---|
| `GET /api/visao` | Seed (`fixtures/seed/processos.json`) sobreposto por `data/<cidade>/*/`. Cada processo traz, além do contrato original, os campos opcionais `ultima_mensagem_em`, `ultima_voz`, `sem_resposta_horas` (só quando o processo depende da prefeitura: `aguardando_prefeitura`, gate ao analista ou `coletar` em andamento; conta desde a última fala nossa sem resposta), `atencao` (`{tipo: gate|parado|falhou|humano|sem_resposta, desde, texto}`, null quando nada depende do implantador; `sem_resposta` só a partir de `LIMIAR_SEM_RESPOSTA_HORAS` = 24) e `slug_previsto` (processo ainda sem pasta). `metricas` ganha `precisam_implantador` e `aguardando_prefeitura`. `gate` ganha `etapa`, `resumo` e `aberto_em` quando existem em `run.json`. A pasta `alvara` casa com "Alvará de Construção" (p001); as demais casam pelo título normalizado ou por `run.json.titulo`. Pasta sem par livre no seed (ex.: `alvara-demo` ao lado de `alvara`) vira linha extra na secretaria do processo com o mesmo título (`run.titulo` ou `ficha.processo`), com o slug no nome; sem título, vai para "Outros". |
| `GET /api/processo/:cidade/:slug` | `run`, `estado` (resumo), `conversa` (histórico com `registros` por turno), `registros_sem_turno`, `modo`, `assumida_em`, `intervencoes`, `outbox_pendente`, `ficha`, `ficha_progresso`, `relatorio`, `metricas`, `diff`, `pendencias`. Cada item de `conversa` traz também `voz` (`analista`, `agente`, `implantador`, `nota` = texto final do turno do agente que não vai ao canal, `sistema` = mensagem do motor), `texto` (o que a voz disse de fato, sem o embrulho "Prefeitura: … Mensagem do analista: …") e `anexo` (nome do arquivo quando o analista mandou um). `role`, `content` e `autor` continuam como estão em `estado.json`. |
| `POST /api/gate/:cidade/:slug` `{acao, texto}` | `npm run gate -- <cidade> <slug> <acao> [texto]` |
| `POST /api/conversa/:cidade/:slug/modo` `{modo}` | `humano` → `npm run gate -- <cidade> <slug> assumir`; `agente` → `... devolver` |
| `POST /api/conversa/:cidade/:slug/enviar` `{texto}` | Acrescenta `{id, texto, autor: "implantador", em, enviado: false}` a `data/<cidade>/<slug>/outbox.json`. O processo do canal entrega e marca `enviado: true`. |

A CLI do pipeline fica numa constante (`CLI_ACOES` em `server.ts`): usa o primeiro script que existir entre `gate` e `acao`. Se nenhum existir ou não iniciar, a rota responde **501** e o painel desabilita os botões com a explicação no tooltip.

## Arquivos lidos por processo (`data/<cidade>/<processo>/`)

| Arquivo | Uso |
|---|---|
| `run.json` | Fonte principal: `status`, `etapa_atual`, `etapas[].criterios`, `gate`, `metricas` (inclusive `intervencoes_humanas`, se houver) |
| `estado.json` | `historico[]` (com `autor: "implantador"` opcional), `registros[]`, `modo` (`agente`/`humano`), `intervencoes[]` (`{tipo: "assumir"|"devolver", em, por?}`) |
| `ficha.json` | Progresso por grupo. Respondida = `resposta` não nula e `confianca >= 0.8`; "por anexo" quando `origem` cita anexo/foto/PDF/planilha |
| `relatorio.json` | Lista de cenários PASS/FAIL |
| `diff.md`, `pendencias.md` | Mostrados como texto |
| `outbox.json` | Mensagens do implantador ainda não entregues ("enviando…") |

Sem `run.json`, as etapas são inferidas de `estado.etapa` (formato de `src/agents/store.ts`) e do que existe em disco (`ficha.json`, `form.json`/`diff.md`, `relatorio.json`). Sem nada, o processo fica "não iniciado" com os dados do seed.

## Exemplo para desenvolvimento

`fixtures/exemplos/{run,estado,relatorio}.vale-verde.alvara.json`: alvará parado em "validar", 13/15 cenários, gate de aprovação para o implantador. Para usar, copie para `data/vale-verde/alvara/` **só se o arquivo não existir** (`data/` não vai para o git):

```bash
for f in run estado relatorio; do [ -e data/vale-verde/alvara/$f.json ] || cp fixtures/exemplos/$f.vale-verde.alvara.json data/vale-verde/alvara/$f.json; done
```
