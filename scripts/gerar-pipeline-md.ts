// Renderiza INSTRUCTIONS/PIPELINE.md a partir de INSTRUCTIONS/pipeline.json.  Uso: npm run docs
import fs from "node:fs";
import { carregarPipeline } from "../src/pipeline/definicao.js";
import { gerarPipelineMd } from "../src/pipeline/docs.js";

fs.writeFileSync("INSTRUCTIONS/PIPELINE.md", gerarPipelineMd(carregarPipeline()));
console.log("gravado: INSTRUCTIONS/PIPELINE.md");
