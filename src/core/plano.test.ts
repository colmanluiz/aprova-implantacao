// Plano de ação: operações validadas contra o formulário real (Habite-se), aplicadas por código e conferidas por casos automáticos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AprovaTemplate } from "./types.js";
import { validarOperacao, aplicarPlano, verificarPlano, cenariosDoPlano, type ItemPlano, type Operacao } from "./plano.js";
import { rodarCenarios } from "./scenario-runner.js";
import { avaliarFormulario, acharCampo } from "./expression-evaluator.js";
import { resumoModelo, pdfDoModelo, etapasDoModelo } from "./resumo-modelo.js";

const habite = (): AprovaTemplate => JSON.parse(fs.readFileSync("forms_modelo/habite_se__6764623d3671100008547843.json", "utf8"));
let n = 0;
const item = (operacao: Operacao, status: ItemPlano["status"] = "confirmado"): ItemPlano =>
  ({ id: `m${++n}`, descricao: `mudança ${n}`, operacao, status, origem: "teste", proposto_em: "x" });

test("validarOperacao: campo, etapa e valores de condição são conferidos contra o formulário", () => {
  const f = habite();
  assert.deepEqual(validarOperacao(f, { tipo: "remover_campo", campo: "doc_procurador" }), []);
  assert.match(validarOperacao(f, { tipo: "remover_campo", campo: "nao_existe" })[0], /não existe/);
  assert.match(validarOperacao(f, { tipo: "adicionar_campo", etapa: "Etapa fantasma", rotulo: "X", formato: "texto", obrigatorio: false })[0], /etapa "Etapa fantasma" não existe/);
  const e = validarOperacao(f, { tipo: "exigir_quando", campo: "documento_requerente", quando: { campo: "vinculo_requerente", valores: ["Inquilino"] } });
  assert.match(e[0], /não são opções/);
  assert.match(validarOperacao(f, { tipo: "adicionar_campo", etapa: "Documentos obrigatórios", rotulo: "Tipo", formato: "selecao", obrigatorio: true })[0], /precisa de opcoes/);
});

test("aplicarPlano: remover, condicionar, renomear, trocar opções e adicionar campo; casos automáticos passam", () => {
  const itens = [
    item({ tipo: "remover_campo", campo: "doc_procurador" }),
    item({ tipo: "exigir_quando", campo: "documento_requerente", quando: { campo: "vinculo_requerente", valores: ["Procurador"] } }),
    item({ tipo: "renomear_campo", campo: "documento_requerente", rotulo: "RG e CPF do requerente" }),
    item({ tipo: "adicionar_campo", etapa: "Documentos obrigatórios", rotulo: "Certidão negativa de débitos", formato: "anexo", obrigatorio: true }),
    item({ tipo: "adicionar_campo", etapa: "Dados do Requerente", rotulo: "Número da OAB", formato: "texto", obrigatorio: true, quando: { campo: "vinculo_requerente", valores: ["Procurador"] } }),
    item({ tipo: "remover_campo", campo: "telefone_requerente" }, "proposto"),
  ];
  const { form, mudancas, falhas } = aplicarPlano(habite(), itens);
  assert.deepEqual(falhas, []);
  assert.equal(mudancas.length, 5, "item só proposto não é aplicado");
  const casos = cenariosDoPlano(form, itens);
  assert.ok(casos.length >= 5);
  const res = rodarCenarios(form, casos);
  assert.deepEqual(res.filter((r) => !r.passou).map((r) => r.id), [], "todos os casos automáticos passam");
  // a ordem dos rótulos no PDF/resumo reflete o novo campo e o rótulo trocado
  const docs = etapasDoModelo(form).find((e) => e.titulo === "Documentos obrigatórios")!;
  assert.ok(docs.itens.some((i) => i.rotulo === "Certidão negativa de débitos"));
  assert.ok(etapasDoModelo(form).flatMap((e) => e.itens).some((i) => i.rotulo === "RG e CPF do requerente"));
  // campo oculto não aparece mais no resumo
  assert.ok(!etapasDoModelo(form).flatMap((e) => e.itens).some((i) => i.path === "doc_procurador"));
});

test("aplicarPlano: remover etapa, renomear etapa e trocar opções mudam a estrutura", () => {
  const { form, falhas } = aplicarPlano(habite(), [
    item({ tipo: "remover_etapa", etapa: "Relatório fotográfico da obra concluída" }),
    item({ tipo: "renomear_etapa", etapa: "Documentos Complementares", titulo: "Outros documentos" }),
    item({ tipo: "trocar_opcoes", campo: "vinculo_requerente", opcoes: ["Proprietário do imóvel", "Procurador"] }),
  ]);
  assert.deepEqual(falhas, []);
  const titulos = etapasDoModelo(form).map((e) => e.titulo);
  assert.ok(!titulos.includes("Relatório fotográfico da obra concluída"));
  assert.ok(titulos.includes("Outros documentos"));
  const est = acharCampo(avaliarFormulario(form, {}), "vinculo_requerente");
  assert.ok(est);
});

test("verificarPlano: item que ficou inválido sai como 'não aplicado' com o motivo", () => {
  const itens = [item({ tipo: "remover_etapa", etapa: "Dados do Requerente" }), item({ tipo: "remover_campo", campo: "doc_procurador" })];
  const { porItem } = verificarPlano(habite(), itens);
  assert.equal(porItem[itens[0].id].ok, true);
  assert.equal(porItem[itens[1].id].ok, false);
  assert.match(porItem[itens[1].id].detalhe, /^não aplicado/);
});

test("resumo e PDF do modelo: curtos para o chat e PDF válido", () => {
  const r = resumoModelo(habite(), "Habite-se");
  assert.ok(r.split("\n").length <= 8);
  assert.ok(!/campo|json|template/i.test(r), "sem jargão");
  const pdf = pdfDoModelo(habite(), "Habite-se", "Vale Verde");
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.subarray(-6).toString("latin1"), /%%EOF/);
});
