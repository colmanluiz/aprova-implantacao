// Porta única de saída: nada chega ao analista sem passar por verificarMensagem.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { store, type Contexto } from "./store.js";
import { enviarAoAnalista } from "./envio.js";
import { ferramentas } from "./tools.js";
import { textoConferencia } from "../pipeline/motor.js";
import { verificarMensagem } from "../core/mensagens.js";

before(() => { process.env.APROVA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "aprova-envio-")); });
const TEMPLATE = "fixtures/templates/alvara-construcao.modeload.json";
let n = 0;
const novoCtx = (): Contexto => ({ cidade: "teste", processo: `e${++n}`, template: TEMPLATE });

test("envio: recusada não sai pelo canal nem entra no histórico; aceita sai e conta", async () => {
  const ctx = novoCtx();
  const saiu: string[] = [];
  const enviar = async (t: string) => { saiu.push(t); };
  const r = await enviarAoAnalista(ctx, enviar, "Vou ajustar a ficha do alvará. Pode ser?");
  assert.equal(r.ok, false);
  assert.equal(saiu.length, 0);
  assert.equal(store.estado(ctx).historico.length, 0);
  const ok = await enviarAoAnalista(ctx, enviar, "Quem assina o alvará hoje?", { autor: "cobranca" });
  assert.equal(ok.ok, true);
  assert.deepEqual(saiu, ["Quem assina o alvará hoje?"]);
  const e = store.estado(ctx);
  assert.equal(e.mensagens_enviadas, 1);
  assert.equal(e.perguntas_feitas, 1);
  assert.equal(e.historico.at(-1)?.autor, "cobranca");
});

test("mostrar_modelo: resumo sem pergunta, PDF e uma pergunta aberta, tudo dentro dos limites", async () => {
  const ctx = novoCtx();
  store.salvarFicha(ctx, JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8")));
  const textos: string[] = [];
  const arquivos: string[] = [];
  const t = ferramentas(ctx, { enviar: async (x) => { textos.push(x); }, enviarArquivo: async (a) => { arquivos.push(a.nome); } });
  const mostrar = t.coletor.find((x) => x.name === "mostrar_modelo")!;
  const out = String(await mostrar.run({} as never));
  assert.equal(textos.length, 2, out);
  assert.match(textos[0], /^Olha como já está pronto/);
  assert.ok(!textos[0].includes("?"));
  assert.equal(textos[1], "Comparando com o jeito que vocês fazem hoje, o que é diferente aí? Se for igual, me diz que é isso.");
  assert.ok(textos.every((x) => verificarMensagem(x).ok));
  assert.deepEqual(arquivos, [`modelo-${ctx.processo}.pdf`]);
  assert.ok(store.plano(ctx).modelo_mostrado_em);
});

test("conferência: até 3 casos curtos cabem em 70 palavras com uma pergunta", () => {
  const casos = ["Casa na ZR1 com 3 m de recuo na frente: o pedido volta", "Quem não é o dono precisa trazer procuração", "Pedido novo não pede o alvará antigo"];
  const t = textoConferencia(casos);
  assert.ok(verificarMensagem(t).ok, t);
  assert.equal((t.match(/\?/g) ?? []).length, 1);
});
