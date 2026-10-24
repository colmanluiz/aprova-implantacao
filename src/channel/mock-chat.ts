// Simulador de canal: você faz o papel do analista da prefeitura no terminal.
// Uso: npm run chat -- --cidade vale-verde --processo alvara --template fixtures/templates/alvara-construcao.modeload.json
// Comandos: /anexo <caminho>  envia foto/PDF;  /estado  mostra a etapa;  /sair
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { tratarMensagem } from "../agents/orquestrador.js";
import { store } from "../agents/store.js";
import type { Anexo } from "../agents/extrator.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const ctx = { cidade: arg("cidade", "vale-verde"), processo: arg("processo", "alvara"), template: arg("template", "fixtures/templates/alvara-construcao.modeload.json") };
const canal = { enviar: async (texto: string) => { console.log(`\n\x1b[32m[Aprova]\x1b[0m ${texto}\n`); } };

function anexoDe(p: string): Anexo {
  const ext = path.extname(p).toLowerCase();
  const nome = path.basename(p);
  if (ext === ".pdf") return { tipo: "pdf", base64: fs.readFileSync(p).toString("base64"), nome };
  if ([".jpg", ".jpeg"].includes(ext)) return { tipo: "imagem", media_type: "image/jpeg", base64: fs.readFileSync(p).toString("base64"), nome };
  if (ext === ".png") return { tipo: "imagem", media_type: "image/png", base64: fs.readFileSync(p).toString("base64"), nome };
  if (ext === ".webp") return { tipo: "imagem", media_type: "image/webp", base64: fs.readFileSync(p).toString("base64"), nome };
  return { tipo: "texto", texto: fs.readFileSync(p, "utf8"), nome };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Processo ${ctx.processo} de ${ctx.cidade}. Digite como o analista. /anexo <arquivo>, /estado, /sair`);
const perguntar = () => rl.question("\x1b[36m[analista]\x1b[0m ", async (linha) => {
  const s = linha.trim();
  if (s === "/sair") { rl.close(); return; }
  if (s === "/estado") { console.log(store.estado(ctx)); return perguntar(); }
  try {
    if (s.startsWith("/anexo ")) {
      const p = s.slice(7).trim();
      await tratarMensagem(ctx, canal, { anexo: anexoDe(p), texto: "segue o arquivo", remetente: "analista" });
    } else if (s) {
      await tratarMensagem(ctx, canal, { texto: s, remetente: "analista" });
    } else if (store.estado(ctx).etapa === "nao_iniciado") {
      await tratarMensagem(ctx, canal, { remetente: "analista" });
    }
  } catch (e) {
    console.error("erro:", (e as Error).message);
  }
  perguntar();
});
perguntar();
