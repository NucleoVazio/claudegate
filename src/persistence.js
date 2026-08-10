// Persistência em disco, opt-in, para duas coisas pedidas pelo usuário:
//   1) a configuração de provider de cada porta (para não precisar reconfigurar
//      toda vez que uma instância nasce na mesma porta)
//   2) o "cofre de chaves API" — pares baseUrl + apiKey salvos manualmente,
//      reaproveitáveis em qualquer instância
//
// Guardado em ~/.claudegate/ (fora da pasta do pacote), em dois arquivos JSON
// simples: providers.json e vault.json. Sem banco de dados, sem dependências.
//
// Isso é uma extensão ao comportamento original do claudegate (que não
// persistia nada — ver README). O restante do funcionamento (processos em
// memória, instâncias não sobrevivendo a restart do master, etc.) continua
// exatamente como era.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".claudegate");
const PROVIDERS_FILE = path.join(DATA_DIR, "providers.json");
const VAULT_FILE = path.join(DATA_DIR, "vault.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Configuração de provider persistida por porta.
// ---------------------------------------------------------------------------

/**
 * @param {number} port
 * @returns {object|null}
 */
export function loadProviderForPort(port) {
  const all = readJsonSafe(PROVIDERS_FILE, {});
  return all[String(port)] || null;
}

/**
 * @param {number} port
 * @param {object} provider
 */
export function saveProviderForPort(port, provider) {
  const all = readJsonSafe(PROVIDERS_FILE, {});
  all[String(port)] = provider;
  writeJson(PROVIDERS_FILE, all);
}

/**
 * @param {number} port
 */
export function clearProviderForPort(port) {
  const all = readJsonSafe(PROVIDERS_FILE, {});
  delete all[String(port)];
  writeJson(PROVIDERS_FILE, all);
}

// ---------------------------------------------------------------------------
// Cofre de chaves API — lista de credenciais (label + baseUrl + apiKey)
// salvas manualmente pelo usuário. Naturalmente "separadas" por baseUrl: cada
// URL diferente representa um provider/empresa diferente.
// ---------------------------------------------------------------------------

/**
 * @returns {Array<{id: string, label: string, baseUrl: string, apiKey: string, createdAt: number}>}
 */
export function listVaultEntries() {
  const entries = readJsonSafe(VAULT_FILE, []);
  return Array.isArray(entries) ? entries : [];
}

/**
 * @param {{label?: string, baseUrl: string, apiKey: string}} data
 */
export function addVaultEntry({ label, baseUrl, apiKey }) {
  const cleanBaseUrl = String(baseUrl || "").trim();
  const cleanApiKey = String(apiKey || "").trim();
  if (!cleanBaseUrl || !cleanApiKey) {
    throw new Error("baseUrl e apiKey são obrigatórios");
  }
  const entries = listVaultEntries();
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    label: String(label || "").trim() || cleanBaseUrl,
    baseUrl: cleanBaseUrl,
    apiKey: cleanApiKey,
    createdAt: Date.now(),
  };
  entries.push(entry);
  writeJson(VAULT_FILE, entries);
  return entry;
}

/**
 * @param {string} id
 */
export function getVaultEntry(id) {
  return listVaultEntries().find((e) => e.id === id) || null;
}

/**
 * @param {string} id
 */
export function removeVaultEntry(id) {
  const entries = listVaultEntries().filter((e) => e.id !== id);
  writeJson(VAULT_FILE, entries);
}
