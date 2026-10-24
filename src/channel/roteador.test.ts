import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rotear, catalogo, lerCsv, menuCurado, textoMenu, slugProcesso, type EstadoChat, type ItemCatalogo } from "./roteador.js";

const item = (titulo: string): ItemCatalogo => ({ id: titulo, titulo, slug: slugProcesso(titulo), arquivo: `${slugProcesso(titulo)}.json`, template: `t/${slugProcesso(titulo)}.json` });
const CAT = ["Alvará de Construção", "Alvará Sanitário", "Habite-se", "Licença Ambiental Prévia (LAP)", "Licença Ambiental de Operação (LAO)", "Auxílio Funeral"].map(item);
const vazio: EstadoChat = { cidade: "vv", processo_atual: null, template: null, escolhido_em: null, ultimo_menu: [] };
const comMenu = (slugs = CAT.map((c) => c.slug)): EstadoChat => ({ ...vazio, ultimo_menu: slugs });
const emAndamento = (extra: Partial<EstadoChat> = {}): EstadoChat => ({ ...vazio, processo_atual: "habite-se", template: "t/habite-se.json", escolhido_em: "x", ...extra });

test("sem processo escolhido: qualquer coisa mostra o menu", () => {
  const r = rotear(vazio, "oi", CAT);
  assert.equal(r.acao, "menu");
});

test("comandos de menu e troca", () => {
  for (const t of ["/start", "/processos", "menu", "Menu", "trocar", "outro processo", "Quero outro"]) {
    assert.equal(rotear(emAndamento(), t, CAT).acao, "menu", t);
  }
});

test("número do último menu escolhe", () => {
  const r = rotear(comMenu(), "2", CAT);
  assert.equal(r.acao, "escolher");
  assert.equal(r.acao === "escolher" && r.item.titulo, "Alvará Sanitário");
  const fora = rotear(comMenu(), "9", CAT);
  assert.equal(fora.acao, "menu");
});

test("número sem menu aberto vai para o processo atual", () => {
  assert.deepEqual(rotear(emAndamento(), "2", CAT), { acao: "encaminhar", texto: "2" });
});

test("nome com e sem acento, maiúsculas", () => {
  for (const t of ["habite-se", "HABITE SE", "auxilio funeral", "Alvara de construcao", "alvará construção"]) {
    const r = rotear(comMenu(), t, CAT);
    assert.equal(r.acao, "escolher", t);
  }
});

test("nome ambíguo mostra menu só com os candidatos", () => {
  const r = rotear(comMenu(), "licenca ambiental", CAT);
  assert.equal(r.acao, "menu");
  assert.deepEqual(r.acao === "menu" && r.opcoes.map((o) => o.titulo), ["Licença Ambiental Prévia (LAP)", "Licença Ambiental de Operação (LAO)"]);
  const alv = rotear(comMenu(), "alvara", CAT);
  assert.equal(alv.acao === "menu" && alv.opcoes.length, 2);
});

test("/processo <nome> escolhe direto, mesmo com processo em andamento", () => {
  const r = rotear(emAndamento(), "/processo alvara sanitario", CAT);
  assert.equal(r.acao === "escolher" && r.item.slug, "alvara-sanitario");
  const nada = rotear(emAndamento(), "/processo xyz", CAT);
  assert.equal(nada.acao === "menu" && nada.aviso, 'Não achei "xyz".');
});

test("com processo em andamento, respostas e nomes soltos são encaminhados", () => {
  assert.deepEqual(rotear(emAndamento(), "1 sim, 2 não", CAT), { acao: "encaminhar", texto: "1 sim, 2 não" });
  assert.equal(rotear(emAndamento(), "Habite-se não é exigido aqui", CAT).acao, "encaminhar");
  assert.equal(rotear(emAndamento(), "quero trocar a taxa", CAT).acao, "encaminhar");
});

test("menu aberto com processo em andamento: texto que não é processo segue para ele", () => {
  assert.equal(rotear(emAndamento({ ultimo_menu: ["habite-se"] }), "1 sim 2 não", CAT).acao, "encaminhar");
});

test("ajuda", () => {
  assert.equal(rotear(emAndamento(), "/ajuda", CAT).acao, "ajuda");
});

test("texto do menu", () => {
  const r = rotear(vazio, "menu", CAT);
  assert.ok(r.acao === "menu");
  const t = textoMenu({ ...r, total: 129 });
  assert.match(t, /^Sobre qual serviço vamos conversar\? Responda com o número ou o nome\.\n1\. Alvará de Construção\n2\. Habite-se/);
  assert.match(t, /qualquer um dos 129 processos/);
});

test("CSV com aspas e catálogo filtra desativados", () => {
  assert.deepEqual(lerCsv('﻿a,b\n1,"x, y"\n'), [["a", "b"], ["1", "x, y"]]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-"));
  fs.writeFileSync(path.join(dir, "_indice.csv"), "id,titulo,desativado,arquivo,url\n1,Habite-se,não,h.json,u\n2,Velho,sim,v.json,u\n3,\"Corte, Poda\",não,c.json,u\n");
  const c = catalogo(dir);
  assert.deepEqual(c.map((i) => [i.slug, i.template]), [["habite-se", path.join(dir, "h.json")], ["corte-poda", path.join(dir, "c.json")]]);
});

test("catálogo real: menu curado resolve os 10 e o alvará usa o template da fixture", () => {
  const cat = catalogo();
  assert.ok(cat.length > 100);
  const m = menuCurado(cat);
  assert.equal(m.length, 10);
  assert.equal(m[0].titulo, "Alvará de Construção");
  assert.equal(m[0].template, "fixtures/templates/alvara-construcao.modeload.json");
  for (const i of cat) assert.ok(fs.existsSync(i.template), i.template);
  assert.equal(new Set(cat.map((i) => i.slug)).size, cat.length);
});
