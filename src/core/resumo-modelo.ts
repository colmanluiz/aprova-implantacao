// Como o modelo é mostrado ao analista: um resumo de WhatsApp e uma prévia etapa por etapa (PDF).
// Linguagem de balcão: sem "campo", "JSON" ou "template".
import type { AprovaTemplate, FormlyField } from "./types.js";
import { walk, label, ehEtapa, opcoesDe } from "./formly.js";
import { gerarPdf, type LinhaPdf } from "./pdf.js";

const FORMATO: Record<string, string> = {
  "next-input": "texto", input: "texto", textarea: "texto longo", "next-ck": "texto longo", "next-tiny": "texto longo",
  "next-upload": "arquivo", radio: "escolha", select: "escolha", multicheckbox: "várias escolhas",
  "next-date": "data", "next-input-data": "texto", "next-cpf-cnpj": "CPF/CNPJ", "next-mapa": "localização no mapa",
  "next-repeat": "lista", "next-processo": "número de processo", "next-cidade-estado": "cidade/UF",
};
/** Tipos que não são pergunta ao cidadão (texto explicativo, remetente/destinatário automáticos). */
const IGNORAR = new Set(["next-html", "next-from", "next-destinatario", "next-wig"]);

export type ItemModelo = { rotulo: string; formato: string; regra: string; opcoes: string[]; path: string };
export type EtapaModelo = { titulo: string; itens: ItemModelo[] };

const removido = (f: FormlyField) => f.hideExpression === true || f.hideExpression === "true";

function regra(f: FormlyField): string {
  const exprReq = f.expressionProperties?.["templateOptions|||required"] ?? f.expressionProperties?.["templateOptions.required"];
  const req = exprReq ? "obrigatório em alguns casos" : f.templateOptions?.required ? "obrigatório" : "opcional";
  return typeof f.hideExpression === "string" ? `${req}; aparece só em alguns casos` : req;
}

/** Etapas do modelo com o que cada uma pede ao cidadão. */
export function etapasDoModelo(tpl: AprovaTemplate): EtapaModelo[] {
  const out: EtapaModelo[] = [];
  for (const { field } of walk(tpl.form)) {
    if (!ehEtapa(field) || removido(field)) continue;
    const itens: ItemModelo[] = [];
    for (const v of walk(field.fieldGroup)) {
      const f = v.field;
      if (!f.key || !f.type || IGNORAR.has(f.type) || removido(f) || v.parents.some(removido)) continue;
      if (v.dentroDeRepeat) continue;
      const rotulo = label(f);
      if (!rotulo) continue;
      itens.push({ rotulo, formato: FORMATO[f.type] ?? "texto", regra: regra(f), opcoes: opcoesDe(f), path: v.path });
    }
    out.push({ titulo: label(field) ?? "(sem título)", itens });
  }
  return out;
}

const nomesSaida = (tpl: AprovaTemplate) =>
  (Array.isArray(tpl.config?.templates) ? tpl.config.templates : [])
    .map((t: any) => t?.nome ?? t?.text_button ?? t?.name ?? t?.title).filter((x: unknown): x is string => typeof x === "string" && !!x.trim());

const curto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const resumirLista = (xs: string[], n: number) => xs.slice(0, n).join(", ") + (xs.length > n ? ` e mais ${xs.length - n}` : "");

/** Mensagem curta (5 a 8 linhas) para o chat. */
export function resumoModelo(tpl: AprovaTemplate, titulo?: string): string {
  const etapas = etapasDoModelo(tpl);
  const itens = etapas.flatMap((e) => e.itens);
  const docs = itens.filter((i) => i.formato === "arquivo");
  const docsSempre = docs.filter((d) => d.regra === "obrigatório");
  const saidas = nomesSaida(tpl);
  const L: string[] = [];
  L.push(`Modelo de ${titulo ?? tpl.config?.title ?? "processo"} que a Aprova já usa:`);
  L.push(`- ${etapas.length} etapas: ${resumirLista(etapas.map((e) => e.titulo), 6)}`);
  L.push(`- o cidadão preenche ${itens.length} informações${itens.filter((i) => i.regra.startsWith("obrigatório")).length ? `, ${itens.filter((i) => i.regra === "obrigatório").length} sempre obrigatórias` : ""}`);
  if (docs.length) {
    const nomes = (docsSempre.length ? docsSempre : docs).slice(0, 3).map((d) => curto(d.rotulo, 40));
    L.push(`- ${docs.length} documentos anexados${docsSempre.length ? `, ${docsSempre.length} sempre exigidos` : ""} (ex.: ${nomes.join("; ")})`);
  }
  if (saidas.length) L.push(`- ao final emite: ${saidas.slice(0, 4).join(", ")}`);
  L.push("Mandei o PDF com tudo, etapa por etapa.");
  return L.join("\n");
}

/** Prévia completa do modelo, etapa por etapa. */
export function pdfDoModelo(tpl: AprovaTemplate, titulo?: string, cidade?: string): Buffer {
  const L: LinhaPdf[] = [];
  L.push({ texto: `Modelo: ${titulo ?? tpl.config?.title ?? "processo"}`, estilo: "titulo" });
  if (cidade) L.push({ texto: `Parametrização para ${cidade}. Este é o formulário que o cidadão preenche hoje no modelo da Aprova.`, estilo: "nota" });
  const saidas = nomesSaida(tpl);
  if (saidas.length) L.push({ texto: `Documentos emitidos ao final: ${saidas.join(", ")}`, estilo: "nota" });
  etapasDoModelo(tpl).forEach((e, i) => {
    L.push({ texto: `${i + 1}. ${e.titulo}`, estilo: "subtitulo" });
    if (!e.itens.length) L.push({ texto: "(só texto explicativo ou dados automáticos)", estilo: "nota", recuo: 1 });
    for (const it of e.itens) {
      L.push({ texto: `- ${it.rotulo}  (${it.formato}, ${it.regra})`, recuo: 1 });
      if (it.opcoes.length) L.push({ texto: `opções: ${it.opcoes.slice(0, 12).join(" / ")}${it.opcoes.length > 12 ? " ..." : ""}`, estilo: "nota", recuo: 2 });
    }
  });
  return gerarPdf(L);
}

/** Versão compacta para o agente: etapa, rótulo, path, formato, regra, opções. */
export function modeloParaAgente(tpl: AprovaTemplate): string {
  return etapasDoModelo(tpl).map((e) =>
    `## ${e.titulo}\n` + e.itens.map((i) => `- ${i.rotulo} [${i.path}] (${i.formato}; ${i.regra})${i.opcoes.length ? ` opções: ${i.opcoes.slice(0, 15).join(" | ")}` : ""}`).join("\n"),
  ).join("\n\n");
}
