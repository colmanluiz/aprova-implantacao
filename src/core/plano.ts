// Plano de ação: o que a prefeitura quer mudar no modelo, em operações estruturadas.
// O agente propõe itens (descrição de balcão + operação); o código valida contra o formulário e aplica.
// Nenhum LLM edita o JSON: a operação é a única forma de mudar o formulário fora da ficha.
import { z } from "zod";
import type { AprovaTemplate, Cenario, FormlyField, Mudanca } from "./types.js";
import { walk, label, ehEtapa, opcoesDe } from "./formly.js";
import { rodarCenarios } from "./scenario-runner.js";

const Condicao = z.object({
  campo: z.string().min(1).describe("path ou key do campo que decide"),
  valores: z.array(z.string()).min(1).describe("valores (texto da opção) que ativam a regra"),
});
export type Condicao = z.infer<typeof Condicao>;

export const FORMATOS = ["texto", "texto_longo", "numero", "data", "anexo", "selecao", "sim_nao"] as const;

export const Operacao = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("remover_campo"), campo: z.string() }),
  z.object({ tipo: z.literal("exigir_sempre"), campo: z.string() }),
  z.object({ tipo: z.literal("tornar_opcional"), campo: z.string() }),
  z.object({ tipo: z.literal("exigir_quando"), campo: z.string(), quando: Condicao }),
  z.object({ tipo: z.literal("mostrar_quando"), campo: z.string(), quando: Condicao }),
  z.object({ tipo: z.literal("trocar_opcoes"), campo: z.string(), opcoes: z.array(z.string()).min(1) }),
  z.object({ tipo: z.literal("renomear_campo"), campo: z.string(), rotulo: z.string().min(1) }),
  z.object({
    tipo: z.literal("adicionar_campo"),
    etapa: z.string().describe("título da etapa onde o campo entra"),
    rotulo: z.string().min(1),
    formato: z.enum(FORMATOS),
    obrigatorio: z.boolean(),
    opcoes: z.array(z.string()).optional().describe("só para formato selecao"),
    quando: Condicao.optional().describe("se informado, o campo só aparece nessa condição"),
    depois_de: z.string().optional().describe("path ou key do campo depois do qual entra"),
  }),
  z.object({ tipo: z.literal("remover_etapa"), etapa: z.string() }),
  z.object({ tipo: z.literal("renomear_etapa"), etapa: z.string(), titulo: z.string().min(1) }),
]);
export type Operacao = z.infer<typeof Operacao>;

export type StatusItem = "proposto" | "confirmado" | "descartado";

export type ItemPlano = {
  id: string;
  /** como o analista entende: "Tirar a ART do responsável técnico" */
  descricao: string;
  operacao: Operacao;
  status: StatusItem;
  origem: string;
  proposto_em: string;
  confirmado_em?: string;
  /** resultado da última verificação automática (casos gerados pelo código) */
  verificacao?: { em: string; ok: boolean; detalhe: string };
};

export type Plano = {
  /** null até o analista dizer se o modelo atende */
  decisao: "atende" | "mudar" | null;
  decidido_em?: string;
  /** quando o resumo e o PDF do modelo foram enviados ao analista */
  modelo_mostrado_em?: string;
  itens: ItemPlano[];
};

export const planoVazio = (): Plano => ({ decisao: null, itens: [] });
export const itensConfirmados = (p: Plano | undefined) => (p?.itens ?? []).filter((i) => i.status === "confirmado");
export const itensPropostos = (p: Plano | undefined) => (p?.itens ?? []).filter((i) => i.status === "proposto");

// ---------------------------------------------------------------- localizar

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Campo por path exato ou, se não houver, por key única. */
export function acharCampoPlano(form: AprovaTemplate, ref: string): { field: FormlyField; path: string } | { erro: string } {
  const todos = [...walk(form.form)].filter((v) => v.field.key);
  const exato = todos.find((v) => v.path === ref);
  if (exato) return { field: exato.field, path: exato.path };
  const porKey = todos.filter((v) => String(v.field.key) === ref);
  if (porKey.length === 1) return { field: porKey[0].field, path: porKey[0].path };
  if (porKey.length > 1) return { erro: `key "${ref}" aparece ${porKey.length} vezes; use o path (${porKey.map((v) => v.path).join(", ")})` };
  return { erro: `campo "${ref}" não existe no formulário (use listar_campos)` };
}

