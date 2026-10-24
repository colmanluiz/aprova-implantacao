import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { carregarPipeline } from "./definicao.js";
import { gerarPipelineMd } from "./docs.js";
import { criteriosSemImplementacao } from "./motor.js";

test("docs: INSTRUCTIONS/PIPELINE.md está em dia com pipeline.json (rode npm run docs)", () => {
  const esperado = gerarPipelineMd(carregarPipeline());
  assert.equal(fs.readFileSync("INSTRUCTIONS/PIPELINE.md", "utf8"), esperado);
});

test("pipeline.json: seis etapas na ordem e todo critério tem implementação", () => {
  const def = carregarPipeline();
  assert.deepEqual(def.etapas.map((e) => e.slug), ["analisar", "coletar", "extrair", "aplicar", "validar", "conferir", "homologar"]);
  assert.deepEqual(criteriosSemImplementacao(def), []);
  assert.equal(def.etapas.flatMap((e) => e.criterios).filter((k) => k.tipo === "juiz").length, 1);
});
