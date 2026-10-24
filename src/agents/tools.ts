// Ferramentas que os agentes podem chamar. Cada uma embrulha código de src/core/ ou o store.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { walk, label, ehEtapa } from "../core/formly.js";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { analisarTemplate } from "../core/template-analyzer.js";
import { aplicarFicha, gerarDiff } from "../core/patcher.js";
import { rodarCenarios, relatorioTexto } from "../core/scenario-runner.js";
import { validarResposta } from "../core/respostas.js";
import { store, perguntasAbertas, resumir, type Contexto } from "./store.js";
import { extrair, type Anexo, type SaidaExtrator } from "./extrator.js";
import { registrarRejeicao, limparRejeicao } from "../pipeline/run.js";
import type { AprovaTemplate, Cenario, Pergunta } from "../core/types.js";

/** Junta cenários pelo id: novo entra no fim, id repetido substitui no lugar. */
export function juntarCenarios(base: Cenario[], novos: Cenario[]): Cenario[] {
  const out = [...base];
  for (const c of novos) {
    const i = out.findIndex((x) => x.id === c.id);
    if (i >= 0) out[i] = c; else out.push(c);
  }
  return out;
}

export type CampoListado = {
  path: string; key: string; label: string | null; type: string | null; etapa: string | null;
  opcoes?: string[]; condicao_visivel: string | null; condicao_obrigatorio: string | null;
  /** campo calculado: expressão crua que o formulário usa para preencher o valor (nunca defina no model) */
  calculado_de?: string;
};

/** Campos com key do formulário, com a etapa (step) e as condições cruas. */
export function listarCampos(form: AprovaTemplate): CampoListado[] {
  const out: CampoListado[] = [];
  for (const { field, path, parents } of walk(form.form)) {
    if (!field.key) continue;
    const step = [...parents].reverse().find(ehEtapa);
    const to = field.templateOptions ?? {};
    const expReq = field.expressionProperties?.["templateOptions|||required"] ?? field.expressionProperties?.["templateOptions.required"];
    out.push({
      path,
      key: String(field.key),
      label: label(field) ?? null,
      type: field.type ?? null,
      etapa: step ? label(step) ?? null : null,
      ...(Array.isArray(to.options) && to.options.length ? { opcoes: to.options.map((o: any) => String(o.label ?? o.value)) } : {}),
      condicao_visivel: typeof field.hideExpression === "string" ? `oculto quando: ${field.hideExpression}` : field.hideExpression === true ? "sempre oculto" : null,
      condicao_obrigatorio: typeof expReq === "string" ? expReq : to.required ? "sempre" : null,
      ...(typeof field.expressionProperties?.[`model|||${field.key}`] === "string" ? { calculado_de: field.expressionProperties![`model|||${field.key}`].trim().slice(0, 300) } : {}),
    });
  }
  return out;
}

