// Simulador de canal: você faz o papel do analista da prefeitura no terminal.
//
// Interativo:  npm run chat -- [--cidade vale-verde] [--processo alvara] [--template fixtures/templates/alvara-construcao.modeload.json]
//   Comandos: /anexo <arquivo> [legenda]  envia foto/PDF/planilha;  /estado  mostra a etapa;  /sair
//
// Roteiro (demo):  npm run chat -- --script fixtures/insumos/conversa-demo.txt [--pausa 1500] [--transcricao saida.md] [--continuar]
//   Reproduz as falas do analista, uma por linha, com pausa entre elas. Linhas "/anexo <arquivo> [legenda]" mandam arquivo;
//   linhas vazias e linhas com "#" são ignoradas. Sem --continuar, o processo começa do zero (apaga data/<cidade>/<processo>).
//
// Nos dois modos, mensagens do implantador escritas no painel (outbox.json) aparecem como [implantador].
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { tratarMensagem } from "../agents/orquestrador.js";
import { store } from "../agents/store.js";
import type { Anexo } from "../agents/extrator.js";
import { entregarOutbox, salvarCanal, vigiarOutbox } from "./outbox.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);

const ctx = { cidade: arg("cidade", "vale-verde"), processo: arg("processo", "alvara"), template: arg("template", "fixtures/templates/alvara-construcao.modeload.json") };
const roteiro = arg("script", "");
const pausaMs = Number(arg("pausa", "1500"));
const arqTranscricao = arg("transcricao", "");
const pasta = store.pasta(ctx);

const COR = { verde: "\x1b[32m", ciano: "\x1b[36m", amarelo: "\x1b[33m", cinza: "\x1b[90m", fim: "\x1b[0m" };
const transcricao: string[] = [];
const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const canal = {
  enviar: async (texto: string) => {
    console.log(`\n${COR.verde}[Aprova]${COR.fim} ${texto}\n`);
    transcricao.push(`**Aprova** (${hora()}):\n\n${citar(texto)}\n`);
  },
};
const citar = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n");

function anexoDe(p: string): Anexo {
  const ext = path.extname(p).toLowerCase();
  const nome = path.basename(p);
  const b64 = () => fs.readFileSync(p).toString("base64");
  if (ext === ".pdf") return { tipo: "pdf", base64: b64(), nome };
  if ([".jpg", ".jpeg"].includes(ext)) return { tipo: "imagem", media_type: "image/jpeg", base64: b64(), nome };
  if (ext === ".png") return { tipo: "imagem", media_type: "image/png", base64: b64(), nome };
  if (ext === ".webp") return { tipo: "imagem", media_type: "image/webp", base64: b64(), nome };
  return { tipo: "texto", texto: fs.readFileSync(p, "utf8"), nome };
}

// Enquanto o agente responde, a caixa de saída espera: evita duas escritas cruzadas no estado.json.
let ocupado = false;
let semCredencial = false;
async function processar(linha: string) {
  ocupado = true;
  try {
    if (linha.startsWith("/anexo ")) {
      const [arquivo, ...legenda] = linha.slice(7).trim().split(/\s+/);
      transcricao.push(`**Analista** (${hora()}): [anexo] \`${path.basename(arquivo)}\`${legenda.length ? ` ${legenda.join(" ")}` : ""}\n`);
      await tratarMensagem(ctx, canal, { anexo: anexoDe(arquivo), texto: legenda.join(" ") || "segue o arquivo", remetente: "analista" })
        .then(nota);
    } else if (linha) {
      transcricao.push(`**Analista** (${hora()}): ${linha}\n`);
      await tratarMensagem(ctx, canal, { texto: linha, remetente: "analista" }).then(nota);
    } else if (store.estado(ctx).etapa === "nao_iniciado") {
      await tratarMensagem(ctx, canal, { remetente: "analista" }).then(nota);
    }
  } catch (e) {
    console.error("erro:", (e as Error).message);
    if (/authentication|api[_ ]?key|401/i.test((e as Error).message)) semCredencial = true;
    transcricao.push(`_erro: ${(e as Error).message}_\n`);
  } finally {
    ocupado = false;
  }
  await entregarImplantador();
}

