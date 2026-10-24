// Roteador de conversa: o analista escolhe, pelo próprio chat, qual processo vai parametrizar, e pode trocar.
//
// Catálogo: forms_modelo/_indice.csv (só os ativos). Cada processo tem a sua pasta data/<cidade>/<slug>/ e o seu estado;
// trocar de processo não apaga nada: voltar a um processo retoma de onde parou.
//
// Estado do chat: data/<cidade>/.canais/<tipo>-<chat_id>.json
//   { cidade, processo_atual, template, titulo, escolhido_em, ultimo_menu }
// (pasta com ponto para o painel, que lista data/<cidade>/*, não confundir com um processo).
//
// Comandos do analista: "menu", "/processos", "/start", "trocar", "outro processo", "quero outro" → menu;
// número do último menu ou nome do processo → escolhe; "/processo <nome>" → escolhe direto; "/ajuda" → ajuda.
// Qualquer outra coisa vai para o processo atual.
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../core/patcher.js";
import { tratarMensagem } from "../agents/orquestrador.js";
import { store, baseDados, perguntasAbertas, type Contexto } from "../agents/store.js";
import type { Canal } from "../agents/tools.js";
import type { Anexo } from "../agents/extrator.js";
import { lerRun, salvarRun } from "../pipeline/run.js";

export type ItemCatalogo = { id: string; titulo: string; slug: string; arquivo: string; template: string };

export type EstadoChat = {
  cidade: string;
  processo_atual: string | null;
  template: string | null;
  titulo?: string | null;
  escolhido_em: string | null;
  /** slugs do último menu mostrado, na ordem; vazio quando não há menu aberto */
  ultimo_menu: string[];
};

export type Rota =
  | { acao: "menu"; opcoes: ItemCatalogo[]; total: number; aviso?: string }
  | { acao: "escolher"; item: ItemCatalogo }
  | { acao: "encaminhar"; texto: string }
  | { acao: "ajuda" }
  | { acao: "prazo"; data: string };

export const PASTA_FORMS = "forms_modelo";
/** O Alvará de Construção usa o template de fixture: é dele que saem os cenários base e os dados da demo. */
const TEMPLATE_FIXO: Record<string, string> = {
  "Alvará de Construção": "fixtures/templates/alvara-construcao.modeload.json",
};
/** Menu inicial: processos que se reconhecem de longe. Os que não existirem no catálogo são ignorados. */
export const MENU_CURADO = [
  "Alvará de Construção",
  "Habite-se",
  "Alvará Sanitário",
  "Alvará de Licença para Localização e Funcionamento",
  "Licença Ambiental Prévia (LAP)",
  "Auxílio Funeral",
  "Baixa de Empresa",
  "Castração de Animais",
  "Solicitação de Férias",
  "Solicitação de Cadastro em Programas Sociais",
];
const MAX_MENU = 10;

// ---------------------------------------------------------------- catálogo

/** CSV simples com aspas (títulos com vírgula vêm entre aspas). */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ",") { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((c) => c !== "")) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c !== "")) linhas.push(linha);
  return linhas;
}

export const slugProcesso = (titulo: string) => slugify(titulo).replace(/_/g, "-");

let cache: ItemCatalogo[] | undefined;
/** Processos ativos de forms_modelo/_indice.csv. */
export function catalogo(pasta = PASTA_FORMS): ItemCatalogo[] {
  if (cache && pasta === PASTA_FORMS) return cache;
  const [cab, ...linhas] = lerCsv(fs.readFileSync(path.join(pasta, "_indice.csv"), "utf8"));
  const col = (n: string) => cab.indexOf(n);
  const [iId, iTit, iDes, iArq] = [col("id"), col("titulo"), col("desativado"), col("arquivo")];
  const usados = new Set<string>();
  const out: ItemCatalogo[] = [];
  for (const l of linhas) {
    if (normalizar(l[iDes] ?? "") !== "nao") continue;
    const titulo = l[iTit].trim();
    let slug = slugProcesso(titulo);
    if (usados.has(slug)) slug = `${slug}-${l[iId].slice(-6)}`;
    usados.add(slug);
    out.push({ id: l[iId], titulo, slug, arquivo: l[iArq], template: TEMPLATE_FIXO[titulo] ?? path.join(pasta, l[iArq]) });
  }
  if (pasta === PASTA_FORMS) cache = out;
  return out;
}

