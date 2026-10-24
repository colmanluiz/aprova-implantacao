// Avaliador de expressões Formly em sandbox. Dado um template e um `model`
// (o que o cidadão preencheu), calcula para cada campo: visível, obrigatório,
// valor computado. Não abre tela, não precisa do app Aprova.

import vm from "node:vm";
import type { AprovaTemplate, FormlyField, EstadoCampo, DatasetTabela } from "./types.js";
import { label } from "./formly.js";

const PASSES = 6;

type Ctx = { model: any; field: any; formState: any };

function avaliar(expr: string, ctx: Ctx): { ok: true; value: unknown } | { ok: false; erro: string } {
  try {
    const sandbox = vm.createContext({ model: ctx.model, field: ctx.field, formState: ctx.formState });
    const value = vm.runInContext(`(${expr})`, sandbox, { timeout: 50 });
    return { ok: true, value };
  } catch (e) {
    try {
      // Algumas expressões são blocos, não expressões. Tenta como corpo de função.
      const sandbox = vm.createContext({ model: ctx.model, field: ctx.field, formState: ctx.formState });
      const value = vm.runInContext(`(function(){ ${expr} })()`, sandbox, { timeout: 50 });
      return { ok: true, value };
    } catch (e2) {
      return { ok: false, erro: (e2 as Error).message };
    }
  }
}

/** Model do item de repeat com fallback para o model raiz (comportamento do next-repeat da Aprova). */
function modelComFallback(item: any, raiz: any) {
  return new Proxy(item, {
    get(t, p) {
      if (p in t) return t[p as any];
      return raiz[p as any];
    },
    has(t, p) {
      return p in t || p in raiz;
    },
  });
}

/** Expande códigos de zona em `input_data` quando o form carrega um dataset embutido. */
export function expandirDataset(model: any, datasets?: Record<string, DatasetTabela>) {
  if (!datasets) return model;
  const out = { ...model };
  for (const [fonte, tabela] of Object.entries(datasets)) {
    const v = out[fonte];
    if (typeof v === "string" && tabela[v]) {
      out[fonte] = { codigo: v, input_data: { data: Object.entries(tabela[v]).map(([key, value]) => ({ key, value })) } };
    }
  }
  return out;
}

export function avaliarFormulario(tpl: AprovaTemplate, modelEntrada: Record<string, any>): EstadoCampo[] {
  const model = expandirDataset(structuredClone(modelEntrada), tpl.config?.datasets);
  const formState: Record<string, unknown> = {};
  const estados = new Map<string, EstadoCampo>();
  const campos: { field: FormlyField; path: string; getModel: () => any; index?: number; ocultoPorPai: () => boolean }[] = [];

  // Materializa a lista de campos, instanciando itens de repeat conforme o model.
  function coletar(fields: FormlyField[] | undefined, getModel: () => any, prefix: string, pais: string[]) {
    if (!fields) return;
    for (const f of fields) {
      const path = f.key ? (prefix ? `${prefix}.${f.key}` : f.key) : prefix;
      const ocultoPorPai = () => pais.some((p) => estados.get(p)?.visivel === false);
      if (f.key || f.type) campos.push({ field: f, path, getModel, ocultoPorPai });
      const novosPais = f.key ? [...pais, path] : pais;
      if (f.fieldGroup) coletar(f.fieldGroup, getModel, path, novosPais);
      if (f.fieldArray && f.key) {
        const itens: any[] = Array.isArray(getModel()[f.key]) ? getModel()[f.key] : [];
        const inner = f.fieldArray.fieldGroup ?? [f.fieldArray];
        itens.forEach((_, i) => {
          const getItem = () => modelComFallback(getModel()[f.key!][i], model);
          coletar(inner, getItem, `${path}[${i}]`, novosPais);
          const ultimo = campos[campos.length - 1];
          void ultimo;
        });
      }
    }
  }
  coletar(tpl.form, () => model, "", []);

  // Estado inicial
  for (const c of campos) {
    const to = c.field.templateOptions ?? {};
    estados.set(c.path, {
      key: c.field.key ?? "",
      path: c.path,
      type: c.field.type,
      label: label(c.field),
      visivel: !(c.field.hideExpression === true || to.hidden === true),
      obrigatorio: !!to.required,
      valor: c.field.key ? c.getModel()[c.field.key] : undefined,
      indeterminado: [],
    });
  }

  // Passes até estabilizar: expressionProperties (model e templateOptions) e depois hideExpression.
  for (let pass = 0; pass < PASSES; pass++) {
    let mudou = false;
    for (const c of campos) {
      const est = estados.get(c.path)!;
      const to = { ...(c.field.templateOptions ?? {}), required: est.obrigatorio };
      const indexMatch = c.path.match(/\[(\d+)\]\.[^.\[]+$/);
      const fieldObj = {
        key: c.field.key,
        type: c.field.type,
        templateOptions: to,
        props: to,
        parent: { templateOptions: { index: indexMatch ? Number(indexMatch[1]) : undefined } },
      };
      const ctx: Ctx = { model: c.getModel(), field: fieldObj, formState };
      est.indeterminado = [];

      for (const [prop, expr] of Object.entries(c.field.expressionProperties ?? {})) {
        if (typeof expr !== "string") continue;
        const r = avaliar(expr, ctx);
        if (!r.ok) { est.indeterminado.push(`${prop}: ${r.erro}`); continue; }
        const [alvo, nome] = prop.split("|||");
        if (alvo === "model" && nome) {
          const m = c.getModel();
          const atual = m[nome];
          if (r.value !== undefined && !Object.is(atual, r.value) && String(atual) !== String(r.value)) {
            m[nome] = r.value;
            mudou = true;
          }
        } else if ((alvo === "templateOptions" || alvo === "props") && nome === "required") {
          const novo = !!r.value;
          if (est.obrigatorio !== novo) { est.obrigatorio = novo; mudou = true; }
        } else if ((alvo === "templateOptions" || alvo === "props") && nome) {
          (to as any)[nome] = r.value;
        }
      }
      if (c.field.key) est.valor = c.getModel()[c.field.key];

      if (typeof c.field.hideExpression === "string") {
        const r = avaliar(c.field.hideExpression, { ...ctx, field: { ...fieldObj, templateOptions: { ...to, required: est.obrigatorio } } });
        if (!r.ok) est.indeterminado.push(`hideExpression: ${r.erro}`);
        else {
          const vis = !r.value;
          if (est.visivel !== vis) { est.visivel = vis; mudou = true; }
        }
      }
    }
    if (!mudou) break;
  }

  // Campo dentro de pai oculto também está oculto; campo oculto não é obrigatório.
  for (const c of campos) {
    const est = estados.get(c.path)!;
    if (c.ocultoPorPai()) est.visivel = false;
    if (!est.visivel) est.obrigatorio = false;
  }
  return [...estados.values()].filter((e) => e.key);
}

/** Localiza um estado por chave simples ("area_total") ou caminho ("quadro_areas[0].area_total"). */
export function acharCampo(estados: EstadoCampo[], campo: string): EstadoCampo | undefined {
  return estados.find((e) => e.path === campo) ?? estados.find((e) => e.key === campo && !e.path.includes("["));
}
