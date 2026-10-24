// Caixa de saída do implantador: mensagens escritas no painel e entregues pelo canal (Telegram ou terminal).
//
// Contrato (data/<cidade>/<processo>/outbox.json): array de
//   { id, texto, autor: "implantador", em, enviado: false, enviado_em? }
// O painel acrescenta itens; o processo do canal entrega os pendentes, marca enviado e registra no histórico
// (estado.json) como { role: "assistant", autor: "implantador", content, em }.
//
// Canal por processo (data/<cidade>/<processo>/canal.json): { tipo: "telegram", chat_id } — para entregar
// mesmo depois de reiniciar o processo do canal.
import fs from "node:fs";
import path from "node:path";

export type ItemOutbox = {
  id: string;
  texto: string;
  autor: "implantador";
  em: string;
  enviado: boolean;
  enviado_em?: string;
};

export type InfoCanal = { tipo: "telegram"; chat_id: number | string } | { tipo: "terminal" };

export const pastaProcesso = (cidade: string, processo: string, base = "data") => path.join(base, cidade, processo);

const lerJson = <T>(p: string): T | undefined => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return undefined; }
};
const gravarJson = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
  fs.renameSync(tmp, p); // troca atômica: o painel nunca lê arquivo pela metade
};

export function lerOutbox(pasta: string): ItemOutbox[] {
  const v = lerJson<ItemOutbox[]>(path.join(pasta, "outbox.json"));
  return Array.isArray(v) ? v : [];
}

export const pendentes = (pasta: string) => lerOutbox(pasta).filter((i) => !i.enviado);

function marcarEnviado(pasta: string, id: string, quando: string) {
  // Relê antes de gravar para não perder itens que o painel acrescentou durante o envio.
  const atual = lerOutbox(pasta);
  const item = atual.find((i) => i.id === id);
  if (item) { item.enviado = true; item.enviado_em = quando; }
  gravarJson(path.join(pasta, "outbox.json"), atual);
}

function registrarNoHistorico(pasta: string, texto: string, quando: string) {
  const arq = path.join(pasta, "estado.json");
  const estado = lerJson<any>(arq) ?? {
    etapa: "nao_iniciado", historico: [], mensagens_enviadas: 0, perguntas_feitas: 0, atualizado_em: quando,
  };
  estado.historico = Array.isArray(estado.historico) ? estado.historico : [];
  estado.historico.push({ role: "assistant", autor: "implantador", content: texto, em: quando });
  estado.atualizado_em = quando;
  gravarJson(arq, estado);
}

/**
 * Entrega os itens pendentes da caixa de saída, um por vez, na ordem.
 * Se o envio falhar, para ali: o item continua pendente e será tentado na próxima volta.
 */
export async function entregarOutbox(
  pasta: string,
  enviar: (texto: string) => Promise<void>,
  agora: () => string = () => new Date().toISOString(),
): Promise<ItemOutbox[]> {
  const entregues: ItemOutbox[] = [];
  for (const item of pendentes(pasta)) {
    try {
      await enviar(item.texto);
    } catch {
      break;
    }
    const quando = agora();
    marcarEnviado(pasta, item.id, quando);
    registrarNoHistorico(pasta, item.texto, quando);
    entregues.push({ ...item, enviado: true, enviado_em: quando });
  }
  return entregues;
}

export function salvarCanal(pasta: string, info: InfoCanal) {
  gravarJson(path.join(pasta, "canal.json"), info);
}
export const lerCanal = (pasta: string) => lerJson<InfoCanal>(path.join(pasta, "canal.json"));

/** Processos (pastas) que já têm canal do tipo pedido registrado em disco. */
export function processosComCanal(tipo: InfoCanal["tipo"], base = "data"): { pasta: string; canal: InfoCanal }[] {
  const out: { pasta: string; canal: InfoCanal }[] = [];
  if (!fs.existsSync(base)) return out;
  for (const cidade of fs.readdirSync(base)) {
    const dc = path.join(base, cidade);
    if (!fs.statSync(dc).isDirectory()) continue;
    for (const processo of fs.readdirSync(dc)) {
      const pasta = path.join(dc, processo);
      const canal = lerCanal(pasta);
      if (canal?.tipo === tipo) out.push({ pasta, canal });
    }
  }
  return out;
}

/**
 * Varre a caixa de saída a cada `intervaloMs`. `alvos()` diz, a cada volta, quais pastas entregar e por onde.
 * `ocupado(pasta)` permite pular um processo enquanto o agente está respondendo nele (evita escrita cruzada no estado).
 * Devolve uma função para parar.
 */
export function vigiarOutbox(opts: {
  alvos: () => { pasta: string; enviar: (texto: string) => Promise<void> }[];
  intervaloMs?: number;
  ocupado?: (pasta: string) => boolean;
  aoEntregar?: (pasta: string, itens: ItemOutbox[]) => void;
}): () => void {
  let rodando = false;
  const volta = async () => {
    if (rodando) return;
    rodando = true;
    try {
      for (const { pasta, enviar } of opts.alvos()) {
        if (opts.ocupado?.(pasta)) continue;
        const itens = await entregarOutbox(pasta, enviar);
        if (itens.length) opts.aoEntregar?.(pasta, itens);
      }
    } catch (e) {
      console.error("outbox:", (e as Error).message);
    } finally {
      rodando = false;
    }
  };
  const t = setInterval(volta, opts.intervaloMs ?? 2000);
  return () => clearInterval(t);
}
