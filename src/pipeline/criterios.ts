// Catálogo de critérios: nome (como aparece em pipeline.json) → predicado sobre o estado do processo.
// "aguardando" = ainda não terminou (não é erro, não consome tentativa); "falhou" consome uma tentativa.
import type { AprovaTemplate, Cenario, Ficha, ResultadoCenario } from "../core/types.js";
import { walk, expressoes } from "../core/formly.js";
import { rodarCenarios } from "../core/scenario-runner.js";
import { perguntasAbertas, perguntasDe, semResposta, type Contexto } from "../agents/store.js";
import type { SaidaExtrator } from "../agents/extrator.js";
import type { CriterioDef, Resultado, Run } from "./tipos.js";
import { julgarCobertura, type ClienteJuiz } from "./juiz.js";

export type CtxCriterio = {
  ctx: Contexto;
  run: Run;
  criterio: CriterioDef;
  template: AprovaTemplate;
  ficha?: Ficha;
  form?: AprovaTemplate;
  cenarios?: Cenario[];
  relatorio?: ResultadoCenario[];
  /** última leitura do extrator (só na sub-etapa extrair) */
  extracao?: SaidaExtrator;
  /** cliente do juiz; null = rodando sem LLM */
  juiz: { cliente: ClienteJuiz; modelo: string } | null;
};

export type Avaliacao = { resultado: Resultado | "nao_avaliado"; detalhe: string; faltam?: string[] };
export type Criterio = (c: CtxCriterio) => Avaliacao | Promise<Avaliacao>;

const ok = (detalhe: string): Avaliacao => ({ resultado: "passou", detalhe });
const falha = (detalhe: string): Avaliacao => ({ resultado: "falhou", detalhe });
const lista = (xs: string[], n = 5) => xs.slice(0, n).join(", ") + (xs.length > n ? ` e mais ${xs.length - n}` : "");

