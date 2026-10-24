// Transições do ledger com agentes falsos: aguardando × falhou × retry esgotado → gate; resolução de gates; modo humano.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Cenario, Ficha } from "../core/types.js";
import { store, perguntasDe, type Contexto } from "../agents/store.js";
import { tratarMensagem } from "../agents/orquestrador.js";
import { iniciarProcesso, avancar, resolverGate, reexecutarEtapa, assumirConversa, devolverConversa, historicoParaMensagens, MAX_RODADAS_VALIDADOR, type RunAgentFn } from "./motor.js";
import { lerRun, etapaRun } from "./run.js";
import { verificarMensagem } from "../core/mensagens.js";
import type { ClienteJuiz } from "./juiz.js";

before(() => { process.env.APROVA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "aprova-motor-")); });

const TEMPLATE = "fixtures/templates/alvara-construcao.modeload.json";
let n = 0;
const novoCtx = (): Contexto => ({ cidade: "teste", processo: `p${++n}`, template: TEMPLATE });
const fichaVV = (): Ficha => JSON.parse(fs.readFileSync("fixtures/fichas/alvara.vale-verde.json", "utf8"));
const cenariosVV: Cenario[] = JSON.parse(fs.readFileSync("fixtures/cenarios/alvara.cenarios.json", "utf8"));

type Chamada = { agente: string; mensagens: any[]; tools: any[]; maxIteracoes?: number };
function agenteFalso(comportamento: (c: Chamada, i: number) => Promise<string | void> | string | void) {
  const chamadas: Chamada[] = [];
  const fn: RunAgentFn = async (o) => {
    const c = { agente: o.agente, mensagens: o.mensagens, tools: o.tools ?? [], maxIteracoes: o.maxIteracoes };
    chamadas.push(c);
    const texto = (await comportamento(c, chamadas.length - 1)) ?? "";
    return { texto, conversa: [...o.mensagens, { role: "assistant", content: texto || "ok" }] };
  };
  return { fn, chamadas };
}
const ferramenta = (c: Chamada, nome: string) => c.tools.find((t) => t.name === nome);
const juizFixo = (saidas: unknown[]): { cliente: ClienteJuiz; modelo: string; n: () => number } => {
  let i = 0;
  return { modelo: "fake", n: () => i, cliente: { messages: { parse: async () => ({ parsed_output: saidas[Math.min(i++, saidas.length - 1)] }) } } };
};
const canalFalso = () => { const enviadas: string[] = []; return { enviadas, canal: { enviar: async (t: string) => { enviadas.push(t); } } }; };

/** Ficha de Vale Verde com o resto anotado como pendência: coletar passa. */
function fichaFechada(cidade: string): Ficha {
  const f = fichaVV();
  f.cidade = cidade;
  for (const q of perguntasDe(f)) if (q.resposta === null) q.pendencia ??= "analista não sabe";
  return f;
}

test("início: analisar conclui e coletar fica aguardando sem consumir tentativa", async () => {
  const ctx = novoCtx();
  const a = agenteFalso(() => {});
  const run = await iniciarProcesso(ctx, { runAgent: a.fn, juiz: null });
  assert.equal(run.status, "aguardando_prefeitura");
  assert.equal(run.etapa_atual, "coletar");
  assert.equal(etapaRun(run, "analisar").status, "concluida");
  const col = etapaRun(run, "coletar");
  assert.equal(col.status, "aguardando");
  assert.equal(col.criterios[0].resultado, "aguardando");
  assert.deepEqual(col.retentativas ?? {}, {});
  assert.ok(fs.existsSync(store.arquivo(ctx, "snapshot/template.json")));
  assert.ok(fs.existsSync(store.arquivo(ctx, "snapshot/pipeline.json")));
  assert.equal(run.seed_id, "p001");
  assert.equal(a.chamadas.length, 0);
  // resíduo de outra cidade é resolvido pelo analisador, nunca perguntado ao analista
  const residuos = perguntasDe(store.ficha(ctx)!).filter((q) => q.tipo === "residuo");
  assert.ok(residuos.length > 0);
  for (const q of residuos) { assert.equal(q.resposta, "Teste"); assert.equal(q.confianca, 1); assert.match(q.origem!, /^analisador/); }
  assert.match(etapaRun(run, "analisar").saida_resumo, /resíduo\(s\) trocado\(s\) por "Teste"/);
  // estado.json legado continua coerente para canal e painel
  assert.equal(store.estado(ctx).etapa, "aguardando_prefeitura");
});

