// Painel do implantador. Sem build, sem dependências.
// Fonte: /api/visao e /api/processo/:cidade/:slug (polling de 2 s).
// Fallback: painel/data.json (?static=1 ou API fora do ar), gerado por `npm run painel:data`.
"use strict";

const INTERVALO = 2000;
const params = new URLSearchParams(location.search);
const SO_ESTATICO = params.has("static");

const STATUS_ROTULO = {
  nao_iniciado: "não iniciado",
  executando: "executando",
  aguardando_prefeitura: "aguardando prefeitura",
  aguardando_implantador: "aguardando implantador",
  concluido: "concluído",
  parado: "parado",
};
const ETAPA_ROTULO = { pendente: "pendente", executando: "executando", aguardando: "aguardando", concluida: "concluída", falhou: "falhou" };
const CRITERIO_ICONE = { passou: "OK", falhou: "X", aguardando: "..", nao_avaliado: "–" };

const estado = {
  visao: null,
  detalhe: null,
  estatico: null, // conteúdo de data.json quando em fallback
  fonte: "api",
  rota: null,
  assinaturas: {},
  ultimoOk: 0,
  enviando: false,
};

// ---------- utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—");

function data(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function hora(iso) {
  const d = data(iso);
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}
function quando(iso) {
  const d = data(iso);
  if (!d) return "";
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? hora(iso) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function setHtml(el, html, chave) {
  // Evita repintar (e perder seleção/rolagem) quando nada mudou.
  if (estado.assinaturas[chave] === html) return false;
  estado.assinaturas[chave] = html;
  el.innerHTML = html;
  return true;
}
async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function postJson(url, corpo) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  let j = {};
  try { j = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, ok: r.ok, corpo: j };
}

// ---------- fonte de dados ----------
async function carregarEstatico() {
  estado.estatico = await getJson("data.json");
  estado.fonte = "estatico";
}
async function buscarVisao() {
  if (!SO_ESTATICO) {
    try {
      estado.visao = await getJson("/api/visao");
      estado.fonte = "api";
      estado.ultimoOk = Date.now();
      return;
    } catch { /* cai para o estático */ }
  }
  try {
    await carregarEstatico();
    estado.visao = estado.estatico.visao ?? estado.estatico;
    estado.ultimoOk = Date.now();
  } catch {
    estado.fonte = "falha";
  }
}
async function buscarDetalhe(cidade, slug) {
  if (estado.fonte === "api") {
    try { estado.detalhe = await getJson(`/api/processo/${encodeURIComponent(cidade)}/${encodeURIComponent(slug)}`); return; }
    catch (e) { if (String(e.message) === "404") { estado.detalhe = { vazio: true, cidade, slug }; return; } }
  }
  const det = estado.estatico?.detalhes?.[`${cidade}/${slug}`];
  estado.detalhe = det ?? { vazio: true, cidade, slug };
}

// ---------- indicador ao vivo ----------
function pintarVivo() {
  const el = $("vivo");
  el.classList.remove("ok", "estatico", "falha");
  if (estado.fonte === "api") {
    el.classList.add("ok");
    $("vivo-texto").textContent = `ao vivo · ${new Date(estado.ultimoOk).toLocaleTimeString("pt-BR")}`;
  } else if (estado.fonte === "estatico") {
    el.classList.add("estatico");
    const g = estado.visao?.gerado_em;
    $("vivo-texto").textContent = `cópia estática · ${g ? quando(g) : ""}`;
  } else {
    el.classList.add("falha");
    $("vivo-texto").textContent = "sem conexão com o painel";
  }
}

// ---------- visão da prefeitura ----------
function faixa(etapas) {
  return `<div class="faixa" role="img" aria-label="${esc(etapas.map((e) => `${e.nome}: ${ETAPA_ROTULO[e.status] ?? e.status}`).join("; "))}">${
    etapas.map((e) => `<span class="seg ${esc(e.status)}" title="${esc(e.nome)}: ${esc(ETAPA_ROTULO[e.status] ?? e.status)}"></span>`).join("")
  }</div>`;
}
function pilula(status) {
  return `<span class="pilula ${esc(status)}">${esc(STATUS_ROTULO[status] ?? status)}</span>`;
}
function seloGate(gate) {
  if (!gate) return "";
  const para = gate.para === "analista" ? "analista" : "implantador";
  return `<span class="selo ${para}">aguardando ${para}</span>`;
}

function pintarMetricas(v) {
  const m = v.metricas;
  const tiles = [
    { r: "Processos prontos", v: `${fmtNum(m.processos_prontos)}<small> / ${fmtNum(m.processos_total)}</small>`, n: `${fmtNum(m.processos_em_andamento)} em andamento · ${fmtNum(m.gates_abertos)} aguardando decisão`, cls: "destaque" },
    { r: "Horas de reunião evitadas", v: fmtNum(m.horas_reuniao_evitadas), n: `${fmtNum(m.mensagens)} mensagens no lugar de reuniões` },
    { r: "Perguntas respondidas sem reunião", v: `${fmtNum(m.perguntas_respondidas_sem_reuniao)}<small> / ${fmtNum(m.perguntas_feitas)}</small>`, n: `${fmtNum(m.respondidas_por_mensagem)} por mensagem · ${fmtNum(m.respondidas_por_anexo)} por anexo · ${fmtNum(m.pendencias_abertas)} pendências` },
    { r: "Cenários passando", v: `${fmtNum(m.cenarios_passando)}<small> / ${fmtNum(m.cenarios_rodados)}</small>`, n: m.intervencoes_humanas ? `${fmtNum(m.intervencoes_humanas)} intervenções humanas na conversa` : "validação sem clique, antes da homologação" },
  ];
  const html = tiles.map((t, i) => `<div class="metrica ${t.cls ?? ""}" data-i="${i}"><div class="metrica-rotulo">${esc(t.r)}</div><div class="metrica-valor">${t.v}</div><div class="metrica-nota">${esc(t.n)}</div></div>`).join("");
  const el = $("metricas");
  const antes = [...el.querySelectorAll(".metrica-valor")].map((x) => x.innerHTML);
  if (setHtml(el, html, "metricas")) {
    el.querySelectorAll(".metrica").forEach((t, i) => {
      if (antes.length && antes[i] !== t.querySelector(".metrica-valor").innerHTML) t.classList.add("flash");
    });
  }
}

function pintarLegenda(v) {
  const html = [
    ["concluida", "concluída", "var(--ok)"], ["executando", "executando", "var(--exec)"], ["aguardando", "aguardando", "var(--espera)"],
    ["falhou", "falhou", "var(--erro)"], ["pendente", "pendente", "var(--pendente)"],
  ].map(([, r, c]) => `<span><i style="background:${c}"></i>${r}</span>`).join("")
    + `<span class="etapas-nomes">etapas: ${esc(v.etapas.map((e) => e.slug).join(" › "))}</span>`;
  setHtml($("legenda"), html, "legenda");
}

function pintarSecretarias(v) {
  const html = v.secretarias.map((s) => {
    const prontos = s.processos.filter((p) => p.pronto).length;
    const linhas = s.processos.map((p) => {
      const clic = p.tem_dados && p.slug;
      const extras = [seloGate(p.gate), p.modo === "humano" ? `<span class="selo humano">implantador na conversa</span>` : ""].join("");
      const nums = p.tem_dados ? `<span class="linha-num">${fmtNum(p.respondidas)}/${fmtNum(p.perguntas_feitas)} resp · ${fmtNum(p.pendencias)} pend${p.cenarios ? ` · ${esc(p.cenarios)} cen` : ""}</span>` : "";
      return `<li class="linha ${clic ? "com-dados" : ""}" ${clic ? `tabindex="0" data-href="#/p/${esc(v.cidade_slug)}/${esc(p.slug)}"` : ""}>
        <div><div class="linha-nome" title="${esc(p.processo)}">${esc(p.processo)}${p.complexidade === "complexo" ? `<span class="complexo">complexo</span>` : ""}</div>
          ${extras || nums ? `<div class="linha-extra">${extras}${nums}</div>` : ""}</div>
        ${faixa(p.etapas)}
        ${pilula(p.status)}
      </li>`;
    }).join("");
    return `<section class="secretaria"><div class="secretaria-cab"><h3>${esc(s.nome)}</h3><span class="contagem">${prontos}/${s.processos.length} prontos</span></div><ul class="linhas">${linhas}</ul></section>`;
  }).join("");
  setHtml($("secretarias"), html, "secretarias");
}

function pintarVisao() {
  const v = estado.visao;
  if (!v) return;
  $("cidade").textContent = v.cidade;
  pintarMetricas(v);
  pintarLegenda(v);
  pintarSecretarias(v);
}

$("secretarias").addEventListener("click", (e) => {
  const li = e.target.closest("[data-href]");
  if (li) location.hash = li.dataset.href;
});
$("secretarias").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const li = e.target.closest("[data-href]");
  if (li) location.hash = li.dataset.href;
});

