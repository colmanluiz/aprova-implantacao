// Executa um agente: instrução de INSTRUCTIONS/ como system, ferramentas de src/core/ via tool runner.
import type Anthropic from "@anthropic-ai/sdk";
import { client, MODEL } from "./client.js";
import { instrucao, type NomeAgente } from "./instructions.js";

type Mensagem = Anthropic.Beta.BetaMessageParam;

export async function runAgent(opts: {
  agente: NomeAgente;
  mensagens: Mensagem[];
  tools?: any[];
  maxIteracoes?: number;
}): Promise<{ texto: string; mensagem: Anthropic.Beta.BetaMessage }> {
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: instrucao(opts.agente), cache_control: { type: "ephemeral" } }],
    messages: opts.mensagens,
    tools: opts.tools ?? [],
    max_iterations: opts.maxIteracoes ?? 12,
    // Fallback servidor para refusals do classificador de segurança (opcional; remova se o endpoint não aceitar).
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  } as any);
  const mensagem = await runner;
  if (mensagem.stop_reason === "refusal") {
    return { texto: "Não consegui tratar essa mensagem. Um implantador vai olhar.", mensagem };
  }
  const texto = mensagem.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { texto, mensagem };
}
