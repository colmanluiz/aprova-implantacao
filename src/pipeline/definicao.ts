// Carrega e valida a definição declarativa do pipeline (INSTRUCTIONS/pipeline.json).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PipelineDef, type EtapaDef } from "./tipos.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PIPELINE_JSON = path.resolve(here, "../../INSTRUCTIONS/pipeline.json");

export function carregarPipeline(arquivo = PIPELINE_JSON): PipelineDef {
  const def = PipelineDef.parse(JSON.parse(fs.readFileSync(arquivo, "utf8")));
  const slugs = new Set(def.etapas.map((e) => e.slug));
  for (const e of def.etapas) {
    if (e.tipo === "agente" && !e.agente) throw new Error(`etapa ${e.slug}: tipo agente sem agente`);
    if (e.sub_etapa_de && !slugs.has(e.sub_etapa_de)) throw new Error(`etapa ${e.slug}: sub_etapa_de desconhecida`);
    for (const c of e.criterios) if (c.tipo === "juiz" && !c.rubrica) throw new Error(`critério ${c.nome}: juiz sem rubrica`);
  }
  return def;
}

/** Etapas na ordem em que o motor avança (sub-etapas rodam dentro da etapa-mãe). */
export function etapasPrincipais(def: PipelineDef): EtapaDef[] {
  return def.etapas.filter((e) => !e.sub_etapa_de);
}

export function etapaDef(def: PipelineDef, slug: string): EtapaDef {
  const e = def.etapas.find((x) => x.slug === slug);
  if (!e) throw new Error(`etapa desconhecida: ${slug}`);
  return e;
}
