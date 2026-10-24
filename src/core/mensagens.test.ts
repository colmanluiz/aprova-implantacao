import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarMensagem, contarPalavras } from "./mensagens.js";

const recusa = (t: string) => {
  const v = verificarMensagem(t);
  assert.equal(v.ok, false, t);
  return v.ok ? "" : v.motivo;
};
const palavras = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");

test("mensagens: até 2 perguntas passa, 3 recusa", () => {
  assert.ok(verificarMensagem("Quem assina o Habite-se hoje? É a mesma pessoa do alvará?").ok);
  assert.match(recusa("1. Quem assina? 2. Qual setor? 3. Tem taxa?"), /^mensagem_recusada: mais de 2 perguntas numa mensagem/);
});

test("mensagens: pergunta com mais de 70 palavras recusa e diz quantas", () => {
  assert.ok(verificarMensagem(`${palavras(69)} certo?`).ok);
  assert.equal(recusa(`${palavras(71)} certo?`), "mensagem_recusada: mensagem longa (72 palavras) com pergunta; encurte ou separe a explicação da pergunta");
});

test("mensagens: sem pergunta vai até 160 palavras (resumo, reflexão numerada)", () => {
  const reflexao = "Entendi assim:\n1. O pedido chega pelo balcão.\n2. A vistoria é da Obras.\n3. A taxa é paga antes.\nSe algo estiver errado, me corrija.";
  assert.ok(verificarMensagem(reflexao).ok);
  assert.ok(verificarMensagem(palavras(160)).ok);
  assert.match(recusa(palavras(161)), /^mensagem_recusada: mensagem longa \(161 palavras\)/);
});

test("mensagens: palavra de sistema recusa, sem diferenciar maiúsculas", () => {
  for (const [t, w] of [
    ["Vou ajustar o Template do alvará.", "template"],
    ["Qual o valor no DATASET de zonas?", "dataset"],
    ["Falta a parametrização da taxa.", "parametriz"],
    ["O campo do Formly fica assim.", "formly"],
    ["Troquei o placeholder.", "placeholder"],
    ["Registrei com confiança alta.", "confiança"],
    ["Esse campo fica oculto.", "oculto"],
    ["Rodei offline.", "offline"],
    ["O sistema prevê vistoria?", "o sistema prevê"],
  ]) assert.equal(recusa(t), `mensagem_recusada: palavra de sistema "${w}"; diga em linguagem de balcão`);
});

test("mensagens: contagem de palavras ignora pontuação solta", () => {
  assert.equal(contarPalavras("Certo — 1. sim ; 2. não"), 5);
});
