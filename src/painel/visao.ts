// Montagem do modelo de visão do painel do implantador.
// Lê fixtures/seed/processos.json e sobrepõe o que existir em data/<cidade>/<processo>/.
// Tudo é opcional e lido a cada chamada (os arquivos estão sendo escritos pelo pipeline enquanto o painel roda).
import fs from "node:fs";
import path from "node:path";

// ---------- contrato run.json (escrito pelo pipeline) ----------

export type StatusProcesso = "nao_iniciado" | "executando" | "aguardando_prefeitura" | "aguardando_implantador" | "concluido" | "parado";
export type StatusEtapa = "pendente" | "executando" | "aguardando" | "concluida" | "falhou";
export type ResultadoCriterio = "passou" | "falhou" | "aguardando" | "nao_avaliado";

export type Criterio = { nome: string; resultado: ResultadoCriterio; detalhe?: string; avaliado_em?: string | null };
export type EtapaRun = {
  slug: string; nome: string; tipo?: "codigo" | "agente"; status: StatusEtapa;
  iniciada_em?: string | null; concluida_em?: string | null; tentativas?: number;
  criterios?: Criterio[]; entrada_resumo?: string; saida_resumo?: string;
};
export type Gate = {
  para: "analista" | "implantador"; tipo: "confirmacao" | "aprovacao";
  instrucao?: string; resumo?: string; acoes?: string[]; aberto_em?: string; contexto?: Record<string, unknown>;
};
export type MetricasRun = {
  mensagens_enviadas: number; mensagens_recebidas: number; perguntas_feitas: number;
  respondidas_por_mensagem: number; respondidas_por_anexo: number; pendencias_abertas: number;
  cenarios_rodados: number; cenarios_passando: number; horas_reuniao_evitadas: number;
  intervencoes_humanas: number;
};
export type Run = {
  processo: string; cidade: string; titulo?: string; iniciado_em?: string; atualizado_em?: string;
  etapa_atual?: string; status?: StatusProcesso; etapas?: EtapaRun[]; gate?: Gate | null; metricas?: Partial<MetricasRun>;
};

type Registro = { em: string; pergunta_id?: string; confianca?: number; origem?: string; resumo?: string };
type Mensagem = { role: "user" | "assistant"; content: string; em?: string; autor?: string };
export type Intervencao = { tipo: string; em: string; por?: string; motivo?: string };
export type ItemOutbox = { id: string; texto: string; autor: string; em: string; enviado: boolean };
type EstadoArq = { etapa?: string; historico?: Mensagem[]; mensagens_enviadas?: number; perguntas_feitas?: number; atualizado_em?: string; registros?: Registro[];
  modo?: "agente" | "humano"; intervencoes?: Intervencao[] };
type PerguntaFicha = { id: string; grupo?: string; texto?: string; resposta?: unknown; confianca?: number; origem?: string | null; pendencia?: string };
type FichaArq = { processo?: string; grupos?: { nome: string; perguntas?: PerguntaFicha[] }[] };
type ResultadoArq = { id: string; descricao?: string; passou: boolean; falhas?: unknown[]; indeterminados?: string[] };

type SeedProcesso = { id: string; secretaria: string; processo: string; complexidade?: string; etapa?: string };
type Seed = { cidade: string; secretarias: string[]; processos: SeedProcesso[] };

// ---------- modelo de visão ----------

export const ETAPAS: { slug: string; nome: string }[] = [
  { slug: "analisar", nome: "Analisar template" },
  { slug: "coletar", nome: "Coletar com a prefeitura" },
  { slug: "extrair", nome: "Extrair anexos" },
  { slug: "aplicar", nome: "Aplicar no formulário" },
  { slug: "validar", nome: "Validar cenários" },
  { slug: "homologar", nome: "Homologar" },
];

