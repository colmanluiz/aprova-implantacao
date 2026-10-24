// Ações do implantador sobre um processo. Imprime uma linha curta ("ok: ..." ou "erro: ...") para o painel.
// Uso: npm run gate -- <cidade> <processo> <aprovar|ajustar|rejeitar> [texto]
//      npm run gate -- <cidade> <processo> <assumir|devolver>        (modo humano da conversa)
//      npm run gate -- <cidade> <processo> status                     (resumo detalhado)
import { resolverGate, assumirConversa, devolverConversa } from "../src/pipeline/motor.js";
import { lerRun } from "../src/pipeline/run.js";
import type { AcaoGate, Run } from "../src/pipeline/tipos.js";

const [cidade, processo, acao, ...resto] = process.argv.slice(2);
const texto = resto.join(" ").replace(/\\n/g, "\n") || undefined;
const sair = (msg: string, code = 1): never => { console.log(msg); process.exit(code); };
if (!cidade || !processo || !acao) sair("erro: uso npm run gate -- <cidade> <processo> <aprovar|ajustar|rejeitar|assumir|devolver|status> [texto]", 2);
const ctx = { cidade, processo, template: process.env.TEMPLATE ?? "fixtures/templates/alvara-construcao.modeload.json" };
// Pergunta para o analista aberta pela CLI não chega ao WhatsApp: vai para stderr e fica em run.json.gate.
const canal = { enviar: async (t: string) => { console.error(`[para o analista] ${t}`); } };

const PART: Record<string, string> = { aprovar: "aprovada", ajustar: "ajustada", rejeitar: "rejeitada" };
const depois = (run: Run) =>
  run.status === "concluido" ? "processo concluído"
  : run.gate ? `gate aberto para ${run.gate.para} em ${run.gate.etapa}`
  : `status ${run.status}, etapa ${run.etapa_atual}`;

try {
  if (acao === "status") {
    const run = lerRun(ctx) ?? sair(`erro: processo ${cidade}/${processo} não iniciado`);
    console.log(`ok: ${run.status} | etapa ${run.etapa_atual}${run.gate ? ` | gate para ${run.gate.para}: ${run.gate.resumo}` : ""}`);
    for (const e of run.etapas) console.log(`  ${e.status.padEnd(10)} ${e.slug.padEnd(10)} ${e.criterios.map((k) => `[${k.resultado}] ${k.nome}`).join(" · ")}`);
  } else if (acao === "assumir") {
    assumirConversa(ctx);
    console.log("ok: conversa com o implantador; o agente fica pausado até devolver");
  } else if (acao === "devolver") {
    devolverConversa(ctx);
    console.log("ok: conversa devolvida ao agente");
  } else if (acao in PART) {
    const etapa = lerRun(ctx)?.gate?.etapa ?? "?";
    const run = await resolverGate(ctx, acao as AcaoGate, texto, { canal });
    console.log(`ok: etapa ${etapa} ${PART[acao]}; ${depois(run)}`);
  } else sair(`erro: ação desconhecida: ${acao}`, 2);
} catch (e) {
  sair(`erro: ${(e as Error).message.replace(/\n/g, " | ")}`);
}
