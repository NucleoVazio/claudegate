#!/usr/bin/env node
// CLI do claudegate. Comandos:
//   claudegate           -> sobe o processo master (porta 4419) em background
//   claudegate new       -> pede ao master (já rodando) para criar uma nova instância
//   claudegate status    -> lista instâncias ativas
//   claudegate install   -> gera os wrappers de terminal claude-<porta> para instâncias ativas
//   claudegate stop      -> para o processo master rodando em background
//   claudegate help      -> mostra a ajuda

import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { installWrappers } from "./install.js";
import { MASTER_PORT } from "./registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_SCRIPT = path.join(__dirname, "master.js");
const MASTER_URL = "http://127.0.0.1:4419";
const PID_FILE = path.join(__dirname, "..", ".claudegate-master.pid");

const [, , command] = process.argv;

/**
 * Abre a URL do dashboard no navegador padrão do sistema, sem dependências
 * externas (usa o comando nativo de cada plataforma). Falha silenciosamente
 * se não conseguir — não deve travar o comando `claudegate`.
 * @param {string} url
 */
function openBrowser(url) {
  let cmd;
  let args;
  if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // não é crítico: o usuário ainda pode abrir a URL manualmente
  }
}

async function masterRequest(method, urlPath) {
  try {
    const res = await fetch(`${MASTER_URL}${urlPath}`, { method });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/**
 * Sobe o master em background (detached). O processo filho herda stdio
 * para logs, mas o processo pai pode encerrar normalmente — o master
 * continua rodando independentemente.
 */
async function cmdGateway() {
  // Verifica se já existe um master rodando
  const existing = await isMasterRunning();
  if (existing) {
    console.log(`🚪 claudegate master já está rodando em http://127.0.0.1:${MASTER_PORT}`);
    console.log(`   Acesse o dashboard: http://127.0.0.1:${MASTER_PORT}`);
    openBrowser(`http://127.0.0.1:${MASTER_PORT}`);
    return;
  }

  const child = spawn(process.execPath, [MASTER_SCRIPT], {
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      CLAUDEGATE_MASTER: "1",
    },
  });

  // Desanexa o processo filho para que ele rode independentemente
  child.unref();

  // Salva o PID para poder parar depois
  const { writeFile } = await import("node:fs/promises");
  await writeFile(PID_FILE, String(child.pid), "utf8");

  console.log(`🚪 claudegate master iniciado em background (PID ${child.pid})`);
  console.log(`   Dashboard: http://127.0.0.1:${MASTER_PORT}`);
  console.log(`   Para parar: claudegate stop`);

  // Espera um momento para verificar se o processo subiu corretamente
  await new Promise((r) => setTimeout(r, 1000));
  const running = await isMasterRunning();
  if (running) {
    console.log(`   ✅ Master ativo e respondendo`);
    openBrowser(`http://127.0.0.1:${MASTER_PORT}`);
  } else {
    console.log(`   ⚠️  Master pode ter falhado ao iniciar. Verifique com: claudegate status`);
  }
}

/**
 * Para o processo master rodando em background.
 */
async function cmdStop() {
  const { readFile, unlink } = await import("node:fs/promises");

  let pid;
  try {
    pid = Number(await readFile(PID_FILE, "utf8"));
  } catch {
    // Tenta encontrar pelo PID da porta
    console.log(`Arquivo PID não encontrado. Tentando parar via HTTP...`);
    const result = await masterRequest("GET", "/");
    if (result.ok) {
      console.log(`O master ainda está respondendo em http://127.0.0.1:${MASTER_PORT}`);
      console.log(`Tente encontrar o processo manualmente: lsof -i :${MASTER_PORT}`);
    } else {
      console.log(`Nenhum master encontrado rodando em http://127.0.0.1:${MASTER_PORT}`);
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`🛑 Master (PID ${pid}) encerrado`);
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log(`Processo ${pid} não encontrado (já encerrou)`);
    } else {
      console.log(`Erro ao encerrar: ${err.message}`);
    }
  }

  try {
    await unlink(PID_FILE);
  } catch {
    // ignora
  }
}