test("coletar: mensagem roda o coletor; registro válido entra em registros[]; schema inválido devolve erro e não grava", async () => {
  const ctx = novoCtx();
  const { canal, enviadas } = canalFalso();
  const a = agenteFalso(async (c, i) => {
    if (c.agente !== "coletor") return;
    if (i === 0) {
      await ferramenta(c, "enviar_mensagem").run({ texto: "Olá! Quais são as zonas?" });
      return "apresentação enviada";
    }
    const ruim = await ferramenta(c, "registrar_resposta").run({ pergunta_id: "opcoes-04", resposta: "Nova, Retificação", origem: "mensagem", confianca: 1 });
    assert.match(ruim, /^schema_invalido/);
    const bom = await ferramenta(c, "registrar_resposta").run({ pergunta_id: "opcoes-04", resposta: ["Nova solicitação", "Retificação"], origem: "mensagem", confianca: 1 });
    assert.match(bom, /^ok/);
    return "registrado";
  });
  await tratarMensagem(ctx, canal, {}, { runAgent: a.fn, juiz: null });
  assert.deepEqual(enviadas, ["Olá! Quais são as zonas?"]);
  const r = await tratarMensagem(ctx, canal, { texto: "as opções são nova e retificação" }, { runAgent: a.fn, juiz: null });
  assert.equal(r, "registrado");
  const e = store.estado(ctx);
  const daConversa = (e.registros ?? []).filter((r) => !/analisador/.test(r.origem));
  assert.deepEqual(daConversa.map((r) => r.pergunta_id), ["opcoes-04"]);
  // o turno do coletor diz a cidade e quantas perguntas faltam
  assert.match(a.chamadas[1].mensagens.at(-1).content, /Prefeitura: Teste\. Processo: Alvará de Construção\. Perguntas abertas: \d+\./);
  assert.equal(lerRun(ctx)!.metricas.perguntas_feitas, 1, "conta perguntas distintas, não pontos de interrogação");
  // enviar_mensagem também grava no histórico (o coletor vê o que já perguntou)
  assert.ok(e.historico.some((h) => h.role === "assistant" && h.content.includes("Quais são as zonas")));
  assert.equal(e.mensagens_enviadas, 1);
  const run = lerRun(ctx)!;
  assert.equal(run.metricas.mensagens_recebidas, 1);
  assert.equal(etapaRun(run, "coletar").status, "aguardando");
  assert.deepEqual(run.rejeicoes_schema, {});
});

