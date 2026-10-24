// Prova offline do pipeline: roda tudo sem LLM, com a ficha respondida e os cenários de fixtures/.
// É o plano B da demo: não precisa de chave de API.
import fs from "node:fs";
import type { Ficha } from "../core/types.js";
import { store, perguntasDe, semResposta, resumir, type Contexto } from "../agents/store.js";
import { iniciarProcesso, avancar } from "./motor.js";
import { lerRun } from "./run.js";
import type { Run } from "./tipos.js";

export const PADRAO = {
  cidade: "vale-verde",
  processo: "alvara",
  template: "fixtures/templates/alvara-construcao.modeload.json",
  ficha: "fixtures/fichas/alvara.vale-verde.json",
  cenarios: "fixtures/cenarios/alvara.cenarios.json",
};

export async function rodarOffline(o: Partial<typeof PADRAO> = {}, log: (s: string) => void = () => {}): Promise<Run> {
  const p = { ...PADRAO, ...o };
  const ctx: Contexto = { cidade: p.cidade, processo: p.processo, template: p.template };
  const deps = { semLLM: true, juiz: null, cenarios: p.cenarios };

  // 1. analisar (código) e abrir coletar
  let run = await iniciarProcesso(ctx, deps, { reiniciar: true, opcoes: { sem_llm: true, cenarios: p.cenarios } });
  log(`analisar → ${run.etapas[0].saida_resumo}`);
  log(`coletar  → ${run.etapas[1].criterios[0].resultado}: ${run.etapas[1].criterios[0].detalhe}`);

  // 2. coleta simulada: a ficha de fixtures é o que coletor + extrator teriam registrado na conversa.
  const ficha: Ficha = JSON.parse(fs.readFileSync(p.ficha, "utf8"));
  ficha.cidade ??= p.cidade;
  for (const q of perguntasDe(ficha).filter((x) => !semResposta(x))) {
    store.registrar(ctx, { pergunta_id: q.id, confianca: q.confianca, origem: q.origem ?? "coleta simulada", resumo: resumir(q.resposta) });
  }
  // O analista encerrou sem saber o resto: o coletor anota cada uma como pendência (nunca inventa regra).
  for (const q of perguntasDe(ficha).filter((x) => semResposta(x) && !x.pendencia)) {
    q.pendencia = q.tipo === "residuo"
      ? "possível falso positivo do analisador; implantador confirma na homologação"
      : "analista não respondeu na coleta (simulada); segue para o implantador";
    store.registrar(ctx, { pergunta_id: q.id, confianca: 0, origem: "coleta simulada (offline)", resumo: `pendência: ${q.pendencia}` });
  }
  store.salvarFicha(ctx, ficha);
  // Na coleta simulada o analista aceitou o modelo como está (sem plano de ação).
  store.salvarPlano(ctx, { decisao: "atende", decidido_em: new Date().toISOString(), itens: [] });

  // 3. reavalia coletar e segue: aplicar → validar (cenários fixos) → homologar (gate do implantador)
  run = await avancar(ctx, deps);
  for (const e of lerRun(ctx)!.etapas) {
    log(`${e.slug.padEnd(9)}: ${e.status.padEnd(10)} ${e.saida_resumo}`);
    for (const k of e.criterios) log(`           [${k.resultado}] ${k.nome}${k.detalhe ? ` — ${k.detalhe}` : ""}`);
  }
  return run;
}
