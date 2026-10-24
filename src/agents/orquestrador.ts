// Orquestração em código (determinística) + agentes nas etapas que exigem linguagem.
// O arquivo INSTRUCTIONS/00-orquestrador.md descreve exatamente estas transições.
import { runAgent } from "./run-agent.js";
import { ferramentas, type Canal } from "./tools.js";
import { store, perguntasAbertas, type Contexto } from "./store.js";
import type { Anexo } from "./extrator.js";

export async function tratarMensagem(ctx: Contexto, canal: Canal, entrada: { texto?: string; anexo?: Anexo; remetente?: string }) {
  const estado = store.estado(ctx);
  const anexos: Anexo[] = entrada.anexo ? [entrada.anexo] : [];
  const t = ferramentas(ctx, canal, anexos);

  if (estado.etapa === "nao_iniciado") {
    const ficha = (await import("../core/template-analyzer.js")).analisarTemplate(store.template(ctx), ctx.template);
    ficha.cidade = ctx.cidade;
    store.salvarFicha(ctx, ficha);
    estado.etapa = "analisado";
    store.salvarEstado(ctx, estado);
  }

  const userText = [
    entrada.texto ? `Mensagem do analista${entrada.remetente ? ` (${entrada.remetente})` : ""}: ${entrada.texto}` : "",
    entrada.anexo ? `O analista enviou um anexo (${entrada.anexo.nome ?? entrada.anexo.tipo}). Chame pedir_extracao antes de responder.` : "",
    estado.etapa === "analisado" ? "Esta é a primeira interação: apresente-se e envie o primeiro lote de perguntas prioritárias." : "",
  ].filter(Boolean).join("\n");

  estado.historico.push({ role: "user", content: userText, em: new Date().toISOString() });
  const mensagens = estado.historico.slice(-30).map((h) => ({ role: h.role, content: h.content }));

  const { texto } = await runAgent({ agente: "coletor", mensagens, tools: t.coletor });
  if (texto) estado.historico.push({ role: "assistant", content: texto, em: new Date().toISOString() });
  estado.etapa = "coletando";

  const ficha = store.ficha(ctx)!;
  if (perguntasAbertas(ficha).length === 0) {
    estado.etapa = "ficha_fechada";
    store.salvarEstado(ctx, estado);
    await runAgent({ agente: "aplicador", mensagens: [{ role: "user", content: "A ficha fechou. Aplique e gere o diff." }], tools: t.aplicador });
    estado.etapa = "aplicado";
    store.salvarEstado(ctx, estado);
    await runAgent({
      agente: "validador",
      mensagens: [{ role: "user", content: "Formulário aplicado. Leia a ficha, escreva de 10 a 30 cenários, rode e trate o relatório. Falhas de regra viram perguntas de confirmação ao analista via enviar_mensagem." }],
      tools: t.validador,
    });
    estado.etapa = "validando";
  } else {
    estado.etapa = "aguardando_prefeitura";
  }
  store.salvarEstado(ctx, estado);
  return texto;
}
