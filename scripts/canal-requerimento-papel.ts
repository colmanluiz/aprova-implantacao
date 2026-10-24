// Gera fixtures/insumos/requerimento-alvara-papel.png: "foto de celular" do requerimento de papel do Alvará de
// Construção de Vale Verde (fictício), que a Dona Marlene manda na conversa de demonstração (conversa-marlene.txt).
// Uso: npx tsx scripts/canal-requerimento-papel.ts   (precisa do Google Chrome instalado; renderiza HTML → PNG)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const linha = (rotulo: string, largura = "100%") =>
  `<div class="cp" style="width:${largura}"><span class="r">${rotulo}</span><span class="l"></span></div>`;
const caixa = (t: string) => `<span class="cx">&#9744;</span> ${t}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%}
body{background:radial-gradient(ellipse at 40% 30%,#8a8478 0%,#5d5850 60%,#3f3b35 100%);overflow:hidden;font-family:"Times New Roman",Times,serif}
.folha{position:absolute;left:70px;top:46px;width:860px;padding:34px 44px 30px;box-sizing:border-box;color:#1d1d1d;
 background:linear-gradient(170deg,#efece4 0%,#e6e2d8 55%,#d9d4c8 100%);transform:rotate(-1.6deg);
 box-shadow:0 18px 40px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);filter:contrast(.93) saturate(.75)}
.folha:after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,0) 40%,rgba(0,0,0,.08) 100%);pointer-events:none}
.cab{display:flex;align-items:center;gap:18px;border-bottom:2px solid #333;padding-bottom:10px}
.bra{width:62px;height:72px;border:2px solid #444;border-radius:0 0 30px 30px;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center}
.cab h1{font-size:19px;margin:0;letter-spacing:.6px}.cab h2{font-size:14.5px;margin:2px 0 0;font-weight:normal}
h3{text-align:center;font-size:18px;margin:16px 0 4px;letter-spacing:1px}
.prot{text-align:right;font-size:13px;margin-bottom:6px}
.sec{font-weight:bold;font-size:13.5px;background:#d6d0c2;padding:3px 6px;margin:12px 0 6px;border:1px solid #555}
.lin{display:flex;gap:14px}
.cp{display:flex;align-items:flex-end;gap:6px;font-size:14px;margin:6px 0}
.cp .r{white-space:nowrap}.cp .l{flex:1;border-bottom:1px dotted #333;height:14px}
.cx{font-size:17px}
.ops{font-size:14px;margin:6px 0;display:flex;flex-wrap:wrap;gap:4px 22px}
ol{margin:4px 0 0 0;padding-left:22px;font-size:14px;line-height:1.55}
.obs{font-size:12.5px;margin-top:6px;font-style:italic}
.taxa{font-size:14px;margin:4px 0}
.ass{display:flex;justify-content:space-between;margin-top:34px;gap:24px}
.ass div{flex:1;border-top:1px solid #222;text-align:center;font-size:12.5px;padding-top:4px}
.rod{font-size:11px;text-align:center;margin-top:16px;color:#444}
.carimbo{position:absolute;right:60px;top:150px;transform:rotate(9deg);border:3px double rgba(40,60,140,.55);color:rgba(40,60,140,.6);
 font-family:Arial,sans-serif;font-weight:bold;font-size:13px;padding:6px 10px;text-align:center;border-radius:6px}
.apagado{opacity:.32;filter:blur(.6px)}
</style></head><body><div class="folha">
<div class="cab"><div class="bra">BRASÃO<br>VALE<br>VERDE</div><div>
<h1>PREFEITURA MUNICIPAL DE VALE VERDE</h1>
<h2>Secretaria Municipal de Obras e Serviços Urbanos — Setor de Protocolo</h2></div></div>
<div class="carimbo">PROTOCOLO<br>OBRAS<br>___/___/____</div>
<h3>REQUERIMENTO DE ALVARÁ DE CONSTRUÇÃO</h3>
<div class="prot">Protocolo nº ________ / ______</div>
<div class="sec">1. REQUERENTE</div>
${linha("Nome / Razão social:")}
<div class="lin">${linha("CPF / CNPJ:", "50%")}${linha("Telefone:", "50%")}</div>
${linha("Endereço para correspondência:")}
<div class="ops">Qualidade do requerente: ${caixa("Proprietário")} ${caixa("Responsável técnico")} ${caixa("Procurador")}</div>
<div class="sec">2. IMÓVEL</div>
${linha("Endereço do imóvel:")}
<div class="lin">${linha("Inscrição imobiliária:", "55%")}${linha("Zona:", "45%")}</div>
<div class="lin">${linha("Área do terreno (m²):", "50%")}${linha("Área a construir (m²):", "50%")}</div>
<div class="ops">Tipo de obra: ${caixa("Construção nova")} ${caixa("Ampliação")} ${caixa("Reforma")} ${caixa("Regularização")} ${caixa("Demolição")}</div>
<div class="ops">Material: ${caixa("Alvenaria")} ${caixa("Madeira")} ${caixa("Mista")}</div>
<div class="sec">3. RESPONSÁVEL TÉCNICO</div>
<div class="lin">${linha("Nome:", "60%")}${linha("CREA/CAU nº:", "40%")}</div>
${linha("ART / RRT nº:", "60%")}
<div class="sec">4. DOCUMENTOS EXIGIDOS (anexar a este requerimento)</div>
<ol>
<li>RG e CPF do requerente (pessoa física) <b>ou</b> contrato social (pessoa jurídica);</li>
<li>Certidão de matrícula do imóvel atualizada (até 30 dias);</li>
<li>Projeto arquitetônico em 2 (duas) vias, assinado pelo responsável técnico;</li>
<li>ART (CREA) ou RRT (CAU) do responsável técnico;</li>
<li class="apagado">Procuração com firma reconhecida, quando o requerente não for o proprietário.</li>
</ol>
<div class="obs">Obs.: o pedido incompleto não será protocolado.</div>
<div class="sec">5. TAXA</div>
<div class="taxa">Taxa de licença para construção conforme Código Tributário Municipal, calculada pela área a construir. Guia emitida pelo Setor de Tributação.</div>
<div class="taxa">Valor: R$ ____________ &nbsp;&nbsp; Guia nº __________ &nbsp;&nbsp; Pago em ___/___/______</div>
<div class="taxa" style="margin-top:10px">Declaro, sob as penas da lei, que as informações acima são verdadeiras.</div>
<div class="taxa">Vale Verde, ____ de ____________________ de ________.</div>
<div class="ass"><div>Requerente</div><div>Engenheiro responsável (análise)</div><div>Secretário de Obras e Serviços Urbanos</div></div>
<div class="rod">Rua XV de Novembro, 210 — Centro — Vale Verde — Horário do protocolo: 8h às 11h30 e 13h às 17h</div>
</div></body></html>`;

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "requerimento-"));
const arqHtml = path.join(tmp, "requerimento.html");
fs.writeFileSync(arqHtml, html);
const saida = path.resolve("fixtures/insumos/requerimento-alvara-papel.png");
fs.mkdirSync(path.dirname(saida), { recursive: true });
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${saida}`, "--window-size=1000,1240", `file://${arqHtml}`], { stdio: "inherit" });
console.log(`gerado ${saida}`);
