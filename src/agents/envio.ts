// Porta única de saída para o analista: tudo que chega a ele passa por verificarMensagem
// (enviar_mensagem, mostrar_modelo, gates do pipeline, conferência e cobrança de prazo).
import { verificarMensagem, type VerificacaoMensagem } from "../core/mensagens.js";
import { store, type Contexto } from "./store.js";

export type Envio = (texto: string) => Promise<void>;

/**
 * Confere e envia. Recusada, nada sai pelo canal e o motivo volta a quem chamou
 * (o agente reescreve; o pipeline manda ao implantador). Enviada, conta no estado e vai ao histórico.
 */
export async function enviarAoAnalista(ctx: Contexto, enviar: Envio, texto: string, opts: { autor?: string } = {}): Promise<VerificacaoMensagem> {
  const v = verificarMensagem(texto);
  if (!v.ok) return v;
  await enviar(texto);
  store.atualizarEstado(ctx, (e) => {
    e.mensagens_enviadas++;
    e.perguntas_feitas += (texto.match(/\?/g) ?? []).length;
    e.historico.push({ role: "assistant", content: texto, em: new Date().toISOString(), ...(opts.autor ? { autor: opts.autor } : {}) });
  });
  return v;
}
