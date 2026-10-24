// Gera painel/data.json: a mesma saída de GET /api/visao, mais o detalhe de cada processo com dados
// (em `detalhes["<cidade>/<slug>"]`). Serve ao vídeo de backup e ao modo estático do painel:
//   npm run painel:data   →   abrir painel/index.html?static=1 (ou o painel com a API fora do ar)
import fs from "node:fs";
import path from "node:path";
import { montarVisao, montarDetalhe } from "../src/painel/visao.js";

const root = process.cwd();
const opcoes = { seedPath: path.join(root, "fixtures", "seed", "processos.json"), dataDir: path.join(root, "data"), gateDisponivel: false };
const visao = montarVisao(opcoes);
const detalhes: Record<string, unknown> = {};
for (const p of visao.secretarias.flatMap((s) => s.processos)) {
  if (!p.slug) continue;
  const d = montarDetalhe(opcoes, visao.cidade_slug, p.slug);
  if (d) detalhes[`${visao.cidade_slug}/${p.slug}`] = d;
}
const saida = path.join(root, "painel", "data.json");
fs.writeFileSync(saida, JSON.stringify({ ...visao, detalhes }, null, 2) + "\n");
const m = visao.metricas;
console.log(`painel/data.json gravado: ${m.processos_total} processos, ${m.processos_prontos} prontos, ${Object.keys(detalhes).length} com detalhe, cenários ${m.cenarios_passando}/${m.cenarios_rodados}`);