test("coletar: 2ª rejeição seguida falha, refaz com feedback na mesma conversa, esgota e abre gate para o analista", async () => {
  const ctx = novoCtx();
  const { canal, enviadas } = canalFalso();
  let corrigir = false;
  const a = agenteFalso(async (c) => {
    await ferramenta(c, "registrar_resposta").run(
      corrigir
        ? { pergunta_id: "opcoes-04", resposta: ["Nova solicitação"], origem: "mensagem", confianca: 1 }
        : { pergunta_id: "opcoes-04", resposta: { errado: true }, origem: "mensagem", confianca: 1 });
  });
  const deps = { runAgent: a.fn, juiz: null };
  await iniciarProcesso(ctx, deps);
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  await tratarMensagem(ctx, canal, { texto: "resposta 1" }, deps);
  let run = lerRun(ctx)!;
  assert.equal(etapaRun(run, "coletar").criterios.find((k) => k.nome === "nenhuma pergunta em aberto")!.resultado, "aguardando", "1ª rejeição não é falha");
  assert.equal(run.gate, null);

  await tratarMensagem(ctx, canal, { texto: "resposta 2" }, deps);
  run = lerRun(ctx)!;
  // mensagem + 1 retentativa (tentativas: 1) = 2 chamadas nesta rodada
  assert.equal(a.chamadas.length, 3);
  const retry = a.chamadas[2].mensagens.at(-1).content as string;
  assert.match(retry, /nenhuma pergunta em aberto/);
  assert.match(retry, /resposta 2/, "feedback vai na mesma conversa, depois da mensagem");
  assert.equal(etapaRun(run, "coletar").retentativas?.["nenhuma pergunta em aberto"], 1);
  assert.equal(etapaRun(run, "coletar").status, "falhou");
  assert.equal(run.gate?.para, "analista");
  assert.equal(run.status, "aguardando_prefeitura");
  assert.deepEqual(run.gate?.acoes, ["aprovar", "ajustar", "rejeitar"]);
  assert.ok(enviadas.at(-1)!.includes("Não consegui registrar sua resposta"), "pergunta simples entregue pelo canal");
  assert.ok(!enviadas.at(-1)!.includes("schema"), "sem jargão para o analista");

  // A resposta do analista resolve o gate (ajustar) e volta para o coletor.
  corrigir = true;
  await tratarMensagem(ctx, canal, { texto: "é só nova solicitação" }, deps);
  run = lerRun(ctx)!;
  assert.equal(run.gate, null);
  assert.equal(run.decisoes?.at(-1)?.acao, "ajustar");
  assert.equal(etapaRun(run, "coletar").status, "aguardando");
  assert.match(a.chamadas.at(-1)!.mensagens.at(-1).content, /é só nova solicitação/);
  assert.equal(run.metricas.horas_reuniao_evitadas, 0, "antes de aplicar não conta");
});

test("ficha fechada: aplicar → validar com juiz reprovando → retentativas com faltam → gate do implantador → aprovar → homologar → concluído", async () => {
  const ctx = novoCtx();
  const val = agenteFalso(async (c) => {
    if (c.agente !== "validador") return;
    await ferramenta(c, "rodar_cenarios").run({ cenarios: cenariosVV });
    return "15/15";
  });
  const juiz = juizFixo([{ pass: false, faltam: ["taxa-34"] }]);
  const deps = { runAgent: val.fn, juiz };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  let run = await avancar(ctx, deps);

  assert.equal(etapaRun(run, "coletar").status, "concluida");
  assert.equal(etapaRun(run, "extrair").status, "concluida");
  assert.equal(etapaRun(run, "extrair").criterios[0].resultado, "nao_avaliado");
  assert.equal(etapaRun(run, "aplicar").status, "concluida");
  const v = etapaRun(run, "validar");
  assert.equal(v.criterios[0].resultado, "passou");
  assert.equal(v.criterios[2].resultado, "falhou");
  assert.equal(juiz.n(), 3, "1 avaliação + 2 retentativas");
  assert.equal(val.chamadas.length, 3);
  const fb = val.chamadas[1].mensagens;
  assert.equal(fb.at(-1).role, "user");
  assert.match(fb.at(-1).content, /cenários cobrem a ficha.*taxa-34/);
  assert.match(fb[0].content, /Formulário aplicado/, "retentativa continua a conversa, sem reenviar a semente");
  assert.equal(fb.filter((m: any) => /Formulário aplicado/.test(m.content)).length, 1);
  assert.equal(run.gate?.para, "implantador");
  assert.equal(run.gate?.criterio, "cenários cobrem a ficha");
  assert.equal(run.status, "aguardando_implantador");
  assert.match(fs.readFileSync(store.arquivo(ctx, "pendencias.md"), "utf8"), /cenários cobrem a ficha/);

  run = await resolverGate(ctx, "aprovar", "taxa sem efeito no formulário", deps);
  assert.equal(etapaRun(run, "validar").status, "concluida");
  assert.match(etapaRun(run, "validar").criterios[2].detalhe, /aceito pelo implantador/);
  assert.equal(run.etapa_atual, "homologar");
  assert.equal(run.gate?.tipo, "homologacao");
  assert.equal(run.status, "aguardando_implantador");

  run = await resolverGate(ctx, "aprovar", undefined, deps);
  assert.equal(run.status, "concluido");
  assert.equal(run.gate, null);
  assert.equal(run.metricas.horas_reuniao_evitadas, 1);
  assert.equal(run.metricas.cenarios_passando, 15);
});

