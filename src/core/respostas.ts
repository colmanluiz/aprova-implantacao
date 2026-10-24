// Contratos de saída: o formato que cada tipo de pergunta aceita como resposta.
// O registrar_resposta valida aqui antes de gravar; o aplicador confia neste formato.
import { z } from "zod";
import type { Pergunta, TipoPonto } from "./types.js";

const valorDataset = z.union([z.number(), z.string()]);

const existe = z.object({ existe: z.boolean(), nome: z.string().min(1).optional() });

const ESQUEMAS: Record<Exclude<TipoPonto, "dataset">, z.ZodType> = {
  opcoes: z.array(z.string().min(1)).min(1),
  documento: z.object({ exigido: z.boolean(), sempre: z.boolean().optional() }),
  setor: z.object({ slug: z.string().min(1), setor: z.string().optional() }),
  etapas: z.array(z.string().min(1)).min(1),
  taxa: existe,
  card: existe,
  texto: z.string().min(1),
  residuo: z.string().min(1),
  saida: z.record(z.string(), z.unknown()),
};

/** Formato esperado em linguagem que o modelo consegue seguir. */
export const FORMATO: Record<TipoPonto, string> = {
  opcoes: 'lista de textos não vazia, ex.: ["ZR1","ZR2"]',
  dataset: 'objeto zona → { chave: número ou texto } com todas as chaves pedidas, ex.: {"ZR1":{"RECUO_FRONTAL":4}}',
  documento: '{"exigido": true|false, "sempre"?: true|false}',
  setor: '{"slug": "planejamento", "setor"?: "Secretaria de Planejamento"}',
  etapas: 'lista com os títulos das etapas que ficam, ex.: ["Solicitação","Dados do Requerente"]',
  taxa: '{"existe": true|false, "nome"?: "Taxa de Aprovação"}',
  card: '{"existe": true|false, "nome"?: "Parecer Técnico"}',
  texto: "texto não vazio",
  residuo: "texto não vazio com o valor correto (ex.: o nome da cidade)",
  saida: 'objeto, ex.: {"modelo_proprio": true, "validade_dias": 180}',
};

export function esquemaResposta(q: Pick<Pergunta, "tipo" | "assume">): z.ZodType {
  if (q.tipo !== "dataset") return ESQUEMAS[q.tipo];
  const chaves: string[] = (q.assume as { chaves?: string[] } | null)?.chaves ?? [];
  return z
    .record(z.string(), z.record(z.string(), valorDataset))
    .refine((t) => Object.keys(t).length > 0, { message: "a tabela precisa de pelo menos uma zona" })
    .superRefine((t, c) => {
      for (const [zona, linha] of Object.entries(t)) {
        const faltam = chaves.filter((k) => !(k in linha));
        if (faltam.length) c.addIssue({ code: "custom", path: [zona], message: `zona ${zona} sem ${faltam.join(", ")}` });
      }
    });
}

export type Validacao = { ok: true; valor: unknown } | { ok: false; erro: string };

/** Valida a resposta contra o tipo da pergunta. `null` é sempre aceito (vira pendência). */
export function validarResposta(q: Pick<Pergunta, "id" | "tipo" | "assume">, resposta: unknown): Validacao {
  if (resposta === null || resposta === undefined) return { ok: true, valor: null };
  let valor = resposta;
  // Modelos às vezes mandam o JSON como texto: aceita quando o tipo não é texto livre.
  if (typeof valor === "string" && q.tipo !== "texto" && q.tipo !== "residuo") {
    try { valor = JSON.parse(valor); } catch { /* segue e falha no schema */ }
  }
  const r = esquemaResposta(q).safeParse(valor);
  if (r.success) return { ok: true, valor: r.data };
  const problemas = r.error.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`).join("; ");
  return { ok: false, erro: `schema_invalido: pergunta ${q.id} (tipo ${q.tipo}) espera ${FORMATO[q.tipo]}. Problemas: ${problemas}` };
}