/**
 * Verifica se o master está rodando e respondendo.
 */
async function isMasterRunning() {
  try {
    const res = await fetch(`${MASTER_URL}/`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function cmdNew() {
  const result = await masterRequest("POST", "/instances/new");
  if (!result.ok) {
    console.error("Não foi possível criar a instância. O master está rodando? (claudegate)");
    if (result.error) console.error(`  detalhe: ${result.error}`);
    process.exit(1);
  }
  const { port, dashboardPort } = result.body;
  console.log(`✅ nova instância criada`);
  console.log(`   gateway:   http://127.0.0.1:${port}`);
  console.log(`   dashboard: http://127.0.0.1:${dashboardPort}  (configure o provider aqui)`);
  console.log(`   uso universal: OPENAI_API_KEY="gateway" OPENAI_BASE_URL="http://127.0.0.1:${port}/v1"`);
}

async function cmdStatus() {
  const result = await masterRequest("GET", "/instances");
  if (!result.ok) {
    console.error("Master não está respondendo em http://127.0.0.1:4419. Rode: claudegate");
    process.exit(1);
  }
  const { instances } = result.body;
  if (instances.length === 0) {
    console.log("Nenhuma instância ativa.");
    return;
  }
  console.log(`${instances.length} instância(s) ativa(s):\n`);
  for (const inst of instances.sort((a, b) => a.port - b.port)) {
    console.log(`  :${inst.port}  (dashboard :${inst.dashboardPort}, pid ${inst.pid})`);
  }
}

async function cmdInstall() {
  const result = await masterRequest("GET", "/instances");
  if (!result.ok) {
    console.error("Master não está respondendo em http://127.0.0.1:4419. Rode: claudegate");
    process.exit(1);
  }
  const { instances } = result.body;
  if (instances.length === 0) {
    console.log("Nenhuma instância ativa para instalar. Crie uma com: claudegate new");
    return;
  }

  // Enriquece cada instância com o state do seu próprio dashboard (porta par),
  // para que installWrappers tenha acesso ao provider configurado (baseUrl,
  // apiKey, defaultModel e os 3 slots opcionais). Sem isso, o wrapper não
  // saberia quais modelos exportar.
  const enriched = await Promise.all(
    instances.map(async (inst) => {
      try {
        const res = await fetch(`http://127.0.0.1:${inst.dashboardPort}/api/state`);
        if (!res.ok) return { ...inst, provider: null };
        const state = await res.json();
        return { ...inst, provider: state.provider };
      } catch {
        return { ...inst, provider: null };
      }
    }),
  );

  await installWrappers(enriched);
}

function printHelp() {
  console.log(`claudegate — gateway local multi-porta para Claude Code e uso universal

Uso:
  claudegate             Sobe o processo master (porta 4419) em background
  claudegate new         Cria uma nova instância (porta livre seguinte)
  claudegate status      Lista as instâncias ativas
  claudegate install     Gera os atalhos de terminal claude-<porta> com os 4 slots de modelo
  claudegate stop        Para o processo master rodando em background
  claudegate help        Mostra esta ajuda

Depois de subir o master, acesse http://127.0.0.1:4419 no navegador.
Cada instância tem seu próprio dashboard (porta par) onde você configura
provider + até 4 modelos — esses modelos viram opções no /model do Claude Code.

Uso universal (OpenAI-compatible):
  OPENAI_API_KEY="gateway" OPENAI_BASE_URL="http://127.0.0.1:PORTA/v1" OPENAI_MODEL="modelo"
  A senha "gateway" autentica no proxy local.`);
}

switch (command) {
  case undefined:
  case "gateway": // alias retrocompatível
    await cmdGateway();
    break;
  case "new":
    await cmdNew();
    break;
  case "status":
    await cmdStatus();
    break;
  case "install":
    await cmdInstall();
    break;
  case "stop":
    await cmdStop();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    printHelp();
    process.exit(1);
}
