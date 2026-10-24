// Painel do implantador. Sem build, sem dependências.
// Fonte: /api/visao e /api/processo/:cidade/:slug (polling de 2 s).
// Fallback: painel/data.json (?static=1 ou API fora do ar), gerado por `npm run painel:data`.
"use strict";

const INTERVALO = 2000;
const params = new URLSearchParams(location.search);
const SO_ESTATICO = params.has("static");
const LIMIAR_AVISO_H = 2;   // acima disto, "sem resposta" fica âmbar
const LIMIAR_FILA_H = 24;   // acima disto, entra na fila do implantador (espelha LIMIAR_SEM_RESPOSTA_HORAS em visao.ts)

const STATUS_ROTULO = {
  nao_iniciado: "não iniciado",
  executando: "em andamento",
  aguardando_prefeitura: "aguardando prefeitura",
  aguardando_implantador: "aguarda você",
  concluido: "concluído",
  parado: "parado",
};
const ETAPA_PALAVRA = { pendente: "ainda não começou", executando: "em andamento", aguardando: "aguardando", concluida: "concluída", falhou: "falhou" };
const ETAPA_CURTA = { pendente: "não iniciada", executando: "em andamento", aguardando: "aguardando", concluida: "concluída", falhou: "falhou" };
const ETAPA_NOME_CURTO = { analisar: "Analisar", coletar: "Coletar", extrair: "Ler anexos", aplicar: "Gerar formulário", validar: "Validar", homologar: "Homologar" };
const PRIORIDADE_ATENCAO = { gate: 0, parado: 1, falhou: 2, humano: 3, sem_resposta: 4 };

const estado = {
  visao: null,
  detalhe: null,
  estatico: null,
  fonte: "api",
  rota: null,
  assinaturas: {},
  ultimoOk: 0,
  enviando: false,
  mostrarNotas: false,
  gateUI: null,          // null | "ajustar" | "rejeitar"
  gateSaida: null,       // { ok, texto, em, rota }
  confirmaModo: null,    // null | "humano" | "agente"
  jaPintouAlgo: false,
};

// ---------- utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n, casas = 1) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: casas }) : "—");
const plural = (n, um, varios) => `${fmtNum(n, 0)} ${n === 1 ? um : varios}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
  const mesmoDia = d.toDateString() === new Date().toDateString();
  return mesmoDia ? hora(iso) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function duracao(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const min = Math.round(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60}` : ""}`;
  return `${Math.floor(h / 24)} dias`;
}
const horasTexto = (h) => duracao(h * 3600000);
/** "há 12 min", atualizado a cada tick sem repintar o HTML (a assinatura fica estável). */
const rel = (iso, prefixo = "há ") => (data(iso) ? `<time data-rel="${esc(iso)}" data-pre="${esc(prefixo)}" datetime="${esc(iso)}">${esc(prefixo)}${esc(duracao(Date.now() - data(iso).getTime()))}</time>` : "");
function atualizarRelativos() {
  document.querySelectorAll("time[data-rel]").forEach((t) => {
    const d = data(t.dataset.rel);
    if (d) t.textContent = `${t.dataset.pre ?? ""}${duracao(Date.now() - d.getTime())}`;
  });
}

/** Repinta só quando o HTML mudou; preserva <details data-k> abertos. */
function setHtml(el, html, chave) {
  if (estado.assinaturas[chave] === html) return false;
  const abertos = new Set([...el.querySelectorAll("details[data-k][open]")].map((d) => d.dataset.k));
  estado.assinaturas[chave] = html;
  el.innerHTML = html;
  el.querySelectorAll("details[data-k]").forEach((d) => { if (abertos.has(d.dataset.k)) d.open = true; });
  return true;
}
async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function postJson(url, corpo) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    let j = {};
    try { j = await r.json(); } catch { /* corpo vazio */ }
    return { status: r.status, ok: r.ok, corpo: j };
  } catch (e) {
    return { status: 0, ok: false, corpo: { erro: `sem conexão com o painel (${e.message})` } };
  }
}

// ícones (sem emoji): check, x, relógio, traço, clipe
const ICO = {
  check: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  clock: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>`,
  minus: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>`,
  clip: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 5.5l-4.6 4.6a1.5 1.5 0 0 0 2.1 2.1l5.3-5.3a3 3 0 0 0-4.2-4.2L3.5 8.3a4.5 4.5 0 0 0 6.4 6.4l4.1-4.1"/></svg>`,
};
const ICONE_CRITERIO = { passou: ICO.check, falhou: ICO.x, aguardando: ICO.clock, nao_avaliado: ICO.minus };

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
const somenteLeitura = () => estado.fonte !== "api";
const motivoLeitura = (d) => somenteLeitura() ? "Cópia estática: só leitura" : d && !d.gate_disponivel ? "A CLI do pipeline (npm run gate) não existe neste checkout" : "";

// ---------- indicador ao vivo e avisos ----------
function pintarVivo() {
  const el = $("vivo");
  el.classList.remove("ok", "estatico", "falha");
  const aviso = $("aviso-topo");
  aviso.classList.remove("falha");
  if (estado.fonte === "api") {
    el.classList.add("ok");
    $("vivo-texto").textContent = `ao vivo · ${new Date(estado.ultimoOk).toLocaleTimeString("pt-BR")}`;
    aviso.hidden = true;
  } else if (estado.fonte === "estatico") {
    el.classList.add("estatico");
    const g = estado.visao?.gerado_em;
    $("vivo-texto").textContent = `cópia estática${g ? ` · ${quando(g)}` : ""}`;
    aviso.hidden = false;
    aviso.textContent = `Você está vendo uma cópia estática gerada ${g ? `às ${quando(g)}` : "antes"} (painel/data.json). As ações ficam desabilitadas até a API voltar.`;
  } else {
    el.classList.add("falha");
    $("vivo-texto").textContent = "sem conexão";
    aviso.hidden = !estado.jaPintouAlgo;
    aviso.classList.add("falha");
    aviso.textContent = `Sem conexão com o painel desde ${estado.ultimoOk ? new Date(estado.ultimoOk).toLocaleTimeString("pt-BR") : "o início"}. Mostrando os últimos dados recebidos; tentando de novo a cada 2 s.`;
  }
}