export type ProcessoVisao = {
  id: string; processo: string; secretaria: string; complexidade: string | null;
  slug: string | null; tem_dados: boolean;
  status: StatusProcesso; etapa_atual: string | null;
  etapas: { slug: string; nome: string; status: StatusEtapa }[];
  gate: { para: string; tipo: string } | null;
  modo: "agente" | "humano";
  pronto: boolean;
  pendencias: number; perguntas_feitas: number; respondidas: number; mensagens: number;
  cenarios: string | null; horas_reuniao_evitadas: number;
  atualizado_em: string | null;
};

export type Visao = {
  cidade: string; cidade_slug: string; gerado_em: string; gate_disponivel: boolean;
  etapas: typeof ETAPAS;
  metricas: {
    processos_total: number; processos_prontos: number; processos_em_andamento: number; gates_abertos: number;
    horas_reuniao_evitadas: number; perguntas_feitas: number; perguntas_respondidas_sem_reuniao: number;
    respondidas_por_mensagem: number; respondidas_por_anexo: number; pendencias_abertas: number;
    cenarios_rodados: number; cenarios_passando: number; mensagens: number;
    intervencoes_humanas: number; conversas_assumidas: number;
    por_status: Record<StatusProcesso, number>;
  };
  secretarias: { nome: string; processos: ProcessoVisao[] }[];
};

export type Opcoes = { seedPath: string; dataDir: string; cidadeSlug?: string; gateDisponivel?: boolean };

// ---------- leitura defensiva ----------

export function lerJson<T>(p: string): T | undefined {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return undefined; }
}
export function lerTexto(p: string): string | undefined {
  try { return fs.readFileSync(p, "utf8"); } catch { return undefined; }
}
const existe = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const slugCidade = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pastas cujo nome não é o slug do título no seed. */
const APELIDOS: Record<string, string> = { alvara: "Alvará de Construção" };

// estado.etapa (store.ts) → índice da última etapa concluída em ETAPAS.
const ORDEM_ETAPA_ANTIGA: Record<string, number> = {
  nao_iniciado: -1, analisado: 0, coletando: 0, aguardando_prefeitura: 0, ficha_fechada: 2, aplicado: 3, validando: 3, pronto_para_homologacao: 4,
};

// ---------- derivação por processo ----------

type Pasta = { slug: string; dir: string; run?: Run; estado?: EstadoArq; ficha?: FichaArq; relatorio?: ResultadoArq[]; temForm: boolean; temDiff: boolean };

function lerPasta(dir: string, slug: string): Pasta {
  const rel = lerJson<ResultadoArq[]>(path.join(dir, "relatorio.json"));
  return {
    slug, dir,
    run: lerJson<Run>(path.join(dir, "run.json")),
    estado: lerJson<EstadoArq>(path.join(dir, "estado.json")),
    ficha: lerJson<FichaArq>(path.join(dir, "ficha.json")),
    relatorio: Array.isArray(rel) ? rel : undefined,
    temForm: existe(path.join(dir, "form.json")),
    temDiff: existe(path.join(dir, "diff.md")),
  };
}

const ehAnexo = (origem: string | null | undefined) => !!origem && /anexo|foto|pdf|planilha|imagem|extrator/i.test(origem);

export function progressoFicha(ficha?: FichaArq) {
  const grupos = (ficha?.grupos ?? []).map((g) => {
    const ps = g.perguntas ?? [];
    const respondidas = ps.filter((q) => q.resposta !== null && q.resposta !== undefined && (q.confianca ?? 0) >= 0.8);
    return {
      grupo: g.nome, total: ps.length, respondidas: respondidas.length,
      por_anexo: respondidas.filter((q) => ehAnexo(q.origem)).length,
      abertas: ps.length - respondidas.length,
      pendencias: ps.filter((q) => !!q.pendencia).length,
    };
  });
  return grupos;
}