export function acharEtapa(form: AprovaTemplate, titulo: string): FormlyField | undefined {
  const alvo = norm(titulo);
  const steps = [...walk(form.form)].filter((v) => ehEtapa(v.field)).map((v) => v.field);
  return steps.find((s) => norm(label(s) ?? "") === alvo) ?? steps.find((s) => norm(label(s) ?? "").includes(alvo));
}

const titulosEtapas = (form: AprovaTemplate) => [...walk(form.form)].filter((v) => ehEtapa(v.field)).map((v) => label(v.field) ?? "(sem título)");

// ---------------------------------------------------------------- validar

/** Confere a operação contra o formulário. Devolve a lista de problemas (vazia = válida). */
export function validarOperacao(form: AprovaTemplate, op: Operacao): string[] {
  const erros: string[] = [];
  const campo = (ref: string) => { const r = acharCampoPlano(form, ref); if ("erro" in r) erros.push(r.erro); return "erro" in r ? undefined : r; };
  const cond = (q: Condicao) => {
    const r = campo(q.campo);
    if (!r) return;
    if (r.path.includes("[]")) erros.push(`condição sobre campo de lista repetida (${r.path}) não é suportada`);
    const ops = opcoesDe(r.field);
    if (ops.length) {
      const fora = q.valores.filter((v) => !ops.includes(v));
      if (fora.length) erros.push(`valores ${fora.map((v) => `"${v}"`).join(", ")} não são opções de ${r.path} (opções: ${ops.join(", ")})`);
    }
  };
  switch (op.tipo) {
    case "remover_campo": case "exigir_sempre": case "tornar_opcional": case "renomear_campo": campo(op.campo); break;
    case "exigir_quando": case "mostrar_quando": campo(op.campo); cond(op.quando); break;
    case "trocar_opcoes": {
      const r = campo(op.campo);
      if (r && !Array.isArray(r.field.templateOptions?.options)) erros.push(`${r.path} não é campo de opções`);
      break;
    }
    case "adicionar_campo":
      if (!acharEtapa(form, op.etapa)) erros.push(`etapa "${op.etapa}" não existe (etapas: ${titulosEtapas(form).join(", ")})`);
      if (op.formato === "selecao" && !op.opcoes?.length) erros.push("formato selecao precisa de opcoes");
      if (op.quando) cond(op.quando);
      if (op.depois_de) campo(op.depois_de);
      break;
    case "remover_etapa": case "renomear_etapa":
      if (!acharEtapa(form, op.etapa)) erros.push(`etapa "${op.etapa}" não existe (etapas: ${titulosEtapas(form).join(", ")})`);
      break;
  }
  return erros;
}

// ---------------------------------------------------------------- aplicar

const ACESSO = (path: string) => {
  const partes = path.split(".");
  if (partes.length === 1) return `model.${partes[0]}`;
  // (model.a || {}).b: não quebra quando o grupo ainda não foi preenchido
  return partes.slice(1).reduce((acc, p) => `(${acc} || {}).${p}`, `model.${partes[0]}`);
};

/** Expressão Formly da condição, no estilo dos templates da Aprova. */
export function expressaoCondicao(form: AprovaTemplate, q: Condicao): string {
  const r = acharCampoPlano(form, q.campo);
  const path = "erro" in r ? q.campo : r.path;
  const acc = ACESSO(path);
  if (q.valores.length === 1) return `${acc} === ${aspas(q.valores[0])}`;
  return `[${q.valores.map(aspas).join(", ")}].indexOf(${acc}) >= 0`;
}
const aspas = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function chaveNova(form: AprovaTemplate, rotulo: string): string {
  const base = rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";
  const usadas = new Set([...walk(form.form)].map((v) => String(v.field.key ?? "")));
  let k = base, n = 2;
  while (usadas.has(k)) k = `${base}_${n++}`;
  return k;
}