// ---------- peças compartilhadas ----------
function faixa(etapas) {
  const rotulo = etapas.map((e) => `${e.nome}: ${ETAPA_CURTA[e.status] ?? e.status}`).join("; ");
  return `<div class="faixa" role="img" aria-label="${esc(rotulo)}" title="${esc(rotulo)}">${etapas.map((e) => `<span class="seg ${esc(e.status)}"></span>`).join("")}</div>`;
}
function seloStatus(status, classeExtra = "") {
  const cls = { nao_iniciado: "selo-contorno", executando: "selo-brand", aguardando_prefeitura: "selo-aviso", aguardando_implantador: "selo-solido-aviso", concluido: "selo-ok", parado: "selo-erro" }[status] ?? "selo-neutro";
  return `<span class="selo ${cls} ${classeExtra}">${esc(STATUS_ROTULO[status] ?? status)}</span>`;
}
const dependePrefeitura = (p) => p.tem_dados && (p.status === "aguardando_prefeitura" || p.gate?.para === "analista" || (p.sem_resposta_horas ?? null) !== null);
function textoEspera(p) {
  const h = p.sem_resposta_horas;
  if (h === null || h === undefined || h < LIMIAR_AVISO_H) return "";
  const cls = h >= LIMIAR_FILA_H ? "erro" : "aviso";
  return `<span class="${cls}">sem resposta há ${esc(horasTexto(h))}</span>`;
}

// ---------- visão da prefeitura: métricas ----------
function pintarMetricas(v) {
  const m = v.metricas;
  const falhando = Math.max(0, (m.cenarios_rodados ?? 0) - (m.cenarios_passando ?? 0));
  const tiles = [
    { r: "Processos prontos", v: fmtNum(m.processos_prontos, 0), s: `de ${fmtNum(m.processos_total, 0)}` },
    { r: "Horas de reunião evitadas", v: fmtNum(m.horas_reuniao_evitadas), u: "h" },
    { r: "Respostas sem reunião", v: fmtNum(m.perguntas_respondidas_sem_reuniao, 0), s: `de ${fmtNum(m.perguntas_feitas, 0)} perguntas` },
    { r: "Cenários passando", v: fmtNum(m.cenarios_passando, 0), s: `de ${fmtNum(m.cenarios_rodados, 0)}`, n: falhando ? `${plural(falhando, "falha", "falhas")}` : "" },
  ];
  const html = tiles.map((t) => `<div class="metrica"><div class="metrica-rotulo">${esc(t.r)}</div><div class="metrica-valor">${esc(t.v)}${t.u ? `<span class="metrica-unidade">${esc(t.u)}</span>` : ""}${t.s ? `<small>${esc(t.s)}</small>` : ""}</div>${t.n ? `<div class="metrica-nota">${esc(t.n)}</div>` : ""}</div>`).join("");
  const el = $("metricas");
  const antes = [...el.querySelectorAll(".metrica-valor")].map((x) => x.textContent);
  if (setHtml(el, html, "metricas")) {
    el.querySelectorAll(".metrica").forEach((t, i) => {
      if (antes.length && antes[i] !== t.querySelector(".metrica-valor").textContent) t.classList.add("flash");
    });
  }
}

// ---------- visão da prefeitura: fila ----------
function motivoPrefeitura(p) {
  if (p.gate?.para === "analista") return { texto: "Pergunta com o analista", desde: p.gate.aberto_em ?? null };
  const e = textoEspera(p);
  if (e) return { texto: `Analista ${e}`, desde: null };
  return { texto: "Em conversa com o analista", desde: p.ultima_mensagem_em ?? null };
}
function itemFila(v, p, motivo, desde) {
  return `<li><a class="fila-item" href="#/p/${esc(v.cidade_slug)}/${esc(p.slug)}">
      <span class="fila-nome">${esc(p.processo)}</span>
      <span class="fila-motivo">${motivo}</span>
      <span class="fila-quando">${desde ? rel(desde, "há ") : ""}</span></a></li>`;
}
function pintarFila(v) {
  const todos = v.secretarias.flatMap((s) => s.processos);
  const comDados = todos.filter((p) => p.tem_dados);
  const minha = todos.filter((p) => p.atencao).sort((a, b) => (PRIORIDADE_ATENCAO[a.atencao.tipo] ?? 9) - (PRIORIDADE_ATENCAO[b.atencao.tipo] ?? 9));
  const pref = todos.filter((p) => !p.atencao && dependePrefeitura(p));
  const l1 = minha.length
    ? `<ul class="fila-lista">${minha.map((p) => itemFila(v, p, `<b>${esc(p.atencao.texto)}</b>`, p.atencao.desde)).join("")}</ul>`
    : `<p class="fila-vazia">${comDados.length ? "Nada esperando por você." : "Nenhum processo iniciado. O primeiro “oi” do analista aparece aqui."}</p>`;
  const l2 = pref.length
    ? `<ul class="fila-lista">${pref.map((p) => { const m = motivoPrefeitura(p); return itemFila(v, p, m.texto, m.desde); }).join("")}</ul>`
    : `<p class="fila-vazia">Ninguém esperando a prefeitura.</p>`;
  const html = `
    <div class="fila-bloco ${minha.length ? "urgente" : ""}">
      <div class="fila-cab"><h2>Precisa de você</h2><span class="contagem">${minha.length}</span></div>${l1}
    </div>
    <div class="fila-bloco">
      <div class="fila-cab"><h2>Esperando a prefeitura</h2><span class="contagem">${pref.length}</span></div>${l2}
    </div>`;
  setHtml($("fila"), html, "fila");
}

// ---------- visão da prefeitura: legenda e secretarias ----------
function pintarLegenda(v) {
  const cores = [["concluida", "concluída"], ["executando", "em andamento"], ["aguardando", "aguardando"], ["falhou", "falhou"]]
    .map(([k, r]) => `<span><i class="seg ${k}"></i>${r}</span>`).join("");
  const passos = `<span class="ordem" title="As seis etapas de cada processo, na ordem">${v.etapas.map((e) => `<em>${esc(ETAPA_NOME_CURTO[e.slug] ?? e.nome)}</em>`).join(" › ")}</span>`;
  setHtml($("legenda"), cores + passos, "legenda");
}

