// Gera INSTRUCTIONS/PIPELINE.md a partir de pipeline.json. O teste de trava compara com o arquivo no disco.
import type { PipelineDef } from "./tipos.js";

const AO_FALHAR: Record<string, string> = {
  analista: "pergunta ao analista",
  implantador: "gate do implantador",
  parar: "para o processo",
};

export function gerarPipelineMd(def: PipelineDef): string {
  const L: string[] = [
    "# Pipeline validado",
    "",
    "> Gerado por `npm run docs` a partir de `INSTRUCTIONS/pipeline.json`. Não edite à mão: o teste `docs` falha se este arquivo ficar desatualizado.",
    "",
    "Cada etapa roda e só termina quando todos os seus critérios de saída passam, avaliados em ordem. " +
      "`aguardando` mantém a etapa aberta sem gastar tentativa; `falhou` gasta uma tentativa e refaz a etapa com o motivo; " +
      "sem tentativas, o critério segue a rota `ao_falhar`.",
    "",
    "| # | Etapa | Tipo | Agente | Critérios de saída | Tentativas | Ao falhar |",
    "|---|---|---|---|---|---|---|",
  ];
  def.etapas.forEach((e, i) => {
    const nome = e.sub_etapa_de ? `${e.nome} (\`${e.slug}\`, dentro de \`${e.sub_etapa_de}\`)` : `${e.nome} (\`${e.slug}\`)`;
    const tipo = e.tipo === "agente" ? "agente" : e.gate ? `código + gate ${e.gate}` : "código";
    const crits = e.criterios.map((k) => `${k.nome}${k.tipo === "juiz" ? " _(juiz LLM)_" : ""}`).join("<br>");
    const tent = e.criterios.map((k) => String(k.tentativas)).join("<br>");
    const falhar = e.criterios.map((k) => AO_FALHAR[k.ao_falhar]).join("<br>");
    L.push(`| ${i + 1} | ${nome} | ${tipo} | ${e.agente ? `\`${e.agente}\`` : "—"} | ${crits} | ${tent} | ${falhar} |`);
  });
  L.push("");
  for (const e of def.etapas) {
    L.push(`## ${e.nome}`, "", e.descricao, "");
    if (e.sub_etapa_de) L.push(`Roda dentro de \`${e.sub_etapa_de}\`, cada vez que chega um anexo.`, "");
    for (const k of e.criterios) {
      L.push(`- **${k.nome}**${k.tipo === "juiz" ? " (juiz LLM, falha fechada)" : ""}: ${k.tentativas} ${k.tentativas === 1 ? "tentativa" : "tentativas"} extra; depois, ${AO_FALHAR[k.ao_falhar]}.`);
      if (k.rubrica) L.push(`  - Rubrica: ${k.rubrica}`);
    }
    L.push("");
  }
  return L.join("\n");
}