export const CRITERIOS: Record<string, Criterio> = {
  // ---- analisar ----
  "ficha tem perguntas bloqueantes": ({ ficha }) => {
    if (!ficha) return falha("ficha não foi gerada");
    const qs = perguntasDe(ficha);
    const b = qs.filter((q) => q.prioridade === "bloqueia").length;
    return b > 0 ? ok(`${qs.length} perguntas, ${b} bloqueiam`) : falha(`${qs.length} perguntas e nenhuma bloqueante: o analisador não reconheceu o template`);
  },
  "nenhum placeholder sem pergunta": ({ template, ficha }) => {
    if (!ficha) return falha("ficha não foi gerada");
    const n = (JSON.stringify(template).match(/modeload/g) ?? []).length;
    if (n === 0) return ok("template sem placeholder modeload");
    const setor = perguntasDe(ficha).find((q) => q.tipo === "setor");
    return setor ? ok(`${n} ocorrências de modeload cobertas pela pergunta ${setor.id}`) : falha(`${n} ocorrências de modeload e nenhuma pergunta de setor`);
  },

  // ---- coletar ----
  "nenhuma pergunta em aberto": ({ ficha, run }) => {
    if (!ficha) return falha("ficha inexistente");
    const rej = Object.entries(run.rejeicoes_schema ?? {}).filter(([, r]) => r.n >= 2);
    if (rej.length) {
      const [id, r] = rej[0];
      return falha(`resposta de ${id} rejeitada ${r.n} vezes seguidas pelo formato: ${r.erro}`);
    }
    const abertas = perguntasAbertas(ficha);
    if (abertas.length) return { resultado: "aguardando", detalhe: `${abertas.length} perguntas abertas: ${lista(abertas.map((q) => q.id))}` };
    const pend = perguntasDe(ficha).filter((q) => semResposta(q)).length;
    return ok(pend ? `todas tratadas; ${pend} viraram pendência para o implantador` : "todas respondidas");
  },

  // ---- extrair ----
  "todo candidato cita trecho e confiança": ({ extracao, ficha }) => {
    if (!extracao) return { resultado: "aguardando", detalhe: "nenhum anexo lido ainda" };
    if (!extracao.candidatos.length) return ok(`nenhum candidato${extracao.motivo ? `: ${extracao.motivo}` : ""}`);
    const ids = new Set(ficha ? perguntasDe(ficha).map((q) => q.id) : []);
    const ruins = extracao.candidatos.filter((c) =>
      !c.trecho?.trim() || typeof c.confianca !== "number" || c.confianca < 0 || c.confianca > 1 || (ids.size > 0 && !ids.has(c.pergunta_id)));
    return ruins.length
      ? falha(`${ruins.length} de ${extracao.candidatos.length} candidatos sem trecho, sem confiança ou com pergunta inexistente: ${lista(ruins.map((c) => c.pergunta_id))}`)
      : ok(`${extracao.candidatos.length} candidatos, todos com trecho e confiança`);
  },

  // ---- aplicar ----
  "formulário sem placeholder de modelo": ({ form }) => {
    if (!form) return falha("formulário não foi gerado");
    const n = (JSON.stringify(form).match(/modeload/g) ?? []).length;
    return n === 0 ? ok("nenhum modeload no formulário") : falha(`${n} ocorrências de modeload no formulário (falta resposta de setor?)`);
  },
  "nenhum resíduo de outra cidade pendente": ({ ficha, form }) => {
    if (!ficha || !form) return falha("ficha ou formulário inexistente");
    const problemas: string[] = [];
    for (const q of perguntasDe(ficha).filter((x) => x.tipo === "residuo")) {
      const literal = `'${String(q.assume)}'`;
      if (semResposta(q)) {
        if (!q.pendencia) problemas.push(`${q.id} (${String(q.assume)}) sem decisão`);
        continue;
      }
      if (String(q.resposta) === String(q.assume)) continue; // implantador confirmou que fica
      const sobrou = [...walk(form.form)].some(({ field }) => expressoes(field).some((e) => e.expr.includes(literal)));
      if (sobrou) problemas.push(`${q.id}: '${String(q.assume)}' ainda aparece no formulário`);
    }
    return problemas.length ? falha(problemas.join("; ")) : ok("resíduos tratados ou anotados como pendência");
  },

  // ---- validar ----
  "todos os cenários passam": ({ relatorio, form, cenarios }) => {
    if (!relatorio?.length) return falha("nenhum cenário rodado");
    const f = relatorio.filter((r) => !r.passou);
    if (!f.length) return ok(`${relatorio.length}/${relatorio.length} cenários passam`);
    const cls = form && cenarios ? classificarFalhas(form, cenarios, relatorio) : [];
    const txt = f.map((r) => {
      const k = cls.find((x) => x.id === r.id);
      return k ? `${r.id} [${k.classe}${k.motivo ? `: ${k.motivo}` : ""}]` : r.id;
    });
    return falha(`${f.length} de ${relatorio.length} cenários falharam: ${lista(txt, 6)}`);
  },
  "nenhuma expressão indeterminada nova": ({ relatorio, cenarios, template }) => {
    if (!relatorio || !cenarios) return falha("nenhum cenário rodado");
    const base = new Set(rodarCenarios(template, cenarios).flatMap((r) => r.indeterminados.map(chaveIndet)));
    const novas = [...new Set(relatorio.flatMap((r) => r.indeterminados))].filter((i) => !base.has(chaveIndet(i)));
    return novas.length ? falha(`${novas.length} expressões indeterminadas que o template não tinha: ${lista(novas, 3)}`) : ok("nenhuma expressão indeterminada nova");
  },
  "cenários cobrem a ficha": async ({ juiz, ficha, cenarios, criterio }) => {
    if (!juiz) return { resultado: "nao_avaliado", detalhe: "sem LLM" };
    if (!ficha || !cenarios?.length) return falha("sem ficha ou sem cenários para julgar");
    const { veredicto, valido, erro } = await julgarCobertura({ cliente: juiz.cliente, modelo: juiz.modelo, rubrica: criterio.rubrica ?? "", ficha, cenarios });
    if (!valido) return falha(erro ?? "saída do juiz inválida");
    return veredicto.pass
      ? ok(`juiz: cenários cobrem as perguntas respondidas`)
      : { resultado: "falhou", detalhe: `juiz: faltam cenários para ${veredicto.faltam.length ? lista(veredicto.faltam, 8) : "perguntas não listadas"}`, faltam: veredicto.faltam };
  },

  // ---- homologar ----
  "implantador aprovou": ({ run }) => {
    // Só vale decisão tomada depois que esta rodada de homologação começou (reexecutar/ajustar reabre a etapa).
    const desde = run.etapas.find((e) => e.slug === "homologar")?.decisoes_desde ?? 0;
    const d = [...(run.decisoes ?? []).slice(desde)].reverse().find((x) => x.etapa === "homologar");
    if (!d) return { resultado: "aguardando", detalhe: "aguardando revisão do implantador" };
    return d.acao === "aprovar" ? ok(`aprovado em ${d.em}${d.texto ? `: ${d.texto}` : ""}`) : falha(`${d.acao}${d.texto ? `: ${d.texto}` : ""}`);
  },
};

