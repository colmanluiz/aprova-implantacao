import type { AprovaTemplate, Cenario, ResultadoCenario } from "./types.js";
import { avaliarFormulario, acharCampo } from "./expression-evaluator.js";

function aproximado(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number" || (!isNaN(Number(a)) && !isNaN(Number(b)))) {
    return Math.abs(Number(a) - Number(b)) < 0.005;
  }
  return String(a) === String(b);
}

export function rodarCenarios(tpl: AprovaTemplate, cenarios: Cenario[]): ResultadoCenario[] {
  return cenarios.map((c) => {
    const estados = avaliarFormulario(tpl, c.model);
    const falhas: ResultadoCenario["falhas"] = [];
    for (const esp of c.espera) {
      const est = acharCampo(estados, esp.campo);
      if (!est) { falhas.push({ campo: esp.campo, esperado: esp, obtido: "campo_inexistente" }); continue; }
      const obtido: Record<string, unknown> = {};
      let falhou = false;
      if (esp.visivel !== undefined && est.visivel !== esp.visivel) { obtido.visivel = est.visivel; falhou = true; }
      if (esp.obrigatorio !== undefined && est.obrigatorio !== esp.obrigatorio) { obtido.obrigatorio = est.obrigatorio; falhou = true; }
      if (esp.valor !== undefined && !aproximado(est.valor, esp.valor)) { obtido.valor = est.valor; falhou = true; }
      if (falhou) falhas.push({ campo: esp.campo, esperado: esp, obtido });
    }
    const indeterminados = estados.filter((e) => e.indeterminado?.length).map((e) => `${e.path}: ${e.indeterminado!.join(" | ")}`);
    return { id: c.id, descricao: c.descricao, passou: falhas.length === 0, falhas, indeterminados };
  });
}

export function relatorioTexto(res: ResultadoCenario[]): string {
  const ok = res.filter((r) => r.passou).length;
  const linhas = [`Cenários: ${res.length} | passaram: ${ok} | falharam: ${res.length - ok}`, ""];
  for (const r of res) {
    linhas.push(`${r.passou ? "PASS" : "FAIL"}  ${r.id}  ${r.descricao}`);
    for (const f of r.falhas) {
      linhas.push(`      ${f.campo}: esperado ${JSON.stringify(f.esperado)} obtido ${JSON.stringify(f.obtido)}`);
    }
  }
  const ind = new Set(res.flatMap((r) => r.indeterminados));
  if (ind.size) {
    linhas.push("", `Indeterminados (expressão não avaliável fora do app): ${ind.size}`);
    for (const i of [...ind].slice(0, 10)) linhas.push(`      ${i}`);
  }
  return linhas.join("\n");
}
