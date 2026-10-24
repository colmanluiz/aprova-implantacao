// Limites de conversa com o analista, aplicados em código (não só na instrução do Coletor).
// Uma mensagem que não passa volta ao modelo como `mensagem_recusada: ...` e não é enviada.

export const MAX_PERGUNTAS = 2;
export const MAX_PALAVRAS_COM_PERGUNTA = 70;
export const MAX_PALAVRAS_SEM_PERGUNTA = 160;

/** Palavras de sistema que o analista de balcão não usa (busca sem caixa; prefixos valem: "parametriz" pega "parametrização"). */
export const PALAVRAS_DE_SISTEMA = [
  "template", "dataset", "parametriz", "formly", "placeholder", "confiança", "oculto", "offline", "o sistema prevê",
  // termos internos do pipeline (os mesmos que legivelParaAnalista barra nas descrições de cenário)
  "ficha", "plano de ação", "cenário", "validador",
];

export type VerificacaoMensagem = { ok: true } | { ok: false; motivo: string };

export const contarPalavras = (texto: string) => texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Confere uma mensagem ao analista: até 2 perguntas, curta quando pergunta, sem palavra de sistema. */
export function verificarMensagem(texto: string): VerificacaoMensagem {
  const baixo = texto.toLocaleLowerCase("pt-BR");
  const perguntas = (texto.match(/\?/g) ?? []).length;
  if (perguntas > MAX_PERGUNTAS) return { ok: false, motivo: "mensagem_recusada: mais de 2 perguntas numa mensagem; divida em mensagens de até 2 perguntas, do mesmo assunto" };
  const n = contarPalavras(texto);
  if (perguntas > 0 && n > MAX_PALAVRAS_COM_PERGUNTA) return { ok: false, motivo: `mensagem_recusada: mensagem longa (${n} palavras) com pergunta; encurte ou separe a explicação da pergunta` };
  if (n > MAX_PALAVRAS_SEM_PERGUNTA) return { ok: false, motivo: `mensagem_recusada: mensagem longa (${n} palavras); resumo ou fechamento cabe em até ${MAX_PALAVRAS_SEM_PERGUNTA} palavras` };
  const sistema = PALAVRAS_DE_SISTEMA.find((w) => baixo.includes(w));
  if (sistema) return { ok: false, motivo: `mensagem_recusada: palavra de sistema "${sistema}"; diga em linguagem de balcão` };
  return { ok: true };
}
