import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analisarTemplate } from "../core/template-analyzer.js";
import { aplicarFicha } from "../core/patcher.js";
import { rodarCenarios } from "../core/scenario-runner.js";
import type { AprovaTemplate, Cenario, Ficha } from "../core/types.js";
import { CRITERIOS, type CtxCriterio } from "./criterios.js";
import { carregarPipeline } from "./definicao.js";
import { novoRun } from "./run.js";
import type { ClienteJuiz } from "./juiz.js";

const tpl: AprovaTemplate = JSON.parse(fs.readFileSync("fixtures/templates/alvara-construcao.modeload.json", "utf8"));
const fichaVV = (): Ficha => JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8"));
const cenarios: Cenario[] = JSON.parse(fs.readFileSync("fixtures/cenarios/alvara.cenarios.json", "utf8"));
const def = carregarPipeline();
const ctxBase = { cidade: "t", processo: "t", template: "x" };
const k = (nome: string) => def.etapas.flatMap((e) => e.criterios).find((c) => c.nome === nome)!;

function cx(nome: string, extra: Partial<CtxCriterio> = {}): CtxCriterio {
  return { ctx: ctxBase, run: novoRun(ctxBase, def, "Alvará"), criterio: k(nome), template: tpl, juiz: null, ...extra };
}
const av = (nome: string, extra: Partial<CtxCriterio> = {}) => CRITERIOS[nome](cx(nome, extra));

test("analisar: template real tem perguntas bloqueantes e todo modeload tem pergunta de setor", async () => {
  const ficha = analisarTemplate(tpl);
  assert.equal((await av("ficha tem perguntas bloqueantes", { ficha })).resultado, "passou");
  assert.equal((await av("nenhum placeholder sem pergunta", { ficha })).resultado, "passou");
  const semSetor = { ...ficha, grupos: ficha.grupos.map((g) => ({ ...g, perguntas: g.perguntas.filter((q) => q.tipo !== "setor") })) };
  assert.equal((await av("nenhum placeholder sem pergunta", { ficha: semSetor })).resultado, "falhou");
});

test("coletar: ficha recém-analisada fica aguardando (não falha)", async () => {
  const r = await av("nenhuma pergunta em aberto", { ficha: analisarTemplate(tpl) });
  assert.equal(r.resultado, "aguardando");
  assert.match(r.detalhe, /perguntas abertas/);
});

test("coletar: ficha de Vale Verde ainda tem abertas; com pendências anotadas, passa", async () => {
  const f = fichaVV();
  assert.equal((await av("nenhuma pergunta em aberto", { ficha: f })).resultado, "aguardando");
  for (const q of f.grupos.flatMap((g) => g.perguntas)) if (q.resposta === null) q.pendencia ??= "analista não sabe";
  assert.equal((await av("nenhuma pergunta em aberto", { ficha: f })).resultado, "passou");
});

test("coletar: segunda rejeição de schema seguida vira falha", async () => {
  const run = novoRun(ctxBase, def, "Alvará");
  run.rejeicoes_schema = { "opcoes-04": { n: 1, erro: "x" } };
  const f = analisarTemplate(tpl);
  assert.equal((await CRITERIOS["nenhuma pergunta em aberto"](cx("nenhuma pergunta em aberto", { ficha: f, run }))).resultado, "aguardando");
  run.rejeicoes_schema["opcoes-04"].n = 2;
  const r = await CRITERIOS["nenhuma pergunta em aberto"](cx("nenhuma pergunta em aberto", { ficha: f, run }));
  assert.equal(r.resultado, "falhou");
  assert.match(r.detalhe, /opcoes-04/);
});

test("extrair: candidato sem trecho falha; com trecho e confiança passa; sem candidatos passa com motivo", async () => {
  const f = fichaVV();
  const bom = { pergunta_id: "opcoes-16", valor: ["ZR1"], trecho: "Tabela I", confianca: 0.9, fonte: "pdf" as const };
  assert.equal((await av("todo candidato cita trecho e confiança", { ficha: f, extracao: { candidatos: [bom], descartados: [] } })).resultado, "passou");
  assert.equal((await av("todo candidato cita trecho e confiança", { ficha: f, extracao: { candidatos: [{ ...bom, trecho: " " }], descartados: [] } })).resultado, "falhou");
  assert.equal((await av("todo candidato cita trecho e confiança", { ficha: f, extracao: { candidatos: [{ ...bom, pergunta_id: "nao-existe" }], descartados: [] } })).resultado, "falhou");
  assert.equal((await av("todo candidato cita trecho e confiança", { ficha: f, extracao: { candidatos: [], descartados: [], motivo: "ilegivel" } })).resultado, "passou");
});

