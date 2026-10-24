// Testes do Extrator sem API: cliente falso que devolve respostas prontas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extrair, trechoNoDocumento, aterrarEmTexto, limitarConfiancaImagem, itensDeConferencia, mesclarVerificacao,
  MOTIVO_SEM_TRECHO, type ClienteLLM,
} from "./extrator.js";
import type { Pergunta } from "../core/types.js";

const pergunta = (id: string, tipo: Pergunta["tipo"], texto: string): Pergunta => ({
  id, tipo, grupo: "g", texto, assume: null, afeta: [], prioridade: "bloqueia", aceita_anexo: true, resposta: null, confianca: 0, origem: null,
});
const ZONAS = pergunta("opcoes-16", "opcoes", 'Para "Zoneamento", quais são as zonas?');
const DATASET = pergunta("dataset-28", "dataset", "Parâmetros por zona");

function clienteFalso(respostas: { parse: unknown[]; create?: string[] }) {
  const chamadas: any[] = [];
  const cliente: ClienteLLM = {
    messages: {
      async parse(p) { chamadas.push({ tipo: "parse", p }); return { parsed_output: respostas.parse.shift() }; },
      async create(p) { chamadas.push({ tipo: "create", p }); return { content: [{ type: "text", text: respostas.create?.shift() ?? "" }] }; },
    },
  };
  return { cliente, chamadas };
}

test("trecho: ignora caixa e espaços, exige texto literal", () => {
  const doc = "Art. 12. O recuo frontal   mínimo na ZR2 é de\n4,00 m (quatro metros).";
  assert.ok(trechoNoDocumento("o RECUO frontal mínimo na zr2 é de 4,00 m", doc));
  assert.ok(trechoNoDocumento("“recuo frontal mínimo”", doc));
  assert.ok(trechoNoDocumento("Art. 12 ... 4,00 m", doc), "reticências cortam, pedaços em ordem");
  assert.ok(!trechoNoDocumento("4,00 m ... Art. 12", doc), "ordem invertida não vale");
  assert.ok(!trechoNoDocumento("recuo frontal mínimo na ZR2 é de 5,00 m", doc));
  assert.ok(!trechoNoDocumento("   ", doc));
});

test("aterrar: descarta candidato sem trecho e pergunta que não está aberta", () => {
  const doc = "ZONAS: ZR1, ZR2, ZC1 e ZI";
  const r = aterrarEmTexto([
    { pergunta_id: "opcoes-16", valor: ["ZR1", "ZR2", "ZC1", "ZI"], trecho: "zonas: zr1, zr2, zc1 e zi", confianca: 0.95 },
    { pergunta_id: "opcoes-16", valor: ["ZR3"], trecho: "ZR3", confianca: 0.9 },
    { pergunta_id: "taxa-34", valor: 100, trecho: "ZONAS", confianca: 0.9 },
  ], doc, "pdf", new Set(["opcoes-16"]));
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].fonte, "pdf");
  assert.equal(r.candidatos[0].verificado, true);
  assert.deepEqual(r.descartados.map((d) => d.motivo), [MOTIVO_SEM_TRECHO, "pergunta não está aberta na ficha"]);
});

test("imagem: confiança nasce limitada a 0,7", () => {
  assert.equal(limitarConfiancaImagem({ pergunta_id: "x", valor: 1, trecho: "t", confianca: 0.98 }).confianca, 0.7);
  assert.equal(limitarConfiancaImagem({ pergunta_id: "x", valor: 1, trecho: "t", confianca: 0.5 }).confianca, 0.5);
});

test("verificação: tabela vira um item por zona e só 'sim' em todas sobe para 0,9", () => {
  const cands = [
    limitarConfiancaImagem({ pergunta_id: "opcoes-16", valor: ["ZR1", "ZR2"], trecho: "cabeçalho", confianca: 0.9 }),
    limitarConfiancaImagem({ pergunta_id: "dataset-28", valor: { ZR1: { RECUO_FRONTAL: 4 }, ZR2: { RECUO_FRONTAL: 5 } }, trecho: "tabela", confianca: 0.9 }),
  ];
  const itens = itensDeConferencia(cands, new Map());
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map((i) => i.linha), [undefined, "ZR1", "ZR2"]);
  const r = mesclarVerificacao(cands, itens, [{ item: 1, resposta: "sim" }, { item: 2, resposta: "sim" }, { item: 3, resposta: "não" }]);
  assert.equal(r[0].confianca, 0.9);
  assert.equal(r[0].verificado, true);
  assert.equal(r[1].confianca, 0.4);
  assert.equal(r[1].precisa_confirmacao, true);
  assert.deepEqual(r[1].conferir, ["ZR2"]);
});

test("verificação: sem veredito ou 'ilegível' conta como não confirmado", () => {
  const cands = [limitarConfiancaImagem({ pergunta_id: "a", valor: "x", trecho: "t", confianca: 0.9 })];
  const itens = itensDeConferencia(cands, new Map());
  assert.equal(mesclarVerificacao(cands, itens, [])[0].confianca, 0.4);
  assert.equal(mesclarVerificacao(cands, itens, [{ item: 1, resposta: "ilegível" }])[0].precisa_confirmacao, true);
});

