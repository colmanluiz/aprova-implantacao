// Extrator: anexo (imagem ou PDF) + perguntas abertas → candidatos de resposta, via saída estruturada.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, MODEL } from "./client.js";
import { instrucao } from "./instructions.js";
import type { Pergunta } from "../core/types.js";

export const Candidato = z.object({
  pergunta_id: z.string(),
  valor: z.any(),
  trecho: z.string(),
  confianca: z.number().min(0).max(1),
  parcial: z.boolean().optional(),
});
export const SaidaExtrator = z.object({
  candidatos: z.array(Candidato),
  motivo: z.string().optional(),
});
export type SaidaExtrator = z.infer<typeof SaidaExtrator>;

export type Anexo =
  | { tipo: "imagem"; media_type: "image/jpeg" | "image/png" | "image/webp"; base64: string; nome?: string }
  | { tipo: "pdf"; base64: string; nome?: string }
  | { tipo: "texto"; texto: string; nome?: string };

export async function extrair(anexo: Anexo, abertas: Pergunta[]): Promise<SaidaExtrator> {
  const perguntas = abertas.map((q) => ({ id: q.id, tipo: q.tipo, texto: q.texto, assume: q.assume }));
  const bloco: Anthropic.ContentBlockParam =
    anexo.tipo === "imagem"
      ? { type: "image", source: { type: "base64", media_type: anexo.media_type, data: anexo.base64 } }
      : anexo.tipo === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: anexo.base64 } }
        : { type: "text", text: `Conteúdo do anexo ${anexo.nome ?? ""}:\n${anexo.texto}` };

  const resp = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: instrucao("extrator"),
    messages: [{
      role: "user",
      content: [bloco, { type: "text", text: `Perguntas abertas da ficha:\n${JSON.stringify(perguntas, null, 2)}` }],
    }],
    output_config: { format: zodOutputFormat(SaidaExtrator) },
  });
  return resp.parsed_output ?? { candidatos: [], motivo: "sem saida" };
}
