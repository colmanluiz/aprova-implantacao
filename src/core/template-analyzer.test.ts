import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analisarTemplate, resumoTemplate } from "./template-analyzer.js";
import { aplicarFicha } from "./patcher.js";
import { rodarCenarios } from "./scenario-runner.js";
import type { AprovaTemplate, Cenario, Ficha } from "./types.js";

const tpl: AprovaTemplate = JSON.parse(fs.readFileSync("fixtures/templates/alvara-construcao.modeload.json", "utf8"));
const ficha: Ficha = JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8"));
const cenarios: Cenario[] = JSON.parse(fs.readFileSync("fixtures/cenarios/alvara.cenarios.json", "utf8"));

test("resumo do template real", () => {
  const r = resumoTemplate(tpl);
  assert.equal(r.etapas, 11);
  assert.equal(r.campos, 134);
  assert.ok(r.expressoes >= 150);
});

test("analisador encontra setor, dataset, documentos e o resíduo Cascavel", () => {
  const f = analisarTemplate(tpl);
  const all = f.grupos.flatMap((g) => g.perguntas);
  assert.ok(all.some((q) => q.tipo === "setor"));
  assert.ok(all.some((q) => q.tipo === "dataset" && (q.assume as any).chaves.includes("RECUO_FRONTAL")));
  assert.equal(all.filter((q) => q.tipo === "documento").length, 11);
  assert.ok(all.some((q) => q.tipo === "residuo" && q.assume === "Cascavel"));
});

test("template cru falha nos cenários que dependem da cidade; parametrizado passa em todos", () => {
  const cru = rodarCenarios(tpl, cenarios);
  assert.ok(cru.some((r) => !r.passou));
  const { form } = aplicarFicha(tpl, ficha);
  const res = rodarCenarios(form, cenarios);
  assert.deepEqual(res.filter((r) => !r.passou).map((r) => r.id), []);
});

test("após aplicar, não sobra placeholder modeload", () => {
  const { form } = aplicarFicha(tpl, ficha);
  assert.ok(!JSON.stringify(form).includes("modeload"));
});

// ---- modelos reais do Estúdio (forms_modelo/) e formatos tortos ----
import { literaisSuspeitos } from "./template-analyzer.js";
const modelo = (nome: string): AprovaTemplate => {
  const arq = fs.readdirSync("forms_modelo").find((f) => f.startsWith(`${nome}__`) && f.endsWith(".json"));
  assert.ok(arq, `modelo ${nome} não encontrado em forms_modelo/`);
  return JSON.parse(fs.readFileSync(`forms_modelo/${arq}`, "utf8"));
};
const perguntas = (t: AprovaTemplate) => analisarTemplate(t).grupos.flatMap((g) => g.perguntas);

test("formato torto não quebra: sem config, form objeto, opção-string, fieldArray sem fieldGroup, expressionProperties null", () => {
  const torto = {
    form: {
      wrappers: ["stepper"],
      fieldGroup: [
        null,
        {
          wrappers: ["step"], templateOptions: { label: "Pedido" },
          fieldGroup: [
            { key: "tipo", type: "radio", templateOptions: { label: "Tipo", options: ["Comum", "Urgente", "Especial", "Outro"] }, expressionProperties: null },
            { key: "anexos", type: "next-repeat", fieldArray: { key: "arquivo", type: "next-upload", templateOptions: { label: "Arquivo", required: true } } },
          ],
        },
      ],
    },
  } as unknown as AprovaTemplate;
  const r = resumoTemplate(torto);
  assert.equal(r.etapas, 1);
  assert.equal(r.campos, 3);
  const qs = perguntas(torto);
  const op = qs.find((q) => q.tipo === "opcoes");
  assert.deepEqual(op?.assume, ["Comum", "Urgente", "Especial", "Outro"]);
  const doc = qs.find((q) => q.tipo === "documento");
  assert.deepEqual(doc?.afeta, ["anexos[].arquivo"]);
  assert.equal((doc?.assume as any).repetivel, true);
  assert.ok(!qs.some((q) => q.tipo === "setor")); // sem config, sem placeholder
  assert.doesNotThrow(() => analisarTemplate({} as AprovaTemplate));
});

test("modelo vazio (rascunho 'Titulo novo assunto'): zero campos e só a pergunta de setor", () => {
  const t = modelo("titulo_novo_assunto");
  assert.deepEqual([resumoTemplate(t).etapas, resumoTemplate(t).campos], [0, 0]);
  assert.deepEqual(perguntas(t).map((q) => q.tipo), ["setor"]);
});

test("resíduo: opções montadas por expressão e valores atribuídos não contam", () => {
  // Berçário/Maternal vêm de `templateOptions|||options` por expressão; Proprietários/Quadra são push() de texto.
  for (const nome of ["emissao_de_documentos_escolares", "lume_matricula"]) {
    assert.deepEqual(perguntas(modelo(nome)).filter((q) => q.tipo === "residuo").map((q) => q.assume), [], nome);
  }
  // "Brasil" comparado com autocomplete e "Outras áreas" fora das opções: suspeitos, mas não resíduo de cidade.
  const sus = [...literaisSuspeitos(modelo("solicitacao_de_cadastro_em_programas_sociais")), ...literaisSuspeitos(modelo("autorizacao_de_extracao_supressao_arborea"))];
  assert.deepEqual([...new Set(sus.map((s) => `${s.literal}:${s.classe}`))], ["Brasil:texto_livre", "Outras áreas:fora_das_opcoes"]);
  assert.ok(!perguntas(modelo("autorizacao_de_extracao_supressao_arborea")).some((q) => q.tipo === "residuo"));
});

test("resíduo de cidade em outro modelo: João Pessoa e Cascavel no formulário padrão", () => {
  const lits = perguntas(modelo("formulario_padrao_projeto_ambiente_modelo")).filter((q) => q.tipo === "residuo").map((q) => q.assume);
  assert.deepEqual(lits.sort(), ["Cascavel", "João Pessoa"]);
});

test("setor herdado de outra prefeitura entra na pergunta de setor e é trocado ao aplicar", () => {
  const t = modelo("solicitacao_de_ferias");
  const setor = perguntas(t).find((q) => q.tipo === "setor")!;
  assert.ok((setor.assume as string[]).includes("csimplantacao_implantacaoad"));
  const f: Ficha = { processo: "Férias", template: "x", criada_em: "", grupos: [{ nome: "Quem atende", perguntas: [{ ...setor, resposta: { slug: "rh" }, confianca: 1, origem: "teste" }] }] };
  const { form } = aplicarFicha(t, f);
  const txt = JSON.stringify(form);
  assert.ok(!txt.includes("implantacaoad") && !txt.includes("modeload"));
  assert.ok(txt.includes('"csimplantacao_rh"'));
});

test("segundo processo da demo (férias): cenários de balcão passam no template cru", () => {
  const t = modelo("solicitacao_de_ferias");
  const cs: Cenario[] = JSON.parse(fs.readFileSync("fixtures/cenarios/solicitacao_de_ferias__678172ef8989870008b47fde.cenarios.json", "utf8"));
  assert.ok(cs.length >= 5);
  assert.deepEqual(rodarCenarios(t, cs).filter((r) => !r.passou).map((r) => r.id), []);
});
