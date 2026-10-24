// Analisador de template: extrai mecanicamente os pontos de parametrização
// de um template Formly da Aprova e monta a ficha de perguntas.
// O agente 01-analisador-template só refina o texto das perguntas.

import type { AprovaTemplate, Ficha, Pergunta, TipoPonto, Prioridade } from "./types.js";
import type { FormlyField } from "./types.js";
import { walk, label, etapas, expressoes, valoresDeOpcoes, opcoesDe, comoLista } from "./formly.js";

const PLACEHOLDER = /modeload/i;
/** Opções que não dependem da cidade (comparação sem caixa). */
const TRIVIAIS = new Set(["sim", "não", "nao", "declaro", "não declaro", "nao declaro", "concordo", "li e concordo"]);
/** Seletor padrão da plataforma ("quem está pedindo"): igual em toda cidade. */
const SELETOR_PADRAO = new Set(["usuário logado no sistema", "outro"]);
const PALAVRAS_RESERVADAS = new Set([
  "Sim", "Não", "Declaro", "true", "false", "null", "undefined", "object", "string", "number",
]);
/** Campos cujo valor é nome de cidade/UF: literal comparado com eles é resíduo de outra prefeitura. */
const CAMPO_CIDADE = /(^|[._])(cidade|municipio|município|city|localidade)|cidade_|municipio_/i;
/** Comparação com literal: `model.x === 'Lit'` ou `'Lit' == model.x`. Captura campo e literal. */
const COMPARACAO = /model\??\.([\w?.]+?)\s*[!=]==?\s*'([^']+)'|'([^']+)'\s*[!=]==?\s*model\??\.([\w?.]+)/g;
/** Grupo de setor com sufixo de cidade/ambiente (`planejamento_modeload`, `ouvidoria_umuaramapr`). */
const GRUPO_SETOR = /^[a-z0-9]+_([a-z0-9]+)$/i;

/** Normaliza o template exportado: config ausente, form fora de array etc. */
function normalizar(tpl: AprovaTemplate): { form: FormlyField[]; cfg: AprovaTemplate["config"]; tramite: { groupId: string }[] } {
  const cfg = tpl && typeof tpl.config === "object" && tpl.config ? tpl.config : ({} as AprovaTemplate["config"]);
  const tramite = (Array.isArray(tpl?.tramite) ? tpl.tramite : []).filter((t) => t && typeof t.groupId === "string");
  return { form: comoLista(tpl?.form), cfg, tramite };
}

const lista = <T = any>(v: unknown): T[] => (Array.isArray(v) ? v : []);

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
  const { form, cfg, tramite } = normalizar(tpl);
  const titulo = (typeof cfg.title === "string" && cfg.title.trim()) || nomeTemplate;

  // 1. Setor e cidade (placeholders). Grupos com sufixo de outra cidade/ambiente
  //    (ex.: `ouvidoria_umuaramapr`, `setorentrada_exploread`) também precisam ser trocados.
  const placeholders = new Set<string>();
  const forasteiros = new Set<string>();
  const receptores = lista<string>(cfg.initialReceiverConfig?.possibleReceivers).filter((r) => typeof r === "string");
  for (const g of [...receptores, ...tramite.map((t) => t.groupId)]) {
    if (PLACEHOLDER.test(g)) placeholders.add(g);
    else if (GRUPO_SETOR.test(g)) forasteiros.add(g);
  }
  if (typeof cfg.cidade === "string" && PLACEHOLDER.test(cfg.cidade)) placeholders.add(`config.cidade=${cfg.cidade}`);
  if (placeholders.size || forasteiros.size) {
    const extra = forasteiros.size
      ? ` O modelo ainda aponta para setores de outra prefeitura (${[...forasteiros].join(", ")}): eles também serão trocados.`
      : "";
    pontos.push({
      tipo: "setor",
      grupo: "Quem atende",
      texto: `Qual setor da prefeitura recebe o processo de ${titulo}? Quem analisa e quem assina o documento final?${extra}`,
      assume: [...placeholders, ...forasteiros],
      afeta: ["config.initialReceiverConfig.possibleReceivers", "tramite[].groupId", "config.cidade"],
      prioridade: "bloqueia",
      aceita_anexo: false,
    });
  }

  // 2. Etapas do formulário
  const passos = etapas(form);
  if (passos.length) {
    pontos.push({
      tipo: "etapas",
      grupo: "Estrutura do pedido",
      texto: `O pedido de ${titulo} tem ${passos.length} etapas. Alguma delas não existe na sua cidade?`,
      assume: passos.map((e) => e.titulo),
      afeta: ["form[].wrappers=step"],
      prioridade: "ajusta",
      aceita_anexo: true,
    });
  }

  // 3. Listas de opções, documentos, textos, datasets
  const datasetKeys = new Map<string, Set<string>>(); // campo-fonte → chaves consumidas
  const datasetRe = /model\.([a-zA-Z0-9_]+)\?*\.input_data\?*\.data\?*\.find\(\([a-z]+\)\s*=>\s*[a-z]+\.key\s*===?\s*'([A-Z_]+)'\)/g;

  const basesExternas = new Map<string, { chave: string; campos: string[]; rotulos: string[] }>(); // datasetReference → uso
  const textosPorPath = new Set<string>();

  for (const { field, path, dentroDeRepeat } of walk(form)) {
    const lbl = label(field);
    const to = field.templateOptions && typeof field.templateOptions === "object" ? field.templateOptions : {};

    const valores = opcoesDe(field);
    if (valores.length) {
      const min = valores.map((v) => v.trim().toLowerCase());
      const trivial = min.every((v) => TRIVIAIS.has(v)) || min.every((v) => SELETOR_PADRAO.has(v));
      // Checkbox de declaração: o "valor" é o próprio texto legal (vira ponto de texto, não de opções).
      const declaracao = valores.every((v) => v.length > 80 || /^declaro\b/i.test(v));
      if (declaracao && !trivial) {
        const txt = valores.find((v) => v.length > 80) ?? valores[0];
        if (!/declaro|veracidade|art\.?\s*\d+/i.test(lbl ?? "") || field.type !== "multicheckbox") {
          textosPorPath.add(path);
          pontos.push({
            tipo: "texto",
            grupo: "Textos legais",
            texto: `O template usa este texto de declaração: "${txt.slice(0, 160)}…". Mantém ou a prefeitura tem o texto próprio?`,
            assume: txt,
            afeta: [path],
            prioridade: "cosmetica",
            aceita_anexo: true,
          });
        }
      } else if (!trivial) {
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

    if (field.type === "multicheckbox" && !textosPorPath.has(path) && /declaro|veracidade|art\.?\s*\d+/i.test(lbl ?? "")) {
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

    // Campo que consome base de dados da prefeitura (wrapper consumeDataset / datasetReference).
    if (typeof to.datasetReference === "string" && !/cnae|pa[ií]s|nacionalidade|expedidor/i.test(`${lbl} ${to.datasetKey} ${field.key}`)) {
      const ref = to.datasetReference || "(vazio)";
      if (!basesExternas.has(ref)) basesExternas.set(ref, { chave: String(to.datasetKey ?? ""), campos: [], rotulos: [] });
      basesExternas.get(ref)!.campos.push(path);
      if (lbl) basesExternas.get(ref)!.rotulos.push(lbl);
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
  // Bases genéricas (lista de unidades, setores, zoneamentos...) que não são as tabelas já perguntadas acima.
  for (const [ref, uso] of basesExternas) {
    const campos = uso.campos.filter((c) => !datasetKeys.has(c.split(".").pop()!.replace(/\[\]$/, "")));
    if (!campos.length) continue;
    const nome = uso.rotulos[0] ?? uso.chave ?? campos[0];
    pontos.push({
      tipo: "dataset",
      grupo: "Bases de dados",
      texto: ref === "(vazio)"
        ? `O campo "${nome}" deveria buscar numa base da prefeitura, mas o modelo não aponta para nenhuma. Qual é a lista (${uso.chave || "itens"})? Pode mandar a planilha.`
        : `O campo "${nome}" busca os valores numa base (${uso.chave || "itens"}). A prefeitura tem essa lista? Pode mandar a planilha atualizada.`,
      assume: { fonte: campos[0].split(".").pop()!.replace(/\[\]$/, ""), datasetReference: ref === "(vazio)" ? null : ref, chave: uso.chave },
      afeta: campos,
      prioridade: "ajusta",
      aceita_anexo: true,
    });
  }

  // 4. Cards internos e taxas
  for (const card of lista(cfg.form_tramites).filter((c) => c && typeof c === "object")) {
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
  const saidas = lista(cfg.templates).filter((t) => t && typeof t === "object");
  if (saidas.length) {
    // Pasta do modelo HTML: ModeloAD/Genericos são da base; outra pasta (CascavelPR/, LagoasantaMG/) é de outra prefeitura.
    const pastasDeFora = [...new Set(saidas.map((t: any) => String(t.template ?? "").split("/")[0]).filter((p) => p && !/^(modelo|genericos)/i.test(p)))];
    const aviso = pastasDeFora.length ? ` Atenção: o modelo do documento vem de outra configuração (${pastasDeFora.join(", ")}).` : "";
    pontos.push({
      tipo: "saida",
      grupo: "Documento final",
      texto: `O processo emite: ${saidas.map((t: any) => t.text_button ?? t.template ?? "documento").join(", ")}. A prefeitura tem modelo próprio? Há prazo de validade e numeração própria?${aviso}`,
      assume: saidas.map((t: any) => ({ nome: t.text_button, template: t.template, validade: !!t.possui_prazo_validade })),
      afeta: ["config.templates"],
      prioridade: "ajusta",
      aceita_anexo: true,
    });
  }

  // 6. Resíduos: literal com cara de nome de cidade comparado com campo de cidade/município.
  //    Os demais literais suspeitos (fora das opções, texto livre) ficam em `literaisSuspeitos` para o relatório.
  const residuos = new Map<string, string[]>();
  for (const s of literaisSuspeitos(tpl)) {
    if (s.classe !== "cidade") continue;
    if (!residuos.has(s.literal)) residuos.set(s.literal, []);
    residuos.get(s.literal)!.push(s.path);
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
    "Parâmetros urbanísticos", "Bases de dados", "Taxas", "Tramitação interna", "Textos legais", "Documento final", "Atenção do implantador", "Outros",
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

export type LiteralSuspeito = {
  literal: string;
  campo: string;
  path: string;
  prop: string;
  /** cidade: campo de cidade/município (vira `residuo`); fora_das_opcoes: campo tem opções e o literal não está nelas
   *  (condição que nunca dispara); texto_livre: campo sem opções (sem evidência, só informativo). */
  classe: "cidade" | "fora_das_opcoes" | "texto_livre";
  trecho: string;
};

/** Literais com cara de nome próprio comparados com campos do model e que não são opção do form. */
export function literaisSuspeitos(tpl: AprovaTemplate): LiteralSuspeito[] {
  const { form } = normalizar(tpl);
  const opcoes = valoresDeOpcoes(form);
  const camposComOpcoes = new Set<string>();
  for (const { field } of walk(form)) if (field.key && opcoesDe(field).length) camposComOpcoes.add(String(field.key));
  const out: LiteralSuspeito[] = [];
  for (const { field, path } of walk(form)) {
    for (const { prop, expr } of expressoes(field)) {
      for (const m of expr.matchAll(COMPARACAO)) {
        const lit = m[2] ?? m[3];
        const campo = String(m[1] ?? m[4]).replace(/\?/g, "").split(".")[0];
        if (!/^[A-ZÁ-Ú][a-zá-ú]{2,}(?: [A-Za-zá-ú]+)*$/.test(lit)) continue;
        if (opcoes.has(lit) || PALAVRAS_RESERVADAS.has(lit)) continue;
        if (lit.split(" ").length > 2 || /^(Não|Sem|Com) /.test(lit)) continue; // mensagens de aviso não são resíduo
        const classe = CAMPO_CIDADE.test(campo) ? "cidade" : camposComOpcoes.has(campo) ? "fora_das_opcoes" : "texto_livre";
        const i = m.index ?? 0;
        out.push({ literal: lit, campo, path, prop, classe, trecho: expr.slice(Math.max(0, i - 40), i + m[0].length + 20).replace(/\s+/g, " ") });
      }
    }
  }
  return out;
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
  const { form, cfg } = normalizar(tpl);
  let campos = 0, expr = 0;
  const tipos = new Map<string, number>();
  for (const { field } of walk(form)) {
    if (field.key) campos++;
    expr += expressoes(field).length;
    if (typeof field.type === "string") tipos.set(field.type, (tipos.get(field.type) ?? 0) + 1);
  }
  return {
    titulo: typeof cfg.title === "string" ? cfg.title : undefined,
    etapas: etapas(form).length,
    campos,
    expressoes: expr,
    cards_internos: lista(cfg.form_tramites).length,
    documentos_saida: lista(cfg.templates).length,
    tipos: Object.fromEntries(tipos),
  };
}
