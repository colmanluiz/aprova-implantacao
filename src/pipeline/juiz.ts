// Critério-juiz: um LLM confere se os cenários cobrem a ficha. Fail-closed: qualquer saída inválida reprova.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Cenario, Ficha } from "../core/types.js";
import { perguntasDe, semResposta } from "../agents/store.js";

export const VeredictoJuiz = z.object({ pass: z.boolean(), faltam: z.array(z.string()) });
export type VeredictoJuiz = z.infer<typeof VeredictoJuiz>;

/** O mínimo do SDK que o juiz usa; os testes injetam um cliente falso. */
export type ClienteJuiz = { messages: { parse: (params: any) => Promise<{ parsed_output?: unknown }> } };

export async function julgarCobertura(opts: {
  cliente: ClienteJuiz;
  modelo: string;
  rubrica: string;
  ficha: Ficha;
  cenarios: Cenario[];
}): Promise<{ veredicto: VeredictoJuiz; valido: boolean; erro?: string }> {
  const respondidas = perguntasDe(opts.ficha)
    .filter((q) => !semResposta(q))
    .map((q) => ({ id: q.id, tipo: q.tipo, texto: q.texto, afeta: q.afeta, resposta: q.resposta }));
  const cenarios = opts.cenarios.map((c) => ({ id: c.id, descricao: c.descricao, model: c.model, espera: c.espera }));
  try {
    const resp = await opts.cliente.messages.parse({
      model: opts.modelo,
      max_tokens: 4000,
      system: `Você é um juiz de cobertura de testes de formulário. Avalie com rigor e responda só no formato pedido.\n\nRubrica:\n${opts.rubrica}`,
      messages: [{
        role: "user",
        content: `Perguntas respondidas da ficha:\n${JSON.stringify(respondidas, null, 1)}\n\nCenários:\n${JSON.stringify(cenarios, null, 1)}`,
      }],
      output_config: { format: zodOutputFormat(VeredictoJuiz) },
    });
    const r = VeredictoJuiz.safeParse(resp.parsed_output);
    if (!r.success) return { veredicto: { pass: false, faltam: [] }, valido: false, erro: "saída do juiz ilegível" };
    // Coerência: pass=true com faltam não vazio é contraditório → reprova.
    if (r.data.pass && r.data.faltam.length) return { veredicto: { pass: false, faltam: r.data.faltam }, valido: true };
    return { veredicto: r.data, valido: true };
  } catch (e) {
    return { veredicto: { pass: false, faltam: [] }, valido: false, erro: `juiz indisponível: ${(e as Error).message}` };
  }
}