/** fixtures/cenarios/<slug>.cenarios.json para o template do processo, se existir. */
export function arquivoCenariosBase(ctx: Contexto): string | undefined {
  const base = path.basename(ctx.template).replace(/\.json$/, "");
  const nomes = [base, base.split(".")[0], base.split(/[.-]/)[0], ctx.processo];
  for (const n of nomes) {
    const p = path.join("fixtures/cenarios", `${n}.cenarios.json`);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export type Canal = { enviar: (texto: string) => Promise<void> };

/** Ganchos do pipeline: a sub-etapa extrair embrulha a leitura de anexos com os seus critérios. */
export type Ganchos = {
  aoExtrair?: (anexo: Anexo, abertas: Pergunta[], ler: (a: Anexo, q: Pergunta[]) => Promise<SaidaExtrator>) => Promise<SaidaExtrator>;
};

export function ferramentas(ctx: Contexto, canal: Canal, anexosPendentes: Anexo[] = [], ganchos: Ganchos = {}) {
  const analisar_template = betaZodTool({
    name: "analisar_template",
    description: "Extrai mecanicamente os pontos de parametrização do template Formly e cria a ficha de perguntas do processo.",
    inputSchema: z.object({}),
    run: async () => {
      const ficha = analisarTemplate(store.template(ctx), ctx.template);
      ficha.cidade = ctx.cidade;
      store.salvarFicha(ctx, ficha);
      return JSON.stringify(ficha);
    },
  });

  const ler_ficha = betaZodTool({
    name: "ler_ficha",
    description: "Lê a ficha atual do processo: perguntas, respostas, confiança, pendências.",
    inputSchema: z.object({ somente_abertas: z.boolean().optional() }),
    run: async ({ somente_abertas }) => {
      const f = store.ficha(ctx);
      if (!f) return "ficha inexistente; chame analisar_template";
      return JSON.stringify(somente_abertas ? perguntasAbertas(f) : f);
    },
  });

  const registrar_resposta = betaZodTool({
    name: "registrar_resposta",
    description:
      "Registra a resposta de uma pergunta da ficha, com origem e confiança (0 a 1). Use resposta null + pendencia quando o analista não sabe. " +
      "Formato por tipo: opcoes → lista de textos; dataset → {zona: {CHAVE: número}} com todas as chaves; documento → {exigido, sempre?}; " +
      "setor → {slug, setor?}; etapas → lista de títulos; taxa/card → {existe, nome?}; texto/residuo → texto; saida → objeto. " +
      "Se voltar schema_invalido, corrija o formato ou reformule a pergunta ao analista.",
    inputSchema: z.object({
      pergunta_id: z.string(),
      resposta: z.any().nullable(),
      origem: z.string(),
      confianca: z.number().min(0).max(1),
      pendencia: z.string().optional(),
    }),
    run: async (i) => {
      const f = store.ficha(ctx);
      if (!f) return "ficha inexistente";
      const q = f.grupos.flatMap((g) => g.perguntas).find((q) => q.id === i.pergunta_id);
      if (!q) return `pergunta ${i.pergunta_id} não existe`;
      const v = validarResposta(q, i.resposta);
      if (!v.ok) {
        registrarRejeicao(ctx, q.id, v.erro);
        return v.erro;
      }
      // Candidato de anexo que precisa de confirmação: fica abaixo do limiar até o analista confirmar por mensagem.
      let confianca = i.confianca;
      const pendentes = store.aConfirmar(ctx);
      let aviso = "";
      if (pendentes.includes(q.id)) {
        if (/mensagem/i.test(i.origem)) store.salvarAConfirmar(ctx, pendentes.filter((x) => x !== q.id));
        else if (confianca > 0.79) { confianca = 0.79; aviso = " (confiança limitada a 0,79: confirme com o analista e registre de novo com origem mensagem)"; }
      }
      Object.assign(q, { resposta: v.valor, origem: i.origem, confianca, pendencia: i.pendencia });
      store.salvarFicha(ctx, f);
      limparRejeicao(ctx, q.id);
      store.registrar(ctx, {
        pergunta_id: q.id, confianca, origem: i.origem,
        resumo: v.valor === null ? `pendência: ${i.pendencia ?? "sem resposta"}` : resumir(v.valor),
      });
      return `ok${aviso}; abertas restantes: ${perguntasAbertas(f).length}`;
    },
  });

  const enviar_mensagem = betaZodTool({
    name: "enviar_mensagem",
    description: "Envia uma mensagem curta ao analista da prefeitura pelo canal (WhatsApp/Telegram). Máximo 5 perguntas por mensagem.",
    inputSchema: z.object({ texto: z.string() }),
    run: async ({ texto }) => {
      await canal.enviar(texto);
      store.atualizarEstado(ctx, (e) => {
        e.mensagens_enviadas++;
        e.perguntas_feitas += (texto.match(/\?/g) ?? []).length;
        e.historico.push({ role: "assistant", content: texto, em: new Date().toISOString() });
      });
      return "enviada";
    },
  });

  const pedir_extracao = betaZodTool({
    name: "pedir_extracao",
    description: "Manda o anexo recém-recebido para o Extrator ler, junto com as perguntas abertas. Devolve candidatos de resposta.",
    inputSchema: z.object({}),
    run: async () => {
      const f = store.ficha(ctx);
      const anexo = anexosPendentes.shift();
      if (!f || !anexo) return JSON.stringify({ candidatos: [], descartados: [], motivo: "sem anexo pendente" });
      const abertas = perguntasAbertas(f);
      const ler = (a: Anexo, q: Pergunta[]) => extrair(a, q);
      const saida = ganchos.aoExtrair ? await ganchos.aoExtrair(anexo, abertas, ler) : await ler(anexo, abertas);
      const em = new Date().toISOString();
      store.anexarDescartados(ctx, (saida.descartados ?? []).map((d) => ({ em, anexo: anexo.nome ?? anexo.tipo, ...d })));
      const confirmar = saida.candidatos.filter((k) => k.precisa_confirmacao).map((k) => k.pergunta_id);
      if (confirmar.length) store.salvarAConfirmar(ctx, [...store.aConfirmar(ctx), ...confirmar]);
      return JSON.stringify(saida);
    },
  });

  const aplicar_ficha = betaZodTool({
    name: "aplicar_ficha",
    description: "Gera o formulário parametrizado a partir da ficha respondida (determinístico). Devolve resumo das mudanças e pendências.",
    inputSchema: z.object({}),
    run: async () => {
      const f = store.ficha(ctx);
      if (!f) return "ficha inexistente";
      const { form, mudancas, pendencias } = aplicarFicha(store.template(ctx), f);
      store.salvarForm(ctx, form);
      return JSON.stringify({ mudancas, pendencias: pendencias.map((p) => ({ id: p.id, tipo: p.tipo, texto: p.texto, pendencia: p.pendencia })) });
    },
  });

  const gerar_diff = betaZodTool({
    name: "gerar_diff",
    description: "Gera e grava o diff.md legível para o implantador a partir das mudanças aplicadas.",
    inputSchema: z.object({}),
    run: async () => {
      const f = store.ficha(ctx);
      if (!f) return "ficha inexistente";
      const { mudancas, pendencias } = aplicarFicha(store.template(ctx), f);
      const md = gerarDiff(f, mudancas, pendencias);
      store.salvarDiff(ctx, md);
      return md;
    },
  });

  const rodar_cenarios = betaZodTool({
    name: "rodar_cenarios",
    description:
      "Roda cenários (model + expectativas) contra o formulário parametrizado. Junta pelo id ao conjunto já salvo " +
      "(id novo entra, id repetido substitui) e devolve o relatório do conjunto inteiro. Use substituir: true só para recomeçar do zero.",
    inputSchema: z.object({
      substituir: z.boolean().optional(),
      cenarios: z.array(z.object({
        id: z.string(),
        descricao: z.string(),
        model: z.record(z.string(), z.any()),
        espera: z.array(z.object({ campo: z.string(), visivel: z.boolean().optional(), obrigatorio: z.boolean().optional(), valor: z.any().optional() })),
      })),
    }),
    run: async ({ cenarios, substituir }) => {
      const form = store.form(ctx);
      if (!form) return "formulário inexistente; chame aplicar_ficha";
      const todos = juntarCenarios(substituir ? [] : store.cenarios(ctx) ?? [], cenarios as Cenario[]);
      store.salvarCenarios(ctx, todos);
      const res = rodarCenarios(form, todos);
      store.salvarRelatorio(ctx, res);
      return relatorioTexto(res);
    },
  });

  const listar_campos = betaZodTool({
    name: "listar_campos",
    description:
      "Lista os campos do formulário parametrizado: path, key, label, tipo, etapa, opções, as condições de visibilidade e obrigatoriedade " +
      "(expressão crua) e, para campos calculados, calculado_de (nunca defina esses no model; defina os insumos). Use antes de escrever cenários para preencher no model as pré-condições de cada campo esperado visível.",
    inputSchema: z.object({ etapa: z.string().optional() }),
    run: async ({ etapa }) => {
      const form = store.form(ctx);
      if (!form) return "formulário inexistente";
      const campos = listarCampos(form).filter((c) => !etapa || c.etapa === etapa);
      return JSON.stringify(campos);
    },
  });

  const cenarios_base = betaZodTool({
    name: "cenarios_base",
    description: "Devolve os cenários já comprovados para este template (ponto de partida). Rode-os e acrescente cobertura; não os apague.",
    inputSchema: z.object({}),
    run: async () => {
      const arq = arquivoCenariosBase(ctx);
      return arq ? fs.readFileSync(arq, "utf8") : "[]";
    },
  });

  const estado_processo = betaZodTool({
    name: "estado_processo",
    description: "Lê a etapa atual do processo e contadores.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify({ ...store.estado(ctx), historico: undefined, abertas: store.ficha(ctx) ? perguntasAbertas(store.ficha(ctx)!).length : null }),
  });

  return {
    orquestrador: [estado_processo, analisar_template, ler_ficha],
    coletor: [ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao],
    aplicador: [aplicar_ficha, gerar_diff],
    // O validador não fala com a prefeitura: confirmações viram gate para o analista, abertos pelo pipeline.
    validador: [listar_campos, cenarios_base, ler_ficha, rodar_cenarios],
    todas: [estado_processo, analisar_template, ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao, aplicar_ficha, gerar_diff, rodar_cenarios, listar_campos, cenarios_base],
  };
}
