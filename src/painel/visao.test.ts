import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { montarVisao, montarDetalhe, conversaComRegistros, anexarOutbox, lerOutbox, classificarMensagem } from "./visao.js";

const SEED = path.resolve("fixtures/seed/processos.json");
const EXEMPLO = path.resolve("fixtures/exemplos");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "painel-"));
}
function escrever(p: string, v: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
}

test("sem data/: 96 processos do seed, 12 secretarias, nada pronto", () => {
  const v = montarVisao({ seedPath: SEED, dataDir: path.join(tmp(), "nao-existe") });
  assert.equal(v.cidade_slug, "vale-verde");
  assert.equal(v.metricas.processos_total, 96);
  assert.equal(v.secretarias.length, 12);
  assert.equal(v.metricas.processos_prontos, 0);
  assert.equal(v.metricas.por_status.nao_iniciado, 96);
  const p = v.secretarias[0].processos[0];
  assert.equal(p.etapas.length, 6);
  assert.ok(p.etapas.every((e) => e.status === "pendente"));
  assert.equal(p.slug_previsto, "alvara", "Alvará de Construção usa a pasta alvara");
  assert.equal(v.secretarias[0].processos[1].slug_previsto, "habite-se");
});

test("run.json da pasta alvara sobrepõe a entrada Alvará de Construção (p001)", () => {
  const dir = tmp();
  fs.cpSync(path.join(EXEMPLO, "run.vale-verde.alvara.json"), path.join(dir, "vale-verde/alvara/run.json"));
  const v = montarVisao({ seedPath: SEED, dataDir: dir, gateDisponivel: true });
  const todos = v.secretarias.flatMap((s) => s.processos);
  assert.equal(todos.length, 96, "não cria linha extra");
  const alv = todos.find((p) => p.id === "p001")!;
  assert.equal(alv.slug, "alvara");
  assert.equal(alv.status, "aguardando_implantador");
  assert.equal(alv.etapa_atual, "validar");
  assert.deepEqual(alv.etapas.map((e) => e.status), ["concluida", "concluida", "concluida", "concluida", "aguardando", "pendente"]);
  assert.equal(alv.gate?.para, "implantador");
  assert.equal(alv.gate?.tipo, "aprovacao");
  assert.equal(alv.gate?.aberto_em, "2026-10-24T10:22:00-03:00");
  assert.equal(alv.cenarios, "13/15");
  assert.equal(alv.pronto, false);
  assert.equal(todos.find((p) => p.id === "p003")!.tem_dados, false, "demolição não casa com a pasta alvara");
  assert.equal(v.metricas.horas_reuniao_evitadas, 1);
  assert.equal(v.metricas.perguntas_respondidas_sem_reuniao, 25);
  assert.equal(v.metricas.gates_abertos, 1);
  assert.equal(v.gate_disponivel, true);
});

test("pasta parcial sem run.json: infere etapas por estado.json, ficha e relatorio", () => {
  const dir = tmp();
  const pasta = path.join(dir, "vale-verde/habite-se");
  escrever(path.join(pasta, "estado.json"), { etapa: "aguardando_prefeitura", historico: [{ role: "user", content: "oi", em: "2026-10-24T12:00:00Z" }], mensagens_enviadas: 2, perguntas_feitas: 5 });
  escrever(path.join(pasta, "ficha.json"), { grupos: [{ nome: "Quem atende", perguntas: [
    { id: "a", resposta: "SEPLAN", confianca: 1, origem: "WhatsApp" },
    { id: "b", resposta: ["ZR1"], confianca: 0.95, origem: "Anexo: foto" },
    { id: "c", resposta: null, confianca: 0, origem: null, pendencia: "perguntar à Fazenda" },
  ] }] });
  const v = montarVisao({ seedPath: SEED, dataDir: dir });
  const p = v.secretarias.flatMap((s) => s.processos).find((x) => x.processo === "Habite-se")!;
  assert.equal(p.slug, "habite-se");
  assert.equal(p.status, "aguardando_prefeitura");
  assert.deepEqual(p.etapas.map((e) => e.status).slice(0, 2), ["concluida", "aguardando"]);
  assert.equal(p.respondidas, 2);
  assert.equal(p.pendencias, 1);
  assert.equal(v.metricas.respondidas_por_anexo, 1);
  assert.equal(v.metricas.respondidas_por_mensagem, 1);
});

test("arquivos corrompidos ou pela metade não derrubam a visão; pasta desconhecida vira 'Outros'", () => {
  const dir = tmp();
  escrever(path.join(dir, "vale-verde/alvara/run.json"), '{"processo": "alv');
  escrever(path.join(dir, "vale-verde/coisa-nova/run.json"), { processo: "coisa-nova", cidade: "vale-verde", titulo: "Processo Novo", status: "executando", etapas: [{ slug: "analisar", nome: "Analisar", status: "executando" }] });
  const v = montarVisao({ seedPath: SEED, dataDir: dir });
  const fora = v.secretarias.find((s) => s.nome === "Outros");
  assert.ok(fora);
  assert.equal(fora!.processos[0].processo, "Processo Novo · coisa-nova");
  assert.equal(fora!.processos[0].etapas[0].status, "executando");
  assert.equal(v.metricas.processos_total, 97);
});