test("cenário falhando esgota e vai ao implantador (não ao analista); aprovar segue para a conferência e a homologação", async () => {
  const ctx = novoCtx();
  const { canal, enviadas } = canalFalso();
  const quebrado = cenariosVV.map((c) => c.id === "c11-recuo-abaixo-do-minimo" ? { ...c, espera: c.espera.map((e) => ({ ...e, visivel: !e.visivel })) } : c);
  const val = agenteFalso(async (c) => { await ferramenta(c, "rodar_cenarios").run({ cenarios: quebrado }); });
  const deps = { runAgent: val.fn, juiz: juizFixo([{ pass: true, faltam: [] }]), canal };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  let run = await avancar(ctx, deps);
  assert.equal(run.gate?.para, "implantador");
  assert.equal(run.gate?.criterio, "todos os cenários passam");
  assert.ok(!enviadas.some((t) => /É assim aí/.test(t)), "falha de cenário não vira pergunta ao analista");

  run = await resolverGate(ctx, "aprovar", undefined, deps);
  // Com canal, o formulário pronto passa pela conferência de casos com o analista antes da homologação.
  assert.equal(run.etapa_atual, "conferir");
  assert.equal(run.gate?.tipo, "conferencia");
  assert.match(enviadas.at(-1)!, /^Antes de liberar, confere estes casos pra mim:/);
  assert.ok(verificarMensagem(enviadas.at(-1)!).ok, "conferência cabe nos limites da conversa (até 70 palavras, uma pergunta)");

  await tratarMensagem(ctx, canal, { texto: "tá certo, pode seguir" }, deps);
  run = lerRun(ctx)!;
  assert.equal(run.etapa_atual, "homologar");
  assert.equal(etapaRun(run, "conferir").criterios[0].resultado, "passou");
});

test("homologar: ajustar com <id>=<valor> corrige a ficha e refaz desde aplicar; valor inválido é recusado; rejeitar para", async () => {
  const ctx = novoCtx();
  const deps = { semLLM: true, juiz: null, cenarios: "fixtures/cenarios/alvara.cenarios.json" };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  let run = await avancar(ctx, deps);
  assert.equal(run.gate?.tipo, "homologacao");

  await assert.rejects(resolverGate(ctx, "ajustar", "taxa-34=sim", deps), /schema_invalido/);
  await assert.rejects(resolverGate(ctx, "ajustar", "", deps), /precisa de texto/);
  assert.equal(lerRun(ctx)!.gate?.tipo, "homologacao", "recusa não fecha o gate");

  run = await resolverGate(ctx, "ajustar", 'taxa-34={"existe":false}', deps);
  const taxa = perguntasDe(store.ficha(ctx)!).find((q) => q.id === "taxa-34")!;
  assert.deepEqual(taxa.resposta, { existe: false });
  assert.match(taxa.origem!, /Implantador/);
  assert.equal(etapaRun(run, "aplicar").status, "concluida");
  assert.match(fs.readFileSync(store.arquivo(ctx, "diff.md"), "utf8"), /taxasProcesso/);
  assert.equal(run.gate?.tipo, "homologacao", "volta a pedir homologação");

  run = await resolverGate(ctx, "rejeitar", "prefeitura desistiu", deps);
  assert.equal(run.status, "parado");
  await assert.rejects(resolverGate(ctx, "aprovar", undefined, deps), /nenhum gate aberto/);
});

