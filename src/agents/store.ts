// Estado em disco: data/<cidade>/<processo>/. Sem banco no hackathon.
// A pasta base pode ser trocada com APROVA_DATA (usado pelos testes).
import fs from "node:fs";
import path from "node:path";
import type { Ficha, EtapaProcesso, Cenario, ResultadoCenario, AprovaTemplate } from "../core/types.js";

export type Contexto = { cidade: string; processo: string; template: string };

export type EntradaHistorico = {
  role: "user" | "assistant";
  content: string;
  em: string;
  /** quem escreveu quando não foi o agente nem o analista (ex.: "implantador" no modo humano) */
  autor?: string;
};

export type Registro = { em: string; pergunta_id: string; confianca: number; origem: string; resumo: string };

export type Estado = {
  etapa: EtapaProcesso;
  historico: EntradaHistorico[];
  mensagens_enviadas: number;
  perguntas_feitas: number;
  atualizado_em: string;
  /** cada resposta registrada com sucesso, para o painel mostrar o que cada mensagem rendeu */
  registros?: Registro[];
  /** "humano" quando o implantador assumiu a conversa */
  modo?: "agente" | "humano";
  intervencoes?: { em: string; tipo: "assumir" | "devolver"; acao: "assumir" | "devolver"; por: "implantador" }[];
  /** quando devolvida ao agente, a próxima mensagem leva uma nota do que o implantador conversou */
  nota_pendente_desde?: string;
};

export const baseDados = () => process.env.APROVA_DATA ?? "data";
const dir = (c: Contexto) => path.join(baseDados(), c.cidade, c.processo);
const arq = (c: Contexto, nome: string) => path.join(dir(c), nome);
export const lerJson = <T>(p: string): T | undefined => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined);
export const gravar = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 2));
};

export const store = {
  estado(c: Contexto): Estado {
    return lerJson<Estado>(arq(c, "estado.json")) ?? {
      etapa: "nao_iniciado", historico: [], mensagens_enviadas: 0, perguntas_feitas: 0, atualizado_em: new Date().toISOString(),
      registros: [], modo: "agente", intervencoes: [],
    };
  },
  salvarEstado(c: Contexto, e: Estado) { e.atualizado_em = new Date().toISOString(); gravar(arq(c, "estado.json"), e); },
  /** Executa sempre a partir do snapshot quando ele existe. */
  template(c: Contexto): AprovaTemplate {
    const snap = arq(c, "snapshot/template.json");
    return JSON.parse(fs.readFileSync(fs.existsSync(snap) ? snap : c.template, "utf8"));
  },
  ficha(c: Contexto): Ficha | undefined { return lerJson<Ficha>(arq(c, "ficha.json")); },
  salvarFicha(c: Contexto, f: Ficha) { gravar(arq(c, "ficha.json"), f); },
  salvarForm(c: Contexto, form: AprovaTemplate) { gravar(arq(c, "form.json"), form); },
  form(c: Contexto): AprovaTemplate | undefined { return lerJson<AprovaTemplate>(arq(c, "form.json")); },
  salvarDiff(c: Contexto, md: string) { gravar(arq(c, "diff.md"), md); },
  salvarCenarios(c: Contexto, cs: Cenario[]) { gravar(arq(c, "cenarios.json"), cs); },
  cenarios(c: Contexto): Cenario[] | undefined { return lerJson<Cenario[]>(arq(c, "cenarios.json")); },
  salvarRelatorio(c: Contexto, r: ResultadoCenario[]) { gravar(arq(c, "relatorio.json"), r); },
  relatorio(c: Contexto): ResultadoCenario[] | undefined { return lerJson<ResultadoCenario[]>(arq(c, "relatorio.json")); },
  /**
   * Lê, altera e grava estado.json num passo só (sem await no meio), para não perder o que
   * ferramentas e canais gravaram entre a leitura e a escrita. Use sempre isto para mexer no estado.
   */
  atualizarEstado(c: Contexto, fn: (e: Estado) => void): Estado {
    const e = store.estado(c);
    fn(e);
    store.salvarEstado(c, e);
    return e;
  },
  /** Acrescenta uma entrada ao histórico da conversa (append atômico). */
  anexarHistorico(c: Contexto, h: Omit<EntradaHistorico, "em"> & { em?: string }) {
    return store.atualizarEstado(c, (e) => { e.historico.push({ ...h, em: h.em ?? new Date().toISOString() }); });
  },
  /** Acrescenta um registro de resposta em estado.json.registros[]. */
  registrar(c: Contexto, r: Omit<Registro, "em"> & { em?: string }) {
    store.atualizarEstado(c, (e) => {
      (e.registros ??= []).push({ em: r.em ?? new Date().toISOString(), pergunta_id: r.pergunta_id, confianca: r.confianca, origem: r.origem, resumo: r.resumo });
    });
  },
  /** Candidatos que o extrator marcou para confirmar com o analista (confiança travada em 0,79). */
  aConfirmar(c: Contexto): string[] { return lerJson<string[]>(arq(c, "a-confirmar.json")) ?? []; },
  salvarAConfirmar(c: Contexto, ids: string[]) { gravar(arq(c, "a-confirmar.json"), [...new Set(ids)]); },
  /** Auditoria: candidatos que o extrator descartou (append). */
  anexarDescartados(c: Contexto, itens: unknown[]) {
    if (!itens.length) return;
    const p = arq(c, "descartados.json");
    const atual = lerJson<unknown[]>(p) ?? [];
    gravar(p, [...atual, ...itens]);
  },
  arquivo: arq,
  pasta: dir,
};

export function perguntasDe(f: Ficha) {
  return f.grupos.flatMap((g) => g.perguntas);
}

/** Pergunta sem resposta confiável (resposta nula ou confiança abaixo de 0,8). */
export function semResposta(q: { resposta: unknown; confianca: number }) {
  return q.resposta === null || q.resposta === undefined || q.confianca < 0.8;
}

/**
 * Perguntas que o coletor ainda precisa fazer ao analista: sem resposta confiável,
 * que não viraram pendência explícita ("analista não sabe") e que não são resíduo
 * (resíduo é assunto do implantador, nunca da prefeitura).
 */
export function perguntasAbertas(f: Ficha) {
  return perguntasDe(f).filter((q) => semResposta(q) && !q.pendencia && q.tipo !== "residuo");
}

/** Resumo curto de uma resposta para o painel. */
export function resumir(v: unknown, max = 80): string {
  if (v === null || v === undefined) return "sem resposta";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