test("registros são anexados ao turno do agente dentro da janela de tempo", () => {
  const t = (m: number) => `2026-10-24T12:${String(m).padStart(2, "0")}:00Z`;
  const { turnos, registros_sem_turno } = conversaComRegistros(
    [
      { role: "user", content: "oi", em: t(0) },
      { role: "assistant", content: "pergunta 1", em: t(1) },
      { role: "user", content: "resposta", em: t(5) },
      { role: "assistant", content: "pergunta 2", em: t(6) },
    ],
    [
      { em: t(5), pergunta_id: "setor-01" },
      { em: t(6), pergunta_id: "opcoes-02" },
      { em: t(9), pergunta_id: "taxa-03" },
    ],
  );
  assert.deepEqual(turnos[1].registros, []);
  assert.deepEqual(turnos[3].registros.map((r) => r.pergunta_id), ["setor-01", "opcoes-02"]);
  assert.deepEqual(registros_sem_turno.map((r) => r.pergunta_id), ["taxa-03"]);
});

test("detalhe: conversa, modo humano, intervenções e outbox pendente", () => {
  const dir = tmp();
  const pasta = path.join(dir, "vale-verde/alvara");
  fs.mkdirSync(pasta, { recursive: true });
  fs.cpSync(path.join(EXEMPLO, "run.vale-verde.alvara.json"), path.join(pasta, "run.json"));
  fs.cpSync(path.join(EXEMPLO, "relatorio.vale-verde.alvara.json"), path.join(pasta, "relatorio.json"));
  const estado = JSON.parse(fs.readFileSync(path.join(EXEMPLO, "estado.vale-verde.alvara.json"), "utf8"));
  estado.modo = "humano";
  estado.intervencoes = [{ tipo: "assumir", em: "2026-10-24T10:30:00-03:00", por: "implantador" }];
  estado.historico.push({ role: "assistant", autor: "implantador", content: "Marcos, aqui é a Ana da Aprova.", em: "2026-10-24T10:31:00-03:00" });
  escrever(path.join(pasta, "estado.json"), estado);
  escrever(path.join(pasta, "diff.md"), "# diff");
  anexarOutbox(pasta, "Marcos, aqui é a Ana da Aprova.", "id-1");
  anexarOutbox(pasta, "Pode confirmar a TO da ZC1?", "id-2");
  assert.equal(lerOutbox(pasta).length, 2);

  const d = montarDetalhe({ seedPath: SEED, dataDir: dir }, "vale-verde", "alvara")!;
  assert.ok(d);
  assert.equal(d.modo, "humano");
  assert.equal(d.assumida_em, "2026-10-24T10:30:00-03:00");
  assert.deepEqual(d.outbox_pendente.map((o) => o.id), ["id-2"], "item já no histórico sai da lista de pendentes");
  assert.equal(d.metricas.intervencoes_humanas, 1);
  assert.equal(d.relatorio!.filter((r) => r.passou).length, 13);
  assert.equal(d.diff, "# diff");
  assert.equal(d.pendencias, null);
  assert.ok(d.conversa.some((t) => t.registros.some((r) => r.pergunta_id === "dataset-24")));
  assert.equal(d.processo!.modo, "humano");

  assert.equal(montarDetalhe({ seedPath: SEED, dataDir: dir }, "vale-verde", "nao-existe"), undefined);
  assert.equal(montarDetalhe({ seedPath: SEED, dataDir: dir }, "..", "alvara"), undefined);
});

test("pasta extra só com estado.json + ficha.json entra na secretaria do título da ficha", () => {
  const dir = tmp();
  fs.cpSync(path.join(EXEMPLO, "run.vale-verde.alvara.json"), path.join(dir, "vale-verde/alvara/run.json"));
  const demo = path.join(dir, "vale-verde/alvara-demo");
  escrever(path.join(demo, "estado.json"), { etapa: "coletando", historico: [{ role: "user", content: "Bom dia!", em: "2026-10-24T15:45:52Z" }], mensagens_enviadas: 1, perguntas_feitas: 4, modo: "agente", intervencoes: [] });
  escrever(path.join(demo, "ficha.json"), { processo: "Alvará de Construção", grupos: [{ nome: "Quem atende", perguntas: [{ id: "setor-01", resposta: null, confianca: 0, origem: null }] }] });
  const v = montarVisao({ seedPath: SEED, dataDir: dir });
  const plan = v.secretarias.find((s) => s.nome === "Planejamento Urbano")!;
  const extra = plan.processos.find((p) => p.slug === "alvara-demo")!;
  assert.ok(extra, "linha extra em Planejamento Urbano");
  assert.equal(extra.processo, "Alvará de Construção · alvara-demo");
  assert.equal(extra.status, "executando");
  assert.equal(extra.etapa_atual, "coletar");
  assert.equal(plan.processos.find((p) => p.id === "p001")!.slug, "alvara");
  assert.ok(!v.secretarias.some((s) => s.nome === "Outros"));
  const d = montarDetalhe({ seedPath: SEED, dataDir: dir }, "vale-verde", "alvara-demo")!;
  assert.equal(d.processo!.slug, "alvara-demo");
  assert.equal(d.conversa.length, 1);
  assert.equal(d.run, null);
});