test("extrair imagem: duas chamadas, a segunda só com a imagem e os valores", async () => {
  const { cliente, chamadas } = clienteFalso({
    parse: [
      { candidatos: [
        { pergunta_id: "opcoes-16", valor_json: '["ZR1","ZR2","ZC1","ZI"]', trecho: "coluna Zona", confianca: 0.95 },
        { pergunta_id: "dataset-28", valor_json: '{"ZR1":{"RECUO_FRONTAL":4},"ZR2":{"RECUO_FRONTAL":4}}', trecho: "tabela", confianca: 0.9 },
        { pergunta_id: "nao-aberta", valor_json: "1", trecho: "x", confianca: 0.9 },
      ] },
      { vereditos: [{ item: 1, resposta: "sim" }, { item: 2, resposta: "sim" }, { item: 3, resposta: "ilegivel" }] },
    ],
  });
  const img = { tipo: "imagem" as const, media_type: "image/png" as const, base64: "AAAA", nome: "t.png" };
  const r = await extrair(img, [ZONAS, DATASET], { cliente, modelo: "fake" });
  assert.equal(chamadas.length, 2);
  assert.ok(!("thinking" in chamadas[1].p), "conferência não usa thinking");
  assert.match(JSON.stringify(chamadas[1].p.messages), /ZR2/);
  assert.equal(r.candidatos[0].fonte, "imagem");
  assert.equal(r.candidatos[0].confianca, 0.9);
  assert.equal(r.candidatos[1].confianca, 0.4);
  assert.deepEqual(r.candidatos[1].conferir, ["ZR2"]);
  assert.equal(r.descartados.length, 1);
});

test("extrair imagem: falha na segunda leitura deixa tudo para confirmar", async () => {
  const cliente: ClienteLLM = {
    messages: {
      parse: (() => { let n = 0; return async () => { if (n++ === 0) return { parsed_output: { candidatos: [{ pergunta_id: "opcoes-16", valor_json: '["ZR1"]', trecho: "t", confianca: 0.95 }] } }; throw new Error("rede"); }; })(),
      async create() { return { content: [] }; },
    },
  };
  const r = await extrair({ tipo: "imagem", media_type: "image/png", base64: "A" }, [ZONAS], { cliente, modelo: "fake" });
  assert.equal(r.candidatos[0].confianca, 0.4);
  assert.equal(r.candidatos[0].precisa_confirmacao, true);
});

test("extrair PDF: transcreve primeiro e aterra os trechos na transcrição", async () => {
  const { cliente, chamadas } = clienteFalso({
    create: ["--- página 2 ---\nANEXO II - Zonas: ZR1, ZR2, ZC1 e ZI\nZR2 | recuo frontal | 4,00 m"],
    parse: [{ candidatos: [
      { pergunta_id: "opcoes-16", valor_json: '["ZR1","ZR2","ZC1","ZI"]', trecho: "Zonas: ZR1, ZR2, ZC1 e ZI", confianca: 0.95 },
      { pergunta_id: "dataset-28", valor_json: '{"ZR2":{"RECUO_FRONTAL":5}}', trecho: "ZR2 | recuo frontal | 5,00 m", confianca: 0.95 },
    ] }],
  });
  const r = await extrair({ tipo: "pdf", base64: "JVBERi0=", nome: "lei.pdf" }, [ZONAS, DATASET], { cliente, modelo: "fake" });
  assert.deepEqual(chamadas.map((c) => c.tipo), ["create", "parse"]);
  assert.match(JSON.stringify(chamadas[1].p.messages), /ANEXO II/, "a extração recebe a transcrição");
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].fonte, "pdf");
  assert.equal(r.descartados[0].motivo, MOTIVO_SEM_TRECHO);
});

test("extrair PDF ilegível: sem transcrição, sem candidatos", async () => {
  const { cliente, chamadas } = clienteFalso({ create: [""], parse: [] });
  const r = await extrair({ tipo: "pdf", base64: "x" }, [ZONAS], { cliente, modelo: "fake" });
  assert.equal(chamadas.length, 1);
  assert.equal(r.motivo, "ilegivel");
});

test("extrair texto/planilha: uma chamada, fonte texto", async () => {
  const { cliente, chamadas } = clienteFalso({ parse: [{ candidatos: [{ pergunta_id: "opcoes-16", valor_json: "não é json", trecho: "zona;ZR1", confianca: 0.9 }] }] });
  const r = await extrair({ tipo: "texto", texto: "zona;ZR1\nzona;ZR2" }, [ZONAS], { cliente, modelo: "fake" });
  assert.equal(chamadas.length, 1);
  assert.equal(r.candidatos[0].fonte, "texto");
  assert.equal(r.candidatos[0].valor, "não é json", "valor_json inválido fica como texto");
});

test("extrair imagem: valor_json vira objeto de verdade", async () => {
  const { cliente } = clienteFalso({ parse: [
    { candidatos: [{ pergunta_id: "dataset-28", valor_json: '{"ZI":{"RECUO_FRONTAL":10}}', trecho: "linha ZI", confianca: 0.9 }] },
    { vereditos: [{ item: 1, resposta: "sim" }] },
  ] });
  const r = await extrair({ tipo: "imagem", media_type: "image/png", base64: "A" }, [DATASET], { cliente, modelo: "fake" });
  assert.deepEqual(r.candidatos[0].valor, { ZI: { RECUO_FRONTAL: 10 } });
  assert.equal(r.candidatos[0].confianca, 0.9);
});