function subLinha(p) {
  if (p.atencao) return `<span class="${p.atencao.tipo === "gate" ? "aviso" : p.atencao.tipo === "humano" ? "brand" : "erro"}">${esc(p.atencao.texto)}</span>`;
  if (p.modo === "humano") return `<span class="brand">você na conversa</span>`;
  if (p.gate?.para === "analista") return `pergunta com o analista ${rel(p.gate.aberto_em)}`;
  const e = textoEspera(p);
  if (e) return e;
  if (p.pendencias) return plural(p.pendencias, "pendência", "pendências");
  return "";
}
function pintarSecretarias(v) {
  const peso = (p) => (p.atencao ? 0 : dependePrefeitura(p) ? 1 : p.tem_dados ? 2 : 3);
  const html = v.secretarias.map((s) => {
    const ativos = s.processos.filter((p) => p.tem_dados).length;
    const ordenados = [...s.processos].sort((a, b) => peso(a) - peso(b));
    const linhas = ordenados.map((p) => {
      const nome = `<div class="linha-nome"><span class="texto" title="${esc(p.processo)}">${esc(p.processo)}</span></div>`;
      if (!(p.tem_dados && p.slug)) {
        const alvo = p.slug_previsto ? `href="#/p/${esc(v.cidade_slug)}/${esc(p.slug_previsto)}"` : "";
        return `<li>${alvo ? `<a class="linha sem-dados" ${alvo}>` : `<div class="linha sem-dados">`}${nome}${faixa(p.etapas)}<span class="linha-estado nao_iniciado"></span>${alvo ? "</a>" : "</div>"}</li>`;
      }
      const sub = subLinha(p);
      const estadoHtml = `<span class="linha-estado ${esc(p.status)}"><span class="ponto"></span>${esc(STATUS_ROTULO[p.status] ?? p.status)}</span>`;
      return `<li><a class="linha ${p.atencao ? `atencao-${esc(p.atencao.tipo)}` : ""}" href="#/p/${esc(v.cidade_slug)}/${esc(p.slug)}">${nome}${faixa(p.etapas)}${estadoHtml}${sub ? `<div class="linha-sub">${sub}</div>` : ""}</a></li>`;
    }).join("");
    return `<section class="secretaria"><div class="secretaria-cab"><h3>${esc(s.nome)}</h3><span class="contagem">${ativos ? `${ativos} de ${s.processos.length}` : `${s.processos.length}`}</span></div><ul class="linhas">${linhas}</ul></section>`;
  }).join("");
  setHtml($("secretarias"), html || `<div class="estado-vazio"><h3>Nenhuma secretaria carregada</h3><p>O seed em <code>fixtures/seed/processos.json</code> está vazio ou ilegível.</p></div>`, "secretarias");
}

function pintarVisao() {
  const v = estado.visao;
  if (!v) return;
  $("cidade").textContent = v.cidade;
  pintarMetricas(v);
  pintarFila(v);
  pintarLegenda(v);
  pintarSecretarias(v);
  estado.jaPintouAlgo = true;
}

// ---------- detalhe: cabeçalho e faixa grande ----------
function pintarCabecalhoDetalhe(d) {
  const p = d.processo;
  const titulo = p?.processo ?? d.run?.titulo ?? d.slug;
  $("d-titulo").textContent = titulo;
  $("d-secretaria").textContent = p ? p.secretaria : "";
  $("trilha").hidden = false;
  $("trilha").textContent = p ? `${p.secretaria} / ${titulo}` : titulo;
  const selos = p ? [
    seloStatus(p.status),
    d.modo === "humano" ? `<span class="selo selo-brand"><span class="ponto"></span>você na conversa</span>` : "",
  ].join("") : "";
  setHtml($("d-estado"), selos, "d-estado");

  const base = p?.etapas ?? [];
  const html = base.map((e, i) => {
    const r = d.run?.etapas?.find((x) => x.slug === e.slug) ?? {};
    const quandoTxt = e.status === "concluida" && r.concluida_em ? `às ${quando(r.concluida_em)}` : (e.status === "executando" || e.status === "aguardando") && r.iniciada_em ? `desde ${quando(r.iniciada_em)}` : "";
    return `<div class="passo ${esc(e.status)}"><div class="passo-nome" title="${esc(r.nome || e.nome)}"><span class="passo-n">${i + 1}</span>${esc(ETAPA_NOME_CURTO[e.slug] ?? r.nome ?? e.nome)}</div><div class="passo-estado" title="${esc(quandoTxt)}">${esc(ETAPA_CURTA[e.status] ?? e.status)}</div></div>`;
  }).join("");
  setHtml($("d-faixa"), html, "d-faixa");
}

