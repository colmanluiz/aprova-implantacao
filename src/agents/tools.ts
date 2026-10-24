// Ferramentas que os agentes podem chamar. Cada uma embrulha código de src/core/ ou o store.
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { analisarTemplate } from "../core/template-analyzer.js";
import { aplicarFicha, gerarDiff } from "../core/patcher.js";
import { rodarCenarios, relatorioTexto } from "../core/scenario-runner.js";
import { store, perguntasAbertas, type Contexto } from "./store.js";
import { extrair, type Anexo } from "./extrator.js";
import type { Cenario } from "../core/types.js";

export type Canal = { enviar: (texto: string) => Promise<void> };

export function ferramentas(ctx: Contexto, canal: Canal, anexosPendentes: Anexo[] = []) {
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
    description: "Registra a resposta de uma pergunta da ficha, com origem e confiança (0 a 1). Use pendencia quando o analista não sabe.",
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
      Object.assign(q, { resposta: i.resposta, origem: i.origem, confianca: i.confianca, pendencia: i.pendencia });
      store.salvarFicha(ctx, f);
      return `ok; abertas restantes: ${perguntasAbertas(f).length}`;
    },
  });

  const enviar_mensagem = betaZodTool({
    name: "enviar_mensagem",
    description: "Envia uma mensagem curta ao analista da prefeitura pelo canal (WhatsApp/Telegram). Máximo 5 perguntas por mensagem.",
    inputSchema: z.object({ texto: z.string() }),
    run: async ({ texto }) => {
      await canal.enviar(texto);
      const e = store.estado(ctx);
      e.mensagens_enviadas++;
      e.perguntas_feitas += (texto.match(/\?/g) ?? []).length;
      store.salvarEstado(ctx, e);
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
      if (!f || !anexo) return JSON.stringify({ candidatos: [], motivo: "sem anexo pendente" });
      return JSON.stringify(await extrair(anexo, perguntasAbertas(f)));
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
    description: "Roda cenários (model + expectativas) contra o formulário parametrizado no avaliador de expressões. Devolve relatório.",
    inputSchema: z.object({
      cenarios: z.array(z.object({
        id: z.string(),
        descricao: z.string(),
        model: z.record(z.string(), z.any()),
        espera: z.array(z.object({ campo: z.string(), visivel: z.boolean().optional(), obrigatorio: z.boolean().optional(), valor: z.any().optional() })),
      })),
    }),
    run: async ({ cenarios }) => {
      const form = store.form(ctx);
      if (!form) return "formulário inexistente; chame aplicar_ficha";
      store.salvarCenarios(ctx, cenarios as Cenario[]);
      const res = rodarCenarios(form, cenarios as Cenario[]);
      store.salvarRelatorio(ctx, res);
      return relatorioTexto(res);
    },
  });

  const estado_processo = betaZodTool({
    name: "estado_processo",
    description: "Lê a etapa atual do processo e contadores.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify({ ...store.estado(ctx), historico: undefined, abertas: store.ficha(ctx) ? perguntasAbertas(store.ficha(ctx)!).length : null }),
  });

  const avancar_etapa = betaZodTool({
    name: "avancar_etapa",
    description: "Muda a etapa do processo.",
    inputSchema: z.object({ etapa: z.enum(["nao_iniciado", "analisado", "coletando", "aguardando_prefeitura", "ficha_fechada", "aplicado", "validando", "pronto_para_homologacao"]) }),
    run: async ({ etapa }) => { const e = store.estado(ctx); e.etapa = etapa; store.salvarEstado(ctx, e); return `etapa: ${etapa}`; },
  });

  return {
    orquestrador: [estado_processo, avancar_etapa, analisar_template, ler_ficha],
    coletor: [ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao],
    aplicador: [aplicar_ficha, gerar_diff],
    validador: [ler_ficha, rodar_cenarios, enviar_mensagem],
    todas: [estado_processo, avancar_etapa, analisar_template, ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao, aplicar_ficha, gerar_diff, rodar_cenarios],
  };
}