// ---------- detalhe ----------
function pintarCabecalhoDetalhe(d) {
  const p = d.processo;
  $("d-titulo").textContent = p?.processo ?? d.run?.titulo ?? d.slug;
  $("d-secretaria").textContent = p ? `${p.secretaria} · ${d.cidade}` : d.cidade;
  setHtml($("d-status"), p ? `${pilula(p.status)}${faixa(p.etapas)}` : "", "d-status");
}

function pintarEtapas(d) {
  const run = d.run;
  const atual = run?.etapa_atual ?? d.processo?.etapa_atual;
  const base = d.processo?.etapas ?? [];
  const html = base.map((e) => {
    const r = run?.etapas?.find((x) => x.slug === e.slug) ?? {};
    const crit = (r.criterios ?? []).map((c) => `<li class="criterio ${esc(c.resultado)}">
        <span class="criterio-icone">${esc(CRITERIO_ICONE[c.resultado] ?? "?")}</span>
        <span>${esc(c.nome)}${c.detalhe ? `<span class="criterio-detalhe">${esc(c.detalhe)}</span>` : ""}</span></li>`).join("");
    const meta = [
      r.tentativas > 1 ? `${r.tentativas} tentativas` : r.tentativas === 1 ? "1 tentativa" : "",
      r.concluida_em ? `fim ${quando(r.concluida_em)}` : r.iniciada_em ? `início ${quando(r.iniciada_em)}` : "",
    ].filter(Boolean).join(" · ");
    const resumo = [r.entrada_resumo && `entra: ${r.entrada_resumo}`, r.saida_resumo && `sai: ${r.saida_resumo}`].filter(Boolean).join(" · ");
    return `<li class="etapa ${esc(e.status)} ${e.slug === atual ? "atual" : ""}">
      <span class="etapa-marca" aria-hidden="true"></span>
      <div class="etapa-cab"><span class="etapa-nome">${esc(r.nome || e.nome)}</span><span class="etapa-meta">${esc(meta)}</span></div>
      <div class="etapa-tipo">${esc(r.tipo ?? "")}${r.tipo ? " · " : ""}${esc(ETAPA_ROTULO[e.status] ?? e.status)}</div>
      ${resumo ? `<div class="etapa-resumo">${esc(resumo)}</div>` : ""}
      ${crit ? `<ul class="criterios">${crit}</ul>` : ""}
    </li>`;
  }).join("");
  setHtml($("d-etapas"), html || `<p class="vazio">Sem run.json ainda.</p>`, "d-etapas");
}

