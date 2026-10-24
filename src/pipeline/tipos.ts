// Tipos do pipeline validado: definição (INSTRUCTIONS/pipeline.json) e ledger (data/<cidade>/<processo>/run.json).
import { z } from "zod";

export const CriterioDef = z.object({
  nome: z.string().min(1),
  tentativas: z.number().int().min(0).default(1),
  ao_falhar: z.enum(["analista", "implantador", "parar"]),
  tipo: z.literal("juiz").optional(),
  rubrica: z.string().optional(),
});
export type CriterioDef = z.infer<typeof CriterioDef>;

export const EtapaDef = z.object({
  slug: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.enum(["codigo", "agente"]),
  agente: z.enum(["coletor", "extrator", "aplicador", "validador", "analisador-template"]).optional(),
  descricao: z.string().min(1),
  sub_etapa_de: z.string().optional(),
  gate: z.enum(["analista", "implantador"]).optional(),
  criterios: z.array(CriterioDef),
});
export type EtapaDef = z.infer<typeof EtapaDef>;

export const PipelineDef = z.object({
  versao: z.number(),
  limiar_confianca: z.number().default(0.8),
  etapas: z.array(EtapaDef).min(1),
});
export type PipelineDef = z.infer<typeof PipelineDef>;

export type Resultado = "passou" | "falhou" | "aguardando";
export type ResultadoRun = Resultado | "nao_avaliado";

export type CriterioRun = { nome: string; resultado: ResultadoRun; detalhe: string; avaliado_em: string | null };

export type StatusEtapa = "pendente" | "executando" | "aguardando" | "concluida" | "falhou";
export type StatusRun = "executando" | "aguardando_prefeitura" | "aguardando_implantador" | "concluido" | "parado";

export type EtapaRun = {
  slug: string;
  nome: string;
  tipo: "codigo" | "agente";
  status: StatusEtapa;
  iniciada_em: string | null;
  concluida_em: string | null;
  tentativas: number;
  criterios: CriterioRun[];
  entrada_resumo: string;
  saida_resumo: string;
  /** opcional: retentativas já consumidas por critério */
  retentativas?: Record<string, number>;
};

export type AcaoGate = "aprovar" | "ajustar" | "rejeitar";

export type Gate = {
  para: "analista" | "implantador";
  tipo: "falha_criterio" | "homologacao";
  etapa: string;
  criterio?: string;
  instrucao: string;
  resumo: string;
  acoes: AcaoGate[];
  aberto_em: string;
  contexto: Record<string, unknown>;
};

export type Metricas = {
  mensagens_enviadas: number;
  mensagens_recebidas: number;
  perguntas_feitas: number;
  respondidas_por_mensagem: number;
  respondidas_por_anexo: number;
  pendencias_abertas: number;
  cenarios_rodados: number;
  cenarios_passando: number;
  horas_reuniao_evitadas: number;
  /** opcional: quantas vezes o implantador assumiu a conversa */
  intervencoes_humanas?: number;
};

export type Decisao = { em: string; etapa: string; para: "analista" | "implantador"; acao: AcaoGate; texto?: string; criterio?: string };

export type Run = {
  processo: string;
  cidade: string;
  titulo: string;
  iniciado_em: string;
  atualizado_em: string;
  etapa_atual: string;
  status: StatusRun;
  etapas: EtapaRun[];
  gate: Gate | null;
  metricas: Metricas;
  // ---- campos opcionais (extensões do contrato) ----
  /** decisões tomadas em gates, em ordem */
  decisoes?: Decisao[];
  /** gates já abertos (histórico), para métricas */
  gates_abertos?: { em: string; para: "analista" | "implantador"; etapa: string; criterio?: string }[];
  /** critérios aprovados manualmente: "etapa:criterio" */
  criterios_aprovados?: string[];
  /** rejeições de schema consecutivas por pergunta */
  rejeicoes_schema?: Record<string, { n: number; erro: string }>;
  /** id do processo em fixtures/seed/processos.json (ex.: "p001") */
  seed_id?: string;
  /** como o processo roda (sem LLM usa cenários fixos) */
  opcoes?: { sem_llm?: boolean; cenarios?: string };
  /** horário em que a etapa aplicar foi alcançada */
  aplicar_alcancado_em?: string;
};
