// Gera a ficha respondida de exemplo (Vale Verde) a partir do template real.
// Simula o que o Coletor + Extrator produziriam numa conversa de WhatsApp.
import fs from "node:fs";
import { analisarTemplate } from "../src/core/template-analyzer.js";
import type { AprovaTemplate, Ficha } from "../src/core/types.js";

const tpl: AprovaTemplate = JSON.parse(fs.readFileSync("fixtures/templates/alvara-construcao.modeload.json", "utf8"));
const ficha: Ficha = analisarTemplate(tpl, "alvara-construcao.modeload.json");
ficha.cidade = "Vale Verde";
const all = ficha.grupos.flatMap((g) => g.perguntas);
const set = (pred: (q: any) => boolean, resposta: unknown, origem: string, confianca = 1) => {
  for (const q of all.filter(pred)) Object.assign(q, { resposta, origem, confianca });
};
const porTexto = (s: string) => (q: any) => q.texto.includes(s);

set((q) => q.tipo === "setor", { slug: "vale_verde", setor: "Secretaria de Planejamento Urbano - Divisão de Aprovação de Projetos" }, "WhatsApp, Marcos (SEPLAN), 24/10 09:41");
set((q) => q.tipo === "etapas", (all.find((q) => q.tipo === "etapas")!.assume as string[]), "WhatsApp, Marcos, 24/10 09:43");
set(porTexto('"Zoneamento"'), ["ZR1", "ZR2", "ZC1", "ZI"], "Anexo: foto da tabela anexa à Lei 1.204/2019, p. 2", 0.95);
set(porTexto('"Tipo de logradouro"'), ["Rua", "Avenida", "Travessa", "Estrada", "Outros"], "WhatsApp, Marcos, 24/10 09:50");
set(porTexto('"Material"'), ["Alvenaria", "Madeira", "Mista", "Estrutura metálica"], "WhatsApp, Marcos, 24/10 09:52");
set(porTexto('"Tipo de vínculo do requerente'), (all.find(porTexto('"Tipo de vínculo do requerente'))!.assume), "WhatsApp, Marcos, 24/10 09:53");
set((q) => q.tipo === "dataset", {
  ZR1: { PAVIMENTOS: 2, RECUO_FRONTAL: 4, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 1.5, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 1, TAXA_OCUPACAO: 60, TAXA_PERMEABILIDADE: 20 },
  ZR2: { PAVIMENTOS: 4, RECUO_FRONTAL: 4, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 1.5, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 2, TAXA_OCUPACAO: 60, TAXA_PERMEABILIDADE: 15 },
  ZC1: { PAVIMENTOS: 8, RECUO_FRONTAL: 0, RECUO_LATERAL_MAIOR: 1.5, RECUO_LATERAL_MENOR: 0, RECUO_FUNDOS: 3, INDICE_APROVEITAMENTO: 4, TAXA_OCUPACAO: 80, TAXA_PERMEABILIDADE: 10 },
  ZI: { PAVIMENTOS: 3, RECUO_FRONTAL: 10, RECUO_LATERAL_MAIOR: 5, RECUO_LATERAL_MENOR: 3, RECUO_FUNDOS: 5, INDICE_APROVEITAMENTO: 1.5, TAXA_OCUPACAO: 50, TAXA_PERMEABILIDADE: 20 },
}, "Anexo: foto da tabela anexa à Lei 1.204/2019, p. 2 (extrator, 4 zonas × 8 parâmetros)", 0.9);
set(porTexto('"Projeto arquitetônico em dwg"'), { exigido: false }, "WhatsApp, Marcos, 24/10 10:02");
set(porTexto('"Documento Complementar"'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:02");
set(porTexto('"ART/RRT"'), { exigido: true, sempre: true }, "WhatsApp, Marcos, 24/10 10:03");
set(porTexto('"Matrícula do imóvel atualizada"'), { exigido: true, sempre: true }, "WhatsApp, Marcos, 24/10 10:03");
set(porTexto('"Procuração"'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:04");
set(porTexto('"Alvará antigo"'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:04");
set(porTexto('"Contrato Social'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:05");
set(porTexto('"Documentos pessoais'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:05");
set(porTexto('"Documentos (Carteira'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:05");
set(porTexto('"Projeto arquitetônico em pdf"'), { exigido: true, sempre: true }, "WhatsApp, Marcos, 24/10 10:06");
set(porTexto('"Projetos complementares'), { exigido: true }, "WhatsApp, Marcos, 24/10 10:06");
set(porTexto('"Fiscalização in loco'), { existe: false }, "WhatsApp, Marcos, 24/10 10:10");
set(porTexto('"Numeração Predial"'), { existe: true }, "WhatsApp, Marcos, 24/10 10:10");
set(porTexto('"Parecer Edilício"'), { existe: true, nome: "Parecer Técnico de Aprovação" }, "WhatsApp, Marcos, 24/10 10:11");
set(porTexto('"Pareceres complementares"'), { existe: true }, "WhatsApp, Marcos, 24/10 10:11");
set(porTexto('"Observações"'), { existe: true }, "WhatsApp, Marcos, 24/10 10:11");
set((q) => q.tipo === "residuo" && q.assume === "Cascavel", "Vale Verde", "Implantador (resíduo apontado pelo analisador)");
// Deixadas em aberto de propósito: taxa (analista não sabe), atividades (lista longa, aguardando planilha), texto legal, documento final
for (const q of all.filter((q) => q.tipo === "taxa")) q.pendencia = "Marcos não sabe o valor; perguntar à Secretaria de Fazenda";
for (const q of all.filter(porTexto('"Atividades"'))) q.pendencia = "aguardando planilha de atividades do uso do solo (prometida para segunda)";

fs.mkdirSync("fixtures/fichas", { recursive: true });
fs.writeFileSync("fixtures/fichas/alvara.vale-verde.json", JSON.stringify(ficha, null, 2));
const resp = all.filter((q) => q.resposta !== null).length;
console.log(`ficha: ${all.length} perguntas, ${resp} respondidas, ${all.length - resp} pendentes`);