function pintarGate(d) {
  const g = d.run?.gate;
  const el = $("d-gate");
  if (!g) { setHtml(el, "", "d-gate"); return; }
  const paraImplantador = g.para !== "analista";
  const desab = !d.gate_disponivel || estado.fonte !== "api";
  const dica = estado.fonte !== "api" ? "Cópia estática: ações desabilitadas" : !d.gate_disponivel ? "npm run gate ainda não existe neste checkout (501)" : "";
  const acoes = (g.acoes?.length ? g.acoes : ["aprovar", "ajustar", "rejeitar"]);
  const html = `<section class="gate ${paraImplantador ? "implantador" : "analista"}" aria-live="polite">
    <div class="gate-cab"><strong>${paraImplantador ? "Aguardando implantador" : "Aguardando analista"}</strong>
      <span class="selo ${paraImplantador ? "implantador" : "analista"}">${esc(g.tipo ?? "")}</span>
      <span class="quando">aberto ${esc(quando(g.aberto_em))}</span></div>
    <div><p class="gate-instrucao">${esc(g.instrucao ?? "")}</p>${g.resumo ? `<p class="gate-resumo">${esc(g.resumo)}</p>` : ""}</div>
    ${paraImplantador ? `<div class="gate-acoes">
      <textarea id="gate-texto" rows="2" placeholder="Comentário ou ajuste (opcional)"></textarea>
      <div class="gate-botoes">${acoes.map((a) => `<button type="button" class="btn ${esc(a)}" data-acao="${esc(a)}" ${desab ? `disabled title="${esc(dica)}"` : ""}>${esc(a)}</button>`).join("")}</div>
    </div>` : `<div class="gate-acoes"><p class="vazio">A pergunta foi enviada ao analista pelo WhatsApp.</p></div>`}
    <pre class="gate-saida" id="gate-saida"></pre>
  </section>`;
  setHtml(el, html, "d-gate");
}