// ---------- detalhe: gate como cartão de decisão ----------
function tituloGate(g, d) {
  const nomeEtapa = d.processo?.etapas?.find((e) => e.slug === g.etapa)?.nome ?? g.etapa ?? "";
  if (g.tipo === "homologacao") return "Sua decisão: liberar o formulário para homologação";
  if (g.criterio) return `Sua decisão: o critério "${g.criterio}" falhou em ${nomeEtapa || "uma etapa"}`;
  return `Sua decisão${nomeEtapa ? ` em ${nomeEtapa}` : ""}`;
}
function pintarGate(d) {
  const g = d.run?.gate;
  const el = $("d-gate");
  const rotaK = estado.rota ? `${estado.rota.cidade}/${estado.rota.slug}` : "";
  if (!g) {
    const s = estado.gateSaida;
    if (s && s.rota === rotaK && Date.now() - s.em < 20000) {
      setHtml(el, `<section class="gate resolvido"><div class="gate-cab"><h2>Decisão registrada</h2></div><p class="gate-saida ${s.ok ? "ok" : "erro"}">${esc(s.texto)}</p></section>`, "d-gate");
    } else setHtml(el, "", "d-gate");
    return;
  }
  const paraImplantador = g.para !== "analista";
  const ctx = g.contexto ?? {};
  const desab = somenteLeitura() || !d.gate_disponivel;
  const dica = motivoLeitura(d);

  if (!paraImplantador) {
    const naoEntregue = ctx.entregue === false;
    const html = `<section class="gate analista" aria-live="polite">
      <div class="gate-cab"><h2>Esperando o analista responder</h2><span class="quando">${rel(g.aberto_em, "há ")}</span></div>
      <div>
        <p class="gate-pergunta">${esc(g.instrucao ?? g.resumo ?? "")}</p>
        <p class="gate-saida" style="margin-top:.5rem">${naoEntregue ? "A pergunta ficou registrada mas não saiu pelo canal (gate aberto fora do WhatsApp)." : "Se ele responder “sim”, o pipeline segue sozinho; se responder diferente, a resposta vira ajuste na ficha."}</p>
        ${g.resumo && g.instrucao ? `<details><summary>Por que o pipeline perguntou</summary><p>${esc(g.resumo)}</p></details>` : ""}
      </div>
      <div class="gate-acoes"><p class="gate-saida">Para intervir, assuma a conversa abaixo.</p></div>
    </section>`;
    setHtml(el, html, "d-gate");
    return;
  }

  const pend = Array.isArray(ctx.pendencias) ? ctx.pendencias : [];
  const cenIds = Array.isArray(ctx.cenarios) ? ctx.cenarios : [];
  const chips = [
    typeof ctx.cenarios === "string" ? `<span class="selo ${ctx.cenarios.split("/")[0] === ctx.cenarios.split("/")[1] ? "selo-ok" : "selo-erro"}">cenários ${esc(ctx.cenarios)}</span>` : (d.processo?.cenarios ? `<span class="selo selo-neutro">cenários ${esc(d.processo.cenarios)}</span>` : ""),
    pend.length ? `<span class="selo selo-aviso">${plural(pend.length, "pendência", "pendências")}</span>` : "",
    cenIds.length ? `<span class="selo selo-erro">${plural(cenIds.length, "cenário falhou", "cenários falharam")}</span>` : "",
    d.diff ? `<a class="selo selo-neutro" href="#h-diff">ver mudanças</a>` : "",
  ].join("");
  const pendHtml = pend.length ? `<details data-k="gate-pend"><summary>Ver ${plural(pend.length, "pendência", "pendências")}</summary><ul class="gate-pendencias">${pend.slice(0, 12).map((q) => `<li><b>${esc(perguntaCurta(q.texto))}</b>${q.pendencia ? ` — ${esc(q.pendencia)}` : ""} <code>${esc(q.id)}</code></li>`).join("")}${pend.length > 12 ? `<li>… e mais ${pend.length - 12}</li>` : ""}</ul></details>` : "";
  const cenHtml = cenIds.length ? `<ul class="gate-pendencias">${cenIds.map((id) => { const r = (d.relatorio ?? []).find((x) => x.id === id); return `<li><b>${esc(r?.descricao ?? id)}</b>${r && !r.passou ? ` — ${esc(explicarFalhas(r))}` : ""}</li>`; }).join("")}</ul>` : "";

  const acoes = g.acoes?.length ? g.acoes : ["aprovar", "ajustar", "rejeitar"];
  const botao = (a) => {
    const rot = { aprovar: "Aprovar", ajustar: "Ajustar…", rejeitar: "Rejeitar" }[a] ?? a;
    const cls = { aprovar: "btn-ok", ajustar: "", rejeitar: "btn-perigo" }[a] ?? "";
    const ajuda = { aprovar: "Libera para a prefeitura homologar", ajustar: "Corrige respostas ou pede mais cenários", rejeitar: "Para o processo" }[a] ?? "";
    return `<button type="button" class="btn ${cls}" data-acao="${esc(a)}" title="${esc(desab ? dica : ajuda)}" ${desab ? "disabled" : ""}>${esc(rot)}</button>`;
  };
  let sub = "";
  if (estado.gateUI === "ajustar") {
    sub = `<div class="gate-ajuste">
      <textarea id="gate-texto" rows="3" placeholder="opcoes-20=Construção nova, Reforma&#10;ou um pedido em texto livre"></textarea>
      <div class="dica">Uma linha <code>pergunta_id=valor</code> corrige a ficha e refaz formulário e cenários. Texto livre pede mais cenários ao validador.</div>
      <div class="gate-botoes"><button type="button" class="btn btn-primario" data-acao="ajustar" data-confirmado="1">Enviar ajuste</button><button type="button" class="btn btn-fantasma" data-cancelar="1">Cancelar</button></div>
    </div>`;
  } else if (estado.gateUI === "rejeitar") {
    sub = `<div class="confirma perigo">Rejeitar para o processo; ninguém mais recebe mensagem. Confirmar?
      <button type="button" class="btn btn-perigo-solido" data-acao="rejeitar" data-confirmado="1">Sim, rejeitar</button><button type="button" class="btn" data-cancelar="1">Cancelar</button></div>`;
  }
  const saida = estado.gateSaida && estado.gateSaida.rota === rotaK ? `<p class="gate-saida ${estado.gateSaida.ok ? "ok" : "erro"}">${esc(estado.gateSaida.texto)}</p>` : "";
  const html = `<section class="gate" aria-live="polite">
    <div class="gate-cab"><h2>${esc(tituloGate(g, d))}</h2><span class="quando">${rel(g.aberto_em, "há ")}</span></div>
    <div>
      ${g.tipo === "homologacao" ? "" : `<p class="gate-resumo">${esc(g.resumo ?? "")}</p>`}
      <div class="gate-contexto">${chips}</div>
      ${pendHtml}${cenHtml}
      ${g.instrucao ? `<details><summary>Instrução completa do pipeline</summary><p>${esc(g.instrucao)}</p></details>` : ""}
    </div>
    <div class="gate-acoes">
      <div class="gate-botoes">${acoes.map(botao).join("")}</div>
      ${sub}${saida}
    </div>
  </section>`;
  setHtml(el, html, "d-gate");
}

$("d-gate").addEventListener("click", async (e) => {
  const cancelar = e.target.closest("[data-cancelar]");
  if (cancelar) { estado.gateUI = null; pintarGate(estado.detalhe); return; }
  const b = e.target.closest("button[data-acao]");
  if (!b || !estado.rota) return;
  const acao = b.dataset.acao;
  if ((acao === "ajustar" || acao === "rejeitar") && !b.dataset.confirmado) { estado.gateUI = acao; pintarGate(estado.detalhe); $("gate-texto")?.focus(); return; }
  const texto = $("gate-texto")?.value ?? "";
  if (acao === "ajustar" && !texto.trim()) { $("gate-texto")?.focus(); return; }
  const { cidade, slug } = estado.rota;
  $("d-gate").querySelectorAll("button").forEach((x) => (x.disabled = true));
  estado.gateSaida = { ok: true, texto: `Executando “${acao}”…`, em: Date.now(), rota: `${cidade}/${slug}` };
  pintarGate(estado.detalhe);
  const r = await postJson(`/api/gate/${encodeURIComponent(cidade)}/${encodeURIComponent(slug)}`, { acao, texto });
  const saida = String(r.corpo.saida ?? "").trim();
  estado.gateSaida = { ok: r.ok, texto: r.ok ? (saida || "Feito.") : `Não foi possível (${r.status}): ${r.corpo.erro ?? saida}`, em: Date.now(), rota: `${cidade}/${slug}` };
  estado.gateUI = null;
  delete estado.assinaturas["d-gate"];
  tick();
});

