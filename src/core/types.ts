// Tipos compartilhados entre código clássico e agentes.

export type FormlyField = {
  key?: string;
  type?: string;
  wrappers?: string[];
  className?: string;
  templateOptions?: Record<string, any>;
  expressionProperties?: Record<string, string>;
  hideExpression?: string | boolean;
  validators?: Record<string, any>;
  fieldGroup?: FormlyField[];
  fieldArray?: FormlyField;
  defaultValue?: unknown;
  [extra: string]: unknown;
};

export type AprovaTemplate = {
  _id?: string;
  city_id?: number;
  form: FormlyField[];
  step?: unknown;
  config: Record<string, any> & {
    title?: string;
    descricao?: string;
    sigla?: string;
    cidade?: string;
    tenance?: string;
    templates?: any[];
    form_tramites?: any[];
    initialReceiverConfig?: { type?: string; possibleReceivers?: string[] };
    datasets?: Record<string, DatasetTabela>;
  };
  tramite?: { groupId: string; _id?: string }[];
  options?: Record<string, unknown>;
};

/** Tabela de dataset por chave (ex.: zoneamento → { Z1: { RECUO_FRONTAL: 4 } }). */
export type DatasetTabela = Record<string, Record<string, string | number>>;

export type TipoPonto =
  | "setor"
  | "opcoes"
  | "dataset"
  | "documento"
  | "texto"
  | "taxa"
  | "card"
  | "etapas"
  | "saida"
  | "residuo";

export type Prioridade = "bloqueia" | "ajusta" | "cosmetica";

export type Pergunta = {
  id: string;
  tipo: TipoPonto;
  grupo: string;
  texto: string;
  /** O que o template assume hoje (mostrado ao analista como ponto de partida). */
  assume: unknown;
  /** Chaves/caminhos do template que a resposta altera. */
  afeta: string[];
  prioridade: Prioridade;
  aceita_anexo: boolean;
  resposta: unknown | null;
  confianca: number;
  origem: string | null;
  pendencia?: string;
};

export type Ficha = {
  processo: string;
  template: string;
  cidade?: string;
  criada_em: string;
  grupos: { nome: string; perguntas: Pergunta[] }[];
};

export type Espera = {
  campo: string;
  visivel?: boolean;
  obrigatorio?: boolean;
  valor?: unknown;
};

export type Cenario = {
  id: string;
  descricao: string;
  model: Record<string, any>;
  espera: Espera[];
};

export type EstadoCampo = {
  key: string;
  path: string;
  type?: string;
  label?: string;
  visivel: boolean;
  obrigatorio: boolean;
  valor?: unknown;
  indeterminado?: string[];
};

export type ResultadoCenario = {
  id: string;
  descricao: string;
  passou: boolean;
  falhas: { campo: string; esperado: Partial<Espera>; obtido: Partial<EstadoCampo> | "campo_inexistente" }[];
  indeterminados: string[];
};

export type Mudanca = {
  /** id da pergunta da ficha ou do item do plano de ação */
  pergunta_id: string;
  tipo: TipoPonto | "plano";
  alvo: string;
  antes: unknown;
  depois: unknown;
  origem: string | null;
  confianca: number;
};

export type EtapaProcesso =
  | "nao_iniciado"
  | "analisado"
  | "coletando"
  | "aguardando_prefeitura"
  | "ficha_fechada"
  | "aplicado"
  | "validando"
  | "pronto_para_homologacao";
