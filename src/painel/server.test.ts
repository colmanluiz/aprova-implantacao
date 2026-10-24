import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { criarServidor } from "./server.js";

test("servidor responde /api/visao, detalhe, estático, outbox e 501 sem CLI de gate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "painel-srv-"));
  fs.mkdirSync(path.join(root, "painel"));
  fs.writeFileSync(path.join(root, "painel", "index.html"), "<!doctype html><title>Painel</title>");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
  fs.mkdirSync(path.join(root, "data", "vale-verde", "alvara"), { recursive: true });
  fs.copyFileSync(path.resolve("fixtures/exemplos/run.vale-verde.alvara.json"), path.join(root, "data/vale-verde/alvara/run.json"));
  const srv = criarServidor({ root, seedPath: path.resolve("fixtures/seed/processos.json") });
  await new Promise<void>((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const r = await fetch(`${base}/api/visao`);
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.equal(v.metricas.processos_total, 96);
    assert.equal(v.gate_disponivel, false);

    assert.equal((await fetch(`${base}/api/processo/vale-verde/alvara`)).status, 200);
    assert.equal((await fetch(`${base}/api/processo/vale-verde/nada`)).status, 404);

    const html = await fetch(`${base}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Painel/);
    assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 403);

    const post = (url: string, corpo: unknown) => fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    assert.equal((await post("/api/gate/vale-verde/alvara", { acao: "aprovar" })).status, 501);
    assert.equal((await post("/api/conversa/vale-verde/alvara/modo", { modo: "humano" })).status, 501);
    const env = await post("/api/conversa/vale-verde/alvara/enviar", { texto: "Oi Marcos" });
    assert.equal(env.status, 200);
    const outbox = JSON.parse(fs.readFileSync(path.join(root, "data/vale-verde/alvara/outbox.json"), "utf8"));
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].autor, "implantador");
    assert.equal(outbox[0].enviado, false);
    assert.equal((await post("/api/conversa/vale-verde/alvara/enviar", { texto: "  " })).status, 400);
  } finally {
    srv.close();
  }
});
