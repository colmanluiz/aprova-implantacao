// Gera fixtures/insumos/tabela-zoneamento.png: a tabela de parâmetros urbanísticos de Vale Verde (fictícia)
// que o analista "fotografa" na conversa de demonstração. Valores iguais aos de scripts/ficha-exemplo.ts.
// Uso: npx tsx scripts/canal-tabela-zoneamento.ts   (precisa do Google Chrome instalado; renderiza HTML → PNG)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const COLUNAS = [
  ["PAVIMENTOS", "Nº máx. de pavimentos"],
  ["RECUO_FRONTAL", "Recuo frontal (m)"],
  ["RECUO_LATERAL_MAIOR", "Recuo lateral maior (m)"],
  ["RECUO_LATERAL_MENOR", "Recuo lateral menor (m)"],
  ["RECUO_FUNDOS", "Recuo de fundos (m)"],
  ["INDICE_APROVEITAMENTO", "Índice de aproveitamento"],
  ["TAXA_OCUPACAO", "Taxa de ocupação (%)"],
  ["TAXA_PERMEABILIDADE", "Taxa de permeab. (%)"],
] as const;
const ZONAS: Record<string, { nome: string; v: Record<string, number> }> = {
  ZR1: { nome: "Zona Residencial 1", v: { PAVIMENTOS: 2, RECUO_FRONTAL: 4, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 1.5, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 1, TAXA_OCUPACAO: 60, TAXA_PERMEABILIDADE: 20 } },
  ZR2: { nome: "Zona Residencial 2", v: { PAVIMENTOS: 4, RECUO_FRONTAL: 4, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 1.5, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 2, TAXA_OCUPACAO: 60, TAXA_PERMEABILIDADE: 15 } },
  ZC1: { nome: "Zona Central 1", v: { PAVIMENTOS: 8, RECUO_FRONTAL: 0, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 0, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 4, TAXA_OCUPACAO: 80, TAXA_PERMEABILIDADE: 10 } },
  ZI: { nome: "Zona Industrial", v: { PAVIMENTOS: 3, RECUO_FRONTAL: 10, RECUO_LATERAL_MAIOR: 5, RECUO_LATERAL_MENOR: 3, RECUO_FUNDOS: 5, INDICE_APROVEITAMENTO: 1.5, TAXA_OCUPACAO: 50, TAXA_PERMEABILIDADE: 20 } },
};
const fmt = (k: string, n: number) =>
  k === "PAVIMENTOS" || k.startsWith("TAXA") ? String(n) : n.toLocaleString("pt-BR", { minimumFractionDigits: k === "INDICE_APROVEITAMENTO" ? 1 : 2 });

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f4f1ea;font-family:"Times New Roman",Times,serif;color:#111}
.pg{width:1180px;padding:40px 48px;box-sizing:border-box}
h1{font-size:20px;text-align:center;margin:0 0 4px;letter-spacing:.5px}
h2{font-size:16px;text-align:center;font-weight:normal;margin:0 0 22px}
table{border-collapse:collapse;width:100%;font-size:17px}
th,td{border:1.5px solid #222;padding:9px 8px;text-align:center}
th{background:#e4dfd3;font-size:15px}
td.z{text-align:left;font-weight:bold}
td.z span{font-weight:normal;font-size:14px;display:block}
p{font-size:13.5px;margin:14px 0 0}
.rod{display:flex;justify-content:space-between;font-size:13px;margin-top:26px;color:#444}
</style></head><body><div class="pg">
<h1>PREFEITURA MUNICIPAL DE VALE VERDE</h1>
<h2>Lei Complementar nº 1.204/2019 — ANEXO II — Parâmetros urbanísticos de ocupação do solo por zona</h2>
<table><thead><tr><th>Zona</th>${COLUNAS.map(([, t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
${Object.entries(ZONAS).map(([z, { nome, v }]) => `<tr><td class="z">${z}<span>${nome}</span></td>${COLUNAS.map(([k]) => `<td>${fmt(k, v[k])}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>
<p>Notas: (1) Na ZC1 a edificação pode ser construída no alinhamento predial (recuo frontal nulo). (2) Recuos medidos a partir da divisa do lote. (3) Taxa de ocupação e de permeabilidade em percentual da área do lote.</p>
<div class="rod"><span>Publicada no Diário Oficial do Município em 12/03/2019</span><span>p. 2</span></div>
</div></body></html>`;

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tabela-"));
const arqHtml = path.join(tmp, "tabela.html");
fs.writeFileSync(arqHtml, html);
const saida = path.resolve("fixtures/insumos/tabela-zoneamento.png");
fs.mkdirSync(path.dirname(saida), { recursive: true });
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${saida}`, "--window-size=1180,560", `file://${arqHtml}`], { stdio: "inherit" });
console.log(`gerado ${saida}`);