test("modo humano: assumir pausa o agente; devolver leva a nota do implantador na próxima mensagem", async () => {
  const ctx = novoCtx();
  const { canal } = canalFalso();
  const a = agenteFalso(() => "ok");
  const deps = { runAgent: a.fn, juiz: null };
  await iniciarProcesso(ctx, deps);
  assumirConversa(ctx);
  assert.equal(store.estado(ctx).modo, "humano");
  assert.equal(lerRun(ctx)!.metricas.intervencoes_humanas, 1);
  // o canal grava a mensagem enviada pelo implantador
  store.anexarHistorico(ctx, { role: "assistant", autor: "implantador", content: "Marcos, a taxa é da Fazenda, certo?" });
  const r = await tratarMensagem(ctx, canal, { texto: "isso, da Fazenda" }, deps);
  assert.equal(r, "");
  assert.equal(a.chamadas.length, 0, "nenhum agente roda no modo humano");
  assert.equal(lerRun(ctx)!.metricas.mensagens_recebidas, 1);
  assert.ok(store.estado(ctx).historico.some((h) => h.role === "user" && h.content.includes("da Fazenda")));
  assert.equal(etapaRun(lerRun(ctx)!, "coletar").status, "aguardando");

  devolverConversa(ctx);
  const e = store.estado(ctx);
  assert.equal(e.modo, "agente");
  assert.deepEqual(e.intervencoes?.map((i) => i.tipo), ["assumir", "devolver"]);
  await tratarMensagem(ctx, canal, { texto: "pode seguir" }, deps);
  assert.equal(a.chamadas.length, 1);
  const ultima = a.chamadas[0].mensagens.at(-1).content as string;
  assert.match(ultima, /Enquanto o agente estava pausado, o implantador trocou estas mensagens com o analista/);
  assert.match(ultima, /a taxa é da Fazenda/);
  assert.equal(store.estado(ctx).nota_pendente_desde, undefined, "nota vai uma vez só");
});

