// Simulador de canal: você faz o papel do analista da prefeitura no terminal.
//
// Interativo:  npm run chat -- [--cidade vale-verde] [--processo alvara] [--template fixtures/templates/alvara-construcao.modeload.json]
//   Sem --processo, o chat abre o menu de processos (forms_modelo/_indice.csv) e o analista escolhe; "menu"/"trocar" troca.
//   Com --processo, esse processo já vem escolhido (o menu continua disponível).
//   Comandos: /anexo <arquivo> [legenda]  envia foto/PDF/planilha;  /estado  mostra a etapa;  /sair
//   Do analista (iguais no Telegram): menu, trocar, /processo <nome>, /ajuda.
//
// Roteiro (demo):  npm run chat -- --script fixtures/insumos/conversa-demo.txt [--pausa 1500] [--transcricao saida.md] [--continuar]
//   Reproduz as falas do analista, uma por linha, com pausa entre elas. Linhas "/anexo <arquivo> [legenda]" mandam arquivo;
//   linhas vazias e linhas com "#" são ignoradas. Sem --continuar, o processo começa do zero (apaga data/<cidade>/<processo>).
//   O processo do roteiro é o de --processo (padrão alvara), sem menu; se a primeira fala for um comando de menu
//   ("menu", "/processo X" ou um número), o roteiro começa pelo menu.
//
// Nos dois modos, mensagens do implantador escritas no painel (outbox.json) aparecem como [implantador].
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { store } from "../agents/store.js";
import type { Anexo } from "../agents/extrator.js";
import type { Contexto } from "../agents/store.js";
import { entregarOutbox, salvarCanal, vigiarOutbox } from "./outbox.js";
import { atender, catalogo, ctxDoChat, ehEscolhaDeMenu, lerChat, preselecionar, salvarChat } from "./roteador.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);

const cidade = arg("cidade", "vale-verde");
const processoArg = arg("processo", "");
const roteiro = arg("script", "");
const pausaMs = Number(arg("pausa", "1500"));
const arqTranscricao = arg("transcricao", "");
const TIPO = "terminal", CHAT = "terminal";

/** Processo atual do chat (muda quando o analista escolhe outro no menu). */
let ctx: Contexto | null = ctxDoChat(lerChat(cidade, TIPO, CHAT));
const pastaAtual = () => (ctx ? store.pasta(ctx) : null);

/** --processo: escolhe sem menu. Template: --template, senão o do catálogo, senão o da fixture do alvará. */
function preselecao(processo: string): Contexto {
  const item = catalogo().find((c) => c.slug === processo);
  const template = arg("template", item?.template ?? "fixtures/templates/alvara-construcao.modeload.json");
  salvarChat(TIPO, CHAT, preselecionar(lerChat(cidade, TIPO, CHAT), processo, template, item?.titulo));
  return { cidade, processo, template };
}

