// Extrator: anexo (imagem, PDF ou texto/planilha) + perguntas abertas → candidatos de resposta.
//
// O agente desconfia da própria leitura:
// - PDF/texto: primeiro obtém o texto do documento (no PDF, uma transcrição fiel numa chamada separada);
//   depois todo candidato precisa citar um `trecho` que exista literalmente nesse texto. Sem trecho, descarta.
// - Imagem: todo candidato nasce com confiança no máximo 0,7. Uma segunda chamada, enxuta, olha a imagem de novo
//   e responde "sim / não / ilegível" para cada valor lido. Só "sim" sobe para 0,9.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { instrucao } from "./instructions.js";
import type { Pergunta } from "../core/types.js";

// ---------- Esquemas ----------

/**
 * O que o modelo devolve (saída estruturada). O valor vem como texto JSON em `valor_json` porque a saída
 * estruturada não aceita "qualquer coisa" (lista, tabela por zona, objeto de documento) num mesmo campo.
 */
export const CandidatoBruto = z.object({
  pergunta_id: z.string(),
  valor_json: z.string().describe('Valor em JSON. Ex.: ["ZR1","ZR2"] ou {"ZR1":{"RECUO_FRONTAL":4}} ou {"exigido":true}'),
  trecho: z.string(),
  confianca: z.number().min(0).max(1),
  parcial: z.boolean().optional(),
});
export const SaidaModelo = z.object({
  candidatos: z.array(CandidatoBruto),
  motivo: z.string().optional(),
});

/** Candidato já com o valor decodificado (sem os campos que o código calcula). */
export const CandidatoModelo = z.object({
  pergunta_id: z.string(),
  valor: z.unknown(),
  trecho: z.string(),
  confianca: z.number().min(0).max(1),
  parcial: z.boolean().optional(),
});

/** Decodifica `valor_json`; se não for JSON válido, guarda o texto como veio. */
export function decodificar(c: z.infer<typeof CandidatoBruto>): z.infer<typeof CandidatoModelo> {
  const { valor_json, ...resto } = c;
  let valor: unknown = valor_json;
  try { valor = JSON.parse(valor_json); } catch { /* texto puro */ }
  return { ...resto, valor };
}

export const Fonte = z.enum(["pdf", "imagem", "texto"]);
export type Fonte = z.infer<typeof Fonte>;

export const Candidato = CandidatoModelo.extend({
  fonte: Fonte,
  /** PDF/texto: trecho conferido no documento. Imagem: segunda leitura respondeu "sim". */
  verificado: z.boolean().optional(),
  /** O Coletor deve confirmar com o analista antes de dar por respondida. */
  precisa_confirmacao: z.boolean().optional(),
  /** Para tabelas lidas de imagem: linhas (zonas) que a segunda leitura não confirmou. */
  conferir: z.array(z.string()).optional(),
});
export type Candidato = z.infer<typeof Candidato>;

export const Descartado = CandidatoModelo.extend({ fonte: Fonte, motivo: z.string() });
export type Descartado = z.infer<typeof Descartado>;

export const SaidaExtrator = z.object({
  candidatos: z.array(Candidato),
  descartados: z.array(Descartado),
  motivo: z.string().optional(),
});
export type SaidaExtrator = z.infer<typeof SaidaExtrator>;

export const Veredito = z.enum(["sim", "nao", "ilegivel"]);
export type Veredito = z.infer<typeof Veredito>;
export const SaidaVerificacao = z.object({
  vereditos: z.array(z.object({ item: z.number().int(), resposta: Veredito })),
});

export type Anexo =
  | { tipo: "imagem"; media_type: "image/jpeg" | "image/png" | "image/webp"; base64: string; nome?: string }
  | { tipo: "pdf"; base64: string; nome?: string }
  | { tipo: "texto"; texto: string; nome?: string };

/** Subconjunto do cliente Anthropic que o Extrator usa. Permite testar com um cliente falso, sem API. */
export type ClienteLLM = {
  messages: {
    parse(params: any): Promise<{ parsed_output?: unknown }>;
    create(params: any): Promise<{ content: { type: string; text?: string }[] }>;
  };
};

export const CONF_MAX_IMAGEM = 0.7;
export const CONF_IMAGEM_CONFIRMADA = 0.9;
export const CONF_IMAGEM_NAO_CONFIRMADA = 0.4;
export const MOTIVO_SEM_TRECHO = "trecho não encontrado no documento";

// ---------- Lógica pura (testada sem API) ----------

/** Normaliza para comparação: Unicode NFKC, minúsculas, espaços colapsados, aspas tipográficas simplificadas. */
export function normalizar(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’“”]/g, (c) => (c === "‘" || c === "’" ? "'" : '"'))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O trecho existe literalmente no documento? Ignora caixa e espaços.
 * Aceita reticências ("..." ou "…") como corte: cada pedaço precisa aparecer, na ordem.
 */
