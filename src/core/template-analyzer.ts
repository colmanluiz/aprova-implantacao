// Analisador de template: extrai mecanicamente os pontos de parametrização
// de um template Formly da Aprova e monta a ficha de perguntas.
// O agente 01-analisador-template só refina o texto das perguntas.

import type { AprovaTemplate, Ficha, Pergunta, TipoPonto, Prioridade } from "./types.js";
import { walk, label, etapas, expressoes, valoresDeOpcoes, ehEtapa } from "./formly.js";

const PLACEHOLDER = /modeload/i;
const TRIVIAIS = new Set(["Sim", "Não", "Declaro"]);
const PALAVRAS_RESERVADAS = new Set([
  "Sim", "Não", "Declaro", "true", "false", "null", "undefined", "object", "string", "number",
]);

type PontoBruto = {
  tipo: TipoPonto;
  grupo: string;
  texto: string;
  assume: unknown;
  afeta: string[];
  prioridade: Prioridade;
  aceita_anexo: boolean;
};

export function analisarTemplate(tpl: AprovaTemplate, nomeTemplate = "template"): Ficha {
  const pontos: PontoBruto[] = [];
  const cfg = tpl.config ?? {};
  const titulo = cfg.title ?? nomeTemplate;

  // 1. Setor e cidade (placeholders)
  const placeholders = new Set<string>();
  for (const r of cfg.initialReceiverConfig?.possibleReceivers ?? []) if (PLACEHOLDER.test(r)) placeholders.add(r);
  for (const t of tpl.tramite ?? []) if (PLACEHOLDER.test(t.groupId)) placeholders.add(t.groupId);
  if (cfg.cidade && PLACEHOLDER.test(cfg.cidade)) placeholders.add(`config.cidade=${cfg.cidade}`);
  if (placeholders.size) {
    pontos.push({
      tipo: "setor",
      grupo: "Quem atende",
      texto: `Qual setor da prefeitura recebe o processo de ${titulo}? Quem analisa e quem assina o documento final?`,
      assume: [...placeholders],
      afeta: ["config.initialReceiverConfig.possibleReceivers", "tramite[].groupId", "config.cidade"],
      prioridade: "bloqueia",
      aceita_anexo: false,
    });
  }

  // 2. Etapas do formulário
  const lista = etapas(tpl.form);
  if (lista.length) {
    pontos.push({
      tipo: "etapas",
      grupo: "Estrutura do pedido",
      texto: `O pedido de ${titulo} tem ${lista.length} etapas. Alguma delas não existe na sua cidade?`,
      assume: lista.map((e) => e.titulo),
      afeta: ["form[].wrappers=step"],
      prioridade: "ajusta",
      aceita_anexo: true,
    });
  }

  // 3. Listas de opções, documentos, textos, datasets
  const datasetKeys = new Map<string, Set<string>>(); // campo-fonte → chaves consumidas
  const datasetRe = /model\.([a-zA-Z0-9_]+)\?*\.input_data\?*\.data\?*\.find\(\([a-z]+\)\s*=>\s*[a-z]+\.key\s*===?\s*'([A-Z_]+)'\)/g;

  for (const { field, path, dentroDeRepeat } of walk(tpl.form)) {
    const lbl = label(field);
    const to = field.templateOptions ?? {};

    if (Array.isArray(to.options) && to.options.length) {
      const valores = to.options.map((o: any) => o.label ?? o.value);
      const trivial = valores.every((v: string) => TRIVIAIS.has(v));
      if (!trivial) {
        pontos.push({
          tipo: "opcoes",
          grupo: grupoDe(lbl, path),
          texto: `Para "${lbl}", o template prevê: ${valores.join(", ")}. Essas são as opções da sua cidade? Se tiver a lista oficial (lei, decreto ou planilha), pode mandar.`,
          assume: valores,
          afeta: [path],
          prioridade: valores.length <= 3 ? "ajusta" : "bloqueia",
          aceita_anexo: true,
        });
      }
    }

    if (field.type === "next-upload") {
      const reqExpr = field.expressionProperties?.["templateOptions|||required"];
      const hide = typeof field.hideExpression === "string" ? field.hideExpression : undefined;
      pontos.push({
        tipo: "documento",
        grupo: "Documentos exigidos",
        texto: `O documento "${lbl}" é exigido na sua cidade? ${descreverCondicao(reqExpr, hide, to.required)}`,
        assume: { obrigatorio: !!to.required, condicao: reqExpr ?? null, oculto_quando: hide ?? null, repetivel: dentroDeRepeat },
        afeta: [path],
        prioridade: "bloqueia",
        aceita_anexo: false,
      });
    }

    if (field.type === "multicheckbox" && /declaro|veracidade|art\.?\s*\d+/i.test(lbl ?? "")) {
      pontos.push({
        tipo: "texto",
        grupo: "Textos legais",
        texto: `O template usa este texto de declaração: "${(lbl ?? "").slice(0, 160)}…". Mantém ou a prefeitura tem o texto próprio?`,
        assume: lbl,
        afeta: [path],
        prioridade: "cosmetica",
        aceita_anexo: true,
      });
    }

    for (const { expr } of expressoes(field)) {
      for (const m of expr.matchAll(datasetRe)) {
        const fonte = m[1];
        if (!datasetKeys.has(fonte)) datasetKeys.set(fonte, new Set());
        datasetKeys.get(fonte)!.add(m[2]);
      }
    }
  }

  for (const [fonte, chaves] of datasetKeys) {
    pontos.push({
      tipo: "dataset",
      grupo: "Parâmetros urbanísticos",
      texto: `Para cada zona, preciso dos valores de: ${[...chaves].join(", ")}. Pode mandar a tabela da lei de zoneamento (foto, PDF ou planilha).`,
      assume: { fonte, chaves: [...chaves] },
      afeta: [`config.datasets.${fonte}`],
      prioridade: "bloqueia",
      aceita_anexo: true,
    });
  }

  // 4. Cards internos e taxas
  for (const card of cfg.form_tramites ?? []) {
    const ehTaxa = card.type === "taxa";
    pontos.push({
      tipo: ehTaxa ? "taxa" : "card",
      grupo: ehTaxa ? "Taxas" : "Tramitação interna",
      texto: ehTaxa
        ? `Existe taxa de aprovação para ${titulo}? Como é calculada e quem emite?`
        : `Na análise interna, o template prevê a etapa "${card.nome}". Existe na sua cidade? Quem preenche?`,
      assume: { nome: card.nome, key: card.key, permission: card.permission ?? null },
      afeta: [`config.form_tramites[key=${card.key}]`],
      prioridade: ehTaxa ? "bloqueia" : "ajusta",
      aceita_anexo: false,
    });
  }

  // 5. Documentos de saída
  if (cfg.templates?.length) {
    pontos.push({
      tipo: "saida",
      grupo: "Documento final",
      texto: `O processo emite: ${cfg.templates.map((t: any) => t.text_button).join(", ")}. A prefeitura tem modelo próprio? Há prazo de validade e numeração própria?`,
      assume: cfg.templates.map((t: any) => ({ nome: t.text_button, template: t.template, validade: !!t.possui_prazo_validade })),
      afeta: ["config.templates"],
      prioridade: "ajusta",
      aceita_anexo: true,
    });
  }

  // 6. Resíduos: literais com cara de nome próprio dentro de expressões que não são opções do form
  const opcoes = valoresDeOpcoes(tpl.form);
  const residuos = new Map<string, string[]>();
  for (const { field, path } of walk(tpl.form)) {
    for (const { expr } of expressoes(field)) {
      for (const m of expr.matchAll(/'([A-ZÁ-Ú][a-zá-ú]{2,}(?: [A-Za-zá-ú]+)*)'/g)) {
        const lit = m[1];
        if (opcoes.has(lit) || PALAVRAS_RESERVADAS.has(lit)) continue;
        if (lit.split(" ").length > 2 || /^(Não|Sem|Com) /.test(lit)) continue; // mensagens de aviso não são resíduo
        if (!residuos.has(lit)) residuos.set(lit, []);
        residuos.get(lit)!.push(path);
      }
    }
  }
  for (const [lit, paths] of residuos) {
    pontos.push({
      tipo: "residuo",
      grupo: "Atenção do implantador",
      texto: `O template contém o literal "${lit}" em regra de validação. Parece resíduo de outra cidade: trocar pelo nome correto.`,
      assume: lit,
      afeta: [...new Set(paths)],
      prioridade: "bloqueia",
      aceita_anexo: false,
    });
  }

  // Monta a ficha agrupada
  const ordem = [
    "Quem atende", "Estrutura do pedido", "Quem pode pedir", "Documentos exigidos", "Dados do imóvel",
    "Parâmetros urbanísticos", "Taxas", "Tramitação interna", "Textos legais", "Documento final", "Atenção do implantador", "Outros",
  ];
  const grupos = new Map<string, Pergunta[]>();
  let n = 0;
  for (const p of pontos) {
    const id = `${p.tipo}-${String(++n).padStart(2, "0")}`;
    const q: Pergunta = { id, ...p, resposta: null, confianca: 0, origem: null };
    if (!grupos.has(p.grupo)) grupos.set(p.grupo, []);
    grupos.get(p.grupo)!.push(q);
  }
  return {
    processo: titulo,
    template: nomeTemplate,
    criada_em: new Date().toISOString(),
    grupos: [...grupos.entries()]
      .sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]))
      .map(([nome, perguntas]) => ({ nome, perguntas })),
  };
}