// ---------------------------------------------------------------- roteamento (puro)

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MENU = new Set(["start", "processos", "menu", "trocar", "trocar processo", "outro processo", "quero outro", "quero outro processo", "voltar ao menu"]);
const AJUDA = new Set(["ajuda", "help"]);

/** Títulos que casam com o texto: igual, depois começa com, depois contém, depois todas as palavras. */
export function buscar(cat: ItemCatalogo[], texto: string): ItemCatalogo[] {
  const q = normalizar(texto);
  if (q.length < 3) return [];
  const n = cat.map((c) => ({ c, t: normalizar(c.titulo) }));
  const exato = n.filter((x) => x.t === q);
  if (exato.length) return exato.map((x) => x.c);
  for (const f of [(t: string) => t.startsWith(q), (t: string) => t.includes(q)]) {
    const r = n.filter((x) => f(x.t));
    if (r.length) return r.map((x) => x.c);
  }
  const palavras = q.split(" ").filter((p) => p.length >= 2 && !["de", "da", "do", "o", "a", "e"].includes(p));
  if (!palavras.length) return [];
  return n.filter((x) => { const ts = x.t.split(" "); return palavras.every((p) => ts.some((t) => t.startsWith(p))); }).map((x) => x.c);
}

export function menuCurado(cat: ItemCatalogo[]): ItemCatalogo[] {
  const out: ItemCatalogo[] = [];
  for (const t of MENU_CURADO) {
    const achado = buscar(cat, t)[0];
    if (achado && !out.includes(achado)) out.push(achado);
  }
  for (const c of cat) if (out.length < MAX_MENU && !out.includes(c)) out.push(c);
  return out.slice(0, MAX_MENU);
}

const menu = (cat: ItemCatalogo[], opcoes: ItemCatalogo[], aviso?: string): Rota =>
  ({ acao: "menu", opcoes: opcoes.slice(0, MAX_MENU), total: cat.length, ...(aviso ? { aviso } : {}) });

/** Escolhe por nome; vários resultados viram um menu só com eles. */
function porNome(cat: ItemCatalogo[], nome: string): Rota | undefined {
  const r = buscar(cat, nome);
  if (r.length === 1) return { acao: "escolher", item: r[0] };
  if (r.length > 1) return menu(cat, r, r.length > MAX_MENU ? `Achei ${r.length} processos com "${nome}". Os primeiros:` : undefined);
  return undefined;
}

/**
 * Decide o que fazer com a mensagem do analista. Não toca em disco.
 * Nome de processo só é procurado com menu aberto ou por /processo: com um processo em andamento,
 * qualquer resposta ("1 sim, 2 não", "Habite-se não exige") vai para ele.
 */
export function rotear(estado: EstadoChat, texto: string, cat: ItemCatalogo[] = catalogo()): Rota {
  const bruto = texto.trim();
  const q = normalizar(bruto);
  const menuAberto = estado.ultimo_menu.length > 0;

  if (AJUDA.has(q) || bruto === "/help" || bruto === "/ajuda") return { acao: "ajuda" };
  const pz = bruto.match(/^\/prazo\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/i);
  if (pz) {
    const ano = pz[3] ? (pz[3].length === 2 ? `20${pz[3]}` : pz[3]) : String(new Date().getFullYear());
    return { acao: "prazo", data: `${ano}-${pz[2].padStart(2, "0")}-${pz[1].padStart(2, "0")}` };
  }
  if (MENU.has(q)) return menu(cat, menuCurado(cat));

  const cmd = bruto.match(/^\/processo\s+(.+)$/i);
  if (cmd) return porNome(cat, cmd[1]) ?? menu(cat, menuCurado(cat), `Não achei "${cmd[1].trim()}".`);
  if (/^\/processo\s*$/i.test(bruto)) return menu(cat, menuCurado(cat));

  if (menuAberto) {
    const num = bruto.match(/^(\d{1,2})[.)]?$/);
    if (num) {
      const slug = estado.ultimo_menu[Number(num[1]) - 1];
      const item = slug && cat.find((c) => c.slug === slug);
      if (item) return { acao: "escolher", item };
      return menu(cat, estado.ultimo_menu.map((s) => cat.find((c) => c.slug === s)).filter((c): c is ItemCatalogo => !!c), `Não tem a opção ${num[1]}.`);
    }
    const r = porNome(cat, bruto);
    if (r) return r;
  }

  if (!estado.processo_atual) {
    return menu(cat, menuCurado(cat), q && menuAberto ? `Não achei "${bruto}".` : undefined);
  }
  return { acao: "encaminhar", texto: bruto };
}