/** Texto final do agente: não vai ao analista; aparece em cinza como nota para o implantador. */
function nota(texto: string | undefined) {
  if (texto?.trim()) console.log(`${COR.cinza}(nota do agente) ${texto.trim()}${COR.fim}`);
}

const enviarImplantador = async (texto: string) => {
  console.log(`\n${COR.amarelo}[implantador]${COR.fim} ${texto}\n`);
  transcricao.push(`**Implantador** (${hora()}):\n\n${citar(texto)}\n`);
};
const entregarImplantador = () => entregarOutbox(pasta, enviarImplantador);

function resumoFicha(): string {
  const f = store.ficha(ctx);
  if (!f) return "Ficha não criada.";
  const todas = f.grupos.flatMap((g) => g.perguntas);
  const ok = todas.filter((q) => q.resposta !== null && q.confianca >= 0.8);
  const baixa = todas.filter((q) => q.resposta !== null && q.confianca < 0.8);
  const pend = todas.filter((q) => q.resposta === null && q.pendencia);
  const L = [`Ficha: ${todas.length} perguntas | respondidas: ${ok.length} | a confirmar: ${baixa.length} | pendências: ${pend.length} | sem resposta: ${todas.length - ok.length - baixa.length - pend.length}`, ""];
  L.push("| Pergunta | Resposta | Confiança | Origem |", "|---|---|---|---|");
  for (const q of [...ok, ...baixa]) {
    const r = JSON.stringify(q.resposta);
    L.push(`| ${q.id} | \`${r.length > 70 ? r.slice(0, 67) + "..." : r}\` | ${q.confianca} | ${q.origem ?? ""} |`);
  }
  for (const q of pend) L.push(`| ${q.id} | _pendência_ | — | ${q.pendencia} |`);
  return L.join("\n");
}

function gravarTranscricao() {
  if (!arqTranscricao) return;
  const md = [
    `# Transcrição: ${ctx.processo} de ${ctx.cidade}`,
    "",
    `Gerada por \`npm run chat -- --script ${roteiro}\` em ${new Date().toLocaleString("pt-BR")}.`,
    "",
    "## Conversa",
    "",
    ...transcricao,
    "## Ficha ao final",
    "",
    resumoFicha(),
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(arqTranscricao), { recursive: true });
  fs.writeFileSync(arqTranscricao, md);
  console.log(`transcrição gravada em ${arqTranscricao}`);
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (roteiro) {
  if (!flag("continuar")) fs.rmSync(pasta, { recursive: true, force: true });
  fs.mkdirSync(pasta, { recursive: true });
  salvarCanal(pasta, { tipo: "terminal" });
  const parar = vigiarOutbox({ alvos: () => [{ pasta, enviar: enviarImplantador }], ocupado: () => ocupado });
  const linhas = fs.readFileSync(roteiro, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  console.log(`Roteiro ${roteiro}: ${linhas.length} falas do analista, pausa de ${pausaMs} ms. Processo ${ctx.processo} de ${ctx.cidade}.`);
  if (store.estado(ctx).etapa === "nao_iniciado") await processar("");
  for (const linha of linhas) {
    if (semCredencial) { console.error("Sem credencial da Anthropic (ANTHROPIC_API_KEY no .env): roteiro interrompido."); break; }
    await pausa(pausaMs);
    console.log(`${COR.ciano}[analista]${COR.fim} ${linha}`);
    await processar(linha);
  }
  parar();
  console.log(`\n${resumoFicha()}\n`);
  gravarTranscricao();
} else {
  fs.mkdirSync(pasta, { recursive: true });
  salvarCanal(pasta, { tipo: "terminal" });
  vigiarOutbox({ alvos: () => [{ pasta, enviar: enviarImplantador }], ocupado: () => ocupado });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Processo ${ctx.processo} de ${ctx.cidade}. Digite como o analista. /anexo <arquivo> [legenda], /estado, /sair`);
  const perguntar = () => rl.question(`${COR.ciano}[analista]${COR.fim} `, async (linha) => {
    const s = linha.trim();
    if (s === "/sair") { rl.close(); gravarTranscricao(); process.exit(0); }
    if (s === "/estado") { console.log(store.estado(ctx)); return perguntar(); }
    await processar(s);
    perguntar();
  });
  perguntar();
}
