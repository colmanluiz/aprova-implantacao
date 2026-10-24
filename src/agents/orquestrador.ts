// Entrada do canal. A orquestração é o pipeline declarativo (INSTRUCTIONS/pipeline.json),
// executado por src/pipeline/motor.ts. Este arquivo só traduz "chegou mensagem" em passos do motor.
import { enviarAoAnalista } from "./envio.js";
import { store, type Contexto } from "./store.js";
import type { Canal } from "./tools.js";
import type { Anexo } from "./extrator.js";
import { iniciarProcesso, avancar, resolverGate, assumirConversa, devolverConversa, type Dependencias } from "../pipeline/motor.js";
import { lerRun, salvarRun, agora } from "../pipeline/run.js";

export { assumirConversa, devolverConversa };

const SIM = /^\s*(sim|s|confirmo|confere|correto|isso|exato|pode|ok|certo)\b/i;

export async function tratarMensagem(
  ctx: Contexto,
  canal: Canal,
  entrada: { texto?: string; anexo?: Anexo; remetente?: string },
  depsExtra: Omit<Dependencias, "canal" | "anexos"> = {},
): Promise<string> {
  const deps: Dependencias = { ...depsExtra, canal, anexos: entrada.anexo ? [entrada.anexo] : [] };
  let run = lerRun(ctx) ?? (await iniciarProcesso(ctx, deps));
  const temConteudo = Boolean(entrada.texto?.trim() || entrada.anexo);

  if (temConteudo) {
    run.metricas.mensagens_recebidas++;
    salvarRun(ctx, run);
    store.atualizarEstado(ctx, (e) => { e.ultima_mensagem_analista = agora(); });
  }
  const nAntes = store.estado(ctx).historico.length;
  const mensagem = entrada.texto ? `${entrada.remetente ? `(${entrada.remetente}) ` : ""}${entrada.texto}` : undefined;

  // Modo humano: o implantador está conversando; o agente só guarda a mensagem.
  if (store.estado(ctx).modo === "humano") {
    if (temConteudo) {
      store.anexarHistorico(ctx, {
        role: "user",
        content: `Mensagem do analista: ${mensagem ?? ""}${entrada.anexo ? ` [anexo: ${entrada.anexo.nome ?? entrada.anexo.tipo}]` : ""}`.trim(),
      });
    }
    return "";
  }

  // Gate aberto para o analista: a mensagem é a resposta dele.
  if (run.gate?.para === "analista" && temConteudo) {
    const naColeta = run.gate.etapa === "coletar" || run.gate.etapa === "extrair";
    const acao = !naColeta && SIM.test(entrada.texto ?? "") ? "aprovar" : "ajustar";
    if (acao === "aprovar") store.anexarHistorico(ctx, { role: "user", content: `Mensagem do analista: ${mensagem}` });
    run = await resolverGate(ctx, acao, entrada.texto?.trim() || "(anexo)", deps);
    if (naColeta && entrada.anexo) run = await avancar(ctx, deps, { anexo: entrada.anexo });
    return ultimaResposta(ctx, nAntes);
  }

  if (run.etapa_atual === "coletar") {
    const primeira = store.estado(ctx).historico.length === 0;
    if (temConteudo || primeira) await avancar(ctx, deps, { mensagem, anexo: entrada.anexo, primeira });
    return ultimaResposta(ctx, nAntes);
  }

  // Depois da coleta: registra e responde curto; quem age agora é o pipeline ou o implantador.
  if (temConteudo) {
    store.anexarHistorico(ctx, { role: "user", content: `Mensagem do analista: ${mensagem ?? "(anexo)"}` });
    const aviso = run.status === "concluido"
      ? "Obrigado! O formulário já foi homologado pelo implantador."
      : "Obrigado! Já tenho o que preciso por enquanto; o implantador está revisando o formulário e eu volto se surgir dúvida.";
    await enviarAoAnalista(ctx, canal.enviar, aviso);
    return aviso;
  }
  return "";
}

function ultimaResposta(ctx: Contexto, nAntes: number): string {
  const novas = store.estado(ctx).historico.slice(nAntes).filter((h) => h.role === "assistant" && !h.autor);
  return novas.at(-1)?.content ?? "";
}
