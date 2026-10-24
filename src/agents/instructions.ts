import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, "../../INSTRUCTIONS");

export type NomeAgente = "orquestrador" | "analisador-template" | "coletor" | "extrator" | "aplicador" | "validador";

const ARQUIVO: Record<NomeAgente, string> = {
  orquestrador: "00-orquestrador.md",
  "analisador-template": "01-analisador-template.md",
  coletor: "02-coletor.md",
  extrator: "03-extrator.md",
  aplicador: "04-aplicador.md",
  validador: "05-validador.md",
};

/** Carrega a instrução do agente. É o único lugar que lê INSTRUCTIONS/. */
export function instrucao(nome: NomeAgente): string {
  const comum = fs.readFileSync(path.join(DIR, "README.md"), "utf8").split("Regras comuns a todos os agentes:")[1] ?? "";
  const propria = fs.readFileSync(path.join(DIR, ARQUIVO[nome]), "utf8");
  return `${propria}\n\n## Regras comuns\n${comum.trim()}`;
}