function novoCampo(form: AprovaTemplate, op: Extract<Operacao, { tipo: "adicionar_campo" }>): FormlyField {
  const key = chaveNova(form, op.rotulo);
  const to: Record<string, any> = { label: op.rotulo, required: op.obrigatorio, focus: "false" };
  let type = "next-input";
  switch (op.formato) {
    case "texto": to.type = "text"; break;
    case "numero": to.type = "number"; break;
    case "texto_longo": type = "textarea"; break;
    case "data": type = "next-date"; to.type = "text"; to.placeholder = "Ex: 00/00/0000"; break;
    case "anexo": type = "next-upload"; to.options = []; break;
    case "selecao": type = "select"; to.placeholder = "--selecione--"; to.options = (op.opcoes ?? []).map((o) => ({ label: o, value: o })); break;
    case "sim_nao": type = "radio"; to.options = [{ value: "Sim" }, { value: "Não" }]; break;
  }
  const f: FormlyField = { key, type, className: "col-12", templateOptions: to };
  if (op.quando) f.hideExpression = `!(${expressaoCondicao(form, op.quando)})`;
  return f;
}

/** Lista que contém `alvo` diretamente (fieldGroup do pai). */
function listaDoPai(raiz: FormlyField[], alvo: FormlyField): FormlyField[] | undefined {
  for (const f of raiz) {
    if (f === alvo) return raiz;
    if (Array.isArray(f.fieldGroup)) { const r = listaDoPai(f.fieldGroup, alvo); if (r) return r; }
  }
  return undefined;
}

/** Onde um campo novo entra numa etapa: junto do último campo com key (o grupo de campos da etapa). */
function listaDaEtapa(step: FormlyField): FormlyField[] {
  const comKey = [...walk(step.fieldGroup)].filter((v) => v.field.key && !v.dentroDeRepeat);
  const ultimo = comKey.at(-1)?.field;
  if (ultimo) { const l = listaDoPai(step.fieldGroup ?? [], ultimo); if (l) return l; }
  return (step.fieldGroup ??= []);
}

export type ResultadoPlano = { form: AprovaTemplate; mudancas: Mudanca[]; falhas: { id: string; erro: string }[] };