$("d-gate").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-acao]");
  if (!b || !estado.rota) return;
  const { cidade, slug } = estado.rota;
  const texto = $("gate-texto")?.value ?? "";
  const botoes = $("d-gate").querySelectorAll("button[data-acao]");
  botoes.forEach((x) => (x.disabled = true));
  $("gate-saida").textContent = `executando ${b.dataset.acao}…`;
  const r = await postJson(`/api/gate/${encodeURIComponent(cidade)}/${encodeURIComponent(slug)}`, { acao: b.dataset.acao, texto });
  $("gate-saida").textContent = r.ok ? (r.corpo.saida || "feito") : `erro ${r.status}: ${r.corpo.erro ?? ""}`;
  if (r.status === 501) botoes.forEach((x) => { x.disabled = true; x.title = r.corpo.erro ?? "indisponível"; });
  else botoes.forEach((x) => (x.disabled = false));
});

function falante(m) {
  if (m.role === "user") return "analista";
  return m.autor === "implantador" ? "implantador" : "agente";
}
const ROTULO_FALANTE = { analista: "Analista", agente: "Agente", implantador: "Implantador" };

function htmlRegistros(regs, pendentes) {
  if (!regs?.length) return "";
  return `<ul class="registros ${pendentes ? "pendentes" : ""}">${regs.map((r) => {
    const conf = typeof r.confianca === "number" ? r.confianca : null;
    return `<li>registrou <code>${esc(r.pergunta_id ?? "?")}</code> ${esc(r.resumo ?? "")}${conf !== null ? ` <span class="${conf < 0.8 ? "baixa" : ""}">(${conf.toLocaleString("pt-BR")})</span>` : ""}${r.origem ? ` · ${esc(r.origem)}` : ""}</li>`;
  }).join("")}</ul>`;
}

function pintarChat(d) {
  const turnos = d.conversa ?? [];
  const eventos = (d.intervencoes ?? []).map((i) => ({ tipo: "evento", em: i.em, i }));
  // Intercala eventos (assumir/devolver) antes do primeiro turno posterior a eles.
  const itens = [];
  let k = 0;
  const evs = [...eventos].sort((a, b) => (data(a.em)?.getTime() ?? 0) - (data(b.em)?.getTime() ?? 0));
  for (const t of turnos) {
    const tt = data(t.em)?.getTime();
    while (k < evs.length && tt !== undefined && (data(evs[k].em)?.getTime() ?? 0) <= tt) itens.push(evs[k++]);
    itens.push({ tipo: "turno", t });
  }
  while (k < evs.length) itens.push(evs[k++]);

  let html = itens.map((it) => {
    if (it.tipo === "evento") {
      const txt = it.i.tipo === "assumir" ? "Implantador assumiu a conversa" : it.i.tipo === "devolver" ? "Conversa devolvida ao agente" : it.i.tipo;
      return `<div class="evento">${esc(txt)}${it.i.por ? ` (${esc(it.i.por)})` : ""} · ${esc(hora(it.em))}</div>`;
    }
    const f = falante(it.t);
    return `<div class="bolha ${f}">${f !== "analista" ? `<div class="bolha-autor">${ROTULO_FALANTE[f]}</div>` : ""}${esc(it.t.content)}<span class="bolha-hora">${esc(quando(it.t.em))}</span></div>`
      + (f !== "analista" ? htmlRegistros(it.t.registros) : "");
  }).join("");
  html += htmlRegistros(d.registros_sem_turno, true);
  html += (d.outbox_pendente ?? []).map((o) => `<div class="bolha implantador enviando"><div class="bolha-autor">Implantador</div>${esc(o.texto)}<span class="bolha-hora">enviando…</span></div>`).join("");
  if (!html) html = `<p class="vazio">Nenhuma mensagem ainda. Quando o analista mandar "oi", a conversa aparece aqui.</p>`;

  const chat = $("d-chat");
  const noFim = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  if (setHtml(chat, html, "d-chat") && (noFim || !estado.assinaturas.chatRolado)) {
    chat.scrollTop = chat.scrollHeight;
    estado.assinaturas.chatRolado = true;
  }

  // Modo de conversa: agente ou humano.
  const humano = d.modo === "humano";
  const btn = $("btn-modo");
  btn.hidden = !d.processo;
  btn.textContent = humano ? "Devolver ao agente" : "Assumir conversa";
  btn.className = `btn ${humano ? "" : "assumir"}`;
  const desab = estado.fonte !== "api" || !d.gate_disponivel || estado.enviando;
  btn.disabled = desab;
  btn.title = estado.fonte !== "api" ? "Cópia estática: ações desabilitadas" : !d.gate_disponivel ? "A CLI do pipeline (npm run gate) ainda não existe neste checkout" : "";
  const faixaH = $("faixa-humano");
  faixaH.hidden = !humano;
  if (humano) faixaH.textContent = `Conversa assumida pelo implantador${d.assumida_em ? ` às ${hora(d.assumida_em)}` : ""}. O agente não responde até ser devolvida.`;
  $("compositor").hidden = !humano || estado.fonte !== "api";
}

