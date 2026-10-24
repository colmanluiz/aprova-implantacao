// PDF de texto mínimo (A4, Helvetica, WinAnsi), sem dependências. Serve para a prévia do modelo no chat.

export type LinhaPdf = { texto: string; estilo?: "titulo" | "subtitulo" | "normal" | "nota"; recuo?: number };

const A4 = { w: 595, h: 842 };
const MARGEM = 50;
const ESTILOS = {
  titulo: { fonte: "F2", tam: 16, antes: 6, depois: 10 },
  subtitulo: { fonte: "F2", tam: 12, antes: 12, depois: 4 },
  normal: { fonte: "F1", tam: 10, antes: 0, depois: 3 },
  nota: { fonte: "F1", tam: 9, antes: 0, depois: 3 },
} as const;

/** Quebra por largura aproximada (Helvetica ≈ 0,5 em por caractere). */
function quebrar(texto: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const par of texto.split("\n")) {
    let linha = "";
    for (const p of par.split(/\s+/)) {
      if (!p) continue;
      if ((linha + " " + p).trim().length > maxChars && linha) { out.push(linha); linha = p; }
      else linha = (linha ? linha + " " : "") + p;
    }
    out.push(linha);
  }
  return out;
}

/** Texto em WinAnsi: o que não existe em Latin-1 vira equivalente simples. */
function winAnsi(s: string): string {
  const t = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/→/g, "->");
  return [...t].map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : "?")).join("").replace(/[\\()]/g, (m) => `\\${m}`);
}

export function gerarPdf(linhas: LinhaPdf[]): Buffer {
  const paginas: string[] = [];
  let ops: string[] = [];
  let y = A4.h - MARGEM;
  const novaPagina = () => { if (ops.length) paginas.push(ops.join("\n")); ops = []; y = A4.h - MARGEM; };

  for (const l of linhas) {
    const e = ESTILOS[l.estilo ?? "normal"];
    const recuo = (l.recuo ?? 0) * 14;
    const largura = A4.w - 2 * MARGEM - recuo;
    const maxChars = Math.floor(largura / (e.tam * 0.5));
    y -= e.antes;
    for (const trecho of quebrar(l.texto, maxChars)) {
      if (y - e.tam < MARGEM) novaPagina();
      y -= e.tam;
      ops.push(`BT /${e.fonte} ${e.tam} Tf ${MARGEM + recuo} ${y.toFixed(1)} Td (${winAnsi(trecho)}) Tj ET`);
      y -= 2;
    }
    y -= e.depois;
  }
  novaPagina();

  // Objetos: 1 catálogo, 2 páginas, 3-4 fontes, depois (página, conteúdo) por página.
  const objs: string[] = [];
  const kids = paginas.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  paginas.forEach((conteudo, i) => {
    const pag = 5 + i * 2;
    objs[pag] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pag + 1} 0 R >>`;
    objs[pag + 1] = `<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