/** A fala é uma escolha de menu (comando de menu, /processo ou número)? Usado para decidir se um roteiro começa pelo menu. */
export function ehEscolhaDeMenu(texto: string): boolean {
  const t = texto.trim();
  return MENU.has(normalizar(t)) || /^\/processo\b/i.test(t) || /^\d{1,2}[.)]?$/.test(t);
}

export function textoMenu(r: Extract<Rota, { acao: "menu" }>): string {
  const L: string[] = [];
  if (r.aviso) L.push(r.aviso);
  L.push("Qual processo vamos parametrizar? Responda com o número ou o nome.");
  r.opcoes.forEach((o, i) => L.push(`${i + 1}. ${o.titulo}`));
  if (r.opcoes.length < r.total) L.push(`Ou escreva o nome de qualquer um dos ${r.total} processos.`);
  return L.join("\n");
}

export const TEXTO_AJUDA = [
  "Comandos:",
  "menu: lista os processos para escolher",
  "trocar: muda de processo (o que já respondeu fica salvo)",
  "/processo <nome>: vai direto a um processo",
  "/prazo 29/10: combina o prazo do processo atual",
  "Fora isso, é só responder às perguntas.",
].join("\n");

// ---------------------------------------------------------------- estado do chat (disco)

export const arquivoChat = (cidade: string, tipo: string, chatId: string | number) =>
  path.join(baseDados(), cidade, ".canais", `${tipo}-${chatId}.json`);

export function lerChat(cidade: string, tipo: string, chatId: string | number): EstadoChat {
  try {
    const e = JSON.parse(fs.readFileSync(arquivoChat(cidade, tipo, chatId), "utf8")) as EstadoChat;
    return { ...e, ultimo_menu: Array.isArray(e.ultimo_menu) ? e.ultimo_menu : [] };
  } catch {
    return { cidade, processo_atual: null, template: null, titulo: null, escolhido_em: null, ultimo_menu: [] };
  }
}

export function salvarChat(tipo: string, chatId: string | number, e: EstadoChat) {
  const p = arquivoChat(e.cidade, tipo, chatId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(e, null, 2));
}

export const ctxDoChat = (e: EstadoChat): Contexto | null =>
  e.processo_atual && e.template ? { cidade: e.cidade, processo: e.processo_atual, template: e.template } : null;

/** Fixa um processo no chat sem passar pelo menu (ex.: --processo no terminal, PROCESSO no Telegram). */
export function preselecionar(e: EstadoChat, processo: string, template: string, titulo?: string): EstadoChat {
  return { ...e, processo_atual: processo, template, titulo: titulo ?? processo, escolhido_em: new Date().toISOString(), ultimo_menu: [] };
}

// ---------------------------------------------------------------- atendimento (canal → roteador → pipeline)

/**
 * Como retomar um processo escolhido: "novo" (nunca falou com o analista), "aviso" (fora da coleta ou sem
 * pergunta aberta: uma linha basta) ou "coletor" (coleta em andamento: o Coletor diz o que falta e reenvia o lote).
 */
export function retomada(ctx: Contexto, titulo: string): { tipo: "novo" } | { tipo: "aviso"; texto: string } | { tipo: "coletor"; abertas: number } {
  const estado = store.estado(ctx);
  if (!estado.historico.some((h) => h.role === "assistant")) return { tipo: "novo" };
  const run = lerRun(ctx);
  if (estado.modo === "humano") return { tipo: "aviso", texto: `Voltando ao processo ${titulo}. Pode escrever, o implantador está acompanhando.` };
  if (run && (run.etapa_atual !== "coletar" || run.gate)) {
    return { tipo: "aviso", texto: run.status === "concluido"
      ? `Voltando ao processo ${titulo}: esse já foi homologado pelo implantador.`
      : run.gate?.para === "analista"
        ? `Voltando ao processo ${titulo}: tem uma confirmação esperando você na mensagem anterior.`
        : `Voltando ao processo ${titulo}: as perguntas já terminaram; o implantador está revisando o formulário.` };
  }
  const f = store.ficha(ctx);
  const n = f ? perguntasAbertas(f).length : 0;
  if (!n) return { tipo: "aviso", texto: `Voltando ao processo ${titulo}: não falta nenhuma pergunta.` };
  return { tipo: "coletor", abertas: n };
}