export type ClasseFalha = "precondicao" | "regra" | "tecnica";

/**
 * Classifica cada cenário que falhou:
 * - tecnica: campo inexistente ou expressão indeterminada no campo esperado (vai para o implantador);
 * - precondicao: esperava visível, o campo ficou oculto e a condição de visibilidade depende de algo
 *   que o model do cenário nem preencheu (o cenário esqueceu a pré-condição; o validador corrige o model);
 * - regra: o formulário se comporta diferente do que o cenário diz (vira pergunta ao analista).
 */
export function classificarFalhas(form: AprovaTemplate, cenarios: Cenario[], relatorio: ResultadoCenario[]): { id: string; classe: ClasseFalha; motivo?: string }[] {
  const porKey = new Map<string, { hide?: string }>();
  for (const { field } of walk(form.form)) {
    if (field.key) porKey.set(String(field.key), { hide: typeof field.hideExpression === "string" ? field.hideExpression : undefined });
  }
  const out: { id: string; classe: ClasseFalha; motivo?: string }[] = [];
  for (const r of relatorio.filter((x) => !x.passou)) {
    const cen = cenarios.find((c) => c.id === r.id);
    let classe: ClasseFalha = "regra";
    let motivo: string | undefined;
    for (const f of r.falhas) {
      if (f.obtido === "campo_inexistente") { classe = "tecnica"; motivo = `campo ${f.campo} não existe`; break; }
      const key = f.campo.split(".").pop()!.replace(/\[\d*\]/g, "");
      if (r.indeterminados.some((i) => i.includes(key))) { classe = "tecnica"; motivo = `expressão indeterminada em ${key}`; break; }
      const hide = porKey.get(key)?.hide;
      if (f.esperado.visivel === true && (f.obtido as any).visivel === false && hide && cen) {
        const raizes = [...new Set([...hide.matchAll(/model\??\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]))];
        const doItem = [...new Set([...hide.matchAll(/(?:^|[^.\w])(?:field\.parent\.model|item|row)\??\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]))];
        const presentes = new Set(Object.keys(cen.model ?? {}));
        for (const v of Object.values(cen.model ?? {})) if (Array.isArray(v)) for (const it of v) if (it && typeof it === "object") for (const k of Object.keys(it)) presentes.add(k);
        const faltam = [...raizes, ...doItem].filter((x) => x !== key && !presentes.has(x));
        if (faltam.length) { classe = "precondicao"; motivo = `falta ${faltam.join(", ")} no model (condição: ${hide.slice(0, 80)})`; break; }
      }
    }
    out.push({ id: r.id, classe, ...(motivo ? { motivo } : {}) });
  }
  return out;
}

/**
 * Uma pergunta ao analista precisa ser regra de balcão: sem "Diagnóstico", sem nome de campo
 * (snake_case, camelCase, model.x), sem chaves/colchetes e com no máximo 240 caracteres.
 */
export function legivelParaAnalista(texto: string): { ok: boolean; motivo?: string } {
  if (!texto.trim()) return { ok: false, motivo: "vazio" };
  if (texto.length > 240) return { ok: false, motivo: "mais de 240 caracteres" };
  if (/diagn[oó]stico/i.test(texto)) return { ok: false, motivo: "cenário de diagnóstico" };
  if (/[{}\[\]]/.test(texto)) return { ok: false, motivo: "chaves ou colchetes" };
  if (/\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/.test(texto)) return { ok: false, motivo: "nome de campo (snake_case)" };
  if (/\b[a-z]+[A-Z][A-Za-z0-9]*\b/.test(texto)) return { ok: false, motivo: "nome de campo (camelCase)" };
  if (/\b(model|field)\.\w/.test(texto)) return { ok: false, motivo: "expressão do formulário" };
  return { ok: true };
}

/** Indeterminado sem o índice de repetição ([0]) para comparar template e formulário. */
function chaveIndet(s: string) { return s.replace(/\[\d+\]/g, "[]"); }

export function criterio(nome: string): Criterio {
  const f = CRITERIOS[nome];
  if (!f) throw new Error(`critério sem implementação: "${nome}"`);
  return f;
}
