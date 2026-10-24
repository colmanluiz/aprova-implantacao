import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analisarTemplate, resumoTemplate } from "./template-analyzer.js";
import { aplicarFicha } from "./patcher.js";
import { rodarCenarios } from "./scenario-runner.js";
import type { AprovaTemplate, Cenario, Ficha } from "./types.js";

const tpl: AprovaTemplate = JSON.parse(fs.readFileSync("fixtures/templates/alvara-construcao.modeload.json", "utf8"));
const ficha: Ficha = JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8"));
const cenarios: Cenario[] = JSON.parse(fs.readFileSync("fixtures/cenarios/alvara.cenarios.json", "utf8"));

test("resumo do template real", () => {
  const r = resumoTemplate(tpl);
  assert.equal(r.etapas, 11);
  assert.equal(r.campos, 134);
  assert.ok(r.expressoes >= 150);
});

test("analisador encontra setor, dataset, documentos e o resíduo Cascavel", () => {
  const f = analisarTemplate(tpl);
  const all = f.grupos.flatMap((g) => g.perguntas);
  assert.ok(all.some((q) => q.tipo === "setor"));
  assert.ok(all.some((q) => q.tipo === "dataset" && (q.assume as any).chaves.includes("RECUO_FRONTAL")));
  assert.equal(all.filter((q) => q.tipo === "documento").length, 11);
  assert.ok(all.some((q) => q.tipo === "residuo" && q.assume === "Cascavel"));
});

test("template cru falha nos cenários que dependem da cidade; parametrizado passa em todos", () => {
  const cru = rodarCenarios(tpl, cenarios);
  assert.ok(cru.some((r) => !r.passou));
  const { form } = aplicarFicha(tpl, ficha);
  const res = rodarCenarios(form, cenarios);
  assert.deepEqual(res.filter((r) => !r.passou).map((r) => r.id), []);
});

test("após aplicar, não sobra placeholder modeload", () => {
  const { form } = aplicarFicha(tpl, ficha);
  assert.ok(!JSON.stringify(form).includes("modeload"));
});