function etapasDerivadas(p: Pasta): { etapas: StatusEtapa[]; status: StatusProcesso; atual: string | null } {
  const st: StatusEtapa[] = ETAPAS.map(() => "pendente");
  const ate = (n: number) => { for (let i = 0; i <= n && i < st.length; i++) st[i] = "concluida"; };
  const e = p.estado?.etapa;
  let status: StatusProcesso = "nao_iniciado";
  let nivel = -1;
  if (e && e in ORDEM_ETAPA_ANTIGA) nivel = ORDEM_ETAPA_ANTIGA[e];
  // Sem estado, infere pelo que já existe em disco.
  if (p.ficha) nivel = Math.max(nivel, 0);
  if (p.temForm || p.temDiff) nivel = Math.max(nivel, 3);
  if (p.relatorio?.length) nivel = Math.max(nivel, p.relatorio.every((r) => r.passou) ? 4 : 3);
  if (nivel >= 0) {
    ate(nivel);
    status = "executando";
    const prox = nivel + 1;
    if (prox < st.length) {
      const aguardaPrefeitura = e === "aguardando_prefeitura";
      st[prox] = aguardaPrefeitura || prox === 5 ? "aguardando" : "executando";
      if (aguardaPrefeitura) status = "aguardando_prefeitura";
      else if (prox === 5) status = "aguardando_implantador";
    } else status = "concluido";
  }
  const atualIdx = st.findIndex((s) => s !== "concluida");
  return { etapas: st, status, atual: nivel < 0 ? null : atualIdx < 0 ? ETAPAS[5].slug : ETAPAS[atualIdx].slug };
}

function metricasProcesso(p: Pasta): MetricasRun {
  const m = p.run?.metricas ?? {};
  const prog = progressoFicha(p.ficha);
  const resp = prog.reduce((a, g) => a + g.respondidas, 0);
  const anexo = prog.reduce((a, g) => a + g.por_anexo, 0);
  const pend = prog.reduce((a, g) => a + g.abertas, 0);
  const hist = p.estado?.historico ?? [];
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    mensagens_enviadas: num(m.mensagens_enviadas, p.estado?.mensagens_enviadas ?? hist.filter((h) => h.role === "assistant").length),
    mensagens_recebidas: num(m.mensagens_recebidas, hist.filter((h) => h.role === "user").length),
    perguntas_feitas: num(m.perguntas_feitas, p.estado?.perguntas_feitas ?? 0),
    respondidas_por_mensagem: num(m.respondidas_por_mensagem, resp - anexo),
    respondidas_por_anexo: num(m.respondidas_por_anexo, anexo),
    pendencias_abertas: num(m.pendencias_abertas, pend),
    cenarios_rodados: num(m.cenarios_rodados, p.relatorio?.length ?? 0),
    cenarios_passando: num(m.cenarios_passando, p.relatorio?.filter((r) => r.passou).length ?? 0),
    horas_reuniao_evitadas: num(m.horas_reuniao_evitadas, 0),
    intervencoes_humanas: num(m.intervencoes_humanas, (p.estado?.intervencoes ?? []).filter((i) => i?.tipo === "assumir").length),
  };
}

const STATUS_VALIDOS: StatusProcesso[] = ["nao_iniciado", "executando", "aguardando_prefeitura", "aguardando_implantador", "concluido", "parado"];
const STATUS_ETAPA_VALIDOS: StatusEtapa[] = ["pendente", "executando", "aguardando", "concluida", "falhou"];

type BaseProcesso = Pick<ProcessoVisao, "id" | "processo" | "secretaria" | "complexidade">;

