import type { FormlyField } from "./types.js";

export type Visita = {
  field: FormlyField;
  path: string;
  parents: FormlyField[];
  dentroDeRepeat: boolean;
};

/** Percorre a árvore Formly em profundidade, entregando cada nó com seu caminho. */
export function* walk(
  fields: FormlyField[] | FormlyField | undefined | null,
  parents: FormlyField[] = [],
  prefix = "",
  dentroDeRepeat = false,
): Generator<Visita> {
  for (const field of comoLista(fields)) {
    const key = field.key === undefined || field.key === null ? undefined : String(field.key);
    const path = key ? (prefix ? `${prefix}.${key}` : key) : prefix;
    yield { field, path, parents, dentroDeRepeat };
    if (field.fieldGroup) yield* walk(field.fieldGroup, [...parents, field], path, dentroDeRepeat);
    if (field.fieldArray && typeof field.fieldArray === "object") {
      const fa = field.fieldArray as FormlyField | FormlyField[];
      const inner = Array.isArray(fa) ? fa : (fa.fieldGroup ?? [fa]);
      yield* walk(inner, [...parents, field], `${path}[]`, true);
    }
  }
}

/** Templates exportados nem sempre trazem `form`/`fieldGroup` como array: aceita objeto único e ignora lixo. */
export function comoLista(fields: unknown): FormlyField[] {
  if (!fields) return [];
  const lista = Array.isArray(fields) ? fields : typeof fields === "object" ? [fields] : [];
  return lista.filter((f): f is FormlyField => !!f && typeof f === "object" && !Array.isArray(f));
}

/** Texto visível de uma opção: aceita `{label, value}`, `{value}` e opção-string. */
export function valorOpcao(o: unknown): string | undefined {
  if (o === null || o === undefined) return undefined;
  if (typeof o === "string" || typeof o === "number" || typeof o === "boolean") return String(o);
  if (typeof o === "object") {
    const r = (o as any).label ?? (o as any).value ?? (o as any).name;
    return r === undefined || r === null || typeof r === "object" ? undefined : String(r);
  }
  return undefined;
}

/** Opções estáticas de um campo, já normalizadas para texto. */
export function opcoesDe(field: FormlyField): string[] {
  const o = field.templateOptions?.options;
  if (!Array.isArray(o)) return [];
  return o.map(valorOpcao).filter((v): v is string => v !== undefined && v !== "");
}

export function label(field: FormlyField): string | undefined {
  const l = field.templateOptions?.label ?? field.templateOptions?.title;
  return typeof l === "string" ? l.replace(/\s+/g, " ").trim() : undefined;
}

export function ehEtapa(field: FormlyField): boolean {
  return Array.isArray(field.wrappers) && field.wrappers.includes("step");
}

export function etapas(form: FormlyField[] | FormlyField | undefined | null): { titulo: string; campos: number }[] {
  const out: { titulo: string; campos: number }[] = [];
  for (const { field } of walk(form)) {
    if (ehEtapa(field)) {
      let n = 0;
      for (const v of walk(field.fieldGroup)) if (v.field.key) n++;
      out.push({ titulo: label(field) ?? "(sem título)", campos: n });
    }
  }
  return out;
}

/** Todas as strings de expressão de um campo, com o nome da propriedade. */
export function expressoes(field: FormlyField): { prop: string; expr: string }[] {
  const out: { prop: string; expr: string }[] = [];
  if (typeof field.hideExpression === "string") out.push({ prop: "hideExpression", expr: field.hideExpression });
  const ep = field.expressionProperties;
  for (const [prop, expr] of Object.entries(ep && typeof ep === "object" ? ep : {})) {
    if (typeof expr === "string") out.push({ prop, expr });
  }
  return out;
}

export function valoresDeOpcoes(form: FormlyField[] | FormlyField | undefined | null): Set<string> {
  const set = new Set<string>();
  for (const { field } of walk(form)) {
    const opts = field.templateOptions?.options;
    for (const o of Array.isArray(opts) ? opts : []) {
      if (o && typeof o === "object") {
        if (o.value !== undefined && typeof o.value !== "object") set.add(String(o.value));
        if (o.label !== undefined && typeof o.label !== "object") set.add(String(o.label));
      } else if (o !== undefined && o !== null) set.add(String(o));
    }
    // Opções montadas por expressão (ex.: `templateOptions|||options`: tipo === 'X' ? [{ value: 'Berçário' }] : ...)
    for (const { prop, expr } of expressoes(field)) {
      if (!/options/i.test(prop)) continue;
      for (const m of expr.matchAll(/(?:value|label)\s*:\s*'([^']+)'/g)) set.add(m[1]);
    }
  }
  return set;
}