$("btn-modo").addEventListener("click", async () => {
  if (!estado.rota || !estado.detalhe) return;
  const { cidade, slug } = estado.rota;
  const modo = estado.detalhe.modo === "humano" ? "agente" : "humano";
  estado.enviando = true;
  $("btn-modo").disabled = true;
  const r = await postJson(`/api/conversa/${encodeURIComponent(cidade)}/${encodeURIComponent(slug)}/modo`, { modo });
  estado.enviando = false;
  mostrarErroChat(r.ok ? "" : `Não foi possível ${modo === "humano" ? "assumir" : "devolver"} (${r.status}): ${r.corpo.erro ?? ""}`);
  tick();
});

$("compositor").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!estado.rota) return;
  const campo = $("compositor-texto");
  const texto = campo.value.trim();
  if (!texto) return;
  const { cidade, slug } = estado.rota;
  $("compositor-enviar").disabled = true;
  const r = await postJson(`/api/conversa/${encodeURIComponent(cidade)}/${encodeURIComponent(slug)}/enviar`, { texto });
  $("compositor-enviar").disabled = false;
  if (r.ok) { campo.value = ""; mostrarErroChat(""); tick(); }
  else mostrarErroChat(`Não enviado (${r.status}): ${r.corpo.erro ?? ""}`);
});
$("compositor-texto").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compositor").requestSubmit();
});
function mostrarErroChat(msg) {
  $("chat-erro").hidden = !msg;
  $("chat-erro").textContent = msg;
}

