// Servidor do painel do implantador: node:http puro, sem cache, lê data/ a cada requisição.
// npm run painel  →  http://localhost:4310
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { montarVisao, montarDetalhe, slugValido, lerJson, anexarOutbox, type Opcoes } from "./visao.js";

export type ConfigServidor = { root: string; seedPath?: string; dataDir?: string; painelDir?: string };

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8",
};

function json(res: http.ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req: http.IncomingMessage, limite = 64 * 1024): Promise<string> {
  return new Promise((ok, falha) => {
    let s = "";
    req.on("data", (d) => { s += d; if (s.length > limite) { falha(new Error("corpo grande demais")); req.destroy(); } });
    req.on("end", () => ok(s));
    req.on("error", falha);
  });
}

/**
 * CLI do pipeline que executa ações humanas (gate, assumir, devolver):
 *   npm run <script> -- <cidade> <slug> <acao> [texto]
 * O primeiro nome que existir em package.json é usado (o pipeline pode renomear `gate` para `acao`).
 */
export const CLI_ACOES = ["gate", "acao"] as const;

export function scriptCli(root: string): string | undefined {
  const pkg = lerJson<{ scripts?: Record<string, string> }>(path.join(root, "package.json"));
  return CLI_ACOES.find((n) => !!pkg?.scripts?.[n]);
}
export const gateDisponivel = (root: string) => !!scriptCli(root);

type Resposta = { status: number; corpo: Record<string, unknown> };

function rodarCli(root: string, args: string[]): Promise<Resposta> {
  const script = scriptCli(root);
  const cmd = `npm run ${CLI_ACOES.join("|")} -- ${args.join(" ")}`;
  if (!script) return Promise.resolve({ status: 501, corpo: { erro: `O comando \`${cmd}\` ainda não existe neste checkout (o pipeline está sendo construído). Faça pelo terminal.` } });
  return new Promise((ok) => {
    execFile("npm", ["run", "--silent", script, "--", ...args], { cwd: root, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return ok({ status: 200, corpo: { ok: true, saida: stdout, stderr } });
      const naoIniciou = (err as NodeJS.ErrnoException).code === "ENOENT" || /missing script/i.test(String(stderr));
      ok({ status: naoIniciou ? 501 : 500, corpo: { ok: false, erro: naoIniciou ? `Não foi possível iniciar \`npm run ${script}\`: ${err.message}` : err.message, saida: stdout, stderr } });
    });
  });
}

export function criarServidor(cfg: ConfigServidor) {
  const root = path.resolve(cfg.root);
  const painelDir = path.resolve(cfg.painelDir ?? path.join(root, "painel"));
  const opcoes = (): Opcoes => ({
    seedPath: cfg.seedPath ?? path.join(root, "fixtures", "seed", "processos.json"),
    dataDir: cfg.dataDir ?? path.join(root, "data"),
    gateDisponivel: gateDisponivel(root),
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const partes = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (req.method === "GET" && url.pathname === "/api/visao") return json(res, 200, montarVisao(opcoes()));

      if (req.method === "GET" && partes[0] === "api" && partes[1] === "processo" && partes.length === 4) {
        const d = montarDetalhe(opcoes(), partes[2], partes[3]);
        return d ? json(res, 200, d) : json(res, 404, { erro: `Sem dados em data/${partes[2]}/${partes[3]}` });
      }

      if (req.method === "POST" && partes[0] === "api" && partes[1] === "gate" && partes.length === 4) {
        const [, , cidade, slug] = partes;
        if (!slugValido(cidade) || !slugValido(slug)) return json(res, 400, { erro: "cidade ou processo inválido" });
        let corpo: { acao?: unknown; texto?: unknown };
        try { corpo = JSON.parse((await lerCorpo(req)) || "{}"); } catch { return json(res, 400, { erro: "JSON inválido" }); }
        const acao = typeof corpo.acao === "string" ? corpo.acao : "";
        if (!/^[a-z_]{2,30}$/.test(acao)) return json(res, 400, { erro: "acao inválida" });
        const texto = typeof corpo.texto === "string" ? corpo.texto.slice(0, 4000) : "";
        const r = await rodarCli(root, [cidade, slug, acao, ...(texto.trim() ? [texto] : [])]);
        return json(res, r.status, r.corpo);
      }

      if (req.method === "POST" && partes[0] === "api" && partes[1] === "conversa" && partes.length === 5) {
        const [, , cidade, slug, op] = partes;
        if (!slugValido(cidade) || !slugValido(slug)) return json(res, 400, { erro: "cidade ou processo inválido" });
        let corpo: { modo?: unknown; texto?: unknown };
        try { corpo = JSON.parse((await lerCorpo(req)) || "{}"); } catch { return json(res, 400, { erro: "JSON inválido" }); }
        if (op === "modo") {
          if (corpo.modo !== "humano" && corpo.modo !== "agente") return json(res, 400, { erro: "modo deve ser humano ou agente" });
          const r = await rodarCli(root, [cidade, slug, corpo.modo === "humano" ? "assumir" : "devolver"]);
          return json(res, r.status, r.corpo);
        }
        if (op === "enviar") {
          const texto = typeof corpo.texto === "string" ? corpo.texto.trim().slice(0, 4000) : "";
          if (!texto) return json(res, 400, { erro: "texto vazio" });
          const item = anexarOutbox(path.join(opcoes().dataDir, cidade, slug), texto, randomUUID());
          return json(res, 200, { ok: true, item });
        }
        return json(res, 404, { erro: "operação desconhecida" });
      }

      if (req.method === "GET" || req.method === "HEAD") {
        const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
        const alvo = path.resolve(painelDir, decodeURIComponent(rel));
        if (!alvo.startsWith(painelDir + path.sep)) return json(res, 403, { erro: "fora do painel" });
        fs.readFile(alvo, (err, buf) => {
          if (err) return json(res, 404, { erro: "não encontrado" });
          res.writeHead(200, { "content-type": TIPOS[path.extname(alvo)] ?? "application/octet-stream", "cache-control": "no-store" });
          res.end(req.method === "HEAD" ? undefined : buf);
        });
        return;
      }
      json(res, 405, { erro: "método não suportado" });
    } catch (e) {
      json(res, 500, { erro: (e as Error).message });
    }
  });
}

const principal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (principal) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const porta = Number(process.env.PAINEL_PORT ?? 4310);
  criarServidor({ root }).listen(porta, () => {
    console.log(`Painel do implantador: http://localhost:${porta}`);
    console.log(`  dados: ${path.join(root, "data")}  (lidos a cada requisição)`);
    console.log(`  gate:  ${gateDisponivel(root) ? "npm run gate disponível" : "npm run gate ainda não existe (botões desabilitados)"}`);
  });
}