// ---------- detalhe: etapas como texto corrido ----------
function pintarEtapas(d) {
  const run = d.run;
  const base = d.processo?.etapas ?? [];
  $("d-etapas-nota").textContent = run ? "" : base.length ? "deduzidas pelos arquivos (sem run.json)" : "";
  const html = base.map((e) => {
    const r = run?.etapas?.find((x) => x.slug === e.slug) ?? {};
    const nome = r.nome || e.nome;
    const quandoTxt = e.status === "concluida" && r.concluida_em ? ` às ${quando(r.concluida_em)}` : (e.status === "executando" || e.status === "aguardando") && r.iniciada_em ? ` desde ${quando(r.iniciada_em)}` : "";
    const tent = r.tentativas > 1 ? ` Levou ${r.tentativas} tentativas.` : "";
    let frase = `<b>${esc(cap(ETAPA_PALAVRA[e.status] ?? e.status))}</b>${esc(quandoTxt)}.`;
    if (e.status === "concluida" && r.saida_resumo) frase += ` ${esc(cap(r.saida_resumo))}.`;
    else if ((e.status === "executando" || e.status === "aguardando") && (r.saida_resumo || r.entrada_resumo)) frase += ` ${esc(cap(r.saida_resumo || r.entrada_resumo))}.`;
    else if (e.status === "falhou" && r.saida_resumo) frase += ` ${esc(cap(r.saida_resumo))}.`;
    frase += esc(tent);
    const quem = "";
    const crit = (r.criterios ?? []).map((c) => `<li class="criterio ${esc(c.resultado)}">
        <span class="criterio-icone">${ICONE_CRITERIO[c.resultado] ?? ICO.minus}</span>
        <span><span class="criterio-nome" title="${esc(c.detalhe ?? "")}">${esc(cap(c.nome))}</span>${c.detalhe && c.resultado !== "passou" ? `<span class="criterio-detalhe">${esc(cap(c.detalhe))}</span>` : ""}</span></li>`).join("");
    return `<li class="etapa ${esc(e.status)}">
      <span class="etapa-marca" aria-hidden="true">${e.status === "concluida" ? ICO.check : e.status === "falhou" ? ICO.x : e.status === "aguardando" ? ICO.clock : ""}</span>
      <div class="etapa-cab"><span class="etapa-nome">${esc(nome)}</span></div>
      <div class="etapa-frase">${frase}</div>
      ${quem ? `<div class="etapa-quem">${esc(quem)}</div>` : ""}
      ${crit ? `<ul class="criterios">${crit}</ul>` : ""}
    </li>`;
  }).join("");
  setHtml($("d-etapas"), html || `<p class="vazio">As etapas aparecem quando o pipeline abrir o processo (run.json).</p>`, "d-etapas");
}

// ---------- detalhe: conversa ----------
const ROTULO_VOZ = { analista: "Analista", agente: "Agente", implantador: "Implantador" };
function vozDe(m) {
  if (m.voz) return m.voz;
  if (m.role === "user") return "analista";
  return m.autor === "implantador" ? "implantador" : "agente";
}
function perguntaCurta(texto, max = 110) {
  if (!texto) return "";
  let t = String(texto).replace(/\s+/g, " ").trim();
  // "Para "Tipo de uso", o template prevê: …" → Tipo de uso
  const m = t.match(/^(?:Para|O documento|Na análise interna, o template prevê a etapa)\s+"([^"]+)"/);
  if (m) return m[1];
  const q = t.indexOf("?");
  if (q > 15 && q < max) t = t.slice(0, q + 1);
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + "…";
  return t;
}
function mapaPerguntas(d) {
  const m = new Map();
  for (const g of d.ficha?.grupos ?? []) for (const q of g.perguntas ?? []) m.set(q.id, { ...q, grupo: g.nome });
  return m;
}
function valorLegivel(v, prof = 0) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return fmtNum(v, 2);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^[\[{]/.test(s) && /[\]}]$/.test(s)) { try { return valorLegivel(JSON.parse(s), prof); } catch { /* cortado */ } }
    return s;
  }
  if (Array.isArray(v)) {
    const itens = v.slice(0, 8).map((x) => valorLegivel(x, prof + 1));
    return itens.join(", ") + (v.length > 8 ? ` e mais ${v.length - 8}` : "");
  }
  if (typeof v === "object") {
    const ks = Object.keys(v);
    if ("exigido" in v) return [v.exigido ? "exigido" : "não exigido", v.sempre ? "sempre" : null, v.condicional ? "condicional" : null].filter(Boolean).join(", ");
    if ("existe" in v && ks.length <= 2) return v.existe ? "existe" : "não existe";
    if ("setor" in v) return String(v.setor);
    if ("modelo_proprio" in v) return [v.modelo_proprio ? "modelo próprio" : "modelo padrão do sistema", v.validade_dias ? `validade ${v.validade_dias} dias` : null, v.numeracao_propria ? "numeração própria" : null].filter(Boolean).join(", ");
    if (prof >= 1) return `${ks.length} ${ks.length === 1 ? "valor" : "valores"}`;
    const partes = ks.slice(0, 6).map((k) => `${k.toLowerCase().replace(/_/g, " ")}: ${valorLegivel(v[k], prof + 1)}`);
    return partes.join("; ") + (ks.length > 6 ? `; e mais ${ks.length - 6}` : "");
  }
  return String(v);
}
function chipConfianca(conf, pendencia) {
  if (pendencia) return `<span class="conf pendente">pendência</span>`;
  if (typeof conf !== "number") return "";
  const txt = conf.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  if (conf >= 0.8) return `<span class="conf" title="confiança ${txt}: aplicada no formulário">${txt}</span>`;
  if (conf >= 0.5) return `<span class="conf media" title="abaixo de 0,8: não é aplicada até o analista confirmar">a confirmar ${txt}</span>`;
  return `<span class="conf baixa" title="abaixo de 0,5: descartada ou pendência">baixa ${txt}</span>`;
}
function htmlRegistros(regs, perguntas, pendentes) {
  if (!regs?.length) return "";
  const itens = regs.map((r) => {
    const q = perguntas.get(r.pergunta_id);
    const rotulo = q?.texto ? perguntaCurta(q.texto, 60) : r.pergunta_id ?? "?";
    const pendencia = q && q.pendencia && (q.resposta === null || q.resposta === undefined) ? q.pendencia : null;
    const valor = pendencia ? `pendência: ${pendencia}` : valorLegivel(r.resumo);
    const fonte = ehFoto(r.origem) ? "foto/PDF" : /implantador/i.test(r.origem ?? "") ? "implantador" : /analisador/i.test(r.origem ?? "") ? "código" : "WhatsApp";
    return `<li class="registro" title="${esc([r.origem ? `origem: ${r.origem}` : "", r.pergunta_id].filter(Boolean).join("\n"))}">
      <span class="registro-rotulo">${esc(rotulo)}</span>
      <span class="registro-valor">${esc(valor)}</span>
      <span class="registro-meta">${chipConfianca(r.confianca, pendencia)}<span class="fonte">${esc(fonte)}</span></span>
    </li>`;
  }).join("");
  return `<ul class="registros ${pendentes ? "pendentes" : ""}"><li class="registros-cab">${pendentes ? "Registrado depois da última mensagem" : "Registrou na ficha"}</li>${itens}</ul>`;
}
const ehFoto = (origem) => /anexo|foto|pdf|planilha|imagem|extrator/i.test(origem ?? "");

