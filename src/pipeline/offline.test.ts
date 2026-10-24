import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rodarOffline } from "./offline.js";
import { resolverGate } from "./motor.js";
import { lerRun } from "./run.js";
import { store } from "../agents/store.js";

before(() => { process.env.APROVA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "aprova-offline-")); });

test("offline: vale-verde/alvara de ponta a ponta sem LLM, até o gate de homologação e a aprovação", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const ctx = { cidade: "vale-verde", processo: "alvara", template: "fixtures/templates/alvara-construcao.modeload.json" };
    // Lixo de uma execução anterior não pode aparecer na demo.
    fs.mkdirSync(store.pasta(ctx), { recursive: true });
    fs.writeFileSync(store.arquivo(ctx, "relatorio.json"), "[]");
    let run = await rodarOffline({});
    assert.equal(run.status, "aguardando_implantador");
    assert.equal(run.etapa_atual, "homologar");
    assert.equal(run.gate?.para, "implantador");
    assert.equal(run.gate?.tipo, "homologacao");
    for (const slug of ["analisar", "coletar", "extrair", "aplicar", "validar"]) {
      assert.equal(run.etapas.find((e) => e.slug === slug)!.status, "concluida", slug);
    }
    const juiz = run.etapas.find((e) => e.slug === "validar")!.criterios.find((k) => k.nome === "cenários cobrem a ficha")!;
    assert.deepEqual([juiz.resultado, juiz.detalhe], ["nao_avaliado", "sem LLM"]);
    assert.equal(run.metricas.cenarios_rodados, 15);
    assert.equal(run.metricas.cenarios_passando, 15);
    assert.equal(run.metricas.horas_reuniao_evitadas, 1);
    assert.equal(run.metricas.pendencias_abertas, 11);
    assert.ok(fs.existsSync(store.arquivo(ctx, "snapshot/template.json")));
    assert.ok((store.estado(ctx).registros?.length ?? 0) >= 25);

    run = await resolverGate(ctx, "aprovar");
    assert.equal(run.status, "concluido");
    assert.equal(lerRun(ctx)!.etapas.find((e) => e.slug === "homologar")!.criterios[0].resultado, "passou");
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