test("classificarMensagem separa as vozes do histórico embrulhado pelo motor", () => {
  const w = (t: string) => `Prefeitura: Vale Verde. Processo: Alvará de Construção. Perguntas abertas: 34.\n${t}`;
  assert.deepEqual(classificarMensagem({ role: "user", content: w("Mensagem do analista: (analista) Bom dia! Aqui é o Marcos.") }), { voz: "analista", texto: "Bom dia! Aqui é o Marcos.", anexo: null });
  assert.deepEqual(classificarMensagem({ role: "user", content: w("Mensagem do analista: (analista) essa é a tabela\nO analista enviou um anexo (tabela-zoneamento.png). Chame pedir_extracao antes de responder.") }),
    { voz: "analista", texto: "essa é a tabela", anexo: "tabela-zoneamento.png" });
  assert.equal(classificarMensagem({ role: "user", content: w("Esta é a primeira interação: apresente-se e envie o primeiro lote de perguntas prioritárias.") }).voz, "sistema");
  assert.equal(classificarMensagem({ role: "user", content: w('[pipeline] O critério de saída "x" falhou: y.') }).texto, 'Pipeline: O critério de saída "x" falhou: y.');
  assert.deepEqual(classificarMensagem({ role: "user", content: "oi" }), { voz: "analista", texto: "oi", anexo: null });
  assert.equal(classificarMensagem({ role: "assistant", content: "Enviei 1=setor-01, 2=opcoes-16. Registrei setor-01." }).voz, "nota");
  assert.equal(classificarMensagem({ role: "assistant", content: "Bom dia, Marcos! Anotei: SEPLAN." }).voz, "agente");
  assert.equal(classificarMensagem({ role: "assistant", autor: "implantador", content: "Aqui é a Ana." }).voz, "implantador");
});

test("fila do implantador: gate aberto vira atenção; analista sem responder há 30 h entra na fila; validar em andamento não conta espera", () => {
  const dir = tmp();
  const agora = () => new Date("2026-10-25T20:00:00Z");
  fs.cpSync(path.join(EXEMPLO, "run.vale-verde.alvara.json"), path.join(dir, "vale-verde/alvara/run.json"));
  const hab = path.join(dir, "vale-verde/habite-se");
  escrever(path.join(hab, "estado.json"), { etapa: "aguardando_prefeitura", historico: [
    { role: "user", content: "oi", em: "2026-10-24T12:00:00Z" },
    { role: "assistant", content: "Olá! Qual setor recebe o processo?", em: "2026-10-24T14:00:00Z" },
    { role: "assistant", content: "Enviei 1=setor-01. Não registrei nada.", em: "2026-10-24T14:00:05Z" },
  ] });
  const dem = path.join(dir, "vale-verde/alvara-de-demolicao");
  escrever(path.join(dem, "run.json"), { processo: "alvara-de-demolicao", cidade: "vale-verde", titulo: "Alvará de Demolição", status: "executando", etapa_atual: "validar",
    etapas: [{ slug: "analisar", nome: "Analisar", status: "concluida" }, { slug: "coletar", nome: "Coletar", status: "concluida" }, { slug: "validar", nome: "Validar", status: "executando" }] });
  escrever(path.join(dem, "estado.json"), { etapa: "validando", historico: [{ role: "assistant", content: "Preciso confirmar uma regra", em: "2026-10-24T14:00:00Z" }] });
  const v = montarVisao({ seedPath: SEED, dataDir: dir, agora });
  const todos = v.secretarias.flatMap((s) => s.processos);
  const alv = todos.find((p) => p.slug === "alvara")!;
  assert.equal(alv.atencao?.tipo, "gate");
  assert.equal(alv.gate?.etapa, undefined, "fixture antiga sem etapa no gate: campo fica ausente");
  const h = todos.find((p) => p.slug === "habite-se")!;
  assert.equal(h.ultima_voz, "nota");
  assert.equal(h.sem_resposta_horas, 30);
  assert.equal(h.atencao?.tipo, "sem_resposta");
  assert.match(h.atencao!.texto, /30 h/);
  const d = todos.find((p) => p.slug === "alvara-de-demolicao")!;
  assert.equal(d.sem_resposta_horas, null);
  assert.equal(d.atencao, null);
  assert.equal(todos.find((p) => !p.tem_dados)!.atencao, null);
  assert.equal(v.metricas.precisam_implantador, 2);
  assert.equal(v.metricas.aguardando_prefeitura, 0);
  const det = montarDetalhe({ seedPath: SEED, dataDir: dir, agora }, "vale-verde", "habite-se")!;
  assert.deepEqual(det.conversa.map((t) => t.voz), ["analista", "agente", "nota"]);
});
