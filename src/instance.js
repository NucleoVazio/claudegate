// Processo de uma instância individual. Roda como processo filho do master.
// Sobe DOIS servidores HTTP neste mesmo processo:
//   - gateway na porta ímpar (recebida via env CLAUDEGATE_PORT)
//     -> fala Anthropic /v1/messages (para Claude Code)
//     -> fala OpenAI /v1/chat/completions e /chat/completions (uso universal)
//   - dashboard na porta par (recebida via env CLAUDEGATE_DASHBOARD_PORT) -> HTML de configuração
//
// O estado do provider fica em memória neste processo (não no master, não em disco).
// Configurar pelo dashboard = hot-reload imediato, sem reiniciar nada.

import http from "node:http";
import { anthropicRequestToOpenAI, openAIResponseToAnthropic } from "./protocol.js";
import { StreamTranslator } from "./stream-translator.js";
import { renderDashboardHtml } from "./dashboard-html.js";
import {
  loadProviderForPort,
  saveProviderForPort,
  clearProviderForPort,
  listVaultEntries,
  addVaultEntry,
  getVaultEntry,
  removeVaultEntry,
} from "./persistence.js";

const GATEWAY_PORT = Number(process.env.CLAUDEGATE_PORT);
const DASHBOARD_PORT = Number(process.env.CLAUDEGATE_DASHBOARD_PORT);

if (!GATEWAY_PORT || !DASHBOARD_PORT) {
  console.error("instance.js requer CLAUDEGATE_PORT e CLAUDEGATE_DASHBOARD_PORT no ambiente.");
  process.exit(1);
}

/**
 * Senha padrão para autenticação no gateway quando usado no modo universal
 * (OpenAI-compatible). O usuário configura OPENAI_API_KEY="gateway" no projeto
 * e o gateway aceita, substituindo pela API key real do provider.
 */
const GATEWAY_DEFAULT_PASSWORD = "gateway";

/**
 * Estado em memória desta instância. Editável via dashboard, sem persistência em disco.
 *
 * O provider suporta até 4 modelos, mapeados para os slots que o Claude Code respeita:
 *   - defaultModel    -> ANTHROPIC_MODEL              (obrigatório)
 *   - opusModel       -> ANTHROPIC_DEFAULT_OPUS_MODEL  (opcional, cai para defaultModel no wrapper)
 *   - sonnetModel     -> ANTHROPIC_DEFAULT_SONNET_MODEL (opcional)
 *   - haikuModel      -> ANTHROPIC_DEFAULT_HAIKU_MODEL  (opcional)
 *
 * Assim, dentro do Claude Code, o comando /model mostra até 4 opções para alternar sem mexer no gateway.
 *
 * Para uso universal (OpenAI-compatible), o modelo é o que vier na requisição ou o defaultModel.
 *
 * O provider também suporta múltiplas API keys (apiKey principal + apiKeys extras) na
 * mesma porta. Todas devem ter o mesmo acesso ao mesmo baseUrl/modelos configurados —
 * o gateway apenas alterna (round-robin) entre elas a cada requisição, para distribuir
 * a carga/limite de uso entre várias contas sem precisar de outra instância.
 */
const state = {
  port: GATEWAY_PORT,
  dashboardPort: DASHBOARD_PORT,
  provider: /** @type {null | { type: string, baseUrl: string, apiKey: string, apiKeys: string[], label: string, defaultModel: string, opusModel: string, sonnetModel: string, haikuModel: string }} */ (null),
  // Índice de rotação usado para alternar entre apiKey + apiKeys a cada requisição.
  apiKeyRotationIndex: 0,
  requestCount: 0,
  errorCount: 0,
  lastError: /** @type {string|null} */ (null),
  lastRequestAt: /** @type {number|null} */ (null),
  createdAt: Date.now(),
  // Rastreamento de gastos de tokens (sem limites — somente para análise)
  totalInputTokens: 0,
  totalOutputTokens: 0,
};

// Recupera, se existir, a configuração de provider salva anteriormente para
// esta mesma porta (persistência em disco em ~/.claudegate/providers.json).
// Assim a instância já nasce configurada quando o usuário volta a usá-la.
const persistedProvider = loadProviderForPort(GATEWAY_PORT);
if (persistedProvider) {
  // Compatibilidade: configs antigas não têm apiKeys (chaves extras).
  if (!Array.isArray(persistedProvider.apiKeys)) persistedProvider.apiKeys = [];
  state.provider = persistedProvider;
}