function pintarChat(d) {
  const turnos = d.conversa ?? [];
  const perguntas = mapaPerguntas(d);
  const eventos = (d.intervencoes ?? []).map((i) => ({ tipo: "evento", em: i.em, i }));
  const itens = [];
  let k = 0;
  const evs = [...eventos].sort((a, b) => (data(a.em)?.getTime() ?? 0) - (data(b.em)?.getTime() ?? 0));
  for (const t of turnos) {
    const tt = data(t.em)?.getTime();
    while (k < evs.length && tt !== undefined && (data(evs[k].em)?.getTime() ?? 0) <= tt) itens.push(evs[k++]);
    itens.push({ tipo: "turno", t });
  }
  while (k < evs.length) itens.push(evs[k++]);

  let notas = 0;
  let html = itens.map((it) => {
    if (it.tipo === "evento") {
      const txt = it.i.tipo === "assumir" ? "Implantador assumiu a conversa; o agente pausou" : it.i.tipo === "devolver" ? "Conversa devolvida ao agente" : it.i.tipo;
      return `<div class="evento humano">${esc(txt)}${it.i.por && it.i.por !== "implantador" ? ` (${esc(it.i.por)})` : ""} · ${esc(hora(it.em))}</div>`;
    }
    const t = it.t;
    const voz = vozDe(t);
    const texto = t.texto ?? t.content ?? "";
    if (voz === "nota") {
      notas++;
      if (!estado.mostrarNotas) return "";
      return `<div class="nota"><b>Nota interna do agente (não enviada):</b> ${esc(texto)}</div>`;
    }
    if (voz === "sistema") return `<div class="evento">${esc(texto)} · ${esc(hora(t.em))}</div>`;
    const anexo = t.anexo ? `<div><span class="anexo">${ICO.clip}${esc(t.anexo)}</span></div>` : "";
    const corpo = texto || (t.anexo ? "" : "(mensagem vazia)");
    return `<div class="bolha ${voz}"><div class="bolha-autor">${ROTULO_VOZ[voz] ?? voz}</div>${esc(corpo)}${anexo}<span class="bolha-hora">${esc(quando(t.em))}</span></div>`
      + (voz === "agente" || voz === "implantador" ? htmlRegistros(t.registros, perguntas) : "");
  }).join("");
  html += htmlRegistros(d.registros_sem_turno, perguntas, true);
  html += (d.outbox_pendente ?? []).map((o) => `<div class="bolha implantador enviando"><div class="bolha-autor">Implantador</div>${esc(o.texto)}<span class="bolha-hora">enviando…</span></div>`).join("");
  if (!html) html = `<div class="estado-vazio"><h3>Nenhuma mensagem ainda</h3><p>Quando o analista mandar a primeira mensagem no WhatsApp, ela aparece aqui à direita e a resposta do agente à esquerda. Embaixo de cada resposta do agente fica o que ele registrou na ficha, com origem e confiança.</p></div>`;

  const chat = $("d-chat");
  const noFim = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  if (setHtml(chat, html, "d-chat") && (noFim || !estado.assinaturas.chatRolado)) {
    chat.scrollTop = chat.scrollHeight;
    estado.assinaturas.chatRolado = true;
  }

  const bn = $("btn-notas");
  bn.hidden = !notas;
  bn.textContent = estado.mostrarNotas ? "Ocultar notas" : `Notas do agente (${notas})`;
  bn.title = "Notas de turno que o agente escreve para si mesmo; não vão ao analista.";

  // Modo da conversa: agente ou humano.
  const humano = d.modo === "humano";
  const modoEl = $("chat-modo");
  modoEl.className = `chat-modo ${humano ? "humano" : ""}`;
  setHtml(modoEl, somenteLeitura()
    ? `Cópia estática: só leitura.`
    : humano
      ? `<span class="selo selo-brand"><span class="ponto"></span>Você na conversa${d.assumida_em ? ` desde ${esc(hora(d.assumida_em))}` : ""} · agente pausado</span>`
      : `<span class="selo selo-neutro"><span class="ponto"></span>Agente respondendo</span>`, "d-chat-modo");
  const btn = $("btn-modo");
  btn.hidden = !d.processo;
  btn.textContent = humano ? "Devolver ao agente" : "Assumir conversa";
  btn.className = `btn ${humano ? "" : "btn-brand"}`;
  const desab = somenteLeitura() || !d.gate_disponivel || estado.enviando;
  btn.disabled = desab;
  btn.title = motivoLeitura(d);

  const conf = $("confirma-modo");
  if (estado.confirmaModo && !desab) {
    conf.hidden = false;
    conf.className = `confirma ${estado.confirmaModo === "humano" ? "brand" : ""}`;
    // setHtml: repintar a cada tick trocaria os botões debaixo do clique.
    setHtml(conf, estado.confirmaModo === "humano"
      ? `O agente pausa e você passa a responder ao analista por aqui. <button type="button" class="btn btn-primario" data-modo="humano">Assumir</button><button type="button" class="btn" data-cancelar="1">Cancelar</button>`
      : `O agente recebe um resumo do que você conversou e retoma a ficha. <button type="button" class="btn btn-primario" data-modo="agente">Devolver</button><button type="button" class="btn" data-cancelar="1">Cancelar</button>`, "d-confirma-modo");
  } else conf.hidden = true;

  $("compositor").hidden = !humano || somenteLeitura();
}

