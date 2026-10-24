# Painel do implantador

O que o implantador olha para supervisionar dezenas de processos ao mesmo tempo, e o que a banca vê ao lado do celular na demo. Atualiza sozinho a cada 2 s enquanto a conversa acontece.

```bash
npm run painel        # http://localhost:4310  (PAINEL_PORT muda a porta)
npm run painel:data   # grava painel/data.json (cópia estática para o vídeo e para o fallback)
```

- `src/painel/server.ts`: `node:http` puro. Lê `data/` a cada requisição, sem cache.
- `src/painel/visao.ts`: monta o modelo de visão (seed + `data/<cidade>/*/`). Todo arquivo é opcional; JSON corrompido ou pela metade conta como ausente.
- `painel/index.html`, `app.js`, `styles.css`: HTML + JS puro, sem build e sem CDN (funciona offline).

## Telas

- **Visão da prefeitura** (`#/`): as 4 métricas do topo (processos prontos, horas de reunião evitadas, perguntas respondidas sem reunião, cenários passando), as 12 secretarias e cada processo com a faixa de 6 etapas (`analisar › coletar › extrair › aplicar › validar › homologar`), o status e o selo "aguardando analista/implantador" quando há gate aberto.
- **Detalhe do processo** (`#/p/<cidade>/<slug>`): linha do tempo das etapas com critérios, detalhe e tentativas; card do gate com botões; conversa do WhatsApp com os registros feitos em cada turno do agente; botão "Assumir conversa" / "Devolver ao agente" e caixa de envio no modo humano; números do processo; ficha por grupo; cenários; `diff.md` e `pendencias.md`.
- **Estático** (`?static=1`, ou automático se a API não responder): lê `painel/data.json`. Ações ficam desabilitadas. Precisa ser servido por HTTP (o próprio `npm run painel`, ou `python3 -m http.server -d painel`), porque `file://` bloqueia o `fetch`.

## API

| Rota | O que faz |
|---|---|
| `GET /api/visao` | Seed (`fixtures/seed/processos.json`) sobreposto por `data/<cidade>/*/`. A pasta `alvara` casa com "Alvará de Construção" (p001); as demais casam pelo título normalizado ou por `run.json.titulo`. Pasta sem par livre no seed (ex.: `alvara-demo` ao lado de `alvara`) vira linha extra na secretaria do processo com o mesmo título (`run.titulo` ou `ficha.processo`), com o slug no nome; sem título, vai para "Outros". |
| `GET /api/processo/:cidade/:slug` | `run`, `estado` (resumo), `conversa` (histórico com `registros` por turno), `registros_sem_turno`, `modo`, `assumida_em`, `intervencoes`, `outbox_pendente`, `ficha`, `ficha_progresso`, `relatorio`, `metricas`, `diff`, `pendencias` |
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