/**
 * Retorna o pool de chaves de API desta instância: a principal (apiKey) +
 * as chaves extras (apiKeys), todas com o mesmo acesso ao mesmo baseUrl e
 * modelos configurados. Usado para alternar (round-robin) entre elas a
 * cada requisição, distribuindo a carga/limite de uso entre várias contas.
 * @param {object} provider
 * @returns {string[]}
 */
function getApiKeyPool(provider) {
  const pool = [provider.apiKey, ...(Array.isArray(provider.apiKeys) ? provider.apiKeys : [])]
    .map((k) => (k || "").trim())
    .filter(Boolean);
  return pool.length > 0 ? pool : [provider.apiKey];
}

/**
 * Escolhe a próxima chave de API do pool desta instância, em rodízio
 * (round-robin), para espalhar as requisições entre todas as chaves
 * cadastradas para o mesmo provider/modelo.
 * @param {object} provider
 * @returns {string}
 */
function nextApiKey(provider) {
  const pool = getApiKeyPool(provider);
  const key = pool[state.apiKeyRotationIndex % pool.length];
  state.apiKeyRotationIndex = (state.apiKeyRotationIndex + 1) % pool.length;
  return key;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function anthropicError(res, statusCode, message, type = "api_error") {
  sendJson(res, statusCode, {
    type: "error",
    error: { type, message },
  });
}

/**
 * Registra o uso de tokens no estado da instância (para análise de gastos).
 * Sem limites — o uso é livre do usuário.
 */
function trackTokenUsage(inputTokens, outputTokens) {
  if (typeof inputTokens === "number" && inputTokens > 0) {
    state.totalInputTokens += inputTokens;
  }
  if (typeof outputTokens === "number" && outputTokens > 0) {
    state.totalOutputTokens += outputTokens;
  }
}

/**
 * Verifica se o Bearer token da requisição é válido para o modo universal.
 * Aceita a senha padrão "gateway" ou qualquer token configurado.
 */
function isGatewayAuthValid(req) {
  const auth = req.headers["authorization"];
  if (!auth) return false;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1].trim();
  // Aceita a senha padrão "gateway" como autenticação local
  return token === GATEWAY_DEFAULT_PASSWORD;
}

// ---------------------------------------------------------------------------
// GATEWAY (porta ímpar) — fala dois protocolos:
//   1) Anthropic Messages API (/v1/messages) — para Claude Code
//   2) OpenAI Chat Completions (/v1/chat/completions, /chat/completions) — universal
// ---------------------------------------------------------------------------

const gatewayServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { status: "ok", configured: state.provider !== null });
  }

  // -----------------------------------------------------------------------
  // Rota universal: OpenAI Chat Completions (uso com qualquer projeto)
  // -----------------------------------------------------------------------
  if (req.method === "POST" && (req.url === "/v1/chat/completions" || req.url === "/chat/completions")) {
    return handleOpenAIRequest(req, res);
  }

  // Também expor /v1/models e /models para compatibilidade universal
  if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
    return handleOpenAIModelsRequest(req, res);
  }

  // -----------------------------------------------------------------------
  // Rota Anthropic: /v1/messages (para Claude Code)
  // -----------------------------------------------------------------------
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    return anthropicError(res, 404, `Rota não encontrada: ${req.method} ${req.url}`, "not_found_error");
  }

  state.requestCount += 1;
  state.lastRequestAt = Date.now();

  if (!state.provider) {
    state.errorCount += 1;
    state.lastError = "Instância sem provider configurado";
    return anthropicError(
      res,
      503,
      `Esta instância (porta ${GATEWAY_PORT}) ainda não foi configurada. Acesse http://127.0.0.1:${DASHBOARD_PORT} para definir o provider, modelo e chave de API.`,
      "overloaded_error",
    );
  }

  let anthropicReq;
  try {
    const rawBody = await readBody(req);
    anthropicReq = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    state.errorCount += 1;
    state.lastError = "Body inválido (JSON malformado)";
    return anthropicError(res, 400, "Não foi possível interpretar o corpo da requisição como JSON.", "invalid_request_error");
  }

  const { provider } = state;
  // O Claude Code envia anthropicReq.model = um dos 4 slots configurados no wrapper.
  // Respeitamos isso; só caímos para defaultModel se vier vazio (raro).
  const requestedModel = anthropicReq.model || provider.defaultModel;
  const openAIReq = anthropicRequestToOpenAI(anthropicReq, requestedModel);
  if (openAIReq.stream) { openAIReq.stream_options = { include_usage: true }; }

  let providerRes;
  try {
    providerRes = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${nextApiKey(provider)}`,
      },
      body: JSON.stringify(openAIReq),
    });
  } catch (err) {
    state.errorCount += 1;
    state.lastError = `Falha de rede ao chamar o provider: ${err.message}`;
    return anthropicError(res, 502, state.lastError, "api_error");
  }

  if (!providerRes.ok && !openAIReq.stream) {
    const errText = await providerRes.text().catch(() => "");
    state.errorCount += 1;
    state.lastError = `Provider retornou ${providerRes.status}: ${errText.slice(0, 500)}`;
    return anthropicError(res, providerRes.status, state.lastError, "api_error");
  }

  if (openAIReq.stream) {
    return handleStreamingResponse(res, providerRes, requestedModel, state);
  }

  let openAIRes;
  try {
    openAIRes = await providerRes.json();
  } catch (err) {
    state.errorCount += 1;
    state.lastError = "Resposta do provider não é JSON válido";
    return anthropicError(res, 502, state.lastError, "api_error");
  }

  // Rastrear tokens da resposta não-streaming
  if (openAIRes.usage) {
    trackTokenUsage(openAIRes.usage.prompt_tokens, openAIRes.usage.completion_tokens);
  }

  const anthropicRes = openAIResponseToAnthropic(openAIRes, requestedModel);
  return sendJson(res, 200, anthropicRes);
});

// ---------------------------------------------------------------------------
// Handler para requisições OpenAI-compatible (modo universal)
// ---------------------------------------------------------------------------

async function handleOpenAIRequest(req, res) {
  state.requestCount += 1;
  state.lastRequestAt = Date.now();

  // Verificar autenticação: aceita "gateway" como senha local
  if (!isGatewayAuthValid(req)) {
    state.errorCount += 1;
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: "Autenticação inválida. Use OPENAI_API_KEY=\"gateway\" para acessar o proxy local.", type: "authentication_error" },
    }));
  }

  if (!state.provider) {
    state.errorCount += 1;
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: `Instância (porta ${GATEWAY_PORT}) sem provider configurado. Acesse http://127.0.0.1:${DASHBOARD_PORT}`, type: "server_error" },
    }));
  }

  let openAIReq;
  try {
    const rawBody = await readBody(req);
    openAIReq = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    state.errorCount += 1;
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: "Body inválido (JSON malformado)", type: "invalid_request_error" },
    }));
  }

  const { provider } = state;

  // O modelo pode vir na requisição ou usar o default configurado
  const requestedModel = openAIReq.model || provider.defaultModel;
  openAIReq.model = requestedModel;
  if (openAIReq.stream) { openAIReq.stream_options = { include_usage: true }; }

  let providerRes;
  try {
    providerRes = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${nextApiKey(provider)}`,
      },
      body: JSON.stringify(openAIReq),
    });
  } catch (err) {
    state.errorCount += 1;
    state.lastError = `Falha de rede ao chamar o provider: ${err.message}`;
    res.writeHead(502, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: state.lastError, type: "server_error" },
    }));
  }

  // Streaming: repassar diretamente (já está em formato OpenAI)
  if (openAIReq.stream) {
    if (!providerRes.ok || !providerRes.body) {
      const errText = await providerRes.text().catch(() => "");
      state.errorCount += 1;
      state.lastError = `Provider retornou ${providerRes.status} (stream): ${errText.slice(0, 500)}`;
      res.writeHead(providerRes.status || 502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        error: { message: state.lastError, type: "server_error" },
      }));
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = providerRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamInputTokens = 0;
    let streamOutputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          res.write(line + "\n");

          // Tentar extrair usage de tokens dos chunks de streaming
          if (trimmed.startsWith("data:") && trimmed !== "data: [DONE]") {
            try {
              const payload = trimmed.slice(5).trim();
              if (payload) {
                const chunk = JSON.parse(payload);
                if (chunk.usage) {
                  streamInputTokens = chunk.usage.prompt_tokens ?? streamInputTokens;
                  streamOutputTokens = chunk.usage.completion_tokens ?? streamOutputTokens;
                }
              }
            } catch {
              // chunk parcial, ignora
            }
          }
        }
      }
      // Rastrear tokens do streaming
      trackTokenUsage(streamInputTokens, streamOutputTokens);
    } catch (err) {
      state.errorCount += 1;
      state.lastError = `Stream interrompido: ${err.message}`;
    }

    res.end();
    return;
  }

  // Não-streaming: repassar resposta diretamente
  if (!providerRes.ok) {
    const errText = await providerRes.text().catch(() => "");
    state.errorCount += 1;
    state.lastError = `Provider retornou ${providerRes.status}: ${errText.slice(0, 500)}`;
    res.writeHead(providerRes.status, { "Content-Type": "application/json" });
    return res.end(errText);
  }

  let openAIRes;
  try {
    openAIRes = await providerRes.json();
  } catch (err) {
    state.errorCount += 1;
    state.lastError = "Resposta do provider não é JSON válido";
    res.writeHead(502, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: state.lastError, type: "server_error" },
    }));
  }

  // Rastrear tokens da resposta não-streaming
  if (openAIRes.usage) {
    trackTokenUsage(openAIRes.usage.prompt_tokens, openAIRes.usage.completion_tokens);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  return res.end(JSON.stringify(openAIRes));
}

// ---------------------------------------------------------------------------
// Handler para /v1/models e /models (modo universal)
// ---------------------------------------------------------------------------

async function handleOpenAIModelsRequest(req, res) {
  // Verificar autenticação
  if (!isGatewayAuthValid(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: "Autenticação inválida. Use OPENAI_API_KEY=\"gateway\".", type: "authentication_error" },
    }));
  }

  if (!state.provider) {
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: "Instância sem provider configurado.", type: "server_error" },
    }));
  }

  try {
    const { provider } = state;
    const modelsRes = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${nextApiKey(provider)}` },
    });

    if (!modelsRes.ok) {
      const text = await modelsRes.text().catch(() => "");
      res.writeHead(modelsRes.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        error: { message: `Provider retornou ${modelsRes.status}: ${text.slice(0, 300)}`, type: "server_error" },
      }));
    }

    const data = await modelsRes.json();
    // Repassar diretamente no formato OpenAI /models
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: { message: `Falha ao buscar modelos: ${err.message}`, type: "server_error" },
    }));
  }
}

