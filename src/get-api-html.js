// Gera o HTML da interface "Pegar API": um diretório interativo das
// principais empresas/plataformas que oferecem chaves de API de IA.
// Cada card leva direto para a página oficial onde a chave é gerada
// (ou para a página de download, no caso de ferramentas locais tipo
// roteador/gateway). O ícone de cada card é o favicon oficial do
// próprio site do provedor, carregado dinamicamente via serviço de
// favicons do Google (não embutimos nem redistribuímos nenhum
// logotipo — apenas apontamos para o ícone que a própria empresa
// publica em seu domínio). Se o favicon não carregar por qualquer
// motivo, o card cai automaticamente para um monograma SVG gerado
// nas cores de marca, como estilizado antes.
//
// Para cada provedor listamos o(s) Base URL(s) reais usados por
// clientes OpenAI-compatible (e, quando existir, o endpoint
// Anthropic-compatible), já que é isso que se cola no campo
// "Base URL" do dashboard de cada instância do claudegate.

import { MASCOT_DATA_URI } from "./mascot-data.js";

/**
 * Gera um monograma SVG simples (iniciais sobre fundo colorido) e
 * devolve como data URI em base64 — usado como "ícone" de cada
 * provider sem depender de artes de terceiros.
 * @param {string} letters
 * @param {string} bg
 * @param {string} fg
 */
