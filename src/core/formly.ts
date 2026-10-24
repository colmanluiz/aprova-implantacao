import type { FormlyField } from "./types.js";

export type Visita = {
  field: FormlyField;
  path: string;
  parents: FormlyField[];
  dentroDeRepeat: boolean;
};

/** Percorre a árvore Formly em profundidade, entregando cada nó com seu caminho. */
export function* walk(
  fields: FormlyField[] | undefined,
  parents: FormlyField[] = [],
  prefix = "",
  dentroDeRepeat = false,
): Generator<Visita> {
  if (!fields) return;
  for (const field of fields) {
    const path = field.key ? (prefix ? `${prefix}.${field.key}` : field.key) : prefix;
    yield { field, path, parents, dentroDeRepeat };
    if (field.fieldGroup) yield* walk(field.fieldGroup, [...parents, field], path, dentroDeRepeat);
    if (field.fieldArray) {
      const inner = field.fieldArray.fieldGroup ?? [field.fieldArray];
      yield* walk(inner, [...parents, field], `${path}[]`, true);
    }
  }
}

export function label(field: FormlyField): string | undefined {
  const l = field.templateOptions?.label ?? field.templateOptions?.title;
  return typeof l === "string" ? l.replace(/\s+/g, " ").trim() : undefined;
}

export function ehEtapa(field: FormlyField): boolean {
  return Array.isArray(field.wrappers) && field.wrappers.includes("step");
}

export function etapas(form: FormlyField[]): { titulo: string; campos: number }[] {
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
  for (const [prop, expr] of Object.entries(field.expressionProperties ?? {})) {
    if (typeof expr === "string") out.push({ prop, expr });
  }
  return out;
}

export function valoresDeOpcoes(form: FormlyField[]): Set<string> {
  const set = new Set<string>();
  for (const { field } of walk(form)) {
    for (const o of field.templateOptions?.options ?? []) {
      if (o?.value !== undefined) set.add(String(o.value));
      if (o?.label !== undefined) set.add(String(o.label));
    }
  }
  return set;
}
