// Processo master. Sobe na porta 4419 (fixa). Responsabilidades:
//   - servir o dashboard-mãe (lista todas as instâncias ativas)
//   - expor API local para criar/listar/derrubar instâncias
//   - subir/derrubar os processos filhos (instance.js) que implementam cada porta
//   - endpoint /install para gerar atalhos diretamente pelo dashboard
//
// Tudo em memória — nenhuma instância sobrevive a um restart do master (decisão
// explícita: simplicidade em vez de persistência em disco, nesta fase).

import http from "node:http";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  nextFreePort,
  registerInstance,
  unregisterInstance,
  listInstances,
  getInstance,
  MASTER_PORT,
} from "./registry.js";
import { renderMasterHtml } from "./master-html.js";
import { renderGetApiHtml } from "./get-api-html.js";
import { installWrappers } from "./install.js";
import { startTray } from "./tray.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSTANCE_SCRIPT = path.join(__dirname, "instance.js");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Sobe um novo par de processos (gateway ímpar + dashboard par) para uma
 * instância e a registra no registry em memória.
 * @returns {{ port: number, dashboardPort: number }}
 */
function spawnInstance() {
  const port = nextFreePort();
  const dashboardPort = port + 1;

  const child = fork(INSTANCE_SCRIPT, [], {
    env: {
      ...process.env,
      CLAUDEGATE_PORT: String(port),
      CLAUDEGATE_DASHBOARD_PORT: String(dashboardPort),
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  child.on("exit", (code) => {
    console.log(`[master] instância :${port} encerrou (code ${code})`);
    unregisterInstance(port);
  });

  registerInstance(port, child, dashboardPort);
  console.log(`[master] nova instância: gateway :${port} · dashboard :${dashboardPort}`);

  return { port, dashboardPort };
}

/**
 * @param {number} port
 * @returns {boolean} true se encontrou e derrubou a instância
 */
function killInstance(port) {
  const info = getInstance(port);
  if (!info) return false;
  info.child.kill("SIGTERM");
  unregisterInstance(port);
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "")) {
    const html = renderMasterHtml(listInstances());
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && (req.url === "/get-api" || req.url?.startsWith("/get-api?"))) {
    const html = renderGetApiHtml({ backUrl: "/" });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && req.url === "/instances") {
    return sendJson(res, 200, { instances: listInstances() });
  }

  if (req.method === "POST" && req.url === "/instances/new") {
    const created = spawnInstance();
    return sendJson(res, 201, { ok: true, ...created });
  }

  if (req.method === "DELETE" && req.url?.startsWith("/instances/")) {
    const portStr = req.url.split("/").pop();
    const port = Number(portStr);
    if (!port) return sendJson(res, 400, { ok: false, error: "porta inválida" });
    const killed = killInstance(port);
    return sendJson(res, killed ? 200 : 404, { ok: killed });
  }

  // Endpoint para ativar (install) diretamente pelo dashboard, sem abrir terminal.
  if (req.method === "POST" && req.url === "/install") {
    try {
      const instances = listInstances();

      // Enriquece cada instância com o state do seu próprio dashboard (porta par),
      // para que installWrappers tenha acesso ao provider configurado.
      const enriched = await Promise.all(
        instances.map(async (inst) => {
          try {
            const res2 = await fetch(`http://127.0.0.1:${inst.dashboardPort}/api/state`);
            if (!res2.ok) return { ...inst, provider: null };
            const state = await res2.json();
            return { ...inst, provider: state.provider };
          } catch {
            return { ...inst, provider: null };
          }
        }),
      );

      // Capturar stdout do install para retornar ao dashboard
      const originalLog = console.log;
      let output = "";
      console.log = (...args) => {
        output += args.join(" ") + "\n";
        originalLog(...args);
      };

      try {
        await installWrappers(enriched);
      } finally {
        console.log = originalLog;
      }

      return sendJson(res, 200, { ok: true, output: output.trim() });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(MASTER_PORT, "127.0.0.1", () => {
  console.log(`🚪 claudegate master em http://127.0.0.1:${MASTER_PORT}`);
  console.log(`   Crie uma instância: claudegate new`);
  console.log(`   Ou acesse o dashboard: http://127.0.0.1:${MASTER_PORT}`);
  console.log(`   Pressione Ctrl+C para encerrar tudo.`);

  startTray({
    dashboardUrl: `http://127.0.0.1:${MASTER_PORT}`,
    // "Sair" na bandeja == claudegate stop: dispara o mesmo fluxo do SIGTERM,
    // que já derruba todas as instâncias e encerra o processo master.
    onExit: () => process.kill(process.pid, "SIGTERM"),
  });
});

function shutdownAll() {
  for (const { port } of listInstances()) {
    killInstance(port);
  }
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdownAll);
process.on("SIGTERM", shutdownAll);