/** Aplica os itens confirmados, em ordem, sobre o formulário (já com a ficha aplicada). */
export function aplicarPlano(entrada: AprovaTemplate, itens: ItemPlano[]): ResultadoPlano {
  const form = structuredClone(entrada);
  const mudancas: Mudanca[] = [];
  const falhas: ResultadoPlano["falhas"] = [];
  for (const it of itens.filter((i) => i.status === "confirmado")) {
    const erros = validarOperacao(form, it.operacao);
    if (erros.length) { falhas.push({ id: it.id, erro: erros.join("; ") }); continue; }
    const reg = (alvo: string, antes: unknown, depois: unknown) =>
      mudancas.push({ pergunta_id: it.id, tipo: "plano", alvo, antes, depois, origem: it.origem, confianca: 1 });
    const op = it.operacao;
    const achar = (ref: string) => acharCampoPlano(form, ref) as { field: FormlyField; path: string };
    switch (op.tipo) {
      case "remover_campo": {
        const { field, path } = achar(op.campo);
        reg(path, field.hideExpression ?? "visível", "removido do pedido");
        field.hideExpression = "true";
        field.templateOptions = { ...(field.templateOptions ?? {}), required: false };
        break;
      }
      case "exigir_sempre": case "tornar_opcional": {
        const { field, path } = achar(op.campo);
        const antes = { required: field.templateOptions?.required, expr: exprRequired(field) };
        field.templateOptions = { ...(field.templateOptions ?? {}), required: op.tipo === "exigir_sempre" };
        limparRequired(field);
        reg(path, antes, op.tipo === "exigir_sempre" ? "sempre obrigatório" : "opcional");
        break;
      }
      case "exigir_quando": {
        const { field, path } = achar(op.campo);
        const expr = expressaoCondicao(form, op.quando);
        const antes = { required: field.templateOptions?.required, expr: exprRequired(field) };
        limparRequired(field);
        field.templateOptions = { ...(field.templateOptions ?? {}), required: false };
        field.expressionProperties = { ...(field.expressionProperties ?? {}), "templateOptions|||required": expr };
        reg(path, antes, `obrigatório quando ${expr}`);
        break;
      }
      case "mostrar_quando": {
        const { field, path } = achar(op.campo);
        const antes = field.hideExpression ?? "sempre visível";
        field.hideExpression = `!(${expressaoCondicao(form, op.quando)})`;
        reg(`${path} (visibilidade)`, antes, field.hideExpression);
        break;
      }
      case "trocar_opcoes": {
        const { field, path } = achar(op.campo);
        const antes = opcoesDe(field);
        const comLabel = (field.templateOptions?.options ?? []).some((o: any) => o && typeof o === "object" && "label" in o);
        field.templateOptions = { ...(field.templateOptions ?? {}), options: op.opcoes.map((o) => (comLabel ? { label: o, value: o } : { value: o })) };
        reg(`${path}.options`, antes, op.opcoes);
        break;
      }
      case "renomear_campo": {
        const { field, path } = achar(op.campo);
        reg(`${path}.label`, label(field), op.rotulo);
        field.templateOptions = { ...(field.templateOptions ?? {}), label: op.rotulo };
        break;
      }
      case "adicionar_campo": {
        const step = acharEtapa(form, op.etapa)!;
        const novo = novoCampo(form, op);
        let lista = listaDaEtapa(step);
        let pos = lista.length;
        if (op.depois_de) {
          const ref = achar(op.depois_de).field;
          const l = listaDoPai(form.form, ref);
          if (l) { lista = l; pos = l.indexOf(ref) + 1; }
        }
        lista.splice(pos, 0, novo);
        reg(`${label(step)} → ${novo.key}`, null, `novo campo "${op.rotulo}" (${op.formato}${op.obrigatorio ? ", obrigatório" : ""}${op.quando ? ", condicional" : ""})`);
        break;
      }
      case "remover_etapa": {
        const step = acharEtapa(form, op.etapa)!;
        const l = listaDoPai(form.form, step);
        if (l) l.splice(l.indexOf(step), 1);
        reg("etapas", label(step), "etapa removida");
        break;
      }
      case "renomear_etapa": {
        const step = acharEtapa(form, op.etapa)!;
        reg(`etapa ${label(step)}`, label(step), op.titulo);
        step.templateOptions = { ...(step.templateOptions ?? {}), title: op.titulo, ...(step.templateOptions?.label ? { label: op.titulo } : {}) };
        break;
      }
    }
  }
  return { form, mudancas, falhas };
}

const REQ_KEYS = ["templateOptions|||required", "templateOptions.required"];
const exprRequired = (f: FormlyField) => REQ_KEYS.map((k) => f.expressionProperties?.[k]).find(Boolean);
function limparRequired(f: FormlyField) {
  if (!f.expressionProperties) return;
  for (const k of REQ_KEYS) delete f.expressionProperties[k];
}

/** Paths de campo que cada item confirmado mexe (para saber quais perguntas da ficha o plano substituiu). */
export function camposDoPlano(form: AprovaTemplate, itens: ItemPlano[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of itens.filter((i) => i.status === "confirmado")) {
    const op = it.operacao;
    if ("campo" in op) { const r = acharCampoPlano(form, op.campo); if (!("erro" in r)) out.set(r.path, it.id); }
  }
  return out;
}

// ---------------------------------------------------------------- casos automáticos

/** model com o valor no caminho (a.b → { a: { b: v } }). */
function modelCom(path: string, valor: unknown): Record<string, any> {
  const partes = path.split(".");
  const out: Record<string, any> = {};
  let cur = out;
  partes.forEach((p, i) => { if (i === partes.length - 1) cur[p] = valor; else cur = cur[p] = {}; });
  return out;
}

