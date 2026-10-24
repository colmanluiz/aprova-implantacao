#!/usr/bin/env tsx
// CLI do código clássico. Útil para desenvolver e para a demo sem canal.
import fs from "node:fs";
import path from "node:path";
import { analisarTemplate, resumoTemplate } from "./core/template-analyzer.js";
import { rodarCenarios, relatorioTexto } from "./core/scenario-runner.js";
import { aplicarFicha, gerarDiff } from "./core/patcher.js";
import type { AprovaTemplate, Ficha, Cenario } from "./core/types.js";

const [cmd, ...args] = process.argv.slice(2);
const ler = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8"));
const opt = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const salvar = (p: string | undefined, conteudo: string) => {
  if (!p) { console.log(conteudo); return; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, conteudo);
  console.error(`gravado: ${p}`);
};

switch (cmd) {
  case "analyze": {
    const tpl = ler<AprovaTemplate>(args[0]);
    const ficha = analisarTemplate(tpl, path.basename(args[0]));
    console.error(JSON.stringify(resumoTemplate(tpl)));
    const total = ficha.grupos.reduce((n, g) => n + g.perguntas.length, 0);
    console.error(`pontos de parametrização: ${total} em ${ficha.grupos.length} grupos`);
    salvar(opt("-o"), JSON.stringify(ficha, null, 2));
    break;
  }
  case "validate": {
    const tpl = ler<AprovaTemplate>(args[0]);
    const cenarios = ler<Cenario[]>(args[1]);
    const res = rodarCenarios(tpl, cenarios);
    console.log(relatorioTexto(res));
    if (opt("-o")) salvar(opt("-o"), JSON.stringify(res, null, 2));
    process.exitCode = res.every((r) => r.passou) ? 0 : 1;
    break;
  }
  case "apply": {
    const tpl = ler<AprovaTemplate>(args[0]);
    const ficha = ler<Ficha>(args[1]);
    const { form, mudancas, pendencias } = aplicarFicha(tpl, ficha);
    salvar(opt("-o"), JSON.stringify(form, null, 2));
    salvar(opt("--diff"), gerarDiff(ficha, mudancas, pendencias));
    console.error(`mudanças: ${mudancas.length} | pendências: ${pendencias.length}`);
    break;
  }
  default:
    console.log(`uso:
  tsx src/cli.ts analyze  <template.json> [-o ficha.json]
  tsx src/cli.ts apply    <template.json> <ficha.json> -o form.json --diff diff.md
  tsx src/cli.ts validate <form.json> <cenarios.json> [-o relatorio.json]`);
}
