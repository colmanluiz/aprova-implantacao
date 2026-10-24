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
import { store, perguntasAbertas, resumir, gravar, type Contexto } from "./store.js";
import { extrair, type Anexo, type SaidaExtrator } from "./extrator.js";
import { registrarRejeicao, limparRejeicao } from "../pipeline/run.js";
import type { AprovaTemplate, Cenario, Pergunta } from "../core/types.js";
import { montarFormulario } from "../core/montar.js";
import { Operacao, validarOperacao, verificarPlano, itensConfirmados, itensPropostos, cenariosDoPlano, camposDoPlano, type ItemPlano } from "../core/plano.js";
import { resumoModelo, pdfDoModelo, modeloParaAgente } from "../core/resumo-modelo.js";

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

export type Canal = {
  enviar: (texto: string) => Promise<void>;
  /** opcional: canais que mandam arquivo (Telegram); sem isto, o arquivo fica só em disco */
  enviarArquivo?: (a: { nome: string; conteudo: Buffer; legenda?: string }) => Promise<void>;
};

/** Valor "como está no modelo" por tipo de pergunta; setor, dataset e resíduo não têm (o modelo não sabe). */
export function valorDoModelo(q: Pergunta): unknown | undefined {
  switch (q.tipo) {
    case "opcoes": case "etapas": return Array.isArray(q.assume) && q.assume.length ? q.assume : undefined;
    case "documento": return { exigido: true };
    case "taxa": case "card": return { existe: true };
    case "texto": return typeof q.assume === "string" && q.assume.trim() ? q.assume : undefined;
    case "saida": return { mantido_do_modelo: true };
    default: return undefined;
  }
}

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
      if (somente_abertas) return JSON.stringify(perguntasAbertas(f));
      // Perguntas cujo campo um item confirmado do plano de ação mudou: o plano prevalece sobre a resposta da ficha.
      const tocados = camposDoPlano(store.template(ctx), store.plano(ctx).itens);
      if (!tocados.size) return JSON.stringify(f);
      const anotada = structuredClone(f);
      for (const q of anotada.grupos.flatMap((g) => g.perguntas)) {
        const m = q.afeta.map((a) => tocados.get(a)).find(Boolean);
        if (m) (q as any).substituida_pelo_plano = m;
      }
      return JSON.stringify(anotada);
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

  async function enviarAoAnalista(texto: string) {
    await canal.enviar(texto);
    store.atualizarEstado(ctx, (e) => {
      e.mensagens_enviadas++;
      e.perguntas_feitas += (texto.match(/\?/g) ?? []).length;
      e.historico.push({ role: "assistant", content: texto, em: new Date().toISOString() });
    });
  }

  const enviar_mensagem = betaZodTool({
    name: "enviar_mensagem",
    description: "Envia uma mensagem curta ao analista da prefeitura pelo canal (WhatsApp/Telegram). Máximo 5 perguntas por mensagem.",
    inputSchema: z.object({ texto: z.string() }),
    run: async ({ texto }) => { await enviarAoAnalista(texto); return "enviada"; },
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
    description: "Devolve os cenários já comprovados para este template mais os casos automáticos do plano de ação (ids plano-*). Rode-os e acrescente cobertura; não os apague.",
    inputSchema: z.object({}),
    run: async () => {
      const arq = arquivoCenariosBase(ctx);
      const base: Cenario[] = arq ? JSON.parse(fs.readFileSync(arq, "utf8")) : [];
      const form = store.form(ctx);
      const doPlano = form ? cenariosDoPlano(form, store.plano(ctx).itens) : [];
      return JSON.stringify(juntarCenarios(base, doPlano));
    },
  });


  // ---------------------------------------------------------------- modelo e plano de ação

  const formAtual = () => montarFormulario(store.template(ctx), store.ficha(ctx), store.plano(ctx)).form;
  const resumoItem = (i: ItemPlano) => ({ id: i.id, descricao: i.descricao, status: i.status, operacao: i.operacao, verificacao: i.verificacao });

  const mostrar_modelo = betaZodTool({
    name: "mostrar_modelo",
    description:
      "Envia ao analista o resumo do modelo atual (mensagem curta) e a prévia completa em PDF, etapa por etapa. " +
      "Devolve para você o modelo com o path de cada item, para montar o plano de ação. Use uma vez no começo e de novo se ele pedir para ver como ficou.",
    inputSchema: z.object({}),
    run: async () => {
      const form = formAtual();
      const titulo = String(store.template(ctx).config?.title ?? ctx.processo);
      const texto = resumoModelo(form, titulo);
      await enviarAoAnalista(texto);
      const pdf = pdfDoModelo(form, titulo, ctx.cidade);
      const nome = `modelo-${ctx.processo}.pdf`;
      gravar(store.arquivo(ctx, nome), pdf);
      if (canal.enviarArquivo) await canal.enviarArquivo({ nome, conteudo: pdf, legenda: `Modelo de ${titulo}` });
      const p = store.plano(ctx);
      store.salvarPlano(ctx, { ...p, modelo_mostrado_em: new Date().toISOString() });
      return `Resumo e PDF enviados${canal.enviarArquivo ? "" : " (este canal não manda arquivo: o PDF ficou em " + store.arquivo(ctx, nome) + ")"}.\n\nModelo (para você, não repita ao analista):\n${modeloParaAgente(form)}`;
    },
  });

  const ver_modelo = betaZodTool({
    name: "ver_modelo",
    description: "Lê o modelo como está agora (ficha e plano confirmados aplicados), com o path de cada item. Não envia nada ao analista.",
    inputSchema: z.object({ etapa: z.string().optional() }),
    run: async ({ etapa }) => {
      const txt = modeloParaAgente(formAtual());
      if (!etapa) return txt;
      const bloco = txt.split("\n\n").filter((b) => b.toLowerCase().includes(etapa.toLowerCase()));
      return bloco.join("\n\n") || txt;
    },
  });

  const registrar_decisao = betaZodTool({
    name: "registrar_decisao",
    description:
      "Registra se o modelo atende a prefeitura ('atende') ou se ela quer mudanças ('mudar'). Nos dois casos, o que o modelo já define " +
      "fica aceito como está e sai da lista de perguntas; sobram só as que o modelo não tem como saber (setor, tabelas da cidade). Devolve essas que sobraram.",
    inputSchema: z.object({ decisao: z.enum(["atende", "mudar"]), origem: z.string() }),
    run: async ({ decisao, origem }) => {
      const f = store.ficha(ctx);
      const p = store.plano(ctx);
      store.salvarPlano(ctx, { ...p, decisao, decidido_em: new Date().toISOString() });
      if (!f) return `decisão ${decisao} registrada; ficha inexistente`;
      let aceitas = 0;
      for (const q of perguntasAbertas(f)) {
        const v = valorDoModelo(q);
        if (v === undefined) continue;
        const val = validarResposta(q, v);
        if (!val.ok) continue;
        Object.assign(q, { resposta: val.valor, origem: `${origem}: modelo aceito como está`, confianca: 1, pendencia: undefined });
        aceitas++;
      }
      store.salvarFicha(ctx, f);
      if (aceitas) store.registrar(ctx, { pergunta_id: "modelo", confianca: 1, origem, resumo: `${aceitas} itens do modelo aceitos como estão (${decisao})` });
      const resto = perguntasAbertas(f);
      return JSON.stringify({ decisao, aceitas_do_modelo: aceitas, perguntas_que_sobram: resto.map((q) => ({ id: q.id, tipo: q.tipo, texto: q.texto, prioridade: q.prioridade })) });
    },
  });

  const propor_plano = betaZodTool({
    name: "propor_plano",
    description:
      "Grava itens do plano de ação a partir do que o analista pediu. Cada item: descricao (como o analista diria) e operacao estruturada. " +
      "O código confere cada operação contra o formulário: item inválido volta com o motivo e não é gravado. Os gravados ficam 'proposto' até o analista confirmar. " +
      "Depois, mande ao analista a lista numerada com os ids e peça confirmação.",
    inputSchema: z.object({
      itens: z.array(z.object({ descricao: z.string().min(3), operacao: Operacao })).min(1),
      origem: z.string(),
    }),
    run: async ({ itens, origem }) => {
      const p = store.plano(ctx);
      const form = formAtual();
      const gravados: string[] = [];
      const recusados: { descricao: string; erros: string[] }[] = [];
      let n = p.itens.length;
      for (const it of itens) {
        const erros = validarOperacao(form, it.operacao as Operacao);
        if (erros.length) { recusados.push({ descricao: it.descricao, erros }); continue; }
        const id = `m${++n}`;
        p.itens.push({ id, descricao: it.descricao, operacao: it.operacao as Operacao, status: "proposto", origem, proposto_em: new Date().toISOString() });
        gravados.push(id);
      }
      store.salvarPlano(ctx, p);
      return JSON.stringify({ gravados: p.itens.filter((i) => gravados.includes(i.id)).map((i) => ({ id: i.id, descricao: i.descricao })), recusados, aguardando_confirmacao: itensPropostos(p).length });
    },
  });

  const confirmar_plano = betaZodTool({
    name: "confirmar_plano",
    description:
      "Marca itens do plano como confirmados pelo analista e já aplica no formulário, rodando a verificação automática de cada um. " +
      "Use só depois de ele confirmar por mensagem. Devolve o resultado por item.",
    inputSchema: z.object({ ids: z.array(z.string()).min(1), origem: z.string() }),
    run: async ({ ids, origem }) => {
      const p = store.plano(ctx);
      const desconhecidos = ids.filter((id) => !p.itens.some((i) => i.id === id));
      const agora = new Date().toISOString();
      for (const i of p.itens) if (ids.includes(i.id) && i.status !== "descartado") Object.assign(i, { status: "confirmado", confirmado_em: agora, origem: `${i.origem}; confirmado: ${origem}` });
      const base = montarFormulario(store.template(ctx), store.ficha(ctx)).form;
      const { porItem } = verificarPlano(base, p.itens);
      for (const i of p.itens) if (porItem[i.id]) i.verificacao = { em: agora, ...porItem[i.id] };
      store.salvarPlano(ctx, p);
      for (const id of ids.filter((x) => porItem[x])) store.registrar(ctx, { pergunta_id: id, confianca: 1, origem, resumo: `plano: ${p.itens.find((i) => i.id === id)!.descricao}` });
      return JSON.stringify({
        aplicados: ids.filter((x) => porItem[x]).map((x) => ({ id: x, ...porItem[x] })),
        desconhecidos,
        ainda_propostos: itensPropostos(p).map((i) => i.id),
        confirmados_total: itensConfirmados(p).length,
      });
    },
  });

  const descartar_itens = betaZodTool({
    name: "descartar_itens",
    description: "Descarta itens do plano que o analista não quer mais (ou que você entendeu errado). Para corrigir um item, descarte e proponha de novo.",
    inputSchema: z.object({ ids: z.array(z.string()).min(1), motivo: z.string() }),
    run: async ({ ids, motivo }) => {
      const p = store.plano(ctx);
      for (const i of p.itens) if (ids.includes(i.id)) Object.assign(i, { status: "descartado", origem: `${i.origem}; descartado: ${motivo}` });
      store.salvarPlano(ctx, p);
      return JSON.stringify({ descartados: ids, ainda_propostos: itensPropostos(p).map((i) => i.id) });
    },
  });

  const ler_plano = betaZodTool({
    name: "ler_plano",
    description: "Lê o plano de ação: decisão sobre o modelo e itens (proposto, confirmado, descartado) com a verificação de cada um.",
    inputSchema: z.object({}),
    run: async () => { const p = store.plano(ctx); return JSON.stringify({ decisao: p.decisao, itens: p.itens.map(resumoItem) }); },
  });

  const estado_processo = betaZodTool({
    name: "estado_processo",
    description: "Lê a etapa atual do processo e contadores.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify({ ...store.estado(ctx), historico: undefined, abertas: store.ficha(ctx) ? perguntasAbertas(store.ficha(ctx)!).length : null }),
  });

  return {
    orquestrador: [estado_processo, analisar_template, ler_ficha],
    coletor: [ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao, mostrar_modelo, ver_modelo, registrar_decisao, propor_plano, confirmar_plano, descartar_itens, ler_plano],
    aplicador: [aplicar_ficha, gerar_diff],
    // O validador não fala com a prefeitura: confirmações viram gate para o analista, abertos pelo pipeline.
    validador: [listar_campos, cenarios_base, ler_ficha, ler_plano, rodar_cenarios],
    todas: [estado_processo, analisar_template, ler_ficha, registrar_resposta, enviar_mensagem, pedir_extracao, aplicar_ficha, gerar_diff, rodar_cenarios, listar_campos, cenarios_base],
  };
}
