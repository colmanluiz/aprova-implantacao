import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validarResposta } from "./respostas.js";
import type { Ficha, Pergunta } from "./types.js";

const q = (tipo: Pergunta["tipo"], assume: unknown = null) => ({ id: `${tipo}-01`, tipo, assume });

test("respostas: formatos válidos por tipo", () => {
  assert.ok(validarResposta(q("opcoes"), ["ZR1", "ZR2"]).ok);
  assert.ok(validarResposta(q("documento"), { exigido: true, sempre: false }).ok);
  assert.ok(validarResposta(q("setor"), { slug: "planejamento", setor: "Secretaria de Planejamento" }).ok);
  assert.ok(!validarResposta(q("setor"), { slug: "planejamento_modeload", setor: "Planejamento" }).ok, "placeholder de outra prefeitura deve ser rejeitado");
  assert.ok(!validarResposta(q("setor"), { slug: "planejamento" }).ok, "setor sem nome deve ser rejeitado");
  assert.ok(validarResposta(q("etapas"), ["Solicitação"]).ok);
  assert.ok(validarResposta(q("taxa"), { existe: false }).ok);
  assert.ok(validarResposta(q("card"), { existe: true, nome: "Parecer" }).ok);
  assert.ok(validarResposta(q("texto"), "Declaro…").ok);
  assert.ok(validarResposta(q("residuo"), "Vale Verde").ok);
  assert.ok(validarResposta(q("saida"), { modelo_proprio: true }).ok);
  assert.ok(validarResposta(q("dataset", { chaves: ["RECUO_FRONTAL", "PAVIMENTOS"] }), { ZR1: { RECUO_FRONTAL: 4, PAVIMENTOS: "2" } }).ok);
});

test("respostas: null é sempre aceito (pendência)", () => {
  assert.deepEqual(validarResposta(q("opcoes"), null), { ok: true, valor: null });
});

test("respostas: JSON em texto é decodificado quando o tipo não é texto", () => {
  const r = validarResposta(q("opcoes"), '["A","B"]');
  assert.deepEqual(r, { ok: true, valor: ["A", "B"] });
  assert.deepEqual(validarResposta(q("texto"), '["A"]'), { ok: true, valor: '["A"]' });
});

test("respostas: inválidos devolvem schema_invalido com o formato esperado", () => {
  const casos: [Pergunta["tipo"], unknown][] = [
    ["opcoes", []], ["opcoes", "Z1, Z2"], ["documento", { obrigatorio: true }], ["setor", { setor: "x" }],
    ["etapas", "Solicitação"], ["taxa", { nome: "x" }], ["texto", ""], ["residuo", 3], ["saida", ["x"]],
  ];
  for (const [tipo, v] of casos) {
    const r = validarResposta(q(tipo), v);
    assert.equal(r.ok, false, `${tipo} ${JSON.stringify(v)}`);
    if (!r.ok) { assert.match(r.erro, /^schema_invalido: pergunta /); assert.match(r.erro, new RegExp(`tipo ${tipo}`)); }
  }
});

test("respostas: dataset exige todas as chaves em todas as zonas", () => {
  const r = validarResposta(q("dataset", { chaves: ["RECUO_FRONTAL", "PAVIMENTOS"] }), { ZR1: { RECUO_FRONTAL: 4 } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erro, /ZR1 sem PAVIMENTOS/);
  assert.equal(validarResposta(q("dataset", { chaves: ["X"] }), {}).ok, false);
  assert.equal(validarResposta(q("dataset", { chaves: ["X"] }), { Z: { X: true } }).ok, false);
});

test("respostas: todas as respostas da ficha de Vale Verde passam no schema", () => {
  const ficha: Ficha = JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8"));
  for (const p of ficha.grupos.flatMap((g) => g.perguntas)) {
    const r = validarResposta(p, p.resposta);
    assert.ok(r.ok, `${p.id}: ${!r.ok ? r.erro : ""}`);
  }
});
