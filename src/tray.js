// Ícone na bandeja do sistema (system tray) para o processo master.
// Mostra o mascote do claudegate na barra de tarefas com duas opções:
//   1. Abrir Dashboard -> abre http://127.0.0.1:<MASTER_PORT> no navegador padrão
//   2. Sair             -> encerra o master (equivalente a `claudegate stop`)
//
// Usa o pacote systray2, que já traz binários pré-compilados para
// Windows/macOS/Linux — não precisa de Electron nem de compilação nativa.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import systray2Pkg from "systray2";

// systray2 é um pacote CJS; com o interop do Node a classe acaba um nível
// abaixo do default importado (pkg.default), em vez do próprio pkg.
const SysTray = systray2Pkg.default ?? systray2Pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assets");

/**
 * Abre uma URL no navegador padrão do sistema, sem dependências externas.
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

/**
 * O systray2 tenta marcar seu binário interno (traybin/tray_<platform>_release)
 * como executável usando um modo simbólico ('+x') que o fs.chmod nativo do
 * Node não entende — em alguns ambientes (ex.: node_modules extraído sem o
 * bit de execução preservado) isso falha silenciosamente e o binário nunca
 * roda. Aqui garantimos o bit de execução (0o755) antes de subir a bandeja,
 * em Linux/macOS (no Windows não é necessário).
 */
function ensureTrayBinaryIsExecutable() {
  if (process.platform === "win32") return;
  try {
    const traybinDir = path.join(path.dirname(fileURLToPath(import.meta.resolve("systray2"))), "traybin");
    const binName = process.platform === "darwin" ? "tray_darwin_release" : "tray_linux_release";
    fs.chmodSync(path.join(traybinDir, binName), 0o755);
  } catch {
    // se não conseguirmos, o próprio systray2 ainda tenta por conta própria
  }
}

/**
 * Sobe o ícone na bandeja do sistema.
 * @param {object} opts
 * @param {string} opts.dashboardUrl URL do dashboard a abrir (ex.: http://127.0.0.1:4419)
 * @param {() => void} opts.onExit callback chamado quando o usuário clica em "Sair"
 */
export function startTray({ dashboardUrl, onExit }) {
  ensureTrayBinaryIsExecutable();

  const icon = path.join(ASSETS_DIR, os.platform() === "win32" ? "icon.ico" : "icon.png");

  const itemOpen = {
    title: "Abrir Dashboard",
    tooltip: "Abrir o dashboard do claudegate no navegador",
    checked: false,
    enabled: true,
  };

  const itemExit = {
    title: "Sair",
    tooltip: "Encerrar o claudegate (claudegate stop)",
    checked: false,
    enabled: true,
  };

  const systray = new SysTray({
    menu: {
      icon,
      isTemplateIcon: process.platform === "darwin",
      title: "claudegate",
      tooltip: "claudegate",
      items: [itemOpen, itemExit],
    },
    debug: false,
    copyDir: false,
  });

  systray.onClick((action) => {
    if (action.item.title === itemOpen.title) {
      openBrowser(dashboardUrl);
    } else if (action.item.title === itemExit.title) {
      // Encerra apenas o binário da bandeja (mantém o processo node vivo
      // até o callback de saída terminar de encerrar tudo direito).
      systray.kill(false);
      onExit();
    }
  });

  systray.ready().catch((err) => {
    console.log(`[tray] não foi possível iniciar o ícone da bandeja: ${err.message}`);
  });

  return systray;
}
