// Formulário da cidade = template + respostas da ficha (patcher) + itens confirmados do plano de ação.
// Determinístico: é o mesmo cálculo na prévia durante a conversa e na etapa aplicar.
import type { AprovaTemplate, Ficha, Mudanca, Pergunta } from "./types.js";
import { aplicarFicha } from "./patcher.js";
import { aplicarPlano, type Plano } from "./plano.js";

export type Montagem = { form: AprovaTemplate; mudancas: Mudanca[]; pendencias: Pergunta[]; falhasPlano: { id: string; erro: string }[] };

export function montarFormulario(tpl: AprovaTemplate, ficha: Ficha | undefined, plano?: Plano): Montagem {
  const base = ficha ? aplicarFicha(tpl, ficha) : { form: structuredClone(tpl), mudancas: [], pendencias: [] };
  const p = aplicarPlano(base.form, plano?.itens ?? []);
  return { form: p.form, mudancas: [...base.mudancas, ...p.mudancas], pendencias: base.pendencias, falhasPlano: p.falhas };
}
