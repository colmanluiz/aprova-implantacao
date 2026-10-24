// Motor do pipeline validado. Lê a definição congelada no snapshot, executa a etapa atual,
// avalia os critérios de saída em ordem e decide: avançar, esperar, tentar de novo ou abrir gate.
import fs from "node:fs";
import path from "node:path";
import { analisarTemplate } from "../core/template-analyzer.js";
import { aplicarFicha, gerarDiff } from "../core/patcher.js";
import { rodarCenarios } from "../core/scenario-runner.js";
import { validarResposta } from "../core/respostas.js";
import { resumoTemplate } from "../core/template-analyzer.js";
import type { Cenario, Pergunta } from "../core/types.js";
import { store, perguntasDe, perguntasAbertas, semResposta, resumir, gravar, lerJson, type Contexto, type EntradaHistorico } from "../agents/store.js";
import type { Anexo, SaidaExtrator } from "../agents/extrator.js";
import type { Canal } from "../agents/tools.js";
import type { Mensagem } from "../agents/run-agent.js";
import type { NomeAgente } from "../agents/instructions.js";
import { etapaDef, etapasPrincipais } from "./definicao.js";
import { CRITERIOS, criterio as acharCriterio, classificarFalhas, legivelParaAnalista, type Avaliacao, type CtxCriterio } from "./criterios.js";
import type { ClienteJuiz } from "./juiz.js";
import type { AcaoGate, CriterioDef, EtapaRun, Gate, PipelineDef, Run } from "./tipos.js";
import { nomeCidade, agora, anotarPendencia, criarSnapshot, etapaRun, lerRun, novoRun, pipelineDoProcesso, salvarRun } from "./run.js";

export type RunAgentFn = (opts: { agente: NomeAgente; mensagens: Mensagem[]; tools?: any[]; maxIteracoes?: number }) => Promise<{ texto: string; conversa?: Mensagem[] }>;

export type Dependencias = {
  canal?: Canal;
  /** executor de agentes (padrão: run-agent real). Os testes injetam um falso. */
  runAgent?: RunAgentFn;
  /** cliente do critério-juiz; null = sem LLM */
  juiz?: { cliente: ClienteJuiz; modelo: string } | null;
  /** roda sem nenhum LLM: validar usa cenários fixos, juiz fica nao_avaliado */
  semLLM?: boolean;
  /** arquivo de cenários fixos para validar sem LLM */
  cenarios?: string;
  /** anexos recebidos nesta mensagem */
  anexos?: Anexo[];
};

export type Entrada = { mensagem?: string; feedback?: string; anexo?: Anexo; primeira?: boolean };

const MAX_PASSOS = 40;
/** Máximo de rodadas de ferramenta numa execução do validador (evita conversas de 14 mensagens). */
export const MAX_RODADAS_VALIDADOR = 6;

// ---------------------------------------------------------------- início

/** Abre o processo: snapshot do template e do pipeline, run.json novo, e roda até a primeira espera. */
export async function iniciarProcesso(c: Contexto, deps: Dependencias = {}, opts: { reiniciar?: boolean; opcoes?: Run["opcoes"] } = {}): Promise<Run> {
  const existente = lerRun(c);
  if (existente && !opts.reiniciar) return existente;
  if (opts.reiniciar) limparSaidas(c);
  criarSnapshot(c);
  const def = pipelineDoProcesso(c);
  const tpl = store.template(c);
  const run = novoRun(c, def, String(tpl.config?.title ?? c.processo), opts.opcoes);
  salvarRun(c, run);
  return avancar(c, deps);
}