const COR = { verde: "\x1b[32m", ciano: "\x1b[36m", amarelo: "\x1b[33m", cinza: "\x1b[90m", fim: "\x1b[0m" };
const transcricao: string[] = [];
const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const canal = {
  enviar: async (texto: string) => {
    console.log(`\n${COR.verde}[Aprova]${COR.fim} ${texto}\n`);
    transcricao.push(`**Aprova** (${hora()}):\n\n${citar(texto)}\n`);
  },
  enviarArquivo: async ({ nome, conteudo, legenda }: { nome: string; conteudo: Buffer; legenda?: string }) => {
    const p = path.join(os.tmpdir(), nome);
    fs.writeFileSync(p, conteudo);
    console.log(`\n${COR.verde}[Aprova]${COR.fim} [arquivo] ${legenda ?? nome}: ${p}\n`);
    transcricao.push(`**Aprova** (${hora()}): [arquivo ${nome}]\n`);
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
    let entrada: { texto?: string; anexo?: Anexo; remetente: string } = { remetente: "analista" };
    if (linha.startsWith("/anexo ")) {
      const [arquivo, ...legenda] = linha.slice(7).trim().split(/\s+/);
      transcricao.push(`**Analista** (${hora()}): [anexo] \`${path.basename(arquivo)}\`${legenda.length ? ` ${legenda.join(" ")}` : ""}\n`);
      entrada = { anexo: anexoDe(arquivo), texto: legenda.join(" ") || "segue o arquivo", remetente: "analista" };
    } else if (linha) {
      transcricao.push(`**Analista** (${hora()}): ${linha}\n`);
      entrada = { texto: linha, remetente: "analista" };
    } else if (ctx && store.estado(ctx).etapa !== "nao_iniciado") {
      return; // linha vazia num processo já aberto: nada a fazer
    }
    // Menu, escolha de processo ou encaminhamento ao processo atual: decidido pelo roteador.
    await atender({
      tipo: TIPO, chatId: CHAT, cidade, canal, entrada,
      antes: (c) => {
        if (ctx?.processo !== c.processo) console.log(`${COR.cinza}(processo atual: ${c.processo} → data/${c.cidade}/${c.processo})${COR.fim}`);
        ctx = c;
        fs.mkdirSync(store.pasta(c), { recursive: true });
        salvarCanal(store.pasta(c), { tipo: "terminal" });
      },
      depois: (_c, n) => nota(n),
    });
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
const entregarImplantador = async () => { const p = pastaAtual(); if (p) await entregarOutbox(p, enviarImplantador); };

function resumoFicha(): string {
  const f = ctx && store.ficha(ctx);
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
    `# Transcrição: ${ctx?.processo ?? "(sem processo)"} de ${cidade}`,
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

const alvosOutbox = () => { const p = pastaAtual(); return p ? [{ pasta: p, enviar: enviarImplantador }] : []; };

if (roteiro) {
  const linhas = fs.readFileSync(roteiro, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (linhas[0] && ehEscolhaDeMenu(linhas[0])) {
    salvarChat(TIPO, CHAT, { ...lerChat(cidade, TIPO, CHAT), processo_atual: null, template: null, titulo: null, ultimo_menu: [] });
    ctx = null;
  } else {
    ctx = preselecao(processoArg || "alvara");
    const pasta = store.pasta(ctx);
    if (!flag("continuar")) fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta, { recursive: true });
    salvarCanal(pasta, { tipo: "terminal" });
  }
  const parar = vigiarOutbox({ alvos: alvosOutbox, ocupado: () => ocupado });
  console.log(`Roteiro ${roteiro}: ${linhas.length} falas do analista, pausa de ${pausaMs} ms. Processo ${ctx?.processo ?? "(escolhido no menu)"} de ${cidade}.`);
  if (!ctx || store.estado(ctx).etapa === "nao_iniciado") await processar("");
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
  if (processoArg) ctx = preselecao(processoArg);
  if (ctx) { fs.mkdirSync(store.pasta(ctx), { recursive: true }); salvarCanal(store.pasta(ctx), { tipo: "terminal" }); }
  vigiarOutbox({ alvos: alvosOutbox, ocupado: () => ocupado });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`${ctx ? `Processo ${ctx.processo}` : "Nenhum processo escolhido"} em ${cidade}. Digite como o analista: menu, trocar, /processo <nome>, /anexo <arquivo> [legenda], /estado, /sair`);
  if (!ctx) await processar(""); // abre o menu
  const perguntar = () => rl.question(`${COR.ciano}[analista]${COR.fim} `, async (linha) => {
    const s = linha.trim();
    if (s === "/sair") { rl.close(); gravarTranscricao(); process.exit(0); }
    if (s === "/estado") { console.log(lerChat(cidade, TIPO, CHAT)); if (ctx) console.log(store.estado(ctx)); return perguntar(); }
    await processar(s);
    perguntar();
  });
  perguntar();
}
