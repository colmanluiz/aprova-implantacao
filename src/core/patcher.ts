// Aplicador: ficha respondida + template = formulário parametrizado + lista de mudanças.
// Determinístico. Nenhuma chamada a LLM aqui.

import type { AprovaTemplate, Ficha, Pergunta, Mudanca, FormlyField } from "./types.js";
import { walk, label } from "./formly.js";

const LIMIAR = 0.8;

export function aplicarFicha(tplEntrada: AprovaTemplate, ficha: Ficha): { form: AprovaTemplate; mudancas: Mudanca[]; pendencias: Pergunta[] } {
  let tpl = structuredClone(tplEntrada);
  const mudancas: Mudanca[] = [];
  const pendencias: Pergunta[] = [];
  const perguntas = ficha.grupos.flatMap((g) => g.perguntas);

  for (const q of perguntas) {
    if (q.resposta === null || q.resposta === undefined || q.confianca < LIMIAR) { pendencias.push(q); continue; }
    const reg = (alvo: string, antes: unknown, depois: unknown) =>
      mudancas.push({ pergunta_id: q.id, tipo: q.tipo, alvo, antes, depois, origem: q.origem, confianca: q.confianca });

    switch (q.tipo) {
      case "setor": {
        const r = q.resposta as { slug: string; setor?: string };
        const slug = slugify(r.slug ?? r.setor ?? "");
        if (!slug) { pendencias.push(q); break; }
        const antes = JSON.stringify(tpl.config.initialReceiverConfig);
        const texto = JSON.stringify(tpl).replace(/modeload/g, slug);
        tpl = JSON.parse(texto);
        reg("placeholders modeload", antes, JSON.stringify(tpl.config.initialReceiverConfig));
        break;
      }
      case "opcoes": {
        const lista = (q.resposta as string[]).map((v) => ({ label: v, value: v }));
        for (const path of q.afeta) {
          const f = acharPorPath(tpl.form, path);
          if (!f) continue;
          const antes = f.templateOptions?.options?.map((o: any) => o.label ?? o.value);
          const igual = JSON.stringify(antes) === JSON.stringify(lista.map((o) => o.label));
          f.templateOptions = { ...(f.templateOptions ?? {}), options: lista };
          reg(`${path}.options`, antes, igual ? "mantido como no template" : lista.map((o) => o.label));
        }
        break;
      }
      case "dataset": {
        const { fonte } = q.assume as { fonte: string };
        tpl.config.datasets = { ...(tpl.config.datasets ?? {}), [fonte]: q.resposta as any };
        // As opções do select de zona seguem as chaves da tabela.
        const zonas = Object.keys(q.resposta as object);
        for (const { field } of walk(tpl.form)) {
          if (field.key === fonte || (field.key === "zoneamento" && field.type === "select")) {
            field.templateOptions = { ...(field.templateOptions ?? {}), options: zonas.map((z) => ({ label: z, value: z })) };
          }
        }
        reg(`config.datasets.${fonte}`, null, `${zonas.length} zonas`);
        break;
      }
      case "documento": {
        const r = q.resposta as { exigido: boolean; sempre?: boolean };
        for (const path of q.afeta) {
          const f = acharPorPath(tpl.form, path);
          if (!f) continue;
          const antes = { required: f.templateOptions?.required, expr: f.expressionProperties?.["templateOptions|||required"], hide: f.hideExpression };
          if (!r.exigido) {
            f.hideExpression = "true";
            f.templateOptions = { ...(f.templateOptions ?? {}), required: false };
            reg(path, antes, "removido do pedido");
          } else if (r.sempre) {
            f.templateOptions = { ...(f.templateOptions ?? {}), required: true };
            if (f.expressionProperties) delete f.expressionProperties["templateOptions|||required"];
            reg(path, antes, "sempre obrigatório");
          } else {
            reg(path, antes, "mantido como no template");
          }
        }
        break;
      }
      case "texto": {
        for (const path of q.afeta) {
          const f = acharPorPath(tpl.form, path);
          if (!f) continue;
          const antes = label(f);
          f.templateOptions = { ...(f.templateOptions ?? {}), label: String(q.resposta) };
          reg(`${path}.label`, antes, q.resposta);
        }
        break;
      }
      case "etapas": {
        const manter = new Set(q.resposta as string[]);
        const removidas: string[] = [];
        tpl.form = tpl.form.map((root) => {
          if (!root.fieldGroup) return root;
          root.fieldGroup = root.fieldGroup.filter((step) => {
            const t = label(step) ?? "";
            const ehStep = step.wrappers?.includes("step");
            if (ehStep && !manter.has(t)) { removidas.push(t); return false; }
            return true;
          });
          return root;
        });
        if (removidas.length) reg("etapas", q.assume, `removidas: ${removidas.join(", ")}`);
        break;
      }
      case "taxa":
      case "card": {
        const r = q.resposta as { existe: boolean; nome?: string };
        const key = (q.assume as any).key;
        if (!r.existe) {
          tpl.config.form_tramites = (tpl.config.form_tramites ?? []).filter((c: any) => c.key !== key);
          reg(`config.form_tramites[${key}]`, (q.assume as any).nome, "removido");
        } else if (r.nome) {
          const card = (tpl.config.form_tramites ?? []).find((c: any) => c.key === key);
          if (card) { reg(`config.form_tramites[${key}].nome`, card.nome, r.nome); card.nome = r.nome; }
        }
        break;
      }
      case "residuo": {
        const de = String(q.assume);
        const para = String(q.resposta);
        let n = 0;
        for (const { field } of walk(tpl.form)) {
          if (typeof field.hideExpression === "string" && field.hideExpression.includes(`'${de}'`)) { field.hideExpression = field.hideExpression.split(`'${de}'`).join(`'${para}'`); n++; }
          for (const k of Object.keys(field.expressionProperties ?? {})) {
            const e = field.expressionProperties![k];
            if (e.includes(`'${de}'`)) { field.expressionProperties![k] = e.split(`'${de}'`).join(`'${para}'`); n++; }
          }
        }
        reg(`literal '${de}'`, de, `${para} (${n} ocorrências)`);
        break;
      }
      case "saida": {
        reg("config.templates", (q.assume as any[]).map((t) => t.nome), q.resposta);
        break;
      }
    }
  }
  if (ficha.cidade) tpl.config.cidade_nome = ficha.cidade;
  return { form: tpl, mudancas, pendencias };
}