/** Saídas geradas pelo pipeline; apagadas só quando o processo é reiniciado de propósito. */
function limparSaidas(c: Contexto) {
  for (const f of ["run.json", "ficha.json", "form.json", "diff.md", "cenarios.json", "relatorio.json", "pendencias.md", "estado.json", "extracao.json", "conversas", "snapshot"]) {
    fs.rmSync(store.arquivo(c, f), { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- dependências

async function completar(run: Run, deps: Dependencias): Promise<Required<Pick<Dependencias, "runAgent">> & Dependencias> {
  const semLLM = deps.semLLM ?? run.opcoes?.sem_llm ?? false;
  const cenarios = deps.cenarios ?? run.opcoes?.cenarios;
  let juiz = deps.juiz;
  if (juiz === undefined) {
    if (semLLM) juiz = null;
    else {
      const { client, MODEL } = await import("../agents/client.js");
      juiz = { cliente: client as unknown as ClienteJuiz, modelo: MODEL };
    }
  }
  const runAgent: RunAgentFn = deps.runAgent ?? (async (o) => (await import("../agents/run-agent.js")).runAgent(o));
  return { ...deps, semLLM, cenarios, juiz, runAgent };
}

// ---------------------------------------------------------------- laço principal

/**
 * Avança o processo a partir da etapa atual. `entrada` é a mensagem do analista (coletar)
 * ou o texto de um gate. Para quando uma etapa fica aguardando, um gate abre ou o processo termina.
 */
export async function avancar(c: Contexto, depsEntrada: Dependencias = {}, entrada?: Entrada): Promise<Run> {
  let run = lerRun(c);
  if (!run) throw new Error(`processo ${c.cidade}/${c.processo} não iniciado`);
  const deps = await completar(run, depsEntrada);
  const def = pipelineDoProcesso(c);

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    run = lerRun(c)!;
    if (run.status === "concluido" || run.status === "parado") return run;
    // Gate aberto na etapa atual: nada a fazer até alguém resolver.
    if (run.gate && run.gate.etapa === run.etapa_atual) return run;

    const slug = run.etapa_atual;
    const ed = etapaDef(def, slug);
    const er = etapaRun(run, slug);

    if (er.status === "pendente") {
      er.status = "executando";
      er.iniciada_em = agora();
      er.tentativas = 1;
      run.status = "executando";
      if (slug === "aplicar") run.aplicar_alcancado_em ??= agora();
      salvarRun(c, run);
      await executar(c, ed, deps, entrada);
      entrada = undefined;
    } else if (entrada) {
      if (er.status !== "executando") { er.status = "executando"; run.status = "executando"; salvarRun(c, run); }
      await executar(c, ed, deps, entrada);
      entrada = undefined;
    }

    if (slug === "coletar") resumoColeta(c);
    run = lerRun(c)!;
    const parada = await avaliarEtapa(c, run, ed, deps);
    const er2 = etapaRun(run, slug);

    if (!parada) {
      concluirEtapa(run, er2);
      if (slug === "coletar") fecharSubEtapas(run, def, slug);
      const principais = etapasPrincipais(def);
      const i = principais.findIndex((e) => e.slug === slug);
      const prox = principais[i + 1];
      if (!prox) { run.status = "concluido"; salvarRun(c, run); return run; }
      run.etapa_atual = prox.slug;
      salvarRun(c, run);
      continue;
    }

    const { criterio, avaliacao } = parada;
    if (avaliacao.resultado === "aguardando") {
      er2.status = "aguardando";
      run.status = ed.gate === "implantador" || run.gate?.para === "implantador" ? "aguardando_implantador" : "aguardando_prefeitura";
      salvarRun(c, run);
      return run;
    }

    // falhou
    const usadas = (er2.retentativas ??= {})[criterio.nome] ?? 0;
    if (usadas < criterio.tentativas) {
      er2.retentativas[criterio.nome] = usadas + 1;
      er2.tentativas++;
      salvarRun(c, run);
      await executar(c, ed, deps, { feedback: feedbackDe(criterio, avaliacao) });
      continue;
    }
    await rotearFalha(c, run, ed, er2, criterio, avaliacao, deps);
    return lerRun(c)!;
  }
  throw new Error("pipeline não estabilizou (limite de passos)");
}

function concluirEtapa(run: Run, er: EtapaRun) {
  er.status = "concluida";
  er.concluida_em = agora();
}

/** Sub-etapas (extrair) que nunca rodaram são fechadas junto com a etapa-mãe. */
function fecharSubEtapas(run: Run, def: PipelineDef, mae: string) {
  for (const sub of def.etapas.filter((e) => e.sub_etapa_de === mae)) {
    const er = etapaRun(run, sub.slug);
    if (er.status === "pendente") {
      er.status = "concluida";
      er.concluida_em = agora();
      er.saida_resumo = "nenhum anexo recebido nesta coleta";
      for (const k of er.criterios) { k.resultado = "nao_avaliado"; k.detalhe = "nenhum anexo"; }
    } else if (er.status !== "concluida") {
      er.status = "concluida";
      er.concluida_em = agora();
    }
    if (run.gate?.etapa === sub.slug) {
      (run.decisoes ??= []).push({ em: agora(), etapa: sub.slug, para: run.gate.para, acao: "aprovar", texto: "fechado automaticamente: a coleta terminou" });
      run.gate = null;
    }
  }
}

function feedbackDe(k: CriterioDef, a: Avaliacao): string {
  return `[pipeline] O critério de saída "${k.nome}" falhou: ${a.detalhe}. Corrija isso antes de encerrar; não repita o que já está certo.`;
}

// ---------------------------------------------------------------- critérios

function ctxCriterio(c: Contexto, run: Run, k: CriterioDef, deps: Dependencias, extracao?: SaidaExtrator): CtxCriterio {
  return {
    ctx: c, run, criterio: k,
    template: store.template(c),
    ficha: store.ficha(c),
    form: store.form(c),
    cenarios: store.cenarios(c),
    relatorio: store.relatorio(c),
    extracao: extracao ?? lerJson<SaidaExtrator>(store.arquivo(c, "extracao.json")),
    juiz: deps.juiz ?? null,
  };
}

/**
 * Avalia os critérios da etapa em ordem e grava o resultado no run.
 * Devolve o primeiro que não passou (aguardando ou falhou), ou undefined se todos passaram.
 * nao_avaliado (ex.: juiz sem LLM) não bloqueia.
 */
export async function avaliarEtapa(c: Contexto, run: Run, ed: PipelineDef["etapas"][number], deps: Dependencias, extracao?: SaidaExtrator) {
  const er = etapaRun(run, ed.slug);
  let parada: { criterio: CriterioDef; avaliacao: Avaliacao } | undefined;
  for (let i = 0; i < ed.criterios.length; i++) {
    const k = ed.criterios[i];
    const reg = er.criterios[i] ?? (er.criterios[i] = { nome: k.nome, resultado: "nao_avaliado", detalhe: "", avaliado_em: null });
    if (parada) { Object.assign(reg, { resultado: "nao_avaliado", detalhe: "", avaliado_em: null }); continue; }
    let a: Avaliacao;
    const chave = `${ed.slug}:${k.nome}`;
    if (run.criterios_aprovados?.includes(chave)) {
      const d = [...(run.decisoes ?? [])].reverse().find((x) => x.etapa === ed.slug && x.criterio === k.nome && x.acao === "aprovar");
      a = { resultado: "passou", detalhe: `aceito pelo ${d?.para ?? "implantador"} em gate${d?.texto ? `: ${d.texto}` : ""}` };
    } else {
      try {
        a = await acharCriterio(k.nome)(ctxCriterio(c, run, k, deps, extracao));
      } catch (e) {
        a = { resultado: "falhou", detalhe: `erro ao avaliar: ${(e as Error).message}` };
      }
    }
    Object.assign(reg, { nome: k.nome, resultado: a.resultado, detalhe: a.detalhe, avaliado_em: agora() });
    if (a.resultado === "falhou" || a.resultado === "aguardando") parada = { criterio: k, avaliacao: a };
  }
  salvarRun(c, run);
  return parada;
}

// ---------------------------------------------------------------- gates

async function rotearFalha(c: Contexto, run: Run, ed: PipelineDef["etapas"][number], er: EtapaRun, k: CriterioDef, a: Avaliacao, deps: Dependencias) {
  er.status = "falhou";
  if (k.ao_falhar === "parar") {
    run.status = "parado";
    salvarRun(c, run);
    return;
  }
  await abrirGate(c, run, {
    para: k.ao_falhar,
    tipo: "falha_criterio",
    etapa: ed.slug,
    criterio: k.nome,
    detalhe: a.detalhe,
    tentativas: er.tentativas,
  }, deps);
}

/** Abre um gate autoexplicativo. Para o analista, a instrução é entregue pelo Canal como pergunta simples. */
export async function abrirGate(
  c: Contexto,
  run: Run,
  g: { para: "analista" | "implantador"; tipo: Gate["tipo"]; etapa: string; criterio?: string; detalhe: string; tentativas?: number; resumo?: string; instrucao?: string; contexto?: Record<string, unknown> },
  deps: Dependencias,
) {
  const def = pipelineDoProcesso(c);
  const nomeEtapa = etapaDef(def, g.etapa).nome;
  // Pergunta ao analista só sai se for regra de balcão legível; senão o gate vai para o implantador.
  if (g.para === "analista" && !g.instrucao) {
    const p = perguntaAoAnalista(c, run, g.etapa, g.criterio, g.detalhe);
    if (p.ok) g = { ...g, instrucao: p.texto };
    else g = { ...g, para: "implantador", detalhe: `${g.detalhe} (não foi ao analista: ${p.motivo})` };
  }
  const instrucao = g.instrucao ?? (g.para === "analista" ? "" :
    `Na etapa "${nomeEtapa}", o critério "${g.criterio}" falhou${g.tentativas ? ` depois de ${g.tentativas} tentativa(s)` : ""}: ${g.detalhe}. ` +
    `aprovar = aceitar como está e seguir; ajustar "<pergunta_id>=<valor>" (uma por linha) = corrigir a ficha e refazer; ajustar com texto livre = refazer a etapa com essa orientação; rejeitar = parar o processo.`);
  const gate: Gate = {
    para: g.para,
    tipo: g.tipo,
    etapa: g.etapa,
    ...(g.criterio ? { criterio: g.criterio } : {}),
    instrucao,
    resumo: g.resumo ?? `${nomeEtapa}: ${g.detalhe}`,
    acoes: ["aprovar", "ajustar", "rejeitar"],
    aberto_em: agora(),
    contexto: { detalhe: g.detalhe, ...(g.contexto ?? {}) },
  };
  run.gate = gate;
  (run.gates_abertos ??= []).push({ em: gate.aberto_em, para: gate.para, etapa: gate.etapa, ...(gate.criterio ? { criterio: gate.criterio } : {}) });
  run.status = g.para === "analista" ? "aguardando_prefeitura" : "aguardando_implantador";
  if (g.para === "implantador") anotarPendencia(c, gate);
  if (g.para === "analista") {
    if (deps.canal) {
      await deps.canal.enviar(instrucao);
      store.atualizarEstado(c, (e) => {
        e.mensagens_enviadas++;
        e.perguntas_feitas++;
        e.historico.push({ role: "assistant", content: instrucao, em: agora() });
      });
      gate.contexto.entregue = true;
    } else {
      gate.contexto.entregue = false;
    }
  }
  salvarRun(c, run);
}

/**
 * Pergunta de confirmação em linguagem de servidor, sem jargão. Para cenários, a pergunta é a
 * `descricao` de um cenário que falhou por regra (não por pré-condição esquecida nem falha técnica).
 */
export function perguntaAoAnalista(c: Contexto, run: Run, etapa: string, criterio: string | undefined, detalhe: string): { ok: true; texto: string } | { ok: false; motivo: string } {
  if (criterio === "todos os cenários passam") {
    const rel = store.relatorio(c) ?? [];
    const form = store.form(c);
    const cens = store.cenarios(c) ?? [];
    const cls = form ? classificarFalhas(form, cens, rel) : [];
    const deRegra = rel.filter((r) => !r.passou && (cls.find((k) => k.id === r.id)?.classe ?? "regra") === "regra");
    if (!deRegra.length) return { ok: false, motivo: "nenhuma falha é de regra (pré-condição esquecida, campo calculado definido direto ou falha técnica)" };
    let motivo = "";
    for (const r of deRegra) {
      const v = legivelParaAnalista(r.descricao);
      if (v.ok) return { ok: true, texto: `Preciso confirmar uma regra do ${run.titulo}: "${r.descricao}". É assim que deve funcionar na prefeitura? Responda sim ou não e, se não, como deveria ser.` };
      motivo = `descrição do cenário ${r.id} ilegível para o analista (${v.motivo})`;
    }
    return { ok: false, motivo };
  }
  if (criterio === "nenhuma pergunta em aberto") {
    const id = Object.entries(run.rejeicoes_schema ?? {}).find(([, r]) => r.n >= 2)?.[0];
    const q = id ? perguntasDe(store.ficha(c)!).find((x) => x.id === id) : undefined;
    if (q) return { ok: true, texto: `Não consegui registrar sua resposta para esta pergunta: "${q.texto}" Pode responder de novo, de forma direta? Se não souber, pode dizer "não sei" que eu anoto como pendência.` };
  }
  if (etapa === "extrair") return { ok: true, texto: "Não consegui ler com segurança o arquivo que você mandou. Pode mandar uma foto mais nítida ou escrever os valores aqui mesmo?" };
  const v = legivelParaAnalista(detalhe);
  return v.ok ? { ok: true, texto: `Preciso de uma confirmação sua para seguir: ${detalhe}. Pode me responder?` } : { ok: false, motivo: `detalhe técnico (${v.motivo})` };
}

/**
 * Resolve o gate aberto. aprovar = aceita e segue; ajustar = corrige (linhas "<pergunta_id>=<valor>")
 * e/ou refaz a etapa com o texto como orientação; rejeitar = para o processo.
 */
export async function resolverGate(c: Contexto, acao: AcaoGate, texto?: string, deps: Dependencias = {}): Promise<Run> {
  const run = lerRun(c);
  if (!run) throw new Error(`processo ${c.cidade}/${c.processo} não iniciado`);
  const gate = run.gate;
  if (!gate) throw new Error("nenhum gate aberto");
  if (!["aprovar", "ajustar", "rejeitar"].includes(acao)) throw new Error(`ação inválida: ${acao}`);
  if (acao === "ajustar" && !texto?.trim()) throw new Error("ajustar precisa de texto");

  // Valida os ajustes antes de mexer em qualquer coisa.
  const ajustes = acao === "ajustar" ? lerAjustes(c, texto!) : [];
  const ruins = ajustes.filter((a) => "erro" in a) as { erro: string }[];
  if (ruins.length) throw new Error(ruins.map((r) => r.erro).join("\n"));

  (run.decisoes ??= []).push({ em: agora(), etapa: gate.etapa, para: gate.para, acao, ...(texto ? { texto } : {}), ...(gate.criterio ? { criterio: gate.criterio } : {}) });
  run.gate = null;
  const er = etapaRun(run, gate.etapa);

  if (acao === "rejeitar") {
    er.status = "falhou";
    run.status = "parado";
    salvarRun(c, run);
    return run;
  }

  if (acao === "aprovar") {
    if (gate.tipo === "falha_criterio" && gate.criterio) (run.criterios_aprovados ??= []).push(`${gate.etapa}:${gate.criterio}`);
    if (er.status === "falhou") er.status = "executando";
    run.status = "executando";
    salvarRun(c, run);
    return avancar(c, deps);
  }

  // ajustar
  const validos = ajustes as { q: Pergunta; valor: unknown }[];
  if (validos.length) {
    const f = store.ficha(c)!;
    const origem = `${gate.para === "analista" ? "Analista" : "Implantador"} (gate ${gate.etapa}, ${agora().slice(0, 16)})`;
    for (const { q, valor } of validos) {
      const alvo = perguntasDe(f).find((x) => x.id === q.id)!;
      Object.assign(alvo, { resposta: valor, origem, confianca: 1, pendencia: undefined });
      store.registrar(c, { pergunta_id: q.id, confianca: 1, origem, resumo: resumir(valor) });
    }
    store.salvarFicha(c, f);
  }
  const resto = texto!.split("\n").filter((l) => !RE_AJUSTE.test(l.trim())).join("\n").trim();

  // Ajuste de resposta depois que o formulário já foi gerado: refaz a partir de aplicar.
  const def = pipelineDoProcesso(c);
  const ordem = etapasPrincipais(def).map((e) => e.slug);
  const posAplicar = ordem.indexOf(gate.etapa) > ordem.indexOf("aplicar") && ordem.includes("aplicar");
  if (validos.length && posAplicar) {
    for (const slug of ordem.slice(ordem.indexOf("aplicar"))) reabrir(run, slug);
    run.etapa_atual = "aplicar";
    run.status = "executando";
    salvarRun(c, run);
    return avancar(c, deps);
  }

  // Homologar não tem agente: texto livre volta para o validador como orientação.
  let alvo = gate.etapa === "extrair" ? "coletar" : gate.etapa;
  if (gate.etapa === "homologar" && resto) {
    reabrir(run, "homologar");
    alvo = "validar";
    run.etapa_atual = "validar";
  }
  const ea = etapaRun(run, alvo);
  ea.retentativas = {};
  ea.status = "executando";
  if (er !== ea && er.status === "falhou") er.status = "concluida";
  run.status = "executando";
  salvarRun(c, run);
  const entrada: Entrada | undefined = resto
    ? gate.para === "analista" ? { mensagem: resto } : { feedback: `[implantador] ${resto}` }
    : { feedback: `[implantador] respostas corrigidas: ${validos.map((v) => v.q.id).join(", ")}` };
  return avancar(c, deps, entrada);
}

function reabrir(run: Run, slug: string) {
  const er = etapaRun(run, slug);
  run.criterios_aprovados = (run.criterios_aprovados ?? []).filter((k) => !k.startsWith(`${slug}:`));
  er.decisoes_desde = run.decisoes?.length ?? 0;
  er.status = "pendente";
  er.iniciada_em = null;
  er.concluida_em = null;
  er.tentativas = 0;
  er.retentativas = {};
  for (const k of er.criterios) Object.assign(k, { resultado: "nao_avaliado", detalhe: "", avaliado_em: null });
}

const RE_AJUSTE = /^([a-z]+-\d+)\s*=\s*(.+)$/;
function lerAjustes(c: Contexto, texto: string): ({ q: Pergunta; valor: unknown } | { erro: string })[] {
  const f = store.ficha(c);
  const out: ({ q: Pergunta; valor: unknown } | { erro: string })[] = [];
  for (const linha of texto.split("\n").map((l) => l.trim())) {
    const m = linha.match(RE_AJUSTE);
    if (!m) continue;
    const q = f ? perguntasDe(f).find((x) => x.id === m[1]) : undefined;
    if (!q) { out.push({ erro: `pergunta ${m[1]} não existe` }); continue; }
    const v = validarResposta(q, m[2]);
    out.push(v.ok ? { q, valor: v.valor } : { erro: v.erro });
  }
  return out;
}

/**
 * Reabre uma etapa e todas as seguintes (critérios nao_avaliado, tentativas 0), apaga a conversa
 * do agente daquela etapa (e cenários/relatório quando é validar) e roda o pipeline a partir dela.
 */
export async function reexecutarEtapa(c: Contexto, slug: string, deps: Dependencias = {}): Promise<Run> {
  const run = lerRun(c);
  if (!run) throw new Error(`processo ${c.cidade}/${c.processo} não iniciado`);
  const def = pipelineDoProcesso(c);
  const ordem = etapasPrincipais(def).map((e) => e.slug);
  const i = ordem.indexOf(slug);
  if (i < 0) throw new Error(`etapa inválida para reexecutar: ${slug} (use ${ordem.join(", ")})`);
  if (i < ordem.indexOf("coletar") + 1 && slug !== "coletar") throw new Error("reexecutar analisar recria a ficha; abra o processo de novo");
  const afetadas = ordem.slice(i);
  for (const s of afetadas) {
    reabrir(run, s);
    fs.rmSync(store.arquivo(c, `conversas/${s}.json`), { force: true });
  }
  if (afetadas.includes("validar")) for (const f of ["cenarios.json", "relatorio.json"]) fs.rmSync(store.arquivo(c, f), { force: true });
  if (run.gate && afetadas.includes(run.gate.etapa)) run.gate = null;
  run.etapa_atual = slug;
  run.status = "executando";
  salvarRun(c, run);
  return avancar(c, deps);
}

// ---------------------------------------------------------------- executores

async function executar(c: Contexto, ed: PipelineDef["etapas"][number], deps: Dependencias & { runAgent: RunAgentFn }, entrada?: Entrada) {
  const ex = EXECUTORES[ed.slug];
  if (!ex) throw new Error(`etapa sem executor: ${ed.slug}`);
  await ex(c, deps, entrada);
}

type Executor = (c: Contexto, deps: Dependencias & { runAgent: RunAgentFn }, entrada?: Entrada) => Promise<void>;

function resumos(c: Contexto, slug: string, entrada_resumo?: string, saida_resumo?: string) {
  const run = lerRun(c)!;
  const er = etapaRun(run, slug);
  if (entrada_resumo !== undefined) er.entrada_resumo = entrada_resumo;
  if (saida_resumo !== undefined) er.saida_resumo = saida_resumo;
  salvarRun(c, run);
}

function resumoColeta(c: Contexto) {
  const f = store.ficha(c);
  if (!f) return;
  const qs = perguntasDe(f);
  const resp = qs.filter((q) => !semResposta(q)).length;
  const pend = qs.filter((q) => semResposta(q) && q.pendencia).length;
  resumos(c, "coletar", undefined, `${resp} respondidas, ${pend} pendências, ${perguntasAbertas(f).length} abertas`);
}

const EXECUTORES: Record<string, Executor> = {
  async analisar(c) {
    const tpl = store.template(c);
    const ficha = analisarTemplate(tpl, path.basename(c.template));
    ficha.cidade = c.cidade;
    // Resíduo de outra cidade nunca é perguntado à prefeitura: o analisador troca pelo nome desta cidade.
    // Sem cidade conhecida, fica em aberto e o critério de aplicar abre gate para o implantador.
    const cidade = nomeCidade(c.cidade);
    const residuos = perguntasDe(ficha).filter((q) => q.tipo === "residuo");
    if (cidade) {
      for (const q of residuos) {
        Object.assign(q, { resposta: cidade, origem: "analisador: resíduo substituído pelo nome da cidade", confianca: 1 });
        store.registrar(c, { pergunta_id: q.id, confianca: 1, origem: q.origem!, resumo: `'${String(q.assume)}' → '${cidade}'` });
      }
    }
    store.salvarFicha(c, ficha);
    const r = resumoTemplate(tpl);
    const qs = perguntasDe(ficha);
    const trocas = cidade && residuos.length ? `; ${residuos.length} resíduo(s) trocado(s) por "${cidade}": ${residuos.map((q) => `'${String(q.assume)}'`).join(", ")}` : "";
    resumos(c, "analisar",
      `${path.basename(c.template)}: ${r.etapas} etapas, ${r.campos} campos, ${r.expressoes} expressões`,
      `${qs.length} perguntas em ${ficha.grupos.length} grupos (${qs.filter((q) => q.prioridade === "bloqueia").length} bloqueiam)${trocas}`);
  },

  async coletar(c, deps, entrada) {
    const f0 = store.ficha(c);
    if (f0) resumos(c, "coletar", `${perguntasDe(f0).length} perguntas para o analista`);
    if (entrada && (entrada.mensagem !== undefined || entrada.feedback || entrada.anexo || entrada.primeira)) {
      await rodarColetor(c, deps, entrada);
    }
  },

  // extrair é sub-etapa: roda dentro de coletar, pelo gancho de pedir_extracao (ver lerAnexo).
  async extrair() {},

  async aplicar(c) {
    const ficha = store.ficha(c);
    if (!ficha) return;
    const { form, mudancas, pendencias } = aplicarFicha(store.template(c), ficha);
    store.salvarForm(c, form);
    store.salvarDiff(c, gerarDiff(ficha, mudancas, pendencias));
    const resp = perguntasDe(ficha).filter((q) => !semResposta(q)).length;
    resumos(c, "aplicar", `ficha com ${resp} respostas`, `${mudancas.length} mudanças, ${pendencias.length} pendências (diff.md)`);
  },

  async validar(c, deps, entrada) {
    if (!store.form(c)) return;
    if (deps.semLLM) {
      if (!deps.cenarios) throw new Error("sem LLM é preciso informar o arquivo de cenários fixos");
      const cenarios: Cenario[] = JSON.parse(fs.readFileSync(deps.cenarios, "utf8"));
      store.salvarCenarios(c, cenarios);
      store.salvarRelatorio(c, rodarCenarios(store.form(c)!, cenarios));
      resumos(c, "validar", `cenários fixos: ${path.basename(deps.cenarios)} (sem LLM)`);
    } else {
      const { ferramentas } = await import("../agents/tools.js");
      const t = ferramentas(c, deps.canal ?? { enviar: async () => {} });
      const arqConversa = store.arquivo(c, "conversas/validar.json");
      const anterior = lerJson<Mensagem[]>(arqConversa);
      const mensagens: Mensagem[] = entrada?.feedback && anterior?.length
        ? [...anterior, { role: "user", content: entrada.feedback }]
        : [{ role: "user", content: "Formulário aplicado. Leia a ficha, escreva de 10 a 30 cenários cobrindo cada pergunta respondida, rode com rodar_cenarios e resuma o relatório em até 5 linhas." }];
      // Rodadas de ferramenta limitadas: listar_campos, cenarios_base, ler_ficha, rodar_cenarios e uma correção.
      const { conversa } = await deps.runAgent({ agente: "validador", mensagens, tools: t.validador, maxIteracoes: MAX_RODADAS_VALIDADOR });
      gravar(arqConversa, conversa ?? mensagens);
      resumos(c, "validar", "cenários escritos pelo agente validador");
    }
    const rel = store.relatorio(c);
    if (rel) resumos(c, "validar", undefined, `${rel.length} cenários, ${rel.filter((r) => r.passou).length} passando`);
  },

  async homologar(c, deps) {
    const run = lerRun(c)!;
    if (run.gate) return;
    const ficha = store.ficha(c);
    const pend = ficha ? perguntasDe(ficha).filter(semResposta) : [];
    const rel = store.relatorio(c) ?? [];
    const ok = rel.filter((r) => r.passou).length;
    const resumo = `${pend.length} pendências, cenários ${ok}/${rel.length}, diff em diff.md`;
    resumos(c, "homologar", resumo);
    await abrirGate(c, run, {
      para: "implantador",
      tipo: "homologacao",
      etapa: "homologar",
      detalhe: resumo,
      resumo: `Formulário de ${run.titulo} (${c.cidade}) pronto para revisão: ${resumo}`,
      instrucao:
        `Revise diff.md, pendencias.md e o relatório de cenários. aprovar = liberar para homologação com a prefeitura; ` +
        `ajustar "<pergunta_id>=<valor>" = corrigir respostas e refazer formulário e cenários; ajustar com texto livre = pedir mais cenários ao validador; rejeitar = parar o processo.`,
      contexto: {
        diff: store.arquivo(c, "diff.md"),
        relatorio: store.arquivo(c, "relatorio.json"),
        pendencias: pend.map((q) => ({ id: q.id, texto: q.texto.slice(0, 120), pendencia: q.pendencia ?? null })),
        cenarios: `${ok}/${rel.length}`,
      },
    }, deps);
  },
};

// ---------------------------------------------------------------- coletor e extrator

/** Histórico em disco → mensagens do LLM: tolera `autor`, junta papéis repetidos, começa pelo usuário. */
export function historicoParaMensagens(h: EntradaHistorico[]): Mensagem[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const e of h) {
    const content = e.autor === "implantador" ? `(mensagem do implantador, enviada por ele) ${e.content}` : e.content;
    const last = out[out.length - 1];
    if (last && last.role === e.role) last.content += `\n\n${content}`;
    else out.push({ role: e.role, content });
  }
  while (out.length && out[0].role === "assistant") out.shift();
  return out;
}

async function rodarColetor(c: Contexto, deps: Dependencias & { runAgent: RunAgentFn }, entrada: Entrada) {
  const estado = store.estado(c);
  let limparNota = false;
  const partes: string[] = [];
  const f = store.ficha(c);
  const run = lerRun(c);
  partes.push(`Prefeitura: ${nomeCidade(c.cidade) || c.cidade}. Processo: ${run?.titulo ?? c.processo}. Perguntas abertas: ${f ? perguntasAbertas(f).length : "?"}.`);
  if (estado.nota_pendente_desde) {
    const desde = estado.nota_pendente_desde;
    const trocas = estado.historico.filter((h) => h.autor === "implantador" && h.em >= desde);
    if (trocas.length) partes.push(`Enquanto o agente estava pausado, o implantador trocou estas mensagens com o analista: ${trocas.map((t) => `"${t.content}"`).join(" / ")}. Continue a ficha a partir daí, sem repetir perguntas.`);
    limparNota = true;
  }
  if (entrada.mensagem) partes.push(`Mensagem do analista: ${entrada.mensagem}`);
  if (entrada.anexo) partes.push(`O analista enviou um anexo (${entrada.anexo.nome ?? entrada.anexo.tipo}). Chame pedir_extracao antes de responder.`);
  if (!estado.historico.some((h) => h.role === "assistant")) partes.push("Esta é a primeira interação: apresente-se e envie o primeiro lote de perguntas prioritárias.");
  if (entrada.feedback) partes.push(entrada.feedback);
  store.atualizarEstado(c, (e) => {
    if (limparNota) delete e.nota_pendente_desde;
    e.historico.push({ role: "user", content: partes.join("\n"), em: agora() });
  });

  if (deps.semLLM) return; // sem LLM só registra a mensagem

  const { ferramentas } = await import("../agents/tools.js");
  const anexos = [...(deps.anexos ?? []), ...(entrada.anexo && !deps.anexos?.includes(entrada.anexo) ? [entrada.anexo] : [])];
  const t = ferramentas(c, deps.canal ?? { enviar: async () => {} }, anexos, {
    aoExtrair: (anexo, abertas, ler) => lerAnexo(c, deps, anexo, abertas, ler),
  });
  const mensagens = historicoParaMensagens(store.estado(c).historico.slice(-30));
  const { texto } = await deps.runAgent({ agente: "coletor", mensagens, tools: t.coletor });
  // Append atômico: as ferramentas e o canal mexeram no estado durante a execução.
  if (texto) store.anexarHistorico(c, { role: "assistant", content: texto });
}

/** Sub-etapa extrair: lê o anexo, avalia os critérios do extrator, tenta de novo ou abre gate. */
export async function lerAnexo(
  c: Contexto,
  deps: Dependencias,
  anexo: Anexo,
  abertas: Pergunta[],
  ler: (a: Anexo, q: Pergunta[]) => Promise<SaidaExtrator>,
): Promise<SaidaExtrator> {
  const def = pipelineDoProcesso(c);
  const ed = def.etapas.find((e) => e.sub_etapa_de === "coletar" && e.slug === "extrair") ?? def.etapas.find((e) => e.sub_etapa_de);
  if (!ed) return ler(anexo, abertas);
  let run = lerRun(c)!;
  const er = etapaRun(run, ed.slug);
  er.status = "executando";
  er.iniciada_em ??= agora();
  er.concluida_em = null;
  er.tentativas++;
  er.retentativas = {};
  er.entrada_resumo = `anexo ${anexo.nome ?? anexo.tipo}, ${abertas.length} perguntas abertas`;
  salvarRun(c, run);

  let saida = await ler(anexo, abertas);
  for (;;) {
    gravar(store.arquivo(c, "extracao.json"), saida);
    run = lerRun(c)!;
    const parada = await avaliarEtapa(c, run, ed, deps, saida);
    const e2 = etapaRun(run, ed.slug);
    e2.saida_resumo = `${saida.candidatos.length} candidatos${saida.motivo ? ` (${saida.motivo})` : ""}`;
    if (!parada || parada.avaliacao.resultado !== "falhou") {
      e2.status = "concluida";
      e2.concluida_em = agora();
      salvarRun(c, run);
      return saida;
    }
    const usadas = (e2.retentativas ??= {})[parada.criterio.nome] ?? 0;
    if (usadas < parada.criterio.tentativas) {
      e2.retentativas[parada.criterio.nome] = usadas + 1;
      e2.tentativas++;
      salvarRun(c, run);
      saida = await ler(anexo, abertas);
      continue;
    }
    // Esgotou: descarta candidatos sem trecho/confiança e encaminha conforme ao_falhar.
    const bons = saida.candidatos.filter((k) => k.trecho?.trim() && typeof k.confianca === "number" && k.confianca >= 0 && k.confianca <= 1);
    e2.status = "falhou";
    salvarRun(c, run);
    if (parada.criterio.ao_falhar === "parar") { run.status = "parado"; salvarRun(c, run); }
    else await abrirGate(c, run, { para: parada.criterio.ao_falhar, tipo: "falha_criterio", etapa: ed.slug, criterio: parada.criterio.nome, detalhe: parada.avaliacao.detalhe, tentativas: e2.tentativas }, deps);
    const fora = saida.candidatos.filter((k) => !bons.includes(k)).map((k) => ({ ...k, motivo: "sem trecho ou confiança" }));
    return { candidatos: bons, descartados: [...(saida.descartados ?? []), ...fora], motivo: `candidatos sem trecho descartados; ${parada.avaliacao.detalhe}` };
  }
}

// ---------------------------------------------------------------- modo humano

/** O implantador assume a conversa: o agente para de responder até devolverConversa. */
export function assumirConversa(c: Contexto) {
  if (store.estado(c).modo === "humano") return store.estado(c);
  const e = store.atualizarEstado(c, (x) => {
    x.modo = "humano";
    (x.intervencoes ??= []).push({ em: agora(), tipo: "assumir", acao: "assumir", por: "implantador" });
  });
  const run = lerRun(c);
  if (run) { run.metricas.intervencoes_humanas = (run.metricas.intervencoes_humanas ?? 0) + 1; salvarRun(c, run); }
  return e;
}

/** Devolve a conversa ao agente; a próxima mensagem leva a nota do que o implantador conversou. */
export function devolverConversa(c: Contexto) {
  if (store.estado(c).modo !== "humano") return store.estado(c);
  return store.atualizarEstado(c, (e) => {
    const assumiu = [...(e.intervencoes ?? [])].reverse().find((i) => (i.tipo ?? i.acao) === "assumir");
    e.modo = "agente";
    (e.intervencoes ??= []).push({ em: agora(), tipo: "devolver", acao: "devolver", por: "implantador" });
    if (assumiu) e.nota_pendente_desde = assumiu.em;
  });
}

/** Catálogo exposto para checagem: todo critério do pipeline.json precisa de implementação. */
export function criteriosSemImplementacao(def: PipelineDef): string[] {
  return def.etapas.flatMap((e) => e.criterios.map((k) => k.nome)).filter((n) => !(n in CRITERIOS));
}
