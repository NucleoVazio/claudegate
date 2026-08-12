// Gera, para cada instância ativa, um script `claude-<porta>` que
// exporta ANTHROPIC_BASE_URL apontando para aquela porta e então invoca o
// `claude` real. Os scripts ficam em ~/.claudegate/bin — esse diretório
// precisa estar no PATH para os atalhos funcionarem em qualquer lugar.
//
// A partir da v0.3, cada wrapper exporta os 4 slots de modelo que o
// Claude Code respeita (ANTHROPIC_MODEL + OPUS/SONNET/HAIKU),
// além de CLAUDE_CODE_EFFORT_LEVEL=max e API_TIMEOUT_MS=300000.
// Assim, dentro do Claude Code, o comando /model mostra as opções que você
// configurou no dashboard da porta — e trocar de modelo é só selecionar.
//
// No Windows não existe bash nem ~/.bashrc por padrão, e um arquivo sem
// extensão .cmd/.bat/.exe não é executado pelo cmd/PowerShell mesmo estando
// no PATH — por isso, em process.platform === "win32", geramos um wrapper
// .cmd (batch) em vez do script bash, e pulamos a edição automática de
// rc file (ver ensurePathContainsBinDir).

import { mkdir, writeFile, chmod, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BIN_DIR = path.join(os.homedir(), ".claudegate", "bin");
const IS_WINDOWS = process.platform === "win32";

/**
 * ANTHROPIC_AUTH_TOKEN precisa ter algum valor não-vazio para o Claude Code
 * aceitar a rota de bearer-token gateway, mesmo que o gateway local não
 * valide essa chave (cada instância faz sua própria autenticação contra o
 * provider real, usando a apiKey configurada no dashboard daquela porta).
 */
const LOCAL_TOKEN_PLACEHOLDER = "claudegate-local";

/**
 * Escapa aspas simples para uso dentro de single-quotes em bash.
 * Modelo "foo'bar" vira 'foo'\''bar' — forma canônica de segurar aspas em shell.
 * @param {string} str
 * @returns {string}
 */
function escapeShellSingle(str) {
  return String(str).replace(/'/g, "'\\''");
}

/**
 * Escapa valor para uso dentro de `set "VAR=valor"` em batch do Windows.
 * `%` precisa virar `%%` para não ser interpretado como expansão de
 * variável dentro do próprio .cmd. Aspas duplas são removidas — não há
 * escape confiável para elas dentro de `set "VAR=valor"`.
 * @param {string} str
 * @returns {string}
 */
function escapeBatch(str) {
  return String(str).replace(/%/g, "%%").replace(/"/g, "");
}

/**
 * @param {Array<{ port: number, provider?: any }>} instances
 */
export async function installWrappers(instances) {
  await mkdir(BIN_DIR, { recursive: true });

  let installed = 0;
  let skipped = 0;

  for (const inst of instances) {
    const { port, provider } = inst;

    if (!provider || !provider.defaultModel) {
      console.log(`  ⚠️  :${port} sem provider configurado — pulando (configure em http://127.0.0.1:${inst.dashboardPort})`);
      skipped += 1;
      continue;
    }

    const modelDefault = provider.defaultModel;
    // Slots opcionais vazios caem para o Modelo principal — assim o /model
    // do Claude Code nunca aponta para um modelo inexistente.
    const modelOpus = provider.opusModel || modelDefault;
    const modelSonnet = provider.sonnetModel || modelDefault;
    const modelHaiku = provider.haikuModel || modelDefault;
    const modelsLabel = `${modelDefault}${modelOpus !== modelDefault ? ` · opus:${modelOpus}` : ""}${modelSonnet !== modelDefault ? ` · sonnet:${modelSonnet}` : ""}${modelHaiku !== modelDefault ? ` · haiku:${modelHaiku}` : ""}`;

    if (IS_WINDOWS) {
      const scriptPath = path.join(BIN_DIR, `claude-${port}.cmd`);
      const script = `@echo off
REM Gerado automaticamente por "claudegate install". Nao edite a mao —
REM rode "claudegate install" de novo se precisar regenerar.
REM
REM Instancia :${port}  (dashboard: http://127.0.0.1:${inst.dashboardPort})
REM Provider:  ${escapeBatch(provider.label || modelDefault)}
REM Base URL:  ${escapeBatch(provider.baseUrl || "")}

set "ANTHROPIC_BASE_URL=http://127.0.0.1:${port}"
set "ANTHROPIC_AUTH_TOKEN=${LOCAL_TOKEN_PLACEHOLDER}"
set "ANTHROPIC_API_KEY="

set "ANTHROPIC_MODEL=${escapeBatch(modelDefault)}"
set "ANTHROPIC_DEFAULT_OPUS_MODEL=${escapeBatch(modelOpus)}"
set "ANTHROPIC_DEFAULT_SONNET_MODEL=${escapeBatch(modelSonnet)}"
set "ANTHROPIC_DEFAULT_HAIKU_MODEL=${escapeBatch(modelHaiku)}"

set "CLAUDE_CODE_EFFORT_LEVEL=max"
set "API_TIMEOUT_MS=300000"

claude %*
`;
      await writeFile(scriptPath, script, "utf8");
      console.log(`  ✅ ${scriptPath}  (modelos: ${modelsLabel})`);
      installed += 1;
      continue;
    }

    const scriptPath = path.join(BIN_DIR, `claude-${port}`);
    const script = `#!/usr/bin/env bash
# Gerado automaticamente por "claudegate install". Não edite à mão —
# rode "claudegate install" de novo se precisar regenerar.
#
# Instância :${port}  (dashboard: http://127.0.0.1:${inst.dashboardPort})
# Provider:  ${escapeShellSingle(provider.label || modelDefault)}
# Base URL:  ${escapeShellSingle(provider.baseUrl || "")}

export ANTHROPIC_BASE_URL="http://127.0.0.1:${port}"
export ANTHROPIC_AUTH_TOKEN="${LOCAL_TOKEN_PLACEHOLDER}"
export ANTHROPIC_API_KEY=""

# 4 slots de modelo expostos no /model do Claude Code:
export ANTHROPIC_MODEL='${escapeShellSingle(modelDefault)}'
export ANTHROPIC_DEFAULT_OPUS_MODEL='${escapeShellSingle(modelOpus)}'
export ANTHROPIC_DEFAULT_SONNET_MODEL='${escapeShellSingle(modelSonnet)}'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='${escapeShellSingle(modelHaiku)}'

# Configurações recomendadas (igual ao seu .claude/config.json de referência):
export CLAUDE_CODE_EFFORT_LEVEL="max"
export API_TIMEOUT_MS="300000"

exec claude "$@"
`;
    await writeFile(scriptPath, script, "utf8");
    await chmod(scriptPath, 0o755);
    console.log(`  ✅ ${scriptPath}  (modelos: ${modelsLabel})`);
    installed += 1;
  }

  console.log(`\n${installed} atalho(s) gerado(s) em ${BIN_DIR}` + (skipped > 0 ? ` · ${skipped} pulado(s) por falta de provider` : ""));
  if (installed === 0) return;

  const pathUpdated = await ensurePathContainsBinDir();

  if (pathUpdated) {
    console.log(`\n⚠️  Adicionei ${BIN_DIR} ao seu PATH. Abra um novo terminal (ou rode "source" no seu rc file) para os comandos claude-<porta> ficarem disponíveis.`);
  } else if (!isInCurrentPath()) {
    if (IS_WINDOWS) {
      console.log(`\n⚠️  ${BIN_DIR} não está no seu PATH. Adicione manualmente:
   1. Pesquise por "Variáveis de Ambiente" no menu Iniciar do Windows
   2. Em "Variáveis de usuário", edite a variável PATH e adicione uma nova entrada:
      ${BIN_DIR}
   3. Abra um novo terminal (cmd, PowerShell ou Windows Terminal) para os comandos claude-<porta> ficarem disponíveis.
   (Não editamos o PATH do Windows automaticamente para evitar corromper variáveis longas via "setx".)`);
    } else {
      console.log(`\n⚠️  ${BIN_DIR} não está no seu PATH. Adicione manualmente:\n   export PATH="${BIN_DIR}:$PATH"`);
    }
  }

  const firstInstalled = instances.find((i) => i.provider?.defaultModel);
  if (firstInstalled) {
    console.log(`\nUso: claude-${firstInstalled.port}   (roda o Claude Code apontando para essa porta — /model vai mostrar até 4 opções)`);
  }
}

function isInCurrentPath() {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  return pathEntries.includes(BIN_DIR);
}

/**
 * Adiciona BIN_DIR ao PATH via shell rc file (~/.bashrc ou ~/.zshrc),
 * caso ainda não esteja presente. Não falha o comando inteiro se não
 * conseguir — só avisa o usuário para fazer manualmente.
 *
 * No Windows não fazemos essa edição automática: não há rc file
 * equivalente, e alterar o PATH do usuário via "setx" corre o risco de
 * truncar a variável (limite de ~1024 caracteres do setx.exe) e corromper
 * o PATH existente. Nesse caso instruímos o usuário a adicionar manualmente
 * (ver mensagem em installWrappers).
 *
 * @returns {Promise<boolean>} true se modificou algum rc file agora
 */
async function ensurePathContainsBinDir() {
  if (isInCurrentPath()) return false;
  if (IS_WINDOWS) return false;

  const shell = process.env.SHELL ?? "";
  const rcFile = shell.includes("zsh")
    ? path.join(os.homedir(), ".zshrc")
    : path.join(os.homedir(), ".bashrc");

  const exportLine = `export PATH="${BIN_DIR}:$PATH"`;
  const marker = "# claudegate";

  try {
    let alreadyPresent = false;
    if (existsSync(rcFile)) {
      const content = await readFile(rcFile, "utf8");
      alreadyPresent = content.includes(BIN_DIR);
    }
    if (!alreadyPresent) {
      await appendFile(rcFile, `\n${marker}\n${exportLine}\n`, "utf8");
      return true;
    }
    return false;
  } catch {
    // Não foi possível escrever no rc file (permissões, shell desconhecido, etc).
    // O usuário recebe a instrução manual via isInCurrentPath() no chamador.
    return false;
  }
}