function acharPorPath(form: FormlyField[], path: string): FormlyField | undefined {
  for (const v of walk(form)) if (v.path === path) return v.field;
  return undefined;
}

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function gerarDiff(ficha: Ficha, mudancas: Mudanca[], pendencias: Pergunta[]): string {
  const L: string[] = [`# Diff de parametrização: ${ficha.processo}${ficha.cidade ? ` (${ficha.cidade})` : ""}`, ""];
  L.push("## O que mudou", "");
  const alteradas = mudancas.filter((m) => m.depois !== "mantido como no template");
  for (const m of alteradas) L.push(`- **${m.alvo}**: ${fmt(m.antes)} → ${fmt(m.depois)}  _(${m.origem ?? "sem origem"}, confiança ${m.confianca})_`);
  if (!alteradas.length) L.push("- nada");
  L.push("", "## O que ficou do template", "");
  const mantidas = mudancas.filter((m) => m.depois === "mantido como no template");
  for (const m of mantidas) L.push(`- ${m.alvo}`);
  if (!mantidas.length) L.push("- nada confirmado explicitamente");
  L.push("", "## Atenção do implantador", "");
  for (const p of pendencias) L.push(`- [ ] ${p.id} (${p.tipo}): ${p.texto}${p.pendencia ? ` — ${p.pendencia}` : ""}${p.resposta !== null ? ` — resposta com confiança ${p.confianca}` : ""}`);
  if (!pendencias.length) L.push("- nenhuma pendência");
  return L.join("\n");
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 80 ? `"${v.slice(0, 77)}…"` : v;
  return "`" + JSON.stringify(v).slice(0, 120) + "`";
}
