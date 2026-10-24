#!/usr/bin/env tsx
// Roda o analisador de template em todos os modelos exportados do Estúdio (forms_modelo/*.json)
// e grava docs/forms-modelo-analise.md (leitura humana) e docs/forms-modelo-analise.json (números crus).
//
// uso: npm run analyze:lote [-- <pasta>] [--md saida.md] [--json saida.json]
import fs from "node:fs";
import path from "node:path";
import { analisarTemplate, resumoTemplate, literaisSuspeitos, type LiteralSuspeito } from "../src/core/template-analyzer.js";
import { walk } from "../src/core/formly.js";
import type { AprovaTemplate, TipoPonto } from "../src/core/types.js";

const args = process.argv.slice(2);
const opt = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const pasta = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "forms_modelo";
const saidaMd = opt("--md") ?? "docs/forms-modelo-analise.md";
const saidaJson = opt("--json") ?? "docs/forms-modelo-analise.json";

const TIPOS: TipoPonto[] = ["setor", "etapas", "opcoes", "documento", "dataset", "texto", "taxa", "card", "saida", "residuo"];
const TIPOS_TABELA: TipoPonto[] = ["setor", "opcoes", "documento", "dataset", "texto", "taxa", "card", "saida", "residuo"];

type Indice = { id: string; titulo: string; desativado: string; arquivo: string };

function lerIndice(): Map<string, Indice> {
  const p = path.join(pasta, "_indice.csv");
  const out = new Map<string, Indice>();
  if (!fs.existsSync(p)) return out;
  const linhas = fs.readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1);
  for (const l of linhas) {
    // id,titulo,desativado,arquivo,url (título pode ter vírgula: lê das pontas)
    const partes = l.split(",");
    const id = partes[0];
    const url = partes.pop()!;
    const arquivo = partes.pop()!;
    const desativado = partes.pop()!;
    const titulo = partes.slice(1).join(",");
    void url;
    out.set(arquivo, { id, titulo, desativado, arquivo });
  }
  return out;
}

type Linha = {
  arquivo: string;
  nome: string;
  sigla: string | null;
  modulo: string;
  desativado: boolean | null;
  vazio: boolean;
  etapas: number;
  campos: number;
  expressoes: number;
  pontos: number;
  bloqueiam: number;
  por_tipo: Record<string, number>;
  campos_parametrizaveis: number;
  cobertura: number | null; // fração dos campos que o modelo já entrega sem pergunta
  residuos: string[];
  setores_de_fora: string[];
  saida_de_fora: boolean;
  suspeitos: Omit<LiteralSuspeito, "path">[];
};

const indice = lerIndice();
const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".json")).sort();
const linhas: Linha[] = [];
const erros: { arquivo: string; erro: string }[] = [];

