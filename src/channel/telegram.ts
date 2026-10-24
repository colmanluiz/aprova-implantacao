// Adaptador de canal via Telegram (long polling, sem dependências). Prova o canal de mensageria real.
// Uso: TELEGRAM_BOT_TOKEN=... npx tsx src/channel/telegram.ts
// Para WhatsApp real, troque este arquivo por um adaptador Baileys/Evolution API com a mesma interface `Canal`.
import { tratarMensagem } from "../agents/orquestrador.js";
import type { Anexo } from "../agents/extrator.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error("defina TELEGRAM_BOT_TOKEN"); process.exit(1); }
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE = `https://api.telegram.org/file/bot${TOKEN}`;
const ctxPadrao = { cidade: process.env.CIDADE ?? "vale-verde", processo: process.env.PROCESSO ?? "alvara", template: process.env.TEMPLATE ?? "fixtures/templates/alvara-construcao.modeload.json" };

async function tg(method: string, body: unknown) {
  const r = await fetch(`${API}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json() as Promise<any>;
}
async function baixar(fileId: string): Promise<{ base64: string; path: string }> {
  const info = await tg("getFile", { file_id: fileId });
  const p = info.result.file_path as string;
  const buf = Buffer.from(await (await fetch(`${FILE}/${p}`)).arrayBuffer());
  return { base64: buf.toString("base64"), path: p };
}

let offset = 0;
console.log("Telegram: ouvindo…");
for (;;) {
  const upd = await tg("getUpdates", { offset, timeout: 30 });
  for (const u of upd.result ?? []) {
    offset = u.update_id + 1;
    const m = u.message;
    if (!m) continue;
    const chat = m.chat.id;
    const canal = { enviar: async (texto: string) => { await tg("sendMessage", { chat_id: chat, text: texto }); } };
    let anexo: Anexo | undefined;
    if (m.photo?.length) {
      const { base64 } = await baixar(m.photo[m.photo.length - 1].file_id);
      anexo = { tipo: "imagem", media_type: "image/jpeg", base64, nome: "foto" };
    } else if (m.document?.mime_type === "application/pdf") {
      const { base64 } = await baixar(m.document.file_id);
      anexo = { tipo: "pdf", base64, nome: m.document.file_name };
    }
    try {
      await tg("sendChatAction", { chat_id: chat, action: "typing" });
      await tratarMensagem(ctxPadrao, canal, { texto: m.text ?? m.caption, anexo, remetente: m.from?.first_name });
    } catch (e) {
      console.error(e);
      await canal.enviar("Tive um problema para processar. Um implantador vai olhar.");
    }
  }
}