export function trechoNoDocumento(trecho: string, documento: string): boolean {
  const doc = normalizar(documento);
  const limpo = normalizar(trecho).replace(/^["'«]+|["'»]+$/g, "").trim();
  if (!limpo) return false;
  const pedacos = limpo.split(/\.{3,}|…/).map((p) => p.trim()).filter(Boolean);
  if (!pedacos.length) return false;
  let pos = 0;
  for (const p of pedacos) {
    const i = doc.indexOf(p, pos);
    if (i < 0) return false;
    pos = i + p.length;
  }
  return true;
}

/** Separa candidatos com trecho comprovado dos que serão descartados. */
export function aterrarEmTexto(
  candidatos: z.infer<typeof CandidatoModelo>[],
  documento: string,
  fonte: Fonte,
  idsValidos?: Set<string>,
): { candidatos: Candidato[]; descartados: Descartado[] } {
  const ok: Candidato[] = [];
  const fora: Descartado[] = [];
  for (const c of candidatos) {
    if (idsValidos && !idsValidos.has(c.pergunta_id)) fora.push({ ...c, fonte, motivo: "pergunta não está aberta na ficha" });
    else if (!trechoNoDocumento(c.trecho, documento)) fora.push({ ...c, fonte, motivo: MOTIVO_SEM_TRECHO });
    else ok.push({ ...c, fonte, verificado: true });
  }
  return { candidatos: ok, descartados: fora };
}

/** Candidato lido de imagem nasce com confiança limitada a 0,7. */
export function limitarConfiancaImagem(c: z.infer<typeof CandidatoModelo>): Candidato {
  return { ...c, fonte: "imagem", confianca: Math.min(c.confianca, CONF_MAX_IMAGEM), verificado: false };
}

/** Item de conferência: um valor simples, ou uma linha de tabela (zona) quando o valor é tabela. */
export type ItemConferencia = { item: number; candidato: number; linha?: string; pergunta: string; valor: unknown };

const ehTabela = (v: unknown): v is Record<string, Record<string, unknown>> =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.values(v).length > 0 && Object.values(v).every((x) => !!x && typeof x === "object" && !Array.isArray(x));

/** Monta a lista de perguntas da segunda leitura. Tabelas viram uma pergunta por linha. */
export function itensDeConferencia(candidatos: Candidato[], perguntas: Map<string, string>): ItemConferencia[] {
  const itens: ItemConferencia[] = [];
  candidatos.forEach((c, idx) => {
    const pergunta = perguntas.get(c.pergunta_id) ?? c.pergunta_id;
    if (ehTabela(c.valor)) {
      for (const [linha, valores] of Object.entries(c.valor)) itens.push({ item: itens.length + 1, candidato: idx, linha, pergunta, valor: valores });
    } else {
      itens.push({ item: itens.length + 1, candidato: idx, pergunta, valor: c.valor });
    }
  });
  return itens;
}

const normVeredito = (r: string | undefined): Veredito => {
  const n = (r ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return n === "sim" ? "sim" : n === "nao" ? "nao" : "ilegivel";
};

/**
 * Junta as respostas da segunda leitura aos candidatos.
 * Todos os itens "sim" → 0,9 e verificado. Qualquer "não"/"ilegível" (ou sem resposta) → 0,4 e precisa_confirmacao.
 */
export function mesclarVerificacao(
  candidatos: Candidato[],
  itens: ItemConferencia[],
  vereditos: { item: number; resposta: string }[],
): Candidato[] {
  const porItem = new Map(vereditos.map((v) => [v.item, normVeredito(v.resposta)]));
  return candidatos.map((c, idx) => {
    const meus = itens.filter((i) => i.candidato === idx);
    if (!meus.length) return { ...c, verificado: false, precisa_confirmacao: true, confianca: Math.min(c.confianca, CONF_IMAGEM_NAO_CONFIRMADA) };
    const falhos = meus.filter((i) => porItem.get(i.item) !== "sim");
    if (!falhos.length) return { ...c, confianca: CONF_IMAGEM_CONFIRMADA, verificado: true, precisa_confirmacao: false };
    const conferir = falhos.map((i) => i.linha).filter((l): l is string => !!l);
    return {
      ...c,
      confianca: CONF_IMAGEM_NAO_CONFIRMADA,
      verificado: false,
      precisa_confirmacao: true,
      ...(conferir.length ? { conferir } : {}),
    };
  });
}

// ---------- Chamadas ao modelo ----------

async function clientePadrao(): Promise<ClienteLLM> {
  return (await import("./client.js")).client as unknown as ClienteLLM;
}
async function modeloPadrao(): Promise<string> {
  return (await import("./client.js")).MODEL;
}

const SISTEMA_TRANSCRICAO =
  "Você transcreve documentos de prefeitura. Copie o texto exatamente como está, sem resumir, corrigir ou completar. " +
  "Marque o início de cada página com '--- página N ---'. Escreva tabelas uma linha por vez, colunas separadas por ' | '. " +
  "Onde não for possível ler, escreva [ilegível].";

const SISTEMA_CONFERENCIA =
  "Você confere leituras feitas de uma imagem. Para cada item, olhe a imagem e responda apenas: " +
  "'sim' se o valor está na imagem exatamente assim, 'nao' se a imagem mostra outro valor ou não mostra esse dado, " +
  "'ilegivel' se não dá para ler com segurança. Não explique.";

async function transcreverPdf(cli: ClienteLLM, model: string, base64: string): Promise<string> {
  const resp = await cli.messages.create({
    model,
    max_tokens: 16000,
    system: SISTEMA_TRANSCRICAO,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Transcreva fielmente este documento." },
      ],
    }],
  });
  return resp.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

async function propor(
  cli: ClienteLLM,
  model: string,
  bloco: Anthropic.ContentBlockParam,
  perguntas: unknown[],
  aviso: string,
): Promise<{ candidatos: z.infer<typeof CandidatoModelo>[]; motivo?: string }> {
  const resp = await cli.messages.parse({
    model,
    max_tokens: 16000,
    system: instrucao("extrator"),
    messages: [{
      role: "user",
      content: [bloco, { type: "text", text: `${aviso}\n\nPerguntas abertas da ficha:\n${JSON.stringify(perguntas, null, 2)}` }],
    }],
    output_config: { format: zodOutputFormat(SaidaModelo) },
  });
  const out = SaidaModelo.safeParse(resp.parsed_output);
  if (!out.success) return { candidatos: [], motivo: "sem saida" };
  return { candidatos: out.data.candidatos.map(decodificar), ...(out.data.motivo ? { motivo: out.data.motivo } : {}) };
}

async function conferirImagem(
  cli: ClienteLLM,
  model: string,
  anexo: Extract<Anexo, { tipo: "imagem" }>,
  itens: ItemConferencia[],
): Promise<{ item: number; resposta: string }[]> {
  const lista = itens
    .map((i) => `${i.item}. ${i.pergunta}${i.linha ? ` (linha ${i.linha})` : ""}: o valor ${JSON.stringify(i.valor)} está nesta imagem?`)
    .join("\n");
  const resp = await cli.messages.parse({
    model,
    max_tokens: 2000,
    system: SISTEMA_CONFERENCIA,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: anexo.media_type, data: anexo.base64 } },
        { type: "text", text: `Responda sim, nao ou ilegivel para cada item:\n${lista}` },
      ],
    }],
    output_config: { format: zodOutputFormat(SaidaVerificacao) },
  });
  const out = SaidaVerificacao.safeParse(resp.parsed_output);
  return out.success ? out.data.vereditos : [];
}