test("aplicar: formulário de Vale Verde sem modeload; template cru reprova", async () => {
  const f = fichaVV();
  const { form } = aplicarFicha(tpl, f);
  assert.equal((await av("formulário sem placeholder de modelo", { form })).resultado, "passou");
  assert.equal((await av("formulário sem placeholder de modelo", { form: tpl })).resultado, "falhou");
});

test("aplicar: resíduo sem decisão reprova; com pendência anotada ou corrigido passa", async () => {
  const f = fichaVV();
  const { form } = aplicarFicha(tpl, f);
  const residuos = f.grupos.flatMap((g) => g.perguntas).filter((q) => q.tipo === "residuo");
  const semDecisao = residuos.filter((q) => q.resposta === null);
  if (semDecisao.length) {
    assert.equal((await av("nenhum resíduo de outra cidade pendente", { ficha: f, form })).resultado, "falhou");
    for (const q of semDecisao) q.pendencia = "falso positivo?";
  }
  assert.equal((await av("nenhum resíduo de outra cidade pendente", { ficha: f, form })).resultado, "passou");
  // Resposta registrada mas formulário ainda com o literal (ex.: template cru): reprova.
  assert.equal((await av("nenhum resíduo de outra cidade pendente", { ficha: f, form: tpl })).resultado, "falhou");
});

test("validar: 15/15 no formulário de Vale Verde, sem indeterminada nova; template cru reprova", async () => {
  const { form } = aplicarFicha(tpl, fichaVV());
  const relatorio = rodarCenarios(form, cenarios);
  assert.equal((await av("todos os cenários passam", { relatorio, cenarios })).resultado, "passou");
  assert.equal((await av("nenhuma expressão indeterminada nova", { relatorio, cenarios })).resultado, "passou");
  const cru = rodarCenarios(tpl, cenarios);
  const r = await av("todos os cenários passam", { relatorio: cru, cenarios });
  assert.equal(r.resultado, "falhou");
  assert.equal((await av("todos os cenários passam", {})).resultado, "falhou");
});

const juizFalso = (saida: unknown | Error): { cliente: ClienteJuiz; modelo: string; chamadas: any[] } => {
  const chamadas: any[] = [];
  return {
    chamadas,
    modelo: "fake",
    cliente: { messages: { parse: async (p: any) => { chamadas.push(p); if (saida instanceof Error) throw saida; return { parsed_output: saida }; } } },
  };
};

test("juiz: sem LLM fica nao_avaliado", async () => {
  const r = await av("cenários cobrem a ficha", { ficha: fichaVV(), cenarios });
  assert.deepEqual(r, { resultado: "nao_avaliado", detalhe: "sem LLM" });
});

test("juiz: pass=true passa; pass=false lista faltam; sem tools e com rubrica", async () => {
  const j = juizFalso({ pass: true, faltam: [] });
  assert.equal((await av("cenários cobrem a ficha", { ficha: fichaVV(), cenarios, juiz: j })).resultado, "passou");
  assert.equal(j.chamadas[0].tools, undefined);
  assert.match(j.chamadas[0].system, /Rubrica/);
  assert.ok(j.chamadas[0].output_config?.format);
  const r = await av("cenários cobrem a ficha", { ficha: fichaVV(), cenarios, juiz: juizFalso({ pass: false, faltam: ["taxa-34", "opcoes-15"] }) });
  assert.equal(r.resultado, "falhou");
  assert.deepEqual(r.faltam, ["taxa-34", "opcoes-15"]);
  assert.match(r.detalhe, /opcoes-15/);
});

test("juiz: falha fechada (saída ilegível, contraditória ou erro de rede reprovam)", async () => {
  for (const saida of [null, { pass: "sim" }, { pass: true, faltam: ["x"] }, new Error("timeout")]) {
    const r = await av("cenários cobrem a ficha", { ficha: fichaVV(), cenarios, juiz: juizFalso(saida) });
    assert.equal(r.resultado, "falhou", JSON.stringify(saida));
  }
});

test("homologar: aguarda até haver decisão do implantador", async () => {
  const run = novoRun(ctxBase, def, "Alvará");
  assert.equal((await CRITERIOS["implantador aprovou"](cx("implantador aprovou", { run }))).resultado, "aguardando");
  run.decisoes = [{ em: "x", etapa: "homologar", para: "implantador", acao: "aprovar" }];
  assert.equal((await CRITERIOS["implantador aprovou"](cx("implantador aprovou", { run }))).resultado, "passou");
});

test("nomeCidade: slug vira nome de exibição", async () => {
  const { nomeCidade } = await import("./run.js");
  assert.equal(nomeCidade("vale-verde"), "Vale Verde");
  assert.equal(nomeCidade("sao-jose-dos-campos"), "Sao Jose dos Campos");
  assert.equal(nomeCidade(""), "");
});