test("historicoParaMensagens: tolera autor, junta papéis repetidos e começa pelo usuário", () => {
  const m = historicoParaMensagens([
    { role: "assistant", content: "a0", em: "1" },
    { role: "user", content: "u1", em: "2" },
    { role: "assistant", content: "a1", em: "3" },
    { role: "assistant", autor: "implantador", content: "humano", em: "4" },
    { role: "user", content: "u2", em: "5" },
  ]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
  assert.match(m[1].content as string, /a1[\s\S]*implantador[\s\S]*humano/);
  assert.ok(!("autor" in m[1]));
});

test("extrator: candidato com precisa_confirmacao trava confiança em 0,79 até o analista confirmar por mensagem", async () => {
  const ctx = novoCtx();
  await iniciarProcesso(ctx, { juiz: null, runAgent: agenteFalso(() => {}).fn });
  store.salvarAConfirmar(ctx, ["opcoes-16"]);
  const { ferramentas } = await import("../agents/tools.js");
  const t = ferramentas(ctx, { enviar: async () => {} });
  const reg: any = t.coletor.find((x: any) => x.name === "registrar_resposta")!;
  const r1 = await reg.run({ pergunta_id: "opcoes-16", resposta: ["ZR1"], origem: "anexo: lei p.2", confianca: 0.95 });
  assert.match(r1, /0,79/);
  assert.equal(perguntasDe(store.ficha(ctx)!).find((q) => q.id === "opcoes-16")!.confianca, 0.79);
  await reg.run({ pergunta_id: "opcoes-16", resposta: ["ZR1"], origem: "mensagem", confianca: 1 });
  assert.equal(perguntasDe(store.ficha(ctx)!).find((q) => q.id === "opcoes-16")!.confianca, 1);
  assert.deepEqual(store.aConfirmar(ctx), []);
});

test("validador com cenários de diagnóstico sem pré-condição: no máximo 2 execuções, rodadas limitadas, gate vai ao implantador e nada chega ao analista", async () => {
  const ctx = novoCtx();
  const { canal, enviadas } = canalFalso();
  const diag: Cenario[] = [
    { id: "d1", descricao: 'Diagnóstico: tipo de logradouro "Rua" (opção que já existia no modelo) também fica oculto?', model: { tipo_logradouro: "Rua" }, espera: [{ campo: "tipo_logradouro", visivel: true }] },
    { id: "d2", descricao: "Diagnóstico: piscina aparece?", model: { quadro_areas: [{ tipo_uso_complementar: "Piscina" }] }, espera: [{ campo: "quadro_areas[0].tipo_uso_complementar", visivel: true }] },
  ];
  const val = agenteFalso(async (c) => {
    if (c.agente !== "validador") return;
    const base = JSON.parse(await ferramenta(c, "cenarios_base").run({}));
    assert.equal(base.length, 15);
    const campos = JSON.parse(await ferramenta(c, "listar_campos").run({}));
    assert.ok(campos.some((x: any) => x.key === "tipo_logradouro" && /endereco_cep/.test(x.condicao_visivel)));
    await ferramenta(c, "rodar_cenarios").run({ cenarios: base });
    await ferramenta(c, "rodar_cenarios").run({ cenarios: diag });
  });
  const deps = { runAgent: val.fn, juiz: juizFixo([{ pass: true, faltam: [] }]), canal };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  const run = await avancar(ctx, deps);
  assert.equal(val.chamadas.length, 2, "1 execução + 1 retentativa");
  assert.ok(val.chamadas.every((c) => c.maxIteracoes === MAX_RODADAS_VALIDADOR && MAX_RODADAS_VALIDADOR <= 6));
  assert.match(val.chamadas[1].mensagens.at(-1).content, /precondicao: falta endereco_cep/);
  assert.equal(store.cenarios(ctx)!.length, 17, "rodar_cenarios junta pelo id em vez de substituir");
  assert.equal(run.gate?.para, "implantador");
  assert.deepEqual(enviadas, []);
  assert.equal(run.metricas.horas_reuniao_evitadas, 1);
});

test("reexecutar validar: reabre validar e homologar, apaga cenários e conversa, roda de novo e pede nova homologação", async () => {
  const ctx = novoCtx();
  const deps = { semLLM: true, juiz: null, cenarios: "fixtures/cenarios/alvara.cenarios.json" };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  await avancar(ctx, deps);
  let run = await resolverGate(ctx, "aprovar", undefined, deps);
  assert.equal(run.status, "concluido");
  fs.mkdirSync(store.arquivo(ctx, "conversas"), { recursive: true });
  fs.writeFileSync(store.arquivo(ctx, "conversas/validar.json"), "[]");
  fs.writeFileSync(store.arquivo(ctx, "cenarios.json"), "[]");
  run = await reexecutarEtapa(ctx, "validar", deps);
  assert.ok(!fs.existsSync(store.arquivo(ctx, "conversas/validar.json")));
  assert.equal(store.cenarios(ctx)!.length, 15);
  assert.equal(etapaRun(run, "validar").status, "concluida");
  assert.equal(etapaRun(run, "validar").tentativas, 1);
  assert.equal(run.etapa_atual, "homologar");
  assert.equal(run.status, "aguardando_implantador", "aprovação antiga não vale para a nova rodada");
  assert.equal(run.gate?.tipo, "homologacao");
  await assert.rejects(reexecutarEtapa(ctx, "xyz", deps), /etapa inválida/);
});

test("coletar não fecha com a ficha tratada se a última mensagem ao analista é pergunta sem resposta", async () => {
  const ctx = novoCtx();
  const deps = { semLLM: true, juiz: null, cenarios: "fixtures/cenarios/alvara.cenarios.json" };
  await iniciarProcesso(ctx, deps);
  store.salvarFicha(ctx, fichaFechada(ctx.cidade));
  store.salvarPlano(ctx, { decisao: "atende", itens: [] });
  store.anexarHistorico(ctx, { role: "assistant", content: "Casa na ZR1 com 3 m de recuo volta. Certo?" });
  store.anexarHistorico(ctx, { role: "assistant", content: "Perguntei dataset-28 com caso concreto.", autor: "nota" });
  let run = await avancar(ctx, deps);
  assert.equal(run.etapa_atual, "coletar");
  assert.match(etapaRun(run, "coletar").criterios.find((k) => k.nome === "nenhuma pergunta em aberto")!.detalhe, /pergunta ainda sem resposta/);
  store.anexarHistorico(ctx, { role: "user", content: "Mensagem do analista: certo" });
  run = await avancar(ctx, deps);
  assert.equal(run.gate?.tipo, "homologacao");
});