$("btn-notas").addEventListener("click", () => { estado.mostrarNotas = !estado.mostrarNotas; delete estado.assinaturas["d-chat"]; if (estado.detalhe) pintarChat(estado.detalhe); });
$("btn-modo").addEventListener("click", () => {
  if (!estado.detalhe) return;
  estado.confirmaModo = estado.detalhe.modo === "humano" ? "agente" : "humano";
  pintarChat(estado.detalhe);
});
$("confirma-modo").addEventListener("click", async (e) => {
  if (e.target.closest("[data-cancelar]")) { estado.confirmaModo = null; pintarChat(estado.detalhe); return; }
  const b = e.target.closest("button[data-modo]");
  if (!b || !estado.rota) return;
  const modo = b.dataset.modo;
  const { cidade, slug } = estado.rota;
  estado.enviando = true;
  estado.confirmaModo = null;
  $("confirma-modo").querySelectorAll("button").forEach((x) => (x.disabled = true));
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

// ---------- detalhe: números, ficha, cenários ----------
function pintarNumeros(d) {
  const m = d.metricas ?? {};
  const itens = [
    ["Perguntas feitas", fmtNum(m.perguntas_feitas, 0)],
    ["Respondidas por mensagem", fmtNum(m.respondidas_por_mensagem, 0)],
    ["Respondidas por foto ou PDF", fmtNum(m.respondidas_por_anexo, 0)],
    ["Pendências", fmtNum(m.pendencias_abertas, 0)],
    ["Mensagens", fmtNum((m.mensagens_enviadas ?? 0) + (m.mensagens_recebidas ?? 0), 0)],
    ["Horas de reunião evitadas", `${fmtNum(m.horas_reuniao_evitadas)}<small> h</small>`],
  ];
  setHtml($("d-numeros"), itens.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${v}</dd></div>`).join(""), "d-numeros");
}

function pintarFicha(d) {
  const gs = d.ficha_progresso ?? [];
  const perguntas = d.ficha?.grupos ?? [];
  if (!gs.length) {
    $("d-ficha-nota").textContent = "";
    setHtml($("d-ficha"), `<p class="vazio">Aparece quando o template for analisado.</p>`, "d-ficha");
    return;
  }
  const tot = gs.reduce((a, g) => a + g.total, 0), resp = gs.reduce((a, g) => a + g.respondidas, 0), pend = gs.reduce((a, g) => a + g.pendencias, 0);
  $("d-ficha-nota").textContent = `${resp} de ${tot} respondidas${pend ? ` · ${pend} pend.` : ""}`;
  const html = gs.map((g, gi) => {
    const t = g.total || 1;
    const msg = ((g.respondidas - g.por_anexo) / t) * 100;
    const anx = (g.por_anexo / t) * 100;
    const pnd = (Math.min(g.pendencias, g.abertas) / t) * 100;
    const qs = perguntas.find((x) => x.nome === g.grupo)?.perguntas ?? [];
    const lista = qs.map((q) => {
      const respondida = q.resposta !== null && q.resposta !== undefined && (q.confianca ?? 0) >= 0.8;
      const pendencia = q.pendencia && !respondida;
      return `<li class="ficha-pergunta ${respondida ? "ok" : pendencia ? "pend" : ""}">
        <span class="q">${esc(perguntaCurta(q.texto) || q.id)}</span>
        <span class="r">${pendencia ? `pendência: ${esc(q.pendencia)}` : respondida ? esc(valorLegivel(q.resposta)) : q.resposta !== null && q.resposta !== undefined ? `${esc(valorLegivel(q.resposta))} (a confirmar)` : "sem resposta ainda"}</span>
        <span class="meta">${chipConfianca(q.confianca, pendencia)}${q.origem ? `<span>origem: ${esc(q.origem)}</span>` : ""}<code>${esc(q.id)}</code></span>
      </li>`;
    }).join("");
    const nAbertas = g.abertas - Math.min(g.pendencias, g.abertas);
    return `<details class="ficha-grupo" data-k="ficha-${gi}">
      <summary title="${g.respondidas} respondidas (${g.por_anexo} por anexo), ${nAbertas} em aberto, ${g.pendencias} pendências">
        <span class="nome">${esc(g.grupo)}</span><span class="n ${g.pendencias ? "aviso" : ""}">${g.respondidas}/${g.total}${g.pendencias ? ` · ${g.pendencias} pend.` : ""}</span>
        <div class="barra"><i class="b-msg" style="width:${msg}%"></i><i class="b-anexo" style="width:${anx}%"></i><i class="b-pend" style="width:${pnd}%"></i></div>
      </summary>
      ${lista ? `<ul class="ficha-perguntas">${lista}</ul>` : `<p class="vazio">Sem o texto das perguntas (ficha.json sem este grupo).</p>`}
    </details>`;
  }).join("") + `<div class="ficha-legenda"><span><i style="background:var(--success)"></i>por mensagem</span><span><i style="background:var(--brand-ink)"></i>por foto ou PDF</span><span><i style="background:var(--warning)"></i>pendência com dono</span><span><i style="background:var(--muted-2)"></i>em aberto</span></div>`;
  setHtml($("d-ficha"), html, "d-ficha");
}

function explicarFalhas(r) {
  const fs = r.falhas ?? [];
  if (!fs.length) return "falhou sem detalhe";
  return fs.map((f) => {
    if (f.obtido === "campo_inexistente") return `o campo ${f.campo} não existe no formulário`;
    const e = f.esperado ?? {}, o = f.obtido ?? {};
    const partes = [];
    if ("visivel" in o) partes.push(e.visivel ? "deveria aparecer e ficou oculto" : "deveria ficar oculto e apareceu");
    if ("obrigatorio" in o) partes.push(e.obrigatorio ? "deveria ser obrigatório e ficou opcional" : "deveria ser opcional e ficou obrigatório");
    if ("valor" in o) partes.push(`deveria valer ${valorLegivel(e.valor)} e calculou ${valorLegivel(o.valor)}`);
    return `${f.campo}: ${partes.join("; ") || "resultado diferente do esperado"}`;
  }).join(". ");
}
function pintarCenarios(d) {
  const rel_ = d.relatorio;
  if (!rel_?.length) {
    $("d-cenarios-nota").textContent = "";
    setHtml($("d-cenarios"), `<p class="vazio">Aparecem na etapa Validar.</p>`, "d-cenarios");
    return;
  }
  const ok = rel_.filter((r) => r.passou).length;
  $("d-cenarios-nota").textContent = "";
  const ordenados = [...rel_].sort((a, b) => Number(a.passou) - Number(b.passou));
  const html = `<div class="cenarios-total ${ok === rel_.length ? "tudo-ok" : "com-falha"}"><b>${ok}/${rel_.length}</b><span>${ok === rel_.length ? "todos passam" : plural(rel_.length - ok, "falha", "falhas")}</span></div>
    <ul class="cenarios">${ordenados.map((r) => `<li class="cenario ${r.passou ? "passou" : "falhou"}"><span class="criterio-icone ${r.passou ? "" : ""}" style="background:${r.passou ? "var(--success)" : "var(--danger)"}">${r.passou ? ICO.check : ICO.x}</span>
      <span><span class="desc">${esc(r.descricao ?? r.id)}</span>${!r.passou ? `<span class="porque">${esc(cap(explicarFalhas(r)))}</span>` : ""}${r.indeterminados?.length ? `<span class="indet">${plural(r.indeterminados.length, "expressão indeterminada", "expressões indeterminadas")} (dependem do app)</span>` : ""}</span></li>`).join("")}</ul>`;
  setHtml($("d-cenarios"), html, "d-cenarios");
}

// ---------- detalhe: diff e pendências como texto ----------
function parseDiff(md) {
  const secoes = {};
  let atual = null;
  for (const linha of md.split("\n")) {
    const h = linha.match(/^##\s+(.*)$/);
    if (h) { atual = h[1].trim(); secoes[atual] = []; continue; }
    if (atual && /^-\s+/.test(linha)) secoes[atual].push(linha.replace(/^-\s+/, ""));
  }
  return secoes;
}
function itemDiff(item) {
  const m = item.match(/^\*\*(.+?)\*\*:\s*([\s\S]*)$/);
  if (!m) return `<li class="diff-item"><span class="diff-campo"></span><span class="diff-mudanca">${esc(item)}</span></li>`;
  const campo = m[1];
  let resto = m[2];
  let origem = "";
  const o = resto.lastIndexOf(" _(");
  if (o >= 0 && resto.endsWith(")_")) { origem = resto.slice(o + 3, -2); resto = resto.slice(0, o); }
  const limpar = (s) => s.replace(/^`|`$/g, "").trim();
  const seta = resto.split(" → ");
  const mudanca = seta.length === 2
    ? `<span class="de">${esc(limpar(seta[0]))}</span><span class="seta">→</span><span class="para">${esc(limpar(seta[1]))}</span>`
    : `<span class="para">${esc(limpar(resto))}</span>`;
  return `<li class="diff-item"><span class="diff-campo">${esc(campo)}</span><span class="diff-mudanca">${mudanca}</span>${origem ? `<span class="diff-origem">${esc(origem)}</span>` : ""}</li>`;
}
function pintarTextos(d) {
  if (!d.diff) {
    $("d-diff-nota").textContent = "";
    setHtml($("d-diff"), `<p class="vazio">Aparece quando o formulário for gerado.</p>`, "d-diff");
  } else {
    const s = parseDiff(d.diff);
    const mudou = s["O que mudou"] ?? [];
    const ficou = s["O que ficou do template"] ?? [];
    const atencao = s["Atenção do implantador"] ?? [];
    if (!mudou.length && !ficou.length) {
      $("d-diff-nota").textContent = "";
      setHtml($("d-diff"), `<pre class="pre">${esc(d.diff)}</pre>`, "d-diff");
    } else {
      $("d-diff-nota").textContent = `${plural(mudou.length, "mudança", "mudanças")} · ${ficou.length} como no template`;
      const html = `${mudou.length ? `<ul class="diff-lista">${mudou.map(itemDiff).join("")}</ul>` : `<p class="vazio">Nenhuma mudança em relação ao template.</p>`}
        ${ficou.length ? `<div class="diff-sub">Ficou como no template</div><div class="diff-chips">${ficou.map((c) => `<code>${esc(c.replace(/`/g, ""))}</code>`).join("")}</div>` : ""}
        ${atencao.length ? `<div class="diff-sub">Atenção do implantador</div><ul class="pendencias-lista">${atencao.map((a) => `<li>${esc(a.replace(/^\[[ x]\]\s*/, "").replace(/\*\*/g, ""))}</li>`).join("")}</ul>` : ""}`;
      setHtml($("d-diff"), html, "d-diff");
    }
  }
  $("bloco-pendencias").hidden = !d.pendencias;
  if (d.pendencias) {
    const itens = [];
    for (const linha of d.pendencias.split("\n")) {
      const m = linha.match(/^-\s+\[( |x)\]\s+(.*)$/);
      if (m) { itens.push({ feito: m[1] === "x", texto: m[2], sub: [] }); continue; }
      const s = linha.match(/^\s+-\s+(.*)$/);
      if (s && itens.length) itens[itens.length - 1].sub.push(s[1]);
    }
    const html = itens.length
      ? `<ul class="pendencias-lista">${itens.map((i) => {
          const t = i.texto.replace(/^(\S+)\s+·\s+etapa\s+\*\*(\S+)\*\*:\s*/, (_, iso, etapa) => `${etapa} · ${quando(iso)} · `).replace(/\*\*/g, "");
          return `<li ${i.feito ? 'style="text-decoration:line-through;opacity:.6"' : ""}><b>${esc(t)}</b>${i.sub.filter((x) => !/^resolver:/.test(x)).map((x) => `<div class="muted">${esc(x)}</div>`).join("")}</li>`;
        }).join("")}</ul>`
      : `<pre class="pre">${esc(d.pendencias)}</pre>`;
    setHtml($("d-pendencias"), html, "d-pendencias");
  }
}

// ---------- detalhe: montagem ----------
function pintarDetalhe() {
  const d = estado.detalhe;
  if (!d) return;
  const vazio = !!d.vazio;
  $("d-vazio").hidden = !vazio;
  $("d-gate").hidden = vazio;
  $("d-grade").hidden = vazio;
  $("d-rodape").hidden = vazio;
  $("d-faixa").hidden = vazio;
  if (vazio) {
    const linha = estado.visao?.secretarias?.flatMap((s) => s.processos).find((p) => p.slug === d.slug || p.slug_previsto === d.slug);
    const nome = linha?.processo ?? d.slug;
    $("d-titulo").textContent = nome;
    $("d-secretaria").textContent = linha ? `${linha.secretaria} · ${estado.visao?.cidade ?? d.cidade}` : (estado.visao?.cidade ?? d.cidade);
    $("trilha").hidden = false;
    $("trilha").textContent = nome;
    setHtml($("d-estado"), seloStatus("nao_iniciado"), "d-estado");
    setHtml($("d-vazio"), `<div class="estado-vazio"><h3>Este processo ainda não tem dados</h3>
      <p>Não há nada em <code>data/${esc(d.cidade)}/${esc(d.slug)}/</code>${estado.fonte !== "api" ? " na cópia estática" : ""}. Quando o analista mandar a primeira mensagem (ou o pipeline for aberto pela CLI), aparecem aqui as etapas com critérios, a conversa, a ficha, os cenários e o que mudou no formulário.</p>
      <p><a href="#/">← Voltar à visão da prefeitura</a></p></div>`, "d-vazio");
    estado.jaPintouAlgo = true;
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
  estado.jaPintouAlgo = true;
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
  $("trilha").hidden = !nova;
  if (mudou) {
    estado.detalhe = null;
    estado.gateUI = null;
    estado.confirmaModo = null;
    estado.mostrarNotas = false;
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
    const semNada = estado.fonte === "falha" && !estado.visao;
    $("tela-falha").hidden = !semNada;
    if (semNada) { $("tela-visao").hidden = true; $("tela-detalhe").hidden = true; return; }
    if (estado.visao?.cidade) $("cidade").textContent = estado.visao.cidade;
    if (estado.rota) {
      $("tela-detalhe").hidden = false;
      if (estado.fonte !== "falha") await buscarDetalhe(estado.rota.cidade, estado.rota.slug);
      pintarDetalhe();
      document.title = `${estado.detalhe?.processo?.processo ?? estado.rota.slug} · Painel do implantador`;
    } else {
      $("tela-visao").hidden = false;
      pintarVisao();
      document.title = `${estado.visao?.cidade ?? "Prefeitura"} · Painel do implantador`;
    }
    atualizarRelativos();
  } finally {
    rodando = false;
  }
}

aplicarRota();
setInterval(tick, INTERVALO);
