// Cobrança de prazo: um verificador periódico olha cada processo esperando o analista e decide se cutuca.
// Escada: lembrete leve (ocioso) → cobrança com a conta do prazo (ritmo não fecha) → escala ao implantador.
// Regras de convivência: só em horário comercial, no máximo N por dia, e qualquer resposta do analista zera a escada.
import fs from "node:fs";
import path from "node:path";
import { store, perguntasAbertas, baseDados, type Contexto } from "../agents/store.js";
import { itensPropostos } from "../core/plano.js";
import { enviarAoAnalista } from "../agents/envio.js";
import { lerRun, salvarRun, agora } from "./run.js";
import type { Run } from "./tipos.js";

export type ConfigCobranca = {
  /** horas sem resposta antes do primeiro lembrete */
  ociosoHoras: number;
  maxPorDia: number;
  /** false = ignora horário comercial (para testar) */
  soHorarioComercial: boolean;
  /** cobranças seguidas sem resposta antes de escalar ao implantador */
  escalarApos: number;
};

export const CONFIG_PADRAO: ConfigCobranca = {
  ociosoHoras: Number(process.env.COBRANCA_OCIOSO_HORAS ?? 4),
  maxPorDia: Number(process.env.COBRANCA_MAX_DIA ?? 2),
  soHorarioComercial: process.env.COBRANCA_HORARIO !== "livre",
  escalarApos: Number(process.env.COBRANCA_ESCALAR_APOS ?? 3),
};

export type EntradaCobranca = {
  agora: Date;
  titulo: string;
  prazo?: string;
  /** ISO da última mensagem do analista (ou do início do processo) */
  ultimaAtividade: string;
  cobrancas: NonNullable<Run["cobrancas"]>;
  itensFaltando: number;
};

export type Decisao = { nivel: "lembrete" | "ritmo" | "escalar"; texto: string } | null;

const TZ = "America/Sao_Paulo";
function partesLocais(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, fimDeSemana: p.weekday === "Sat" || p.weekday === "Sun" };
}

export function horarioComercial(d: Date): boolean {
  const { hora, fimDeSemana } = partesLocais(d);
  return !fimDeSemana && hora >= 8 && hora < 18;
}

/** Dias úteis de hoje até o prazo, contando os dois (prazo hoje = 1; prazo passado = 0). */
export function diasUteisAte(hoje: Date, prazo: string): number {
  const ini = new Date(`${partesLocais(hoje).data}T12:00:00Z`);
  const fim = new Date(`${prazo}T12:00:00Z`);
  let n = 0;
  for (const d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  return n;
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const minutos = (itens: number) => Math.max(5, Math.min(itens, 3) * 3);

export function avaliarCobranca(e: EntradaCobranca, cfg: ConfigCobranca = CONFIG_PADRAO): Decisao {
  if (e.itensFaltando <= 0) return null;
  if (cfg.soHorarioComercial && !horarioComercial(e.agora)) return null;
  const hoje = partesLocais(e.agora).data;
  const desdeResposta = e.cobrancas.filter((c) => c.em > e.ultimaAtividade);
  if (desdeResposta.some((c) => c.nivel === "escalar")) return null; // já está com o implantador
  if (e.cobrancas.filter((c) => partesLocais(new Date(c.em)).data === hoje && c.nivel !== "escalar").length >= cfg.maxPorDia) return null;
  const ultima = [e.ultimaAtividade, ...desdeResposta.map((c) => c.em)].sort().at(-1)!;
  if (e.agora.getTime() - new Date(ultima).getTime() < cfg.ociosoHoras * 3_600_000) return null;

  const dias = e.prazo ? diasUteisAte(e.agora, e.prazo) : undefined;
  if (desdeResposta.length >= cfg.escalarApos || (dias !== undefined && dias <= 0)) {
    return { nivel: "escalar", texto: `${e.titulo}: analista sem responder${dias !== undefined ? `, prazo ${dias <= 0 ? "vencido" : dataBR(e.prazo!)}` : ""}; ${e.itensFaltando} item(ns) em aberto, ${desdeResposta.length} cobrança(s) sem resposta. Vale ligar.` };
  }
  if (dias !== undefined && (dias <= 2 || e.itensFaltando > dias * 3)) {
    return { nivel: "ritmo", texto: `Oi! Faltam ${e.itensFaltando} item(ns) do ${e.titulo} para fecharmos até ${dataBR(e.prazo!)} (${dias > 1 ? `${dias} dias úteis` : "1 dia útil"}). Dá uns ${minutos(e.itensFaltando)} minutos hoje. Posso mandar os próximos?` };
  }
  return { nivel: "lembrete", texto: `Oi! Quando puder, seguimos com o ${e.titulo}: falta${e.itensFaltando > 1 ? "m" : ""} ${e.itensFaltando} item(ns), uns ${minutos(e.itensFaltando)} minutos.` };
}

/** O que falta o analista fazer: decidir sobre o modelo, confirmar itens do plano, responder perguntas, conferir casos. */
export function itensFaltando(c: Contexto, run: Run): number {
  if (run.gate?.para === "analista") return 1;
  if (run.etapa_atual !== "coletar") return 0;
  const p = store.plano(c);
  const f = store.ficha(c);
  return (p.decisao ? 0 : 1) + itensPropostos(p).length + (f ? perguntasAbertas(f).length : 0);
}

/**
 * Passa por todos os processos com chat vinculado e cobra quem precisa. `enviar` entrega ao analista;
 * escalar não fala com o analista: anota em pendencias.md e no run para o painel.
 */
export async function verificarCobrancas(
  pastas: { pasta: string; enviar: (texto: string) => Promise<void> }[],
  cfg: ConfigCobranca = CONFIG_PADRAO,
  quando = new Date(),
  log: (s: string) => void = console.log,
) {
  for (const { pasta, enviar } of pastas) {
    const rel = path.relative(baseDados(), pasta).split(path.sep);
    if (rel.length !== 2) continue;
    const c: Contexto = { cidade: rel[0], processo: rel[1], template: "" };
    const run = lerRun(c);
    if (!run || run.status !== "aguardando_prefeitura") continue;
    const estado = store.estado(c);
    if (estado.modo === "humano") continue;
    const decisao = avaliarCobranca({
      agora: quando,
      titulo: run.titulo,
      prazo: run.prazo,
      ultimaAtividade: estado.ultima_mensagem_analista ?? run.iniciado_em,
      cobrancas: run.cobrancas ?? [],
      itensFaltando: itensFaltando(c, run),
    }, cfg);
    if (!decisao) continue;
    if (decisao.nivel !== "escalar") {
      // Mesma porta de saída do Coletor: cobrança que não passa nos limites da conversa vira pendência do implantador.
      const v = await enviarAoAnalista(c, enviar, decisao.texto, { autor: "cobranca" });
      if (!v.ok) Object.assign(decisao, { nivel: "escalar", texto: `${run.titulo}: cobrança não enviada ao analista (${v.motivo})` });
    }
    if (decisao.nivel === "escalar") {
      fs.appendFileSync(store.arquivo(c, "pendencias.md"), `- [ ] ${agora()} · **cobrança de prazo**: ${decisao.texto}\n`);
    }
    const r2 = lerRun(c)!;
    (r2.cobrancas ??= []).push({ em: quando.toISOString(), nivel: decisao.nivel, texto: decisao.texto });
    salvarRun(c, r2);
    log(`cobrança ${decisao.nivel} → ${c.cidade}/${c.processo}`);
  }
}
