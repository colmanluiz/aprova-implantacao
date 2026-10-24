// Ledger do processo: snapshot + run.json + pendencias.md em data/<cidade>/<processo>/.
import fs from "node:fs";
import path from "node:path";
import { store, lerJson, gravar, perguntasDe, semResposta, type Contexto } from "../agents/store.js";
import { carregarPipeline, PIPELINE_JSON } from "./definicao.js";
import type { PipelineDef, Run, EtapaRun, Metricas, Gate } from "./tipos.js";

export const agora = () => new Date().toISOString();

const arqRun = (c: Contexto) => store.arquivo(c, "run.json");
const arqSnapPipeline = (c: Contexto) => store.arquivo(c, "snapshot/pipeline.json");

export function lerRun(c: Contexto): Run | undefined {
  return lerJson<Run>(arqRun(c));
}

export function salvarRun(c: Contexto, run: Run) {
  run.atualizado_em = agora();
  run.metricas = calcularMetricas(c, run);
  gravar(arqRun(c), run);
  sincronizarEstadoLegado(c, run);
}

/** Copia template e pipeline.json para snapshot/; daqui em diante o processo só lê o snapshot. */
export function criarSnapshot(c: Contexto, pipelineArquivo = PIPELINE_JSON) {
  const dir = store.arquivo(c, "snapshot");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(c.template, path.join(dir, "template.json"));
  fs.copyFileSync(pipelineArquivo, path.join(dir, "pipeline.json"));
}

/** Definição do pipeline congelada no início do processo. */
export function pipelineDoProcesso(c: Contexto): PipelineDef {
  const snap = arqSnapPipeline(c);
  return carregarPipeline(fs.existsSync(snap) ? snap : PIPELINE_JSON);
}

export function novoRun(c: Contexto, def: PipelineDef, titulo: string, opcoes?: Run["opcoes"]): Run {
  const t = agora();
  return {
    processo: c.processo,
    cidade: c.cidade,
    titulo,
    iniciado_em: t,
    atualizado_em: t,
    etapa_atual: def.etapas[0].slug,
    status: "executando",
    etapas: def.etapas.map((e): EtapaRun => ({
      slug: e.slug,
      nome: e.nome,
      tipo: e.tipo,
      status: "pendente",
      iniciada_em: null,
      concluida_em: null,
      tentativas: 0,
      criterios: e.criterios.map((k) => ({ nome: k.nome, resultado: "nao_avaliado", detalhe: "", avaliado_em: null })),
      entrada_resumo: "",
      saida_resumo: "",
    })),
    gate: null,
    metricas: metricasZeradas(),
    decisoes: [],
    gates_abertos: [],
    criterios_aprovados: [],
    rejeicoes_schema: {},
    ...(opcoes ? { opcoes } : {}),
    ...(seedId(titulo) ? { seed_id: seedId(titulo) } : {}),
  };
}

