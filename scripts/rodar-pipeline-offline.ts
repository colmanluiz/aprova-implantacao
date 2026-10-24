// Roda o pipeline de vale-verde/alvara sem nenhum LLM (plano B da demo).
// Uso: npm run pipeline:offline [-- --cidade x --processo y]   depois: npm run gate -- vale-verde alvara aprovar
import { rodarOffline } from "../src/pipeline/offline.js";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
if (!process.argv.includes("--sem-llm")) console.log("(modo --sem-llm: este script nunca chama LLM)");
const run = await rodarOffline({ ...(arg("cidade") ? { cidade: arg("cidade") } : {}), ...(arg("processo") ? { processo: arg("processo") } : {}) }, console.log);
console.log(`\nstatus: ${run.status} | etapa atual: ${run.etapa_atual}`);
if (run.gate) {
  console.log(`gate para ${run.gate.para}: ${run.gate.resumo}`);
  console.log(`próximo passo: npm run gate -- ${run.cidade} ${run.processo} aprovar`);
}
console.log(`métricas: ${JSON.stringify(run.metricas)}`);