function monogramDataUri(letters, bg, fg = "#ffffff") {
  const safe = String(letters).slice(0, 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#g)"/>
  <text x="32" y="40" font-family="Segoe UI, Arial, sans-serif" font-size="${safe.length > 2 ? 20 : 24}" font-weight="700" text-anchor="middle" fill="${fg}">${safe}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Monta a lista ordenada de candidatos a favicon oficial de um
 * provedor. Para cada domínio conhecido (por padrão o host de keyUrl
 * ou downloadUrl; ou os domínios explícitos em p.faviconDomains,
 * quando o domínio "principal" for um console/subdomínio sem ícone
 * próprio) geramos duas tentativas, em dois serviços diferentes que
 * apenas buscam o ícone publicado pela própria empresa em seu
 * domínio (não copiamos nem armazenamos logotipos de terceiros):
 *   1. o serviço de favicons do Google
 *   2. o proxy de favicons do DuckDuckGo
 * O client tenta cada URL em ordem via onerror e, se todas falharem,
 * cai para o monograma SVG gerado localmente.
 * @param {Provider} p
 * @returns {string[]}
 */
function officialFaviconCandidates(p) {
  const domains = p.faviconDomains && p.faviconDomains.length ? p.faviconDomains : [];
  if (domains.length === 0) {
    const source = p.downloadUrl || p.keyUrl;
    try {
      if (source) domains.push(new URL(source).hostname);
    } catch {
      // sem domínio válido: só sobra o monograma
    }
  }
  const candidates = [];
  for (const domain of domains) {
    candidates.push(`https://www.google.com/s2/favicons?sz=64&domain=${domain}`);
    candidates.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  }
  return candidates;
}

/**
 * @typedef {{ label: string, url: string }} BaseUrlEntry
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: string,
 *   color: string,
 *   letters: string,
 *   keyUrl: string,
 *   keyLabel?: string,
 *   downloadUrl?: string,
 *   baseUrls: BaseUrlEntry[],
 *   note?: string,
 * }} Provider
 */

/** @type {Provider[]} */
const PROVIDERS = [
  // ---------- Grandes laboratórios ocidentais ----------
  {
    id: "openai",
    name: "OpenAI",
    category: "Ocidental",
    color: "#10a37f",
    letters: "AI",
    keyUrl: "https://platform.openai.com/api-keys",
    baseUrls: [{ label: "OpenAI API", url: "https://api.openai.com/v1" }],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    category: "Ocidental",
    color: "#d97757",
    letters: "AN",
    keyUrl: "https://console.anthropic.com/settings/keys",
    baseUrls: [{ label: "Anthropic API", url: "https://api.anthropic.com/v1" }],
  },
  {
    id: "google",
    name: "Google (Gemini)",
    category: "Ocidental",
    color: "#4285f4",
    letters: "G",
    keyUrl: "https://aistudio.google.com/apikey",
    baseUrls: [
      { label: "Gemini OpenAI-compatible", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
      { label: "Gemini nativo", url: "https://generativelanguage.googleapis.com/v1beta" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    category: "Ocidental",
    color: "#fa520f",
    letters: "MI",
    keyUrl: "https://console.mistral.ai/api-keys",
    baseUrls: [{ label: "Mistral API", url: "https://api.mistral.ai/v1" }],
  },
  {
    id: "cohere",
    name: "Cohere",
    category: "Ocidental",
    color: "#39594d",
    letters: "CO",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    baseUrls: [
      { label: "Cohere nativo", url: "https://api.cohere.ai/v1" },
      { label: "Cohere OpenAI-compatible", url: "https://api.cohere.ai/compatibility/v1" },
    ],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    category: "Ocidental",
    color: "#000000",
    letters: "X",
    keyUrl: "https://console.x.ai",
    baseUrls: [{ label: "xAI API", url: "https://api.x.ai/v1" }],
  },

  // ---------- Infra de inferência rápida / agregadores ----------
  {
    id: "groq",
    name: "Groq",
    category: "Inferência rápida",
    color: "#f55036",
    letters: "GQ",
    keyUrl: "https://console.groq.com/keys",
    baseUrls: [{ label: "Groq OpenAI-compatible", url: "https://api.groq.com/openai/v1" }],
  },
  {
    id: "together",
    name: "Together AI",
    category: "Inferência rápida",
    color: "#0f6fff",
    letters: "TG",
    keyUrl: "https://api.together.ai/settings/api-keys",
    baseUrls: [{ label: "Together API", url: "https://api.together.xyz/v1" }],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    category: "Inferência rápida",
    color: "#6420ff",
    letters: "FW",
    keyUrl: "https://fireworks.ai/account/api-keys",
    faviconDomains: ["fireworks.ai", "www.fireworks.ai"],
    baseUrls: [{ label: "Fireworks API", url: "https://api.fireworks.ai/inference/v1" }],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    category: "Inferência rápida",
    color: "#f7941e",
    letters: "CB",
    keyUrl: "https://cloud.cerebras.ai",
    baseUrls: [{ label: "Cerebras API", url: "https://api.cerebras.ai/v1" }],
  },
  {
    id: "sambanova",
    name: "SambaNova",
    category: "Inferência rápida",
    color: "#00a99d",
    letters: "SN",
    keyUrl: "https://cloud.sambanova.ai/apis",
    baseUrls: [{ label: "SambaNova API", url: "https://api.sambanova.ai/v1" }],
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    category: "Inferência rápida",
    color: "#1a1a2e",
    letters: "DI",
    keyUrl: "https://deepinfra.com/dash/api_keys",
    baseUrls: [{ label: "DeepInfra OpenAI-compatible", url: "https://api.deepinfra.com/v1/openai" }],
  },
  {
    id: "novita",
    name: "Novita AI",
    category: "Inferência rápida",
    color: "#7b2ff7",
    letters: "NV",
    keyUrl: "https://novita.ai/settings/key-management",
    baseUrls: [{ label: "Novita OpenAI-compatible", url: "https://api.novita.ai/v3/openai" }],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "Agregador",
    color: "#6467f2",
    letters: "OR",
    keyUrl: "https://openrouter.ai/settings/keys",
    baseUrls: [{ label: "OpenRouter API", url: "https://openrouter.ai/api/v1" }],
    note: "Agregador: um único endpoint dá acesso a dezenas de modelos/provedores.",
  },
  {
    id: "huggingface",
    name: "Hugging Face (Inference)",
    category: "Agregador",
    color: "#ffbf00",
    letters: "HF",
    fg: "#111111",
    keyUrl: "https://huggingface.co/settings/tokens",
    baseUrls: [{ label: "HF Inference Router", url: "https://router.huggingface.co/v1" }],
  },
  {
    id: "github-models",
    name: "GitHub Models",
    category: "Agregador",
    color: "#24292e",
    letters: "GH",
    keyUrl: "https://github.com/settings/tokens",
    baseUrls: [{ label: "GitHub Models API", url: "https://models.github.ai/inference" }],
    note: "Use um Personal Access Token do GitHub como API key.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM (build.nvidia.com)",
    category: "Infra",
    color: "#76b900",
    letters: "NV",
    keyUrl: "https://build.nvidia.com",
    baseUrls: [{ label: "NVIDIA NIM API", url: "https://integrate.api.nvidia.com/v1" }],
  },
  {
    id: "replicate",
    name: "Replicate",
    category: "Infra",
    color: "#000000",
    letters: "RP",
    keyUrl: "https://replicate.com/account/api-tokens",
    baseUrls: [{ label: "Replicate API", url: "https://api.replicate.com/v1" }],
    note: "API própria (não segue exatamente o formato chat/completions).",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "Infra",
    color: "#4d6bfe",
    letters: "DS",
    keyUrl: "https://platform.deepseek.com/api_keys",
    baseUrls: [{ label: "DeepSeek API", url: "https://api.deepseek.com/v1" }],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "Infra",
    color: "#20808d",
    letters: "PX",
    keyUrl: "https://www.perplexity.ai/settings/api",
    baseUrls: [{ label: "Perplexity API (sem /v1)", url: "https://api.perplexity.ai" }],
  },

  // ---------- China / plataformas asiáticas ----------
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    category: "China",
    color: "#111827",
    letters: "KI",
    keyUrl: "https://platform.moonshot.ai",
    baseUrls: [
      { label: "Global", url: "https://api.moonshot.ai/v1" },
      { label: "China", url: "https://api.moonshot.cn/v1" },
    ],
  },
  {
    id: "zai",
    name: "Z.ai (GLM)",
    category: "China",
    color: "#0b6cff",
    letters: "Z",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    baseUrls: [
      { label: "OpenAI-compatible", url: "https://api.z.ai/api/paas/v4" },
      { label: "OpenAI-compatible (alt)", url: "https://api.z.ai/api/openai/v1" },
      { label: "Anthropic-compatible", url: "https://api.z.ai/api/anthropic" },
      { label: "Coding Plan", url: "https://api.z.ai/api/coding/paas/v4" },
    ],
    note: "Único provedor (além da Anthropic) com endpoint Anthropic-compatible nativo.",
  },
  {
    id: "bigmodel",
    name: "BigModel / Zhipu (GLM, China)",
    category: "China",
    color: "#1454f5",
    letters: "BM",
    keyUrl: "https://open.bigmodel.cn",
    faviconDomains: ["www.bigmodel.cn", "bigmodel.cn", "www.zhipuai.cn"],
    baseUrls: [{ label: "BigModel API", url: "https://open.bigmodel.cn/api/paas/v4" }],
    note: "Espelho doméstico (China) do Z.ai — mesma empresa (Zhipu AI).",
  },
  {
    id: "alibaba-qwen",
    name: "Alibaba Cloud (Qwen / DashScope)",
    category: "China",
    color: "#ff6a00",
    letters: "QW",
    keyUrl: "https://bailian.console.aliyun.com",
    baseUrls: [
      { label: "Internacional", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
      { label: "China", url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
      { label: "EUA (Virginia)", url: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" },
    ],
  },
  {
    id: "xiaomi-mimo",
    name: "Xiaomi MiMo",
    category: "China",
    color: "#ff6900",
    letters: "MM",
    keyUrl: "https://platform.xiaomimimo.com",
    baseUrls: [
      { label: "OpenAI-compatible", url: "https://api.xiaomimimo.com/v1" },
      { label: "Anthropic-compatible", url: "https://api.xiaomimimo.com/anthropic/v1" },
    ],
  },
  {
    id: "baidu-qianfan",
    name: "Baidu Qianfan (ERNIE)",
    category: "China",
    color: "#2932e1",
    letters: "BQ",
    keyUrl: "https://console.bce.baidu.com/qianfan",
    baseUrls: [{ label: "Qianfan API", url: "https://qianfan.baidubce.com/v2" }],
    note: "Confirme o path atual no console — a Baidu costuma versionar por produto.",
  },
  {
    id: "volcengine",
    name: "ByteDance Volcengine (Doubao)",
    category: "China",
    color: "#1664ff",
    letters: "DB",
    keyUrl: "https://console.volcengine.com/ark",
    faviconDomains: ["www.volcengine.com", "www.bytedance.com"],
    baseUrls: [{ label: "Ark API", url: "https://ark.cn-beijing.volces.com/api/v3" }],
  },
  {
    id: "tencent-hunyuan",
    name: "Tencent Hunyuan",
    category: "China",
    color: "#0052d9",
    letters: "TH",
    keyUrl: "https://console.cloud.tencent.com/hunyuan",
    faviconDomains: ["hunyuan.tencent.com", "cloud.tencent.com"],
    baseUrls: [{ label: "Hunyuan OpenAI-compatible", url: "https://api.hunyuan.cloud.tencent.com/v1" }],
  },

  // ---------- Ferramentas locais de roteamento (baixar/instalar) ----------
  {
    id: "9router",
    name: "9Router",
    category: "Roteador local",
    color: "#111111",
    letters: "9R",
    downloadUrl: "https://9router.com",
    keyUrl: "https://9router.com",
    faviconDomains: ["9router.com", "www.9router.com"],
    baseUrls: [{ label: "Gateway local padrão", url: "http://localhost:20128/v1" }],
    note: "Não é uma empresa de API: é um app/gateway local (baixar e instalar) que roteia entre dezenas de provedores.",
  },
  {
    id: "omniroute",
    name: "OmniRoute",
    category: "Roteador local",
    color: "#5b2ee0",
    letters: "OM",
    downloadUrl: "https://omniroute.online",
    keyUrl: "https://omniroute.online",
    faviconDomains: ["omniroute.online", "www.omniroute.online"],
    baseUrls: [{ label: "Gateway local padrão", url: "http://localhost:20128/v1" }],
    note: "Fork em TypeScript do 9Router — também é baixado/instalado localmente.",
  },
];

const CATEGORY_ORDER = [
  "Ocidental",
  "Agregador",
  "Inferência rápida",
  "Infra",
  "China",
  "Roteador local",
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCard(p) {
  const monogram = monogramDataUri(p.letters, p.color, p.fg || "#ffffff");
  const candidates = officialFaviconCandidates(p);
  const iconSrc = candidates.length ? candidates[0] : monogram;
  const remainingCandidates = candidates.slice(1);
  const baseUrlsHtml = p.baseUrls
    .map(
      (b, i) => `
      <div class="baseurl-row">
        <div class="baseurl-meta">
          <span class="baseurl-label">${escapeHtml(b.label)}</span>
          <code class="baseurl-value">${escapeHtml(b.url)}</code>
        </div>
        <button class="btn-copy" data-copy="${escapeHtml(b.url)}" title="Copiar Base URL">copiar</button>
      </div>`,
    )
    .join("");

  const isDownload = Boolean(p.downloadUrl);
  const primaryLabel = isDownload ? "Baixar / abrir site" : "Pegar chave de API";
  const primaryUrl = isDownload ? p.downloadUrl : p.keyUrl;

  return `
  <div class="card" data-name="${escapeHtml(p.name.toLowerCase())}" data-category="${escapeHtml(p.category)}">
    <div class="card-head">
      <span class="card-icon-wrap">
        <img class="card-icon" src="${escapeHtml(iconSrc)}" data-fallback="${escapeHtml(monogram)}" data-candidates='${escapeHtml(JSON.stringify(remainingCandidates))}' alt="${escapeHtml(p.name)}" width="28" height="28" loading="lazy">
      </span>
      <div class="card-title">
        <div class="card-name">${escapeHtml(p.name)}</div>
        <div class="card-cat">${escapeHtml(p.category)}</div>
      </div>
    </div>
    ${p.note ? `<div class="card-note">${escapeHtml(p.note)}</div>` : ""}
    <div class="card-baseurls">${baseUrlsHtml}</div>
    <div class="card-actions">
      <a class="btn-primary" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer">${primaryLabel} →</a>
      ${!isDownload && p.downloadUrl ? `<a class="btn-ghost" href="${escapeHtml(p.downloadUrl)}" target="_blank" rel="noopener noreferrer">Baixar app</a>` : ""}
    </div>
  </div>`;
}

/**
 * @param {{ backUrl?: string }} [opts]
 */
export function renderGetApiHtml(opts = {}) {
  const backUrl = opts.backUrl || "/";

  const cardsByCategory = CATEGORY_ORDER.map((cat) => {
    const items = PROVIDERS.filter((p) => p.category === cat);
    if (items.length === 0) return "";
    return `
      <section class="category-block" data-category-block="${escapeHtml(cat)}">
        <h2 class="category-title">${escapeHtml(cat)}</h2>
        <div class="grid">${items.map(renderCard).join("")}</div>
      </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>claudegate · pegar API</title>
<link rel="icon" type="image/png" href="${MASCOT_DATA_URI}">
<style>
  :root {
    --bg: #0d1011;
    --bg-raised: #161a1c;
    --bg-card: #14181a;
    --line: #262b2e;
    --line-bright: #3a4144;
    --ink: #e7ebec;
    --ink-dim: #8a9296;
    --signal: #ff6a39;
    --ok: #4ade80;
    --info: #60a5fa;
    --mono: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.5;
  }
  .frame { max-width: 1180px; margin: 0 auto; padding: 40px 24px 96px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; }
  .back-link { color: var(--ink-dim); text-decoration: none; font-size: 12px; }
  .back-link:hover { color: var(--ink); }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--signal);
    margin-bottom: 8px;
  }
  h1 { font-size: 26px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .subtitle { color: var(--ink-dim); margin: 0 0 24px; max-width: 78ch; }
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 28px;
    flex-wrap: wrap;
    align-items: center;
  }
  #search {
    flex: 1 1 260px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 6px;
    outline: none;
  }
  #search:focus { border-color: var(--line-bright); }
  .chip {
    background: transparent;
    border: 1px solid var(--line-bright);
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 11px;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
  }
  .chip.active { background: var(--signal); color: #1a0d05; border-color: var(--signal); font-weight: 600; }
  .category-title {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--info);
    margin: 32px 0 14px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--bg-card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.15s ease;
  }
  .card:hover { border-color: var(--line-bright); }
  .card-head { display: flex; align-items: center; gap: 12px; }
  .card-icon-wrap {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .card-icon-wrap.is-monogram { background: transparent; border-color: transparent; }
  .card-icon-wrap.is-monogram .card-icon { width: 40px; height: 40px; border-radius: 10px; }
  .card-icon { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }
  .card-name { font-size: 14px; font-weight: 600; }
  .card-cat { font-size: 10px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
  .card-note { font-size: 11px; color: var(--ink-dim); background: rgba(96,165,250,0.06); border: 1px solid rgba(96,165,250,0.18); border-radius: 6px; padding: 8px 10px; }
  .card-baseurls { display: flex; flex-direction: column; gap: 6px; }
  .baseurl-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 7px 9px;
  }
  .baseurl-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .baseurl-label { font-size: 10px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .baseurl-value {
    font-size: 11px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .btn-copy {
    background: transparent;
    border: 1px solid var(--line-bright);
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 10px;
    padding: 5px 9px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-copy:hover { color: var(--ink); border-color: var(--ink-dim); }
  .btn-copy.copied { color: var(--ok); border-color: var(--ok); }
  .card-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
  .btn-primary {
    background: var(--signal);
    color: #1a0d05;
    text-decoration: none;
    font-weight: 600;
    font-size: 12px;
    padding: 9px 14px;
    border-radius: 6px;
  }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--line-bright);
    color: var(--ink-dim);
    text-decoration: none;
    font-size: 12px;
    padding: 8px 13px;
    border-radius: 6px;
  }
  .btn-ghost:hover { color: var(--ink); }
  .empty-state { text-align: center; padding: 48px 24px; color: var(--ink-dim); border: 1px dashed var(--line-bright); border-radius: 8px; display: none; }
  .toast {
    position: fixed;
    bottom: 24px; left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--ink); color: var(--bg);
    padding: 10px 18px;
    border-radius: 6px;
    font-size: 12px; font-weight: 600;
    opacity: 0;
    transition: all 0.2s ease;
    pointer-events: none;
    z-index: 10;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>
  <div class="frame">
    <div class="topbar">
      <a class="back-link" href="${escapeHtml(backUrl)}">← voltar ao menu</a>
    </div>
    <div class="eyebrow">claudegate · pegar API</div>
    <h1>Onde conseguir sua chave de API</h1>
    <p class="subtitle">
      Catálogo das principais plataformas que oferecem chaves de API de IA (e de alguns
      roteadores locais). Clique em uma empresa para ir direto à página oficial onde a
      chave é gerada, e copie o Base URL certo para colar no dashboard da sua instância
      do claudegate.
    </p>

    <div class="toolbar">
      <input id="search" type="text" placeholder="Buscar por nome (ex: qwen, groq, kimi)...">
      <button class="chip active" data-filter="__all__">todas</button>
      ${CATEGORY_ORDER.map((c) => `<button class="chip" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}
    </div>

    <div id="content">${cardsByCategory}</div>
    <div class="empty-state" id="empty-state">Nenhum resultado para essa busca.</div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const search = document.getElementById('search');
    const chips = Array.from(document.querySelectorAll('.chip'));
    const cards = Array.from(document.querySelectorAll('.card'));
    const blocks = Array.from(document.querySelectorAll('[data-category-block]'));
    const emptyState = document.getElementById('empty-state');
    let activeCategory = '__all__';

    function applyFilters() {
      const term = search.value.trim().toLowerCase();
      let anyVisible = false;
      cards.forEach((card) => {
        const matchesTerm = !term || card.dataset.name.includes(term);
        const matchesCategory = activeCategory === '__all__' || card.dataset.category === activeCategory;
        const visible = matchesTerm && matchesCategory;
        card.style.display = visible ? '' : 'none';
        if (visible) anyVisible = true;
      });
      blocks.forEach((block) => {
        const anyCardVisible = Array.from(block.querySelectorAll('.card')).some((c) => c.style.display !== 'none');
        block.style.display = anyCardVisible ? '' : 'none';
      });
      emptyState.style.display = anyVisible ? 'none' : 'block';
    }

    document.querySelectorAll('.card-icon[data-candidates]').forEach((img) => {
      img.addEventListener('error', function onIconError() {
        let queue = [];
        try {
          queue = JSON.parse(img.dataset.candidates || '[]');
        } catch {
          queue = [];
        }
        if (queue.length > 0) {
          img.src = queue.shift();
          img.dataset.candidates = JSON.stringify(queue);
        } else {
          img.removeEventListener('error', onIconError);
          img.src = img.dataset.fallback;
          img.closest('.card-icon-wrap').classList.add('is-monogram');
        }
      });
    });

    search.addEventListener('input', applyFilters);
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategory = chip.dataset.filter;
        applyFilters();
      });
    });

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    }

    document.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const value = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(value);
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        btn.textContent = 'copiado!';
        btn.classList.add('copied');
        showToast('Base URL copiada');
        setTimeout(() => {
          btn.textContent = 'copiar';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  </script>
</body>
</html>`;
}