function processoDePasta(base: BaseProcesso, p: Pasta): ProcessoVisao {
  const run = p.run;
  let etapas: ProcessoVisao["etapas"];
  let status: StatusProcesso;
  let atual: string | null;
  if (run && Array.isArray(run.etapas) && run.etapas.length) {
    etapas = ETAPAS.map((e) => {
      const r = run.etapas!.find((x) => x?.slug === e.slug);
      const s = r && STATUS_ETAPA_VALIDOS.includes(r.status) ? r.status : "pendente";
      return { slug: e.slug, nome: r?.nome || e.nome, status: s };
    });
    const d = etapasDerivadas(p);
    status = run.status && STATUS_VALIDOS.includes(run.status) ? run.status : d.status;
    atual = run.etapa_atual ?? d.atual;
  } else {
    const d = etapasDerivadas(p);
    etapas = ETAPAS.map((e, i) => ({ ...e, status: d.etapas[i] }));
    status = run?.status && STATUS_VALIDOS.includes(run.status) ? run.status : d.status;
    atual = run?.etapa_atual ?? d.atual;
  }
  const m = metricasProcesso(p);
  const gate = run?.gate && typeof run.gate === "object" ? { para: String(run.gate.para ?? "implantador"), tipo: String(run.gate.tipo ?? "aprovacao") } : null;
  const validar = etapas.find((e) => e.slug === "validar");
  return {
    ...base,
    slug: p.slug, tem_dados: true, status, etapa_atual: atual, etapas, gate, modo: p.estado?.modo === "humano" ? "humano" : "agente",
    pronto: status === "concluido" || validar?.status === "concluida",
    pendencias: m.pendencias_abertas, perguntas_feitas: m.perguntas_feitas,
    respondidas: m.respondidas_por_mensagem + m.respondidas_por_anexo,
    mensagens: m.mensagens_enviadas + m.mensagens_recebidas,
    cenarios: m.cenarios_rodados ? `${m.cenarios_passando}/${m.cenarios_rodados}` : null,
    horas_reuniao_evitadas: m.horas_reuniao_evitadas,
    atualizado_em: run?.atualizado_em ?? p.estado?.atualizado_em ?? null,
  };
}