/**
 * @param {http.ServerResponse} res
 * @param {Response} providerRes - resposta fetch() do provider, em modo streaming
 * @param {string} requestedModel
 * @param {typeof state} state
 */
async function handleStreamingResponse(res, providerRes, requestedModel, state) {
  if (!providerRes.ok || !providerRes.body) {
    const errText = await providerRes.text().catch(() => "");
    state.errorCount += 1;
    state.lastError = `Provider retornou ${providerRes.status} (stream): ${errText.slice(0, 500)}`;
    return anthropicError(res, providerRes.status || 502, state.lastError, "api_error");
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const emit = (eventName, data) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const translator = new StreamTranslator(emit, requestedModel);

  const reader = providerRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        if (!payload) continue;
        try {
          const chunk = JSON.parse(payload);
          translator.push(chunk);
        } catch {
          // chunk parcial ou inválido: ignora essa linha, não derruba o stream inteiro
        }
      }
    }
  } catch (err) {
    state.errorCount += 1;
    state.lastError = `Stream interrompido: ${err.message}`;
  }

  translator.finish();

  // Finalizar o stream Anthropic: emite message_delta + message_stop
  translator.finish();
  // Rastrear tokens do streaming Anthropic
  trackTokenUsage(translator.inputTokens, translator.outputTokens);

  res.end();
}

// ---------------------------------------------------------------------------
// DASHBOARD (porta par) — HTML de configuração + API local de status/config
// ---------------------------------------------------------------------------

const dashboardServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "")) {
    const html = renderDashboardHtml(state);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && req.url === "/api/state") {
    return sendJson(res, 200, publicState());
  }

  if (req.method === "POST" && req.url === "/api/config") {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return sendJson(res, 400, { ok: false, error: "JSON inválido" });
    }

    const { type, baseUrl, apiKey, apiKeys, model, label, defaultModel, opusModel, sonnetModel, haikuModel } = body;

    // Compatibilidade: se alguém mandar o campo antigo "model", treat as defaultModel.
    const finalDefault = (defaultModel || model || "").trim();

    // apiKey é opcional na atualização SE já existir uma configurada (mantém a anterior).
    // Em uma instância ainda não configurada, apiKey é obrigatória.
    const keyToUse = apiKey ? String(apiKey).trim() : state.provider?.apiKey;

    // Chaves extras (mesmo acesso ao mesmo baseUrl/modelos) usadas em rodízio
    // junto com a principal, para distribuir requisições entre várias contas.
    // Aceita tanto array quanto string (uma por linha), e ignora entradas vazias
    // ou repetidas (inclusive repetidas em relação à chave principal).
    let finalExtraKeys = [];
    if (Array.isArray(apiKeys)) {
      finalExtraKeys = apiKeys.map((k) => String(k || "").trim()).filter(Boolean);
    } else if (typeof apiKeys === "string") {
      finalExtraKeys = apiKeys.split("\n").map((k) => k.trim()).filter(Boolean);
    } else if (Array.isArray(state.provider?.apiKeys)) {
      // Nenhuma chave extra enviada nesta atualização: mantém as anteriores.
      finalExtraKeys = state.provider.apiKeys;
    }
    finalExtraKeys = [...new Set(finalExtraKeys)].filter((k) => k !== keyToUse);

    if (!baseUrl || !keyToUse || !finalDefault) {
      return sendJson(res, 400, { ok: false, error: "baseUrl, apiKey e defaultModel (ou model) são obrigatórios" });
    }

    // Hot-reload: substitui o provider em memória imediatamente, sem restart.
    state.provider = {
      type: type || "openai-compatible",
      baseUrl: String(baseUrl).trim(),
      apiKey: keyToUse,
      apiKeys: finalExtraKeys,
      label: label ? String(label).trim() : finalDefault,
      defaultModel: finalDefault,
      opusModel: opusModel ? String(opusModel).trim() : "",
      sonnetModel: sonnetModel ? String(sonnetModel).trim() : "",
      haikuModel: haikuModel ? String(haikuModel).trim() : "",
    };
    state.apiKeyRotationIndex = 0;
    state.lastError = null;

    // Persiste em disco para esta porta, para não se perder quando uma nova
    // instância nascer nesta mesma porta (ver ~/.claudegate/providers.json).
    saveProviderForPort(GATEWAY_PORT, state.provider);

    return sendJson(res, 200, { ok: true, provider: redactProvider(state.provider) });
  }

  // Busca a lista de modelos disponíveis no provider (GET {baseUrl}/models).
  if (req.method === "POST" && req.url === "/api/models") {
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw.length > 0) body = JSON.parse(raw.toString("utf8"));
    } catch {
      return sendJson(res, 400, { ok: false, error: "JSON inválido" });
    }

    const baseUrl = (body.baseUrl || state.provider?.baseUrl || "").trim();
    const apiKey = body.apiKey || state.provider?.apiKey;

    if (!baseUrl || !apiKey) {
      return sendJson(res, 400, { ok: false, error: "Configure baseUrl e apiKey primeiro (salve o provider, ou envie no body)" });
    }

    try {
      const modelsRes = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!modelsRes.ok) {
        const text = await modelsRes.text().catch(() => "");
        return sendJson(res, modelsRes.status, { ok: false, error: `Provider retornou ${modelsRes.status}: ${text.slice(0, 300)}` });
      }
      const data = await modelsRes.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((m) => m.id).filter(Boolean).sort()
        : Array.isArray(data?.models)
          ? data.models.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean).sort()
          : [];
      return sendJson(res, 200, { ok: true, models });
    } catch (err) {
      return sendJson(res, 502, { ok: false, error: `Falha ao buscar modelos: ${err.message}` });
    }
  }

  // -------------------------------------------------------------------------
  // Chaves extras (apiKeys) do provider desta porta — precisam ter o mesmo
  // acesso ao mesmo baseUrl/modelos da apiKey principal já configurada.
  // O gateway alterna (round-robin) entre a principal e as extras a cada
  // requisição, para distribuir o uso entre várias contas na mesma porta.
  // -------------------------------------------------------------------------

  if (req.method === "GET" && req.url === "/api/keys") {
    const keys = (state.provider?.apiKeys || []).map((k, index) => ({ index, apiKey: redactKey(k) }));
    return sendJson(res, 200, { ok: true, keys });
  }

  if (req.method === "POST" && req.url === "/api/keys") {
    if (!state.provider) {
      return sendJson(res, 400, {
        ok: false,
        error: "Configure e salve o provider (Base URL, API Key e modelo) antes de adicionar mais chaves.",
      });
    }
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return sendJson(res, 400, { ok: false, error: "JSON inválido" });
    }
    const newKey = String(body.apiKey || "").trim();
    if (!newKey) {
      return sendJson(res, 400, { ok: false, error: "apiKey é obrigatória" });
    }
    const existing = state.provider.apiKeys || [];
    if (newKey === state.provider.apiKey || existing.includes(newKey)) {
      return sendJson(res, 400, { ok: false, error: "essa chave já está cadastrada nesta porta" });
    }
    state.provider.apiKeys = [...existing, newKey];
    saveProviderForPort(GATEWAY_PORT, state.provider);
    const keys = state.provider.apiKeys.map((k, index) => ({ index, apiKey: redactKey(k) }));
    return sendJson(res, 201, { ok: true, keys });
  }

  if (req.method === "DELETE" && req.url?.startsWith("/api/keys/")) {
    if (!state.provider) {
      return sendJson(res, 404, { ok: false, error: "sem provider configurado" });
    }
    const idx = Number(decodeURIComponent(req.url.split("/").pop()));
    const existing = state.provider.apiKeys || [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= existing.length) {
      return sendJson(res, 404, { ok: false, error: "índice inválido" });
    }
    state.provider.apiKeys = existing.filter((_, i) => i !== idx);
    state.apiKeyRotationIndex = 0;
    saveProviderForPort(GATEWAY_PORT, state.provider);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/api/clear") {
    state.provider = null;
    clearProviderForPort(GATEWAY_PORT);
    return sendJson(res, 200, { ok: true });
  }

  // -------------------------------------------------------------------------
  // Cofre de chaves API (persistido em ~/.claudegate/vault.json) — pares
  // baseUrl + apiKey salvos manualmente, para reaproveitar em qualquer
  // instância. Separados/agrupados por baseUrl (cada URL = outro provider).
  // -------------------------------------------------------------------------

  if (req.method === "GET" && req.url === "/api/vault") {
    const entries = listVaultEntries().map(redactVaultEntry);
    return sendJson(res, 200, { ok: true, entries });
  }

  if (req.method === "POST" && req.url === "/api/vault") {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return sendJson(res, 400, { ok: false, error: "JSON inválido" });
    }
    try {
      const entry = addVaultEntry(body);
      return sendJson(res, 201, { ok: true, entry: redactVaultEntry(entry) });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // Retorna uma entrada com a chave completa (não redigida) — usada só para
  // autopreencher localmente o formulário de provider desta instância.
  if (req.method === "GET" && req.url?.startsWith("/api/vault/")) {
    const id = decodeURIComponent(req.url.split("/").pop());
    const entry = getVaultEntry(id);
    if (!entry) return sendJson(res, 404, { ok: false, error: "não encontrado" });
    return sendJson(res, 200, { ok: true, entry });
  }

  if (req.method === "DELETE" && req.url?.startsWith("/api/vault/")) {
    const id = decodeURIComponent(req.url.split("/").pop());
    removeVaultEntry(id);
    return sendJson(res, 200, { ok: true });
  }

  // Resetar contadores de tokens
  if (req.method === "POST" && req.url === "/api/reset-tokens") {
    state.totalInputTokens = 0;
    state.totalOutputTokens = 0;
    return sendJson(res, 200, { ok: true, totalInputTokens: 0, totalOutputTokens: 0 });
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

function redactKey(key) {
  return key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
}

function redactProvider(provider) {
  if (!provider) return null;
  return {
    ...provider,
    apiKey: redactKey(provider.apiKey),
    apiKeys: Array.isArray(provider.apiKeys) ? provider.apiKeys.map(redactKey) : [],
    apiKeyCount: 1 + (Array.isArray(provider.apiKeys) ? provider.apiKeys.length : 0),
  };
}

function redactVaultEntry(entry) {
  return {
    ...entry,
    apiKey: entry.apiKey ? `${entry.apiKey.slice(0, 4)}...${entry.apiKey.slice(-4)}` : "",
  };
}

function publicState() {
  return {
    port: state.port,
    dashboardPort: state.dashboardPort,
    configured: state.provider !== null,
    provider: redactProvider(state.provider),
    requestCount: state.requestCount,
    errorCount: state.errorCount,
    lastError: state.lastError,
    lastRequestAt: state.lastRequestAt,
    createdAt: state.createdAt,
    totalInputTokens: state.totalInputTokens,
    totalOutputTokens: state.totalOutputTokens,
  };
}

gatewayServer.listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(`[instance] gateway escutando em http://127.0.0.1:${GATEWAY_PORT}`);
});

dashboardServer.listen(DASHBOARD_PORT, "127.0.0.1", () => {
  console.log(`[instance] dashboard escutando em http://127.0.0.1:${DASHBOARD_PORT}`);
});

process.on("SIGTERM", () => {
  gatewayServer.close();
  dashboardServer.close();
  process.exit(0);
});