for (const arquivo of arquivos) {
  try {
    const tpl: AprovaTemplate = JSON.parse(fs.readFileSync(path.join(pasta, arquivo), "utf8"));
    const r = resumoTemplate(tpl);
    const ficha = analisarTemplate(tpl, arquivo);
    const qs = ficha.grupos.flatMap((g) => g.perguntas);
    const por_tipo = Object.fromEntries(TIPOS.map((t) => [t, qs.filter((q) => q.tipo === t).length]));
    const pathsDoForm = new Set<string>();
    for (const { field, path: p } of walk(tpl.form)) if (field.key) pathsDoForm.add(p);
    const tocados = new Set(qs.flatMap((q) => q.afeta).filter((a) => pathsDoForm.has(a)));
    const setor = qs.find((q) => q.tipo === "setor");
    const cfg = (tpl.config ?? {}) as AprovaTemplate["config"];
    const idx = indice.get(arquivo);
    const vistos = new Set<string>();
    const suspeitos = literaisSuspeitos(tpl).filter((s) => {
      const k = `${s.classe}|${s.literal}|${s.campo}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }).map(({ path: _p, ...s }) => s);
    linhas.push({
      arquivo,
      nome: r.titulo ?? idx?.titulo ?? arquivo,
      sigla: typeof cfg.sigla === "string" ? cfg.sigla : null,
      modulo: typeof cfg.tenance === "string" && cfg.tenance ? cfg.tenance : "(sem módulo)",
      desativado: idx ? idx.desativado === "sim" : null,
      vazio: r.campos === 0,
      etapas: r.etapas,
      campos: r.campos,
      expressoes: r.expressoes,
      pontos: qs.length,
      bloqueiam: qs.filter((q) => q.prioridade === "bloqueia").length,
      por_tipo,
      campos_parametrizaveis: tocados.size,
      cobertura: r.campos ? 1 - tocados.size / r.campos : null,
      residuos: qs.filter((q) => q.tipo === "residuo").map((q) => String(q.assume)),
      setores_de_fora: Array.isArray(setor?.assume) ? (setor!.assume as string[]).filter((s) => !/modeload|^config\./.test(s)) : [],
      saida_de_fora: qs.some((q) => q.tipo === "saida" && /outra configuração/.test(q.texto)),
      suspeitos,
    });
  } catch (e) {
    erros.push({ arquivo, erro: (e as Error).message });
  }
}

// ---------- agregados ----------
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

function agregado(ls: Linha[]) {
  const campos = ls.map((l) => l.campos);
  const parametrizaveis = soma(ls.map((l) => l.campos_parametrizaveis));
  return {
    templates: ls.length,
    etapas: { total: soma(ls.map((l) => l.etapas)), mediana: mediana(ls.map((l) => l.etapas)) },
    campos: { total: soma(campos), mediana: mediana(campos) },
    expressoes: { total: soma(ls.map((l) => l.expressoes)), mediana: mediana(ls.map((l) => l.expressoes)) },
    pontos: { total: soma(ls.map((l) => l.pontos)), mediana: mediana(ls.map((l) => l.pontos)), media: r1(media(ls.map((l) => l.pontos))) },
    bloqueiam: { total: soma(ls.map((l) => l.bloqueiam)), mediana: mediana(ls.map((l) => l.bloqueiam)) },
    por_tipo: Object.fromEntries(TIPOS.map((t) => [t, soma(ls.map((l) => l.por_tipo[t] ?? 0))])),
    campos_parametrizaveis: parametrizaveis,
    /** Fração dos campos (somando todos os templates) que não dependem de nenhuma pergunta. */
    cobertura_campos: soma(campos) ? Math.round((1 - parametrizaveis / soma(campos)) * 1000) / 10 : null,
    cobertura_mediana: r1(mediana(ls.filter((l) => l.cobertura !== null).map((l) => l.cobertura! * 100))),
  };
}

const validos = linhas.filter((l) => !l.vazio);
const modulos = [...new Set(validos.map((l) => l.modulo))].sort((a, b) => validos.filter((l) => l.modulo === b).length - validos.filter((l) => l.modulo === a).length);
const porModulo = Object.fromEntries(modulos.map((m) => [m, agregado(validos.filter((l) => l.modulo === m))]));
const geral = agregado(validos);
const suspeitosTodos = linhas.flatMap((l) => l.suspeitos.map((s) => ({ ...s, arquivo: l.arquivo })));
const semJson = [...indice.values()].filter((i) => !arquivos.includes(i.arquivo));

const resultado = {
  gerado_em: new Date().toISOString(),
  pasta,
  arquivos_json: arquivos.length,
  entradas_no_indice: indice.size,
  sem_json: semJson.map((i) => ({ id: i.id, titulo: i.titulo, arquivo: i.arquivo })),
  analisados: linhas.length,
  erros,
  vazios: linhas.filter((l) => l.vazio).map((l) => l.arquivo),
  geral,
  por_modulo: porModulo,
  residuos: {
    templates_com_residuo: validos.filter((l) => l.residuos.length).length,
    literais: Object.fromEntries([...new Set(validos.flatMap((l) => l.residuos))].map((lit) => [lit, validos.filter((l) => l.residuos.includes(lit)).map((l) => l.arquivo)])),
    templates_com_setor_de_fora: validos.filter((l) => l.setores_de_fora.length).length,
    templates_com_saida_de_fora: validos.filter((l) => l.saida_de_fora).length,
    suspeitos_por_classe: Object.fromEntries(["cidade", "fora_das_opcoes", "texto_livre"].map((c) => [c, suspeitosTodos.filter((s) => s.classe === c).length])),
  },
  templates: linhas,
};

// ---------- markdown ----------
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const md: string[] = [];
md.push("# Análise dos modelos do Estúdio (forms_modelo)", "");
md.push(`> Gerado por \`npm run analyze:lote\` em ${resultado.gerado_em.slice(0, 16).replace("T", " ")}. Não editar à mão.`, "");
md.push("## Resumo", "");
md.push(`- **${arquivos.length} templates** em \`${pasta}/\` (o índice lista ${indice.size}${semJson.length ? `; sem JSON: ${semJson.map((i) => i.titulo).join(", ")}` : ""}).`);
md.push(`- **${linhas.length} analisados sem erro**, ${erros.length} com erro.`);
md.push(`- **${resultado.vazios.length} vazios** (rascunho "Titulo novo assunto", 0 campos) ficam fora das contas abaixo: base = **${validos.length} templates**.`);
md.push(`- Totais: ${geral.etapas.total} etapas, ${geral.campos.total} campos, ${geral.expressoes.total} expressões, **${geral.pontos.total} pontos de parametrização** (${geral.bloqueiam.total} bloqueiam).`);
md.push(`- Medianas por template: ${geral.etapas.mediana} etapas, ${geral.campos.mediana} campos, ${geral.expressoes.mediana} expressões, **${geral.pontos.mediana} pontos** (média ${geral.pontos.media}).`);
md.push(`- Cobertura: dos ${geral.campos.total} campos, ${geral.campos_parametrizaveis} dependem de alguma pergunta; **${geral.cobertura_campos}% já vêm prontos do modelo** (mediana por template: ${geral.cobertura_mediana}%).`);
md.push(`- Resíduos de outra cidade em regra de validação: **${resultado.residuos.templates_com_residuo} templates** (${Object.entries(resultado.residuos.literais).map(([k, v]) => `"${k}" ×${v.length}`).join(", ") || "nenhum"}).`);
md.push(`- Setores herdados de outra prefeitura/ambiente no trâmite ou na entrada: **${resultado.residuos.templates_com_setor_de_fora} templates**. Documento final com modelo de outra configuração: **${resultado.residuos.templates_com_saida_de_fora}**.`);
md.push("");
md.push("### Pontos por tipo (todos os templates)", "");
md.push(`| ${TIPOS.join(" | ")} |`, `| ${TIPOS.map(() => "---:").join(" | ")} |`, `| ${TIPOS.map((t) => geral.por_tipo[t]).join(" | ")} |`, "");
md.push("### Por módulo (`config.tenance`)", "");
md.push("| módulo | templates | etapas (mediana) | campos (total / mediana) | expressões (total / mediana) | pontos (total / mediana) | cobertura dos campos |");
md.push("|---|---:|---:|---:|---:|---:|---:|");
for (const m of modulos) {
  const a = porModulo[m];
  md.push(`| ${m} | ${a.templates} | ${a.etapas.mediana} | ${a.campos.total} / ${a.campos.mediana} | ${a.expressoes.total} / ${a.expressoes.mediana} | ${a.pontos.total} / ${a.pontos.mediana} | ${a.cobertura_campos}% |`);
}
md.push("");
md.push("## Por template", "");
md.push("Pontos por tipo: setor / opções / documento / dataset / texto / taxa / card / saída / resíduo. Cobertura = campos sem nenhuma pergunta ÷ campos.", "");
md.push(`| nome | sigla | módulo | etapas | campos | expr. | ${TIPOS_TABELA.join(" | ")} | total | cobertura | resíduos e alertas |`);
md.push(`|---|---|---|---:|---:|---:|${TIPOS_TABELA.map(() => "---:").join("|")}|---:|---:|---|`);
for (const l of [...linhas].sort((a, b) => a.modulo.localeCompare(b.modulo) || a.nome.localeCompare(b.nome))) {
  const alertas = [
    ...l.residuos.map((r) => `"${r}"`),
    ...(l.setores_de_fora.length ? [`setor: ${l.setores_de_fora.map((s) => `\`${s}\``).join(", ")}`] : []),
    ...(l.saida_de_fora ? ["saída de outra configuração"] : []),
    ...(l.vazio ? ["vazio"] : []),
    ...(l.desativado ? ["desativado"] : []),
  ].join("; ");
  md.push(`| ${l.nome.replace(/\|/g, "/")} | ${l.sigla ?? "—"} | ${l.modulo} | ${l.etapas} | ${l.campos} | ${l.expressoes} | ${TIPOS_TABELA.map((t) => l.por_tipo[t] || "·").join(" | ")} | ${l.pontos} | ${pct(l.cobertura)} | ${alertas} |`);
}
md.push("");
md.push("## O que a heurística de resíduo sinaliza", "");
md.push("Literais com cara de nome próprio **comparados** com um campo do model (`model.x === 'Lit'`) e que não aparecem nas opções do formulário (nem nas opções montadas por expressão). Só a classe `cidade` vira pergunta `residuo` na ficha (e é trocada automaticamente pelo nome da cidade no pipeline); as outras ficam aqui para julgamento humano.", "");
md.push("| classe | literal | campo comparado | template | trecho |", "|---|---|---|---|---|");
for (const s of suspeitosTodos.sort((a, b) => a.classe.localeCompare(b.classe))) {
  md.push(`| ${s.classe} | "${s.literal}" | \`${s.campo}\` | ${s.arquivo.replace(/__.*$/, "")} | \`${s.trecho.replace(/\|/g, "\\|").slice(0, 110)}\` |`);
}
md.push("");
md.push("## Erros", "");
if (!erros.length) md.push("Nenhum template quebrou o analisador.");
for (const e of erros) md.push(`- \`${e.arquivo}\`: ${e.erro}`);
if (semJson.length) md.push("", `Sem JSON no export (o índice cita, a API devolveu vazio): ${semJson.map((i) => `${i.titulo} (\`${i.id}\`)`).join(", ")}.`);
md.push("");

fs.mkdirSync(path.dirname(saidaMd), { recursive: true });
fs.writeFileSync(saidaMd, md.join("\n"));
fs.writeFileSync(saidaJson, JSON.stringify(resultado, null, 2));
console.error(`${linhas.length}/${arquivos.length} analisados, ${erros.length} erros, ${resultado.vazios.length} vazios`);
console.error(`base ${validos.length}: mediana ${geral.pontos.mediana} pontos (média ${geral.pontos.media}), cobertura ${geral.cobertura_campos}% dos campos`);
console.error(`gravado: ${saidaMd}, ${saidaJson}`);