export async function extrair(
  anexo: Anexo,
  abertas: Pergunta[],
  deps: { cliente?: ClienteLLM; modelo?: string } = {},
): Promise<SaidaExtrator> {
  const cli = deps.cliente ?? (await clientePadrao());
  const model = deps.modelo ?? (await modeloPadrao());
  const perguntas = abertas.map((q) => ({ id: q.id, tipo: q.tipo, texto: q.texto, assume: q.assume }));
  const ids = new Set(abertas.map((q) => q.id));
  const textos = new Map(abertas.map((q) => [q.id, q.texto]));

  if (anexo.tipo === "imagem") {
    const bloco: Anthropic.ContentBlockParam = { type: "image", source: { type: "base64", media_type: anexo.media_type, data: anexo.base64 } };
    const saida = await propor(cli, model, bloco, perguntas, "Anexo: imagem. Em `trecho`, descreva onde na imagem está o valor (linha, coluna, título).");
    const descartados: Descartado[] = saida.candidatos
      .filter((c) => !ids.has(c.pergunta_id))
      .map((c) => ({ ...c, fonte: "imagem" as const, motivo: "pergunta não está aberta na ficha" }));
    let candidatos = saida.candidatos.filter((c) => ids.has(c.pergunta_id)).map(limitarConfiancaImagem);
    if (candidatos.length) {
      const itens = itensDeConferencia(candidatos, textos);
      let vereditos: { item: number; resposta: string }[] = [];
      try {
        vereditos = await conferirImagem(cli, model, anexo, itens);
      } catch {
        vereditos = []; // sem segunda leitura: tudo fica para o analista confirmar
      }
      candidatos = mesclarVerificacao(candidatos, itens, vereditos);
    }
    return { candidatos, descartados, ...(saida.motivo ? { motivo: saida.motivo } : {}) };
  }

  const fonte: Fonte = anexo.tipo === "pdf" ? "pdf" : "texto";
  const documento = anexo.tipo === "pdf" ? await transcreverPdf(cli, model, anexo.base64) : anexo.texto;
  if (!documento.trim()) return { candidatos: [], descartados: [], motivo: "ilegivel" };

  const bloco: Anthropic.ContentBlockParam = { type: "text", text: `Texto do anexo ${anexo.nome ?? ""}:\n${documento}` };
  const saida = await propor(cli, model, bloco, perguntas,
    "Anexo: documento em texto. Em `trecho`, copie literalmente a frase ou linha do texto acima de onde veio o valor. Candidato sem trecho literal será descartado.");
  const { candidatos, descartados } = aterrarEmTexto(saida.candidatos, documento, fonte, ids);
  return { candidatos, descartados, ...(saida.motivo ? { motivo: saida.motivo } : {}) };
}
