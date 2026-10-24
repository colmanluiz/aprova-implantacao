// Adaptador de canal via Telegram (long polling, sem dependências). Prova o canal de mensageria real.
// Uso: TELEGRAM_BOT_TOKEN=... npm run telegram
// Para WhatsApp real, troque este arquivo por um adaptador Baileys/Evolution API com a mesma interface `Canal`.
//
// Mensagens do implantador (painel → data/<cidade>/<processo>/outbox.json) são entregues a cada 2 s no chat do processo.
// O vínculo chat ↔ processo fica em memória e em data/<cidade>/<processo>/canal.json, para sobreviver a reinício.
import { tratarMensagem } from "../agents/orquestrador.js";
import { store } from "../agents/store.js";
import type { Anexo } from "../agents/extrator.js";
import { processosComCanal, salvarCanal, vigiarOutbox } from "./outbox.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error("defina TELEGRAM_BOT_TOKEN"); process.exit(1); }
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE = `https://api.telegram.org/file/bot${TOKEN}`;
const ctxPadrao = { cidade: process.env.CIDADE ?? "vale-verde", processo: process.env.PROCESSO ?? "alvara", template: process.env.TEMPLATE ?? "fixtures/templates/alvara-construcao.modeload.json" };

async function tg(method: string, body: unknown, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${API}/${method}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(method === "getUpdates" ? 45_000 : 15_000),
      });
      return (await r.json()) as any;
    } catch (e) {
      if (i >= tentativas) throw e;
      console.error(`telegram ${method}: ${(e as Error).message}; tentando de novo (${i}/${tentativas})`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}
async function baixar(fileId: string): Promise<{ base64: string; path: string }> {
  const info = await tg("getFile", { file_id: fileId });
  const p = info.result.file_path as string;
  const buf = Buffer.from(await (await fetch(`${FILE}/${p}`)).arrayBuffer());
  return { base64: buf.toString("base64"), path: p };
}
async function enviarTexto(chat: number | string, texto: string) {
  const r = await tg("sendMessage", { chat_id: chat, text: texto });
  if (!r?.ok) throw new Error(`sendMessage falhou: ${r?.description ?? "sem resposta"}`);
}

// chat de cada processo (pasta), recuperado do disco e atualizado a cada mensagem recebida
const chatDoProcesso = new Map<string, number | string>();
for (const { pasta, canal } of processosComCanal("telegram")) if (canal.tipo === "telegram") chatDoProcesso.set(pasta, canal.chat_id);
const ocupados = new Set<string>();

vigiarOutbox({
  alvos: () => [...chatDoProcesso].map(([pasta, chat]) => ({ pasta, enviar: (t: string) => enviarTexto(chat, t) })),
  ocupado: (pasta) => ocupados.has(pasta),
  aoEntregar: (pasta, itens) => console.log(`implantador → ${pasta}: ${itens.length} mensagem(ns)`),
});

const IMAGEM = new Set(["image/jpeg", "image/png", "image/webp"]);

let offset = 0;
console.log("Telegram: ouvindo…");
for (;;) {
  const upd = await tg("getUpdates", { offset, timeout: 30 }).catch(() => ({ result: [] }));
  for (const u of upd.result ?? []) {
    offset = u.update_id + 1;
    const m = u.message;
    if (!m) continue;
    const chat = m.chat.id;
    const ctx = ctxPadrao;
    const pasta = store.pasta(ctx);
    if (chatDoProcesso.get(pasta) !== chat) {
      chatDoProcesso.set(pasta, chat);
      salvarCanal(pasta, { tipo: "telegram", chat_id: chat });
    }
    const canal = { enviar: (texto: string) => enviarTexto(chat, texto) };
    ocupados.add(pasta);
    try {
      let anexo: Anexo | undefined;
      if (m.photo?.length) {
        const { base64 } = await baixar(m.photo[m.photo.length - 1].file_id);
        anexo = { tipo: "imagem", media_type: "image/jpeg", base64, nome: "foto" };
      } else if (m.document?.mime_type === "application/pdf") {
        const { base64 } = await baixar(m.document.file_id);
        anexo = { tipo: "pdf", base64, nome: m.document.file_name };
      } else if (IMAGEM.has(m.document?.mime_type)) {
        // foto enviada "como arquivo" (sem compressão): comum para tabela de lei
        const { base64 } = await baixar(m.document.file_id);
        anexo = { tipo: "imagem", media_type: m.document.mime_type, base64, nome: m.document.file_name };
      } else if (m.document?.mime_type?.startsWith("text/")) {
        const { base64 } = await baixar(m.document.file_id);
        anexo = { tipo: "texto", texto: Buffer.from(base64, "base64").toString("utf8"), nome: m.document.file_name };
      }
      await tg("sendChatAction", { chat_id: chat, action: "typing" });
      await tratarMensagem(ctx, canal, { texto: m.text ?? m.caption, anexo, remetente: m.from?.first_name });
    } catch (e) {
      console.error(e);
      await canal.enviar("Tive um problema para processar. Um implantador vai olhar.").catch(() => {});
    } finally {
      ocupados.delete(pasta);
    }
  }
}