/**
 * Casos que o código escreve sozinho para cada item confirmado: conferem o efeito da operação
 * no formulário aplicado. São a "validação na hora"; o validador acrescenta cobertura depois.
 */
export function cenariosDoPlano(form: AprovaTemplate, itens: ItemPlano[]): Cenario[] {
  const out: Cenario[] = [];
  for (const it of itens.filter((i) => i.status === "confirmado")) {
    const op = it.operacao;
    const path = (ref: string) => { const r = acharCampoPlano(form, ref); return "erro" in r ? undefined : r.path; };
    const id = (s: string) => `plano-${it.id}${s}`;
    const desc = it.descricao;
    switch (op.tipo) {
      case "remover_campo": {
        const p = path(op.campo);
        if (p) out.push({ id: id(""), descricao: desc, model: {}, espera: [{ campo: p, visivel: false }] });
        break;
      }
      case "tornar_opcional": {
        const p = path(op.campo);
        if (p) out.push({ id: id(""), descricao: desc, model: {}, espera: [{ campo: p, obrigatorio: false }] });
        break;
      }
      case "exigir_quando": case "mostrar_quando": {
        const p = path(op.campo), c = path(op.quando.campo);
        if (!p || !c) break;
        const prop = op.tipo === "exigir_quando" ? "obrigatorio" : "visivel";
        out.push({ id: id("-sim"), descricao: `${desc} (quando ${op.quando.valores[0]})`, model: modelCom(c, op.quando.valores[0]), espera: [{ campo: p, [prop]: true }] });
        out.push({ id: id("-nao"), descricao: `${desc} (nos outros casos)`, model: {}, espera: [{ campo: p, [prop]: false }] });
        break;
      }
      case "adicionar_campo": {
        const novo = [...walk(form.form)].find((v) => label(v.field) === op.rotulo && v.field.key);
        if (!novo) break;
        const c = op.quando ? path(op.quando.campo) : undefined;
        const model = op.quando && c ? modelCom(c, op.quando.valores[0]) : {};
        out.push({ id: id(""), descricao: desc, model, espera: [{ campo: novo.path, visivel: true, obrigatorio: op.obrigatorio }] });
        break;
      }
      default: break; // trocar_opcoes, renomear e etapas: efeito estrutural, conferido em aplicarPlano
    }
  }
  return out;
}

/**
 * Verificação na hora: aplica o plano e roda os casos automáticos. Item que falha por depender de
 * outra resposta (campo oculto no model vazio) não é erro: o validador cobre com pré-condição.
 */
export function verificarPlano(formComFicha: AprovaTemplate, itens: ItemPlano[]): { form: AprovaTemplate; porItem: Record<string, { ok: boolean; detalhe: string }> } {
  const { form, falhas } = aplicarPlano(formComFicha, itens);
  const porItem: Record<string, { ok: boolean; detalhe: string }> = {};
  for (const f of falhas) porItem[f.id] = { ok: false, detalhe: `não aplicado: ${f.erro}` };
  const casos = cenariosDoPlano(form, itens);
  const res = rodarCenarios(form, casos);
  for (const it of itens.filter((i) => i.status === "confirmado" && !porItem[i.id])) {
    const meus = res.filter((r) => r.id === `plano-${it.id}` || r.id.startsWith(`plano-${it.id}-`));
    if (!meus.length) { porItem[it.id] = { ok: true, detalhe: "aplicado (mudança de estrutura)" }; continue; }
    const ruins = meus.filter((r) => !r.passou);
    porItem[it.id] = ruins.length
      ? { ok: false, detalhe: ruins.map((r) => `${r.descricao}: ${r.falhas.map((f) => `${f.campo} esperado ${JSON.stringify(f.esperado)} obtido ${JSON.stringify(f.obtido)}`).join("; ")}`).join(" | ") }
      : { ok: true, detalhe: `${meus.length} caso(s) conferido(s)` };
  }
  return { form, porItem };
}
