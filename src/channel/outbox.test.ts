import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { entregarOutbox, lerOutbox, salvarCanal, processosComCanal, vigiarOutbox, type ItemOutbox } from "./outbox.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "outbox-"));
const item = (id: string, texto: string, enviado = false): ItemOutbox => ({ id, texto, autor: "implantador", em: "2026-10-24T10:00:00Z", enviado });

test("entrega pendentes, marca enviado e registra no histórico", async () => {
  const pasta = tmp();
  fs.writeFileSync(path.join(pasta, "outbox.json"), JSON.stringify([item("1", "já foi", true), item("2", "Oi Marcos"), item("3", "Tudo certo?")]));
  fs.writeFileSync(path.join(pasta, "estado.json"), JSON.stringify({ etapa: "coletando", historico: [{ role: "user", content: "x", em: "t" }] }));
  const enviados: string[] = [];
  const r = await entregarOutbox(pasta, async (t) => { enviados.push(t); }, () => "2026-10-24T10:05:00Z");
  assert.deepEqual(enviados, ["Oi Marcos", "Tudo certo?"]);
  assert.equal(r.length, 2);
  assert.ok(lerOutbox(pasta).every((i) => i.enviado));
  assert.equal(lerOutbox(pasta)[1].enviado_em, "2026-10-24T10:05:00Z");
  const estado = JSON.parse(fs.readFileSync(path.join(pasta, "estado.json"), "utf8"));
  assert.equal(estado.etapa, "coletando");
  assert.deepEqual(estado.historico.at(-1), { role: "assistant", autor: "implantador", content: "Tudo certo?", em: "2026-10-24T10:05:00Z" });
  assert.equal((await entregarOutbox(pasta, async () => { throw new Error("não deveria"); })).length, 0, "não reenvia");
});

test("falha no envio para e mantém pendente", async () => {
  const pasta = tmp();
  fs.writeFileSync(path.join(pasta, "outbox.json"), JSON.stringify([item("1", "a"), item("2", "b")]));
  let n = 0;
  const r = await entregarOutbox(pasta, async () => { if (n++ === 1) throw new Error("rede"); });
  assert.equal(r.length, 1);
  assert.deepEqual(lerOutbox(pasta).map((i) => i.enviado), [true, false]);
});

test("sem outbox.json não faz nada", async () => {
  assert.deepEqual(await entregarOutbox(tmp(), async () => {}), []);
});

test("item acrescentado pelo painel durante o envio não se perde", async () => {
  const pasta = tmp();
  const arq = path.join(pasta, "outbox.json");
  fs.writeFileSync(arq, JSON.stringify([item("1", "a")]));
  await entregarOutbox(pasta, async () => {
    fs.writeFileSync(arq, JSON.stringify([item("1", "a"), item("2", "novo")]));
  });
  assert.deepEqual(lerOutbox(pasta).map((i) => [i.id, i.enviado]), [["1", true], ["2", false]]);
});

test("canal.json: processos com telegram são encontrados depois de reiniciar", () => {
  const base = tmp();
  salvarCanal(path.join(base, "vale-verde", "alvara"), { tipo: "telegram", chat_id: 42 });
  fs.mkdirSync(path.join(base, "vale-verde", "habite-se"), { recursive: true });
  const r = processosComCanal("telegram", base);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].canal, { tipo: "telegram", chat_id: 42 });
});

test("vigiarOutbox: entrega na volta e respeita processo ocupado", async () => {
  const livre = tmp();
  const ocupada = tmp();
  for (const p of [livre, ocupada]) fs.writeFileSync(path.join(p, "outbox.json"), JSON.stringify([item("1", p)]));
  const enviados: string[] = [];
  const parar = vigiarOutbox({
    intervaloMs: 10,
    alvos: () => [livre, ocupada].map((pasta) => ({ pasta, enviar: async (t: string) => { enviados.push(t); } })),
    ocupado: (p) => p === ocupada,
  });
  await new Promise((r) => setTimeout(r, 60));
  parar();
  assert.deepEqual(enviados, [livre]);
});