function listarPastas(dataDir: string, cidadeSlug: string): Pasta[] {
  const raiz = path.join(dataDir, cidadeSlug);
  let nomes: string[] = [];
  try { nomes = fs.readdirSync(raiz, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort(); } catch { return []; }
  return nomes.map((n) => lerPasta(path.join(raiz, n), n));
}

function casar(seed: SeedProcesso[], p: Pasta, usados: Set<string>): SeedProcesso | undefined {
  const livres = seed.filter((s) => !usados.has(s.id));
  const alvos = [APELIDOS[p.slug], p.run?.titulo, p.ficha?.processo, p.slug].filter(Boolean).map((s) => chave(s as string));
  for (const a of alvos) { const s = livres.find((x) => chave(x.processo) === a); if (s) return s; }
  const k = chave(p.slug);
  return k.length >= 4 ? livres.find((x) => chave(x.processo).startsWith(k)) : undefined;
}

export function montarVisao(o: Opcoes): Visao {
  const seed = lerJson<Seed>(o.seedPath) ?? { cidade: o.cidadeSlug ?? "Cidade", secretarias: [], processos: [] };
  const cidadeSlug = o.cidadeSlug ?? slugCidade(seed.cidade);
  const pastas = listarPastas(o.dataDir, cidadeSlug);
  const usados = new Set<string>();
  const porId = new Map<string, Pasta>();
  const avulsas: Pasta[] = [];
  for (const p of pastas) {
    const s = casar(seed.processos, p, usados);
    if (s) { usados.add(s.id); porId.set(s.id, p); } else avulsas.push(p);
  }

  const vazio = (s: SeedProcesso): ProcessoVisao => ({
    id: s.id, processo: s.processo, secretaria: s.secretaria, complexidade: s.complexidade ?? null,
    slug: null, tem_dados: false, status: "nao_iniciado", etapa_atual: null,
    etapas: ETAPAS.map((e) => ({ ...e, status: "pendente" as StatusEtapa })), gate: null, modo: "agente", pronto: false,
    pendencias: 0, perguntas_feitas: 0, respondidas: 0, mensagens: 0, cenarios: null, horas_reuniao_evitadas: 0, atualizado_em: null,
  });

  const processos: ProcessoVisao[] = seed.processos.map((s) => {
    const p = porId.get(s.id);
    return p ? processoDePasta({ id: s.id, processo: s.processo, secretaria: s.secretaria, complexidade: s.complexidade ?? null }, p) : vazio(s);
  });
  // Pastas sem par livre no seed (ex.: alvara-demo ao lado de alvara): entram como linha extra na secretaria
  // do processo com o mesmo título (run.titulo ou ficha.processo), ou em "Outros".
  for (const p of avulsas) {
    const titulo = p.run?.titulo || p.ficha?.processo;
    const irmao = titulo ? seed.processos.find((x) => chave(x.processo) === chave(titulo)) : undefined;
    processos.push(processoDePasta({
      id: `x-${p.slug}`, processo: titulo ? `${titulo} · ${p.slug}` : p.slug,
      secretaria: irmao?.secretaria ?? "Outros", complexidade: irmao?.complexidade ?? null,
    }, p));
  }

  const nomesSec = [...seed.secretarias];
  for (const p of processos) if (!nomesSec.includes(p.secretaria)) nomesSec.push(p.secretaria);
  const secretarias = nomesSec.map((nome) => ({ nome, processos: processos.filter((p) => p.secretaria === nome) })).filter((s) => s.processos.length);

  const por_status = Object.fromEntries(STATUS_VALIDOS.map((s) => [s, 0])) as Record<StatusProcesso, number>;
  for (const p of processos) por_status[p.status]++;
  const somaM = (f: (m: MetricasRun) => number) => pastas.reduce((a, p) => a + f(metricasProcesso(p)), 0);
  const porMsg = somaM((m) => m.respondidas_por_mensagem);
  const porAnexo = somaM((m) => m.respondidas_por_anexo);

  return {
    cidade: seed.cidade, cidade_slug: cidadeSlug, gerado_em: new Date().toISOString(), gate_disponivel: !!o.gateDisponivel,
    etapas: ETAPAS,
    metricas: {
      processos_total: processos.length,
      processos_prontos: processos.filter((p) => p.pronto).length,
      processos_em_andamento: processos.filter((p) => p.tem_dados && !p.pronto).length,
      gates_abertos: processos.filter((p) => p.gate).length,
      horas_reuniao_evitadas: Math.round(somaM((m) => m.horas_reuniao_evitadas) * 10) / 10,
      perguntas_feitas: somaM((m) => m.perguntas_feitas),
      perguntas_respondidas_sem_reuniao: porMsg + porAnexo,
      respondidas_por_mensagem: porMsg, respondidas_por_anexo: porAnexo,
      pendencias_abertas: somaM((m) => m.pendencias_abertas),
      cenarios_rodados: somaM((m) => m.cenarios_rodados),
      cenarios_passando: somaM((m) => m.cenarios_passando),
      mensagens: somaM((m) => m.mensagens_enviadas + m.mensagens_recebidas),
      intervencoes_humanas: somaM((m) => m.intervencoes_humanas),
      conversas_assumidas: processos.filter((p) => p.modo === "humano").length,
      por_status,
    },
    secretarias,
  };
}

// ---------- detalhe ----------

export type Turno = Mensagem & { registros: Registro[] };

/** Cada turno do agente recebe os registros feitos desde o turno anterior do agente até ele (inclusive). */
export function conversaComRegistros(historico: Mensagem[] = [], registros: Registro[] = []) {
  const ts = (s?: string) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : NaN; };
  const regs = registros.filter((r) => Number.isFinite(ts(r.em))).sort((a, b) => ts(a.em) - ts(b.em));
  const usados = new Set<Registro>();
  let inicio = -Infinity;
  const turnos: Turno[] = historico.map((m) => {
    const t: Turno = { ...m, registros: [] };
    if (m.role === "assistant") {
      const fim = ts(m.em);
      if (Number.isFinite(fim)) {
        t.registros = regs.filter((r) => !usados.has(r) && ts(r.em) > inicio && ts(r.em) <= fim);
        t.registros.forEach((r) => usados.add(r));
        inicio = fim;
      }
    }
    return t;
  });
  return { turnos, registros_sem_turno: regs.filter((r) => !usados.has(r)) };
}