function pintarNumeros(d) {
  const m = d.metricas ?? {};
  const itens = [
    ["Perguntas feitas", m.perguntas_feitas],
    ["Respondidas por mensagem", m.respondidas_por_mensagem],
    ["Respondidas por anexo", m.respondidas_por_anexo],
    ["Pendências abertas", m.pendencias_abertas],
    ["Mensagens enviadas", m.mensagens_enviadas],
    ["Mensagens recebidas", m.mensagens_recebidas],
    ["Horas de reunião evitadas", m.horas_reuniao_evitadas],
    ["Intervenções humanas", m.intervencoes_humanas],
  ];
  setHtml($("d-numeros"), itens.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${fmtNum(v)}</dd></div>`).join(""), "d-numeros");
}

function pintarFicha(d) {
  const gs = d.ficha_progresso ?? [];
  if (!gs.length) { setHtml($("d-ficha"), `<p class="vazio">ficha.json ainda não gerada.</p>`, "d-ficha"); return; }
  const html = gs.map((g) => {
    const t = g.total || 1;
    const msg = ((g.respondidas - g.por_anexo) / t) * 100;
    const anx = (g.por_anexo / t) * 100;
    return `<div class="ficha-grupo" title="${g.respondidas} respondidas (${g.por_anexo} por anexo), ${g.abertas} abertas, ${g.pendencias} pendências">
      <span>${esc(g.grupo)}</span><span class="n">${g.respondidas}/${g.total}</span>
      <div class="barra"><i class="b-msg" style="width:${msg}%"></i><i class="b-anexo" style="width:${anx}%"></i></div></div>`;
  }).join("") + `<div class="ficha-legenda">verde: por mensagem · hachurado: por anexo · cinza: em aberto</div>`;
  setHtml($("d-ficha"), html, "d-ficha");
}

function pintarCenarios(d) {
  const rel = d.relatorio;
  if (!rel?.length) { setHtml($("d-cenarios"), `<p class="vazio">Cenários ainda não rodados.</p>`, "d-cenarios"); return; }
  const ok = rel.filter((r) => r.passou).length;
  const ordenados = [...rel].sort((a, b) => Number(a.passou) - Number(b.passou));
  const html = `<div class="cenarios-total ${ok === rel.length ? "tudo-ok" : "com-falha"}">${ok}/${rel.length} passando</div>
    <ul class="cenarios">${ordenados.map((r) => `<li class="cenario ${r.passou ? "passou" : "falhou"}"><b>${r.passou ? "PASS" : "FAIL"}</b>
      <span>${esc(r.descricao ?? r.id)}${!r.passou && r.falhas?.length ? `<small>${esc(r.falhas.map((f) => f.campo ?? JSON.stringify(f)).join(", "))}</small>` : ""}</span></li>`).join("")}</ul>`;
  setHtml($("d-cenarios"), html, "d-cenarios");
}

function pintarTextos(d) {
  setHtml($("d-diff"), d.diff ? esc(d.diff) : `<span class="vazio">diff.md ainda não gerado.</span>`, "d-diff");
  $("bloco-pendencias").hidden = !d.pendencias;
  setHtml($("d-pendencias"), esc(d.pendencias ?? ""), "d-pendencias");
}

function pintarDetalhe() {
  const d = estado.detalhe;
  if (!d) return;
  if (d.vazio) {
    $("d-titulo").textContent = `${d.cidade}/${d.slug}`;
    setHtml($("d-etapas"), `<p class="vazio">Sem dados em data/${esc(d.cidade)}/${esc(d.slug)}.</p>`, "d-etapas");
    return;
  }
  pintarCabecalhoDetalhe(d);
  pintarGate(d);
  pintarEtapas(d);
  pintarChat(d);
  pintarNumeros(d);
  pintarFicha(d);
  pintarCenarios(d);
  pintarTextos(d);
}

// ---------- rotas e laço ----------
function lerRota() {
  const m = location.hash.match(/^#\/p\/([^/]+)\/([^/]+)/);
  return m ? { cidade: decodeURIComponent(m[1]), slug: decodeURIComponent(m[2]) } : null;
}
function aplicarRota() {
  const nova = lerRota();
  const mudou = JSON.stringify(nova) !== JSON.stringify(estado.rota);
  estado.rota = nova;
  $("tela-visao").hidden = !!nova;
  $("tela-detalhe").hidden = !nova;
  $("link-visao").classList.toggle("ativo", !nova);
  if (mudou) {
    estado.detalhe = null;
    for (const k of Object.keys(estado.assinaturas)) if (k.startsWith("d-") || k === "chatRolado") delete estado.assinaturas[k];
    $("compositor-texto").value = "";
    mostrarErroChat("");
    window.scrollTo(0, 0);
  }
  tick();
}
window.addEventListener("hashchange", aplicarRota);

let rodando = false;
async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    await buscarVisao();
    pintarVivo();
    if (estado.visao?.cidade) $("cidade").textContent = estado.visao.cidade;
    if (estado.rota) {
      await buscarDetalhe(estado.rota.cidade, estado.rota.slug);
      pintarDetalhe();
      document.title = `${estado.detalhe?.processo?.processo ?? estado.rota.slug} · Painel do implantador`;
    } else {
      pintarVisao();
      document.title = "Painel do implantador";
    }
  } finally {
    rodando = false;
  }
}

aplicarRota();
setInterval(tick, INTERVALO);
