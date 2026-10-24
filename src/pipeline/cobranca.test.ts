// Escada de cobrança: silêncio quando o ritmo está ok, lembrete quando ocioso, conta do prazo quando não fecha, escala ao implantador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarCobranca, diasUteisAte, horarioComercial, type ConfigCobranca } from "./cobranca.js";

const cfg: ConfigCobranca = { ociosoHoras: 4, maxPorDia: 2, soHorarioComercial: true, escalarApos: 3 };
// terça 2026-10-27 15h em Brasília = 18h UTC
const TER_15H = new Date("2026-10-27T18:00:00Z");
const base = { agora: TER_15H, titulo: "Habite-se", ultimaAtividade: "2026-10-27T12:00:00Z", cobrancas: [], itensFaltando: 6 };

test("dias úteis e horário comercial", () => {
  assert.equal(diasUteisAte(TER_15H, "2026-10-29"), 3, "ter, qua, qui");
  assert.equal(diasUteisAte(TER_15H, "2026-11-02"), 5, "pula sábado e domingo");
  assert.equal(diasUteisAte(TER_15H, "2026-10-26"), 0, "prazo vencido");
  assert.equal(horarioComercial(TER_15H), true);
  assert.equal(horarioComercial(new Date("2026-10-27T23:00:00Z")), false, "20h");
  assert.equal(horarioComercial(new Date("2026-10-31T15:00:00Z")), false, "sábado");
});

test("silêncio: respondeu há pouco, nada faltando ou fora do horário", () => {
  assert.equal(avaliarCobranca({ ...base, ultimaAtividade: "2026-10-27T16:30:00Z" }, cfg), null);
  assert.equal(avaliarCobranca({ ...base, itensFaltando: 0 }, cfg), null);
  assert.equal(avaliarCobranca({ ...base, agora: new Date("2026-10-27T23:00:00Z") }, cfg), null);
});

test("lembrete leve quando ocioso sem prazo apertado; cobrança com conta quando o ritmo não fecha", () => {
  const l = avaliarCobranca({ ...base, prazo: "2026-11-10" }, cfg)!;
  assert.equal(l.nivel, "lembrete");
  assert.match(l.texto, /faltam 6 item/);
  const r = avaliarCobranca({ ...base, prazo: "2026-10-28" }, cfg)!;
  assert.equal(r.nivel, "ritmo");
  assert.match(r.texto, /até 28\/10 \(2 dias úteis\)/);
});

test("no máximo 2 por dia, espaçadas pelo tempo de ócio; resposta do analista zera a escada; escala depois de 3 sem resposta", () => {
  const c1 = { em: "2026-10-27T13:00:00Z", nivel: "lembrete" as const, texto: "" };
  assert.equal(avaliarCobranca({ ...base, cobrancas: [{ ...c1, em: "2026-10-27T15:00:00Z" }] }, cfg), null, "cobrou há 3h: espera o tempo de ócio");
  assert.equal(avaliarCobranca({ ...base, cobrancas: [c1] }, cfg)!.nivel, "lembrete", "cobrou há 5h: pode cobrar de novo");
  const hoje2 = [c1, { ...c1, em: "2026-10-27T13:30:00Z" }];
  assert.equal(avaliarCobranca({ ...base, ultimaAtividade: "2026-10-26T12:00:00Z", cobrancas: hoje2 }, cfg), null, "limite diário");
  const tres = ["2026-10-23T13:00:00Z", "2026-10-24T13:00:00Z", "2026-10-26T13:00:00Z"].map((em) => ({ em, nivel: "lembrete" as const, texto: "" }));
  assert.equal(avaliarCobranca({ ...base, ultimaAtividade: "2026-10-22T12:00:00Z", cobrancas: tres }, cfg)!.nivel, "escalar");
  assert.notEqual(avaliarCobranca({ ...base, ultimaAtividade: "2026-10-27T12:00:00Z", cobrancas: tres }, cfg)?.nivel, "escalar", "respondeu depois: zera");
  assert.equal(avaliarCobranca({ ...base, prazo: "2026-10-26" }, cfg)!.nivel, "escalar", "prazo vencido");
});

test("textos de cobrança ao analista passam nos limites da conversa (a mesma porta de saída do Coletor)", async () => {
  const { verificarMensagem } = await import("../core/mensagens.js");
  for (const prazo of [undefined, "2026-11-10", "2026-10-28"]) {
    const d = avaliarCobranca({ ...base, titulo: "Alvará de Construção", itensFaltando: 9, ...(prazo ? { prazo } : {}) }, cfg)!;
    assert.ok(verificarMensagem(d.texto).ok, d.texto);
  }
});