export const slugValido = (s: string) => /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(s);

export function montarDetalhe(o: Opcoes, cidade: string, slug: string) {
  if (!slugValido(cidade) || !slugValido(slug)) return undefined;
  const dir = path.join(o.dataDir, cidade, slug);
  try { if (!fs.statSync(dir).isDirectory()) return undefined; } catch { return undefined; }
  const p = lerPasta(dir, slug);
  const visao = montarVisao({ ...o, cidadeSlug: cidade });
  const linha = visao.secretarias.flatMap((s) => s.processos).find((x) => x.slug === slug);
  const conversa = conversaComRegistros(p.estado?.historico, p.estado?.registros);
  const outbox = lerOutbox(dir);
  // Item do outbox some da lista "enviando…" quando já está marcado como enviado ou já apareceu no histórico.
  const noHistorico = new Set((p.estado?.historico ?? []).filter((h) => h.autor === "implantador").map((h) => h.content.trim()));
  const outbox_pendente = outbox.filter((i) => !i.enviado && !noHistorico.has(String(i.texto).trim()));
  const intervencoes = (p.estado?.intervencoes ?? []).filter((i) => i && typeof i.em === "string");
  const ultimaAssumida = [...intervencoes].reverse().find((i) => i.tipo === "assumir");
  return {
    cidade, slug, gerado_em: new Date().toISOString(), gate_disponivel: !!o.gateDisponivel,
    processo: linha ?? null,
    run: p.run ?? null,
    estado: p.estado ? { etapa: p.estado.etapa ?? null, mensagens_enviadas: p.estado.mensagens_enviadas ?? 0, perguntas_feitas: p.estado.perguntas_feitas ?? 0, atualizado_em: p.estado.atualizado_em ?? null } : null,
    modo: p.estado?.modo === "humano" ? "humano" : "agente",
    assumida_em: p.estado?.modo === "humano" ? ultimaAssumida?.em ?? null : null,
    intervencoes,
    outbox_pendente,
    conversa: conversa.turnos,
    registros_sem_turno: conversa.registros_sem_turno,
    ficha_progresso: progressoFicha(p.ficha),
    ficha: p.ficha ?? null,
    relatorio: p.relatorio ?? null,
    metricas: metricasProcesso(p),
    diff: lerTexto(path.join(dir, "diff.md")) ?? null,
    pendencias: lerTexto(path.join(dir, "pendencias.md")) ?? null,
  };
}

export type Detalhe = NonNullable<ReturnType<typeof montarDetalhe>>;

// ---------- outbox (mensagens do implantador para o canal entregar) ----------

export function lerOutbox(dir: string): ItemOutbox[] {
  const v = lerJson<ItemOutbox[]>(path.join(dir, "outbox.json"));
  return Array.isArray(v) ? v.filter((i) => i && typeof i.texto === "string") : [];
}

/** Read-modify-write de data/<cidade>/<slug>/outbox.json. Grava em arquivo temporário e renomeia (o canal lê o mesmo arquivo). */
export function anexarOutbox(dir: string, texto: string, id: string, agora = new Date()): ItemOutbox {
  const item: ItemOutbox = { id, texto, autor: "implantador", em: agora.toISOString(), enviado: false };
  fs.mkdirSync(dir, { recursive: true });
  const arqv = path.join(dir, "outbox.json");
  const lista = lerOutbox(dir);
  lista.push(item);
  const tmp = `${arqv}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, arqv);
  return item;
}