/** "vale-verde" → "Vale Verde"; "sao-jose-dos-campos" → "Sao Jose dos Campos". Vazio se não houver cidade. */
export function nomeCidade(slug: string | undefined): string {
  if (!slug?.trim()) return "";
  const menores = new Set(["da", "das", "de", "do", "dos", "e"]);
  return slug.split(/[-_\s]+/).filter(Boolean)
    .map((w, i) => (i > 0 && menores.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Liga o processo ao seed do painel pelo título (fixtures/seed/processos.json). */
export function seedId(titulo: string, arquivo = "fixtures/seed/processos.json"): string | undefined {
  try {
    const seed = JSON.parse(fs.readFileSync(arquivo, "utf8")) as { processos: { id: string; processo: string }[] };
    return seed.processos.find((p) => p.processo === titulo)?.id;
  } catch { return undefined; }
}

export function etapaRun(run: Run, slug: string): EtapaRun {
  const e = run.etapas.find((x) => x.slug === slug);
  if (!e) throw new Error(`etapa ${slug} não está no run`);
  return e;
}

export function metricasZeradas(): Metricas {
  return {
    mensagens_enviadas: 0, mensagens_recebidas: 0, perguntas_feitas: 0, respondidas_por_mensagem: 0, respondidas_por_anexo: 0,
    pendencias_abertas: 0, cenarios_rodados: 0, cenarios_passando: 0, horas_reuniao_evitadas: 0,
  };
}

/**
 * Métricas derivadas do disco. mensagens_recebidas e intervencoes_humanas são contadores do run.
 * horas_reuniao_evitadas: 1,0 quando o processo chega a "aplicar" sem nenhum gate aberto para o analista;
 * 0,67 quando houve gate para o analista (equivale a ~20 min de ligação em vez de 1 h de reunião); 0 antes de "aplicar".
 */
export function calcularMetricas(c: Contexto, run: Run): Metricas {
  const m: Metricas = { ...metricasZeradas(), ...run.metricas };
  const estado = store.estado(c);
  m.mensagens_enviadas = estado.mensagens_enviadas;
  // Perguntas feitas = perguntas distintas da ficha que receberam registro vindo da conversa
  // (resposta ou pendência). Não conta pontos de interrogação nem o que o analisador/implantador resolveu.
  m.perguntas_feitas = new Set((estado.registros ?? [])
    .filter((r) => !/analisador|implantador/i.test(r.origem))
    .map((r) => r.pergunta_id)).size;
  const ficha = store.ficha(c);
  if (ficha) {
    const qs = perguntasDe(ficha);
    const respondidas = qs.filter((q) => !semResposta(q));
    m.respondidas_por_anexo = respondidas.filter((q) => /anexo|extrator/i.test(q.origem ?? "")).length;
    m.respondidas_por_mensagem = respondidas.filter((q) => !/anexo|extrator|implantador|template/i.test(q.origem ?? "")).length;
    m.pendencias_abertas = qs.filter(semResposta).length;
  }
  const rel = store.relatorio(c);
  if (rel) { m.cenarios_rodados = rel.length; m.cenarios_passando = rel.filter((r) => r.passou).length; }
  const gatesAnalista = (run.gates_abertos ?? []).filter((g) => g.para === "analista").length;
  m.horas_reuniao_evitadas = run.aplicar_alcancado_em ? (gatesAnalista === 0 ? 1 : 0.67) : 0;
  return m;
}

/** Mantém estado.json.etapa (enum antigo) coerente, porque canal e painel ainda leem esse campo. */
function sincronizarEstadoLegado(c: Contexto, run: Run) {
  const e = store.estado(c);
  const atual = run.etapa_atual;
  const st = etapaRun(run, atual).status;
  const legado =
    run.status === "concluido" ? "pronto_para_homologacao"
    : atual === "analisar" ? "analisado"
    : atual === "coletar" ? (st === "aguardando" ? "aguardando_prefeitura" : "coletando")
    : atual === "aplicar" ? "ficha_fechada"
    : atual === "validar" ? "validando"
    : "pronto_para_homologacao";
  if (e.etapa !== legado) { e.etapa = legado; store.salvarEstado(c, e); }
}

/** Acrescenta uma pendência legível em pendencias.md (gates do implantador). */
export function anotarPendencia(c: Contexto, gate: Gate) {
  const p = store.arquivo(c, "pendencias.md");
  const cab = fs.existsSync(p) ? "" : `# Pendências do implantador: ${c.processo} (${c.cidade})\n\n`;
  const linha = `- [ ] ${gate.aberto_em} · etapa **${gate.etapa}**${gate.criterio ? ` · critério "${gate.criterio}"` : ""}: ${gate.resumo}\n  - ${gate.instrucao.replace(/\n/g, " ")}\n  - resolver: \`npm run gate -- ${c.cidade} ${c.processo} <aprovar|ajustar|rejeitar> [texto]\`\n`;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, cab + linha);
}

/** Rejeição de schema consecutiva por pergunta (usada pelo critério de coletar). */
export function registrarRejeicao(c: Contexto, perguntaId: string, erro: string) {
  const run = lerRun(c);
  if (!run) return;
  const r = (run.rejeicoes_schema ??= {});
  r[perguntaId] = { n: (r[perguntaId]?.n ?? 0) + 1, erro };
  salvarRun(c, run);
}

export function limparRejeicao(c: Contexto, perguntaId: string) {
  const run = lerRun(c);
  if (!run?.rejeicoes_schema?.[perguntaId]) return;
  delete run.rejeicoes_schema[perguntaId];
  salvarRun(c, run);
}