/** Turno sintético que pede ao Coletor para retomar (vai ao histórico como fala do analista). */
export const PEDIDO_RETOMADA = "(voltei a este processo pelo menu: me diga quantas perguntas faltam e mande o próximo lote)";

export type Atendimento = {
  tipo: string;
  chatId: string | number;
  cidade: string;
  canal: Canal;
  entrada: { texto?: string; anexo?: Anexo; remetente?: string };
  /** chamado com o processo antes de qualquer escrita nele (registrar canal, marcar ocupado) */
  antes?: (ctx: Contexto) => void;
  /** fim de cada chamada ao pipeline (nota do agente) */
  depois?: (ctx: Contexto, notaAgente: string) => void;
  cat?: ItemCatalogo[];
};

/** Trata uma mensagem do chat: menu, escolha (e início/retomada do processo) ou encaminhamento. Devolve o processo atual. */
export async function atender(a: Atendimento): Promise<Contexto | null> {
  const cat = a.cat ?? catalogo();
  let estado = lerChat(a.cidade, a.tipo, a.chatId);
  const texto = a.entrada.texto?.trim() ?? "";

  // Arquivo: vai para o processo atual (a legenda não é comando); sem processo, pede para escolher antes.
  const rota: Rota = a.entrada.anexo
    ? (estado.processo_atual ? { acao: "encaminhar", texto } : menu(cat, menuCurado(cat), "Antes do arquivo, me diga de qual processo é."))
    : texto ? rotear(estado, texto, cat) : (estado.processo_atual ? { acao: "encaminhar", texto: "" } : menu(cat, menuCurado(cat)));

  if (rota.acao === "ajuda") { await a.canal.enviar(TEXTO_AJUDA); return ctxDoChat(estado); }

  if (rota.acao === "prazo") {
    const ctx = ctxDoChat(estado);
    const run = ctx ? lerRun(ctx) : undefined;
    if (!ctx || !run) { await a.canal.enviar("Escolha um processo antes de combinar o prazo."); return ctx; }
    salvarRun(ctx, { ...run, prazo: rota.data });
    await a.canal.enviar(`Prazo do ${run.titulo} combinado: ${rota.data.slice(8, 10)}/${rota.data.slice(5, 7)}.`);
    return ctx;
  }

  if (rota.acao === "menu") {
    salvarChat(a.tipo, a.chatId, { ...estado, ultimo_menu: rota.opcoes.map((o) => o.slug) });
    await a.canal.enviar(textoMenu(rota));
    return ctxDoChat(estado);
  }

  if (rota.acao === "escolher") {
    const { item } = rota;
    estado = { ...estado, processo_atual: item.slug, template: item.template, titulo: item.titulo, escolhido_em: new Date().toISOString(), ultimo_menu: [] };
    salvarChat(a.tipo, a.chatId, estado);
    const ctx = ctxDoChat(estado)!;
    a.antes?.(ctx);
    const r = retomada(ctx, item.titulo);
    if (r.tipo === "aviso") { await a.canal.enviar(r.texto); return ctx; }
    let nota: string;
    if (r.tipo === "coletor") {
      nota = await tratarMensagem(ctx, a.canal, { texto: PEDIDO_RETOMADA, remetente: a.entrada.remetente });
    } else {
      await a.canal.enviar(`Combinado: ${item.titulo}. Vou te mostrar o modelo que a Aprova já tem.`);
      // Turno vazio: é assim que tratarMensagem abre um processo (o Coletor se apresenta e manda o primeiro lote).
      nota = await tratarMensagem(ctx, a.canal, { remetente: a.entrada.remetente });
    }
    a.depois?.(ctx, nota);
    return ctx;
  }

  // encaminhar
  if (estado.ultimo_menu.length) { estado = { ...estado, ultimo_menu: [] }; salvarChat(a.tipo, a.chatId, estado); }
  const ctx = ctxDoChat(estado)!;
  a.antes?.(ctx);
  const nota = await tratarMensagem(ctx, a.canal, { ...a.entrada, texto: rota.texto || undefined });
  a.depois?.(ctx, nota);
  return ctx;
}