function grupoDe(lbl: string | undefined, path: string): string {
  const s = `${lbl ?? ""} ${path}`.toLowerCase();
  if (/zone|uso|atividade|material|logradouro|imóvel|imovel/.test(s)) return "Dados do imóvel";
  if (/requerente|vínculo|vinculo|proprietário|proprietario|responsável|responsavel/.test(s)) return "Quem pode pedir";
  if (/solicita/.test(s)) return "Estrutura do pedido";
  return "Outros";
}

function descreverCondicao(reqExpr?: string, hide?: string, required?: boolean): string {
  if (reqExpr) {
    if (/length\s*==\s*11/.test(reqExpr)) return "No template, é exigido só de pessoa física.";
    if (/length\s*>\s*11/.test(reqExpr)) return "No template, é exigido só de pessoa jurídica.";
    return "No template, é exigido só em algumas situações.";
  }
  if (hide) {
    const m = hide.match(/!==\s*'([^']+)'/);
    if (m) return `No template, só aparece quando o requerente é "${m[1]}".`;
    return "No template, só aparece em algumas situações.";
  }
  return required ? "No template, é sempre obrigatório." : "No template, é opcional.";
}

/** Resumo numérico do template, para README e pitch. */
export function resumoTemplate(tpl: AprovaTemplate) {
  let campos = 0, expr = 0;
  const tipos = new Map<string, number>();
  for (const { field } of walk(tpl.form)) {
    if (field.key) campos++;
    expr += expressoes(field).length;
    if (field.type) tipos.set(field.type, (tipos.get(field.type) ?? 0) + 1);
    void ehEtapa;
  }
  return {
    titulo: tpl.config?.title,
    etapas: etapas(tpl.form).length,
    campos,
    expressoes: expr,
    cards_internos: tpl.config?.form_tramites?.length ?? 0,
    documentos_saida: tpl.config?.templates?.length ?? 0,
    tipos: Object.fromEntries(tipos),
  };
}
