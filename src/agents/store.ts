// Estado em disco: data/<cidade>/<processo>/. Sem banco no hackathon.
import fs from "node:fs";
import path from "node:path";
import type { Ficha, EtapaProcesso, Cenario, ResultadoCenario, AprovaTemplate } from "../core/types.js";

export type Contexto = { cidade: string; processo: string; template: string };

export type Estado = {
  etapa: EtapaProcesso;
  historico: { role: "user" | "assistant"; content: string; em: string }[];
  mensagens_enviadas: number;
  perguntas_feitas: number;
  atualizado_em: string;
};

const dir = (c: Contexto) => path.join("data", c.cidade, c.processo);
const arq = (c: Contexto, nome: string) => path.join(dir(c), nome);
const lerJson = <T>(p: string): T | undefined => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined);
const gravar = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 2));
};

export const store = {
  estado(c: Contexto): Estado {
    return lerJson<Estado>(arq(c, "estado.json")) ?? {
      etapa: "nao_iniciado", historico: [], mensagens_enviadas: 0, perguntas_feitas: 0, atualizado_em: new Date().toISOString(),
    };
  },
  salvarEstado(c: Contexto, e: Estado) { e.atualizado_em = new Date().toISOString(); gravar(arq(c, "estado.json"), e); },
  template(c: Contexto): AprovaTemplate { return JSON.parse(fs.readFileSync(c.template, "utf8")); },
  ficha(c: Contexto): Ficha | undefined { return lerJson<Ficha>(arq(c, "ficha.json")); },
  salvarFicha(c: Contexto, f: Ficha) { gravar(arq(c, "ficha.json"), f); },
  salvarForm(c: Contexto, form: AprovaTemplate) { gravar(arq(c, "form.json"), form); },
  form(c: Contexto): AprovaTemplate | undefined { return lerJson<AprovaTemplate>(arq(c, "form.json")); },
  salvarDiff(c: Contexto, md: string) { gravar(arq(c, "diff.md"), md); },
  salvarCenarios(c: Contexto, cs: Cenario[]) { gravar(arq(c, "cenarios.json"), cs); },
  cenarios(c: Contexto): Cenario[] | undefined { return lerJson<Cenario[]>(arq(c, "cenarios.json")); },
  salvarRelatorio(c: Contexto, r: ResultadoCenario[]) { gravar(arq(c, "relatorio.json"), r); },
  pasta: dir,
};

export function perguntasAbertas(f: Ficha) {
  return f.grupos.flatMap((g) => g.perguntas).filter((q) => q.resposta === null || q.confianca < 0.8);
}
