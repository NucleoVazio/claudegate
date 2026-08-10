// Gera o HTML do dashboard de uma instância. Função pura: recebe o state
// atual e devolve a string HTML completa. Sem dependências externas —
// CSS e JS inline, igual o padrão do openrat.

import { MASCOT_DATA_URI } from "./mascot-data.js";

/**
 * @param {object} state - estado em memória da instância (ver instance.js)
 */
export function renderDashboardHtml(state) {
  const portLabel = String(state.port).padStart(4, "0");

  // Formata número de tokens com separador de milhar
  const fmt = (n) => n.toLocaleString("pt-BR");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>claudegate · porta ${state.port}</title>
<link rel="icon" type="image/png" href="${MASCOT_DATA_URI}">
<style>
  body {
    position: relative;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background-image: url('${MASCOT_DATA_URI}');
    background-repeat: no-repeat;
    background-position: center;
    background-size: min(70vw, 900px);
    opacity: 0.05;
    pointer-events: none;
    z-index: 0;
  }
  .frame {
    position: relative;
    z-index: 1;
  }
  .header-logo {
    display: inline-block;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-image: url('${MASCOT_DATA_URI}');
    background-size: cover;
    background-position: center;
    vertical-align: middle;
    margin-right: 10px;
  }
  :root {
    --bg: #0d1011;
    --bg-raised: #161a1c;
    --line: #262b2e;
    --line-bright: #3a4144;
    --ink: #e7ebec;
    --ink-dim: #8a9296;
    --signal: #ff6a39;
    --ok: #4ade80;
    --err: #f87171;
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
    -webkit-font-smoothing: antialiased;
  }
  .frame {
    max-width: 780px;
    margin: 0 auto;
    padding: 48px 24px 96px;
  }
  .port-tag {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim);
    border: 1px solid var(--line-bright);
    border-radius: 3px;
    padding: 4px 10px;
    margin-bottom: 24px;
  }
  .port-tag b { color: var(--signal); font-weight: 600; letter-spacing: 0; }
  h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--ink-dim);
    margin: 0 0 36px;
    font-size: 13px;
  }
  .status-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 32px;
    padding: 12px 16px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: ${state.provider ? "var(--ok)" : "var(--ink-dim)"};
    flex-shrink: 0;
  }
  .status-row .label { font-weight: 600; }
  .status-row .meta { color: var(--ink-dim); font-size: 12px; margin-left: auto; }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 24px;
    margin: 0 0 20px;
    background: var(--bg-raised);
  }
  legend {
    padding: 0 8px;
    color: var(--ink-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  label {
    display: block;
    font-size: 12px;
    color: var(--ink-dim);
    margin: 16px 0 6px;
  }
  label:first-of-type { margin-top: 0; }
  input, select {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--line-bright);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 13px;
    padding: 10px 12px;
    border-radius: 5px;
    outline: none;
    transition: border-color 0.15s ease;
  }
  input:focus, select:focus { border-color: var(--signal); }
  input::placeholder { color: #4a5256; }
  .row-actions {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }
  button {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 5px;
    padding: 11px 20px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  button:hover { opacity: 0.88; }
  .btn-primary { background: var(--signal); color: #1a0d05; }
  .btn-ghost {
    background: transparent;
    color: var(--ink-dim);
    border: 1px solid var(--line-bright);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .stat {
    background: var(--bg-raised);
    padding: 16px;
  }
  .stat .num { font-size: 20px; font-weight: 600; }
  .stat .num.err { color: var(--err); }
  .stat .num.info { color: var(--info); }
  .stat .cap { color: var(--ink-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  .token-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    margin-top: 12px;
  }
  .token-stat {
    background: var(--bg-raised);
    padding: 16px;
  }
  .token-stat .num { font-size: 18px; font-weight: 600; }
  .token-stat .num.in { color: var(--info); }
  .token-stat .num.out { color: var(--signal); }
  .token-stat .cap { color: var(--ink-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  .error-box {
    margin-top: 16px;
    padding: 12px 14px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: 6px;
    color: var(--err);
    font-size: 12px;
    word-break: break-word;
  }
  .hint {
    margin-top: 6px;
    color: #5a6266;
    font-size: 11px;
  }
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
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .models-list {
    margin-top: 12px;
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px;
    border: 1px dashed var(--line);
    border-radius: 6px;
  }
  .models-list:empty { display: none; }
  .models-list .model-chip {
    background: var(--bg);
    border: 1px solid var(--line-bright);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 11px;
    padding: 5px 9px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .models-list .model-chip:hover { border-color: var(--signal); color: var(--signal); }
  .models-list .msg { color: var(--ink-dim); font-size: 12px; padding: 4px; }
  .models-list .msg.err { color: var(--err); }
  .slot-hint {
    color: #5a6266;
    font-size: 10px;
    margin: 2px 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--signal);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 32px 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
  }
  .usage-info {
    margin-top: 12px;
    padding: 12px 16px;
    background: rgba(96, 165, 250, 0.06);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 6px;
    color: var(--ink-dim);
    font-size: 12px;
  }
  .usage-info code { color: var(--info); }
  .vault-groups {
    margin-bottom: 4px;
  }
  .vault-groups:empty { margin-bottom: 0; }
  .vault-group {
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px dashed var(--line);
    border-radius: 6px;
  }
  .vault-group-title {
    font-size: 11px;
    color: var(--info);
    word-break: break-all;
    margin-bottom: 8px;
  }
  .vault-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .vault-entry:first-of-type { border-top: none; }
  .vault-entry .meta {
    flex: 1;
    font-size: 12px;
    color: var(--ink-dim);
    word-break: break-all;
  }
  .vault-entry button {
    font-size: 11px;
    padding: 6px 10px;
    flex-shrink: 0;
  }
  .extra-keys-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .extra-key-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .extra-key-row input {
    flex: 1;
  }
  .extra-key-row button {
    flex-shrink: 0;
    font-size: 11px;
    padding: 9px 12px;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="port-tag">gateway <b>:${state.port}</b> · dashboard :${state.dashboardPort}</div>
    <h1><span class="header-logo"></span>Instância ${portLabel}</h1>
    <p class="subtitle">Configure o provider desta porta. O Claude Code que apontar para <code>http://127.0.0.1:${state.port}</code> usa exatamente o que estiver salvo aqui.</p>

    <div class="status-row" id="status-row">
      <span class="dot"></span>
      <span class="label" id="status-label">${state.provider ? `ativa · ${escapeHtml(state.provider.label)}` : "sem provider configurado"}</span>
      <span class="meta" id="status-meta">${state.requestCount} req · ${state.errorCount} erros</span>
    </div>

    <fieldset>
      <legend>Cofre de Chaves API</legend>
      <p class="hint" style="margin-top:0;">Guarde pares de Base URL + API Key para reaproveitar em qualquer instância. Agrupado por Base URL — cada URL diferente é tratada como um provider/empresa separado.</p>

      <div id="vault-groups" class="vault-groups"></div>

      <label for="vaultLabel">Nome (opcional)</label>
      <input type="text" id="vaultLabel" placeholder="ex: openrouter-conta-2">

      <label for="vaultBaseUrl">Base URL</label>
      <input type="text" id="vaultBaseUrl" placeholder="https://openrouter.ai/api/v1">

      <label for="vaultApiKey">API Key</label>
      <input type="password" id="vaultApiKey" placeholder="sk-...">

      <div class="row-actions" style="margin-top: 16px;">
        <button type="button" class="btn-ghost" id="vault-add-btn">Salvar no cofre</button>
      </div>
    </fieldset>

    <form id="config-form">
      <fieldset>
        <legend>Provider</legend>

        <label for="label">Nome (só para identificação no dashboard)</label>
        <input type="text" id="label" name="label" placeholder="ex: openrouter-kimi" value="${state.provider ? escapeHtml(state.provider.label) : ""}">

        <label for="baseUrl">Base URL (formato OpenAI-compatible, sem /chat/completions no final)</label>
        <input type="text" id="baseUrl" name="baseUrl" placeholder="https://openrouter.ai/api/v1" required value="${state.provider ? escapeHtml(state.provider.baseUrl) : ""}">

        <label for="apiKey">API Key</label>
        <input type="password" id="apiKey" name="apiKey" placeholder="${state.provider ? "•••• já configurada — deixe em branco para manter" : "sk-..."}" ${state.provider ? "" : "required"}>
        <p class="hint">Salva em <code>~/.claudegate/providers.json</code> para esta porta — na próxima vez que uma instância nascer aqui, ela já vem configurada.</p>

        <div class="row-actions" style="margin-top: 16px;">
          <button type="button" class="btn-ghost" id="fetch-models-btn">Buscar modelos disponíveis no provider</button>
          <button type="button" class="btn-ghost" id="extra-keys-toggle-btn">Adicionar mais chaves</button>
        </div>
        <div id="models-list" class="models-list"></div>
        <p class="hint" style="margin-top: 6px;">Salve a configuração primeiro se a lista não aparecer — o gateway precisa de baseUrl + apiKey válidos para consultar o <code>GET /models</code> do provider.</p>

        <div id="extra-keys-section" style="display:none; margin-top:16px;">
          <p class="hint" style="margin-top:0;">Chaves extras precisam ter o <strong>mesmo acesso</strong> ao mesmo Base URL e aos mesmos modelos configurados acima. O gateway alterna (rodízio) entre a chave principal e as extras a cada requisição — útil para dividir o uso entre várias contas nesta mesma porta.</p>
          <div id="extra-keys-list" class="extra-keys-list"></div>
          <div class="extra-key-row" style="margin-top:10px;">
            <input type="password" id="newExtraKey" placeholder="sk-... (mesma conta/modelo do provider acima)">
            <button type="button" class="btn-ghost" id="extra-key-add-btn">Adicionar</button>
          </div>
          ${state.provider ? "" : `<p class="hint">Salve o provider (Base URL + API Key + modelo) primeiro — chaves extras precisam de um provider já configurado nesta porta.</p>`}
        </div>
      </fieldset>

      <fieldset>
        <legend>Modelos — 4 slots (mapeados para o /model do Claude Code)</legend>
        <p class="hint" style="margin-top: 0;">Preencha os slots que quiser expor no <code>/model</code> do Claude Code. Slots opcionais vazios viram o Modelo principal no wrapper. Clique num modelo da lista acima para preencher o campo em foco.</p>

        <label for="defaultModel">Modelo principal · ANTHROPIC_MODEL — obrigatório</label>
        <input type="text" id="defaultModel" name="defaultModel" placeholder="moonshotai/kimi-k2.6:free" required value="${state.provider ? escapeHtml(state.provider.defaultModel) : ""}">
        <div class="slot-hint">usado como padrão quando o Claude Code não especifica nenhum</div>

        <label for="opusModel">Opus · ANTHROPIC_DEFAULT_OPUS_MODEL — opcional</label>
        <input type="text" id="opusModel" name="opusModel" placeholder="vazio = usa o principal" value="${state.provider ? escapeHtml(state.provider.opusModel) : ""}">
        <div class="slot-hint">tier "opus" no /model do Claude Code</div>

        <label for="sonnetModel">Sonnet · ANTHROPIC_DEFAULT_SONNET_MODEL — opcional</label>
        <input type="text" id="sonnetModel" name="sonnetModel" placeholder="vazio = usa o principal" value="${state.provider ? escapeHtml(state.provider.sonnetModel) : ""}">
        <div class="slot-hint">tier "sonnet" no /model do Claude Code</div>

        <label for="haikuModel">Haiku · ANTHROPIC_DEFAULT_HAIKU_MODEL — opcional</label>
        <input type="text" id="haikuModel" name="haikuModel" placeholder="vazio = usa o principal" value="${state.provider ? escapeHtml(state.provider.haikuModel) : ""}">
        <div class="slot-hint">tier "haiku" no /model do Claude Code</div>
      </fieldset>

      <div class="row-actions">
        <button type="submit" class="btn-primary">Salvar e ativar</button>
        ${state.provider ? `<button type="button" class="btn-ghost" id="clear-btn">Limpar configuração</button>` : ""}
      </div>
    </form>

    ${state.lastError ? `<div class="error-box">${escapeHtml(state.lastError)}</div>` : ""}

    <div class="stats" style="margin-top: 28px;">
      <div class="stat">
        <div class="num">${state.requestCount}</div>
        <div class="cap">requisições</div>
      </div>
      <div class="stat">
        <div class="num err">${state.errorCount}</div>
        <div class="cap">erros</div>
      </div>
      <div class="stat">
        <div class="num">${state.lastRequestAt ? relativeTime(state.lastRequestAt) : "—"}</div>
        <div class="cap">última requisição</div>
      </div>
    </div>

    <div class="section-title">Gastos de Tokens</div>
    <div class="token-stats">
      <div class="token-stat">
        <div class="num in">${fmt(state.totalInputTokens)}</div>
        <div class="cap">tokens de entrada (input)</div>
      </div>
      <div class="token-stat">
        <div class="num out">${fmt(state.totalOutputTokens)}</div>
        <div class="cap">tokens de saída (output)</div>
      </div>
    </div>

    <div class="section-title">Uso Universal (OpenAI-compatible)</div>
    <div class="usage-info">
      <p style="margin:0 0 8px;">Esta porta também funciona como endpoint OpenAI-compatible para qualquer projeto que precise de API + URL + modelo:</p>
      <code>OPENAI_API_KEY="gateway"</code><br>
      <code>OPENAI_BASE_URL="http://127.0.0.1:${state.port}/v1"</code><br>
      <code>OPENAI_MODEL="modelo_escolhido"</code>
      <p style="margin:8px 0 0;color:var(--ink-dim);">A senha <code>gateway</code> autentica no proxy local. O modelo pode ser qualquer um suportado pelo provider configurado. O gateway substitui a senha pela API key real ao repassar a requisição.</p>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const form = document.getElementById('config-form');
    const toast = document.getElementById('toast');
    const modelsList = document.getElementById('models-list');
    const fetchBtn = document.getElementById('fetch-models-btn');

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // Rastreia qual campo de modelo está em foco para saber onde colar o modelo clicado.
    let lastFocusedModelField = document.getElementById('defaultModel');
    ['defaultModel', 'opusModel', 'sonnetModel', 'haikuModel'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('focus', () => { lastFocusedModelField = el; });
    });

    if (fetchBtn) {
      fetchBtn.addEventListener('click', async () => {
        modelsList.innerHTML = '<div class="msg">buscando modelos…</div>';
        const baseUrl = document.getElementById('baseUrl').value.trim();
        const apiKeyVal = document.getElementById('apiKey').value;
        const payload = {};
        if (baseUrl) payload.baseUrl = baseUrl;
        if (apiKeyVal) payload.apiKey = apiKeyVal;
        try {
          const res = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (!json.ok) {
            modelsList.innerHTML = '<div class="msg err">' + (json.error || 'falha') + '</div>';
            return;
          }
          if (!json.models || json.models.length === 0) {
            modelsList.innerHTML = '<div class="msg">nenhum modelo retornado pelo provider</div>';
            return;
          }
          modelsList.innerHTML = '';
          json.models.forEach((m) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'model-chip';
            chip.textContent = m;
            chip.title = 'inserir em: ' + (lastFocusedModelField?.id || 'defaultModel');
            chip.addEventListener('click', () => {
              const target = lastFocusedModelField || document.getElementById('defaultModel');
              target.value = m;
              target.focus();
              showToast('inserido em ' + target.id);
            });
            modelsList.appendChild(chip);
          });
        } catch (err) {
          modelsList.innerHTML = '<div class="msg err">erro de rede: ' + err.message + '</div>';
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.apiKey) delete data.apiKey;
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.ok) {
          showToast('Configuração salva — instância ativa');
          setTimeout(() => location.reload(), 600);
        } else {
          showToast('Erro: ' + (json.error || 'falha desconhecida'));
        }
      } catch (err) {
        showToast('Erro de rede: ' + err.message);
      }
    });

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await fetch('/api/clear', { method: 'POST' });
        location.reload();
      });
    }

    // ------------------------------------------------------------------
    // Cofre de chaves API — lista, agrupa por baseUrl, permite usar/remover
    // ------------------------------------------------------------------
    const vaultGroups = document.getElementById('vault-groups');
    const vaultAddBtn = document.getElementById('vault-add-btn');

    async function loadVault() {
      try {
        const res = await fetch('/api/vault');
        const json = await res.json();
        if (!json.ok) return;
        renderVault(json.entries || []);
      } catch {}
    }

    function renderVault(entries) {
      if (!entries.length) {
        vaultGroups.innerHTML = '<p class="hint" style="margin:4px 0;">nenhuma chave salva ainda</p>';
        return;
      }
      const groups = {};
      entries.forEach((e) => {
        (groups[e.baseUrl] = groups[e.baseUrl] || []).push(e);
      });
      vaultGroups.innerHTML = '';
      Object.keys(groups).sort().forEach((baseUrl) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'vault-group';

        const title = document.createElement('div');
        title.className = 'vault-group-title';
        title.textContent = baseUrl;
        groupEl.appendChild(title);

        groups[baseUrl].forEach((e) => {
          const row = document.createElement('div');
          row.className = 'vault-entry';

          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = e.label + ' · ' + e.apiKey;
          row.appendChild(meta);

          const useBtn = document.createElement('button');
          useBtn.type = 'button';
          useBtn.className = 'btn-ghost';
          useBtn.textContent = 'usar';
          useBtn.addEventListener('click', async () => {
            try {
              const r = await fetch('/api/vault/' + encodeURIComponent(e.id));
              const j = await r.json();
              if (j.ok) {
                document.getElementById('baseUrl').value = j.entry.baseUrl;
                document.getElementById('apiKey').value = j.entry.apiKey;
                showToast('preenchido a partir do cofre — clique em "Salvar e ativar"');
              }
            } catch (err) {
              showToast('erro de rede: ' + err.message);
            }
          });
          row.appendChild(useBtn);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'btn-ghost';
          delBtn.textContent = 'remover';
          delBtn.addEventListener('click', async () => {
            await fetch('/api/vault/' + encodeURIComponent(e.id), { method: 'DELETE' });
            loadVault();
          });
          row.appendChild(delBtn);

          groupEl.appendChild(row);
        });

        vaultGroups.appendChild(groupEl);
      });
    }

    if (vaultAddBtn) {
      vaultAddBtn.addEventListener('click', async () => {
        const label = document.getElementById('vaultLabel').value;
        const baseUrl = document.getElementById('vaultBaseUrl').value.trim();
        const apiKey = document.getElementById('vaultApiKey').value.trim();
        if (!baseUrl || !apiKey) {
          showToast('preencha Base URL e API Key');
          return;
        }
        try {
          const res = await fetch('/api/vault', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, baseUrl, apiKey }),
          });
          const json = await res.json();
          if (json.ok) {
            document.getElementById('vaultLabel').value = '';
            document.getElementById('vaultBaseUrl').value = '';
            document.getElementById('vaultApiKey').value = '';
            showToast('chave salva no cofre');
            loadVault();
          } else {
            showToast('erro: ' + (json.error || 'falha desconhecida'));
          }
        } catch (err) {
          showToast('erro de rede: ' + err.message);
        }
      });
    }

    loadVault();

    // ------------------------------------------------------------------
    // Chaves extras (apiKeys) — mesmo acesso ao mesmo baseUrl/modelos do
    // provider já configurado nesta porta. O gateway alterna entre elas
    // e a chave principal a cada requisição (rodízio).
    // ------------------------------------------------------------------
    const extraKeysToggleBtn = document.getElementById('extra-keys-toggle-btn');
    const extraKeysSection = document.getElementById('extra-keys-section');
    const extraKeysList = document.getElementById('extra-keys-list');
    const extraKeyAddBtn = document.getElementById('extra-key-add-btn');

    async function loadExtraKeys() {
      try {
        const res = await fetch('/api/keys');
        const json = await res.json();
        if (!json.ok) return;
        renderExtraKeys(json.keys || []);
      } catch {}
    }

    function renderExtraKeys(keys) {
      if (!keys.length) {
        extraKeysList.innerHTML = '<p class="hint" style="margin:4px 0;">nenhuma chave extra cadastrada nesta porta ainda</p>';
        return;
      }
      extraKeysList.innerHTML = '';
      keys.forEach((k) => {
        const row = document.createElement('div');
        row.className = 'extra-key-row';

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.style.flex = '1';
        meta.style.fontSize = '12px';
        meta.style.color = 'var(--ink-dim)';
        meta.textContent = 'chave extra #' + (k.index + 1) + ' · ' + k.apiKey;
        row.appendChild(meta);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-ghost';
        delBtn.textContent = 'remover';
        delBtn.addEventListener('click', async () => {
          await fetch('/api/keys/' + k.index, { method: 'DELETE' });
          loadExtraKeys();
        });
        row.appendChild(delBtn);

        extraKeysList.appendChild(row);
      });
    }

    if (extraKeysToggleBtn) {
      extraKeysToggleBtn.addEventListener('click', () => {
        const showing = extraKeysSection.style.display !== 'none';
        extraKeysSection.style.display = showing ? 'none' : 'block';
        if (!showing) loadExtraKeys();
      });
    }

    if (extraKeyAddBtn) {
      extraKeyAddBtn.addEventListener('click', async () => {
        const input = document.getElementById('newExtraKey');
        const apiKey = input.value.trim();
        if (!apiKey) {
          showToast('digite uma chave de API');
          return;
        }
        try {
          const res = await fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey }),
          });
          const json = await res.json();
          if (json.ok) {
            input.value = '';
            showToast('chave extra adicionada');
            loadExtraKeys();
          } else {
            showToast('erro: ' + (json.error || 'falha desconhecida'));
          }
        } catch (err) {
          showToast('erro de rede: ' + err.message);
        }
      });
    }

    // Auto-refresh token stats a cada 5s
    setInterval(async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const s = await res.json();
        // Update token display if elements exist
        const inEl = document.querySelector('.token-stat .num.in');
        const outEl = document.querySelector('.token-stat .num.out');
        if (inEl) inEl.textContent = s.totalInputTokens.toLocaleString('pt-BR');
        if (outEl) outEl.textContent = s.totalOutputTokens.toLocaleString('pt-BR');
        // Update request stats
        const reqNum = document.querySelectorAll('.stats .num')[0];
        const errNum = document.querySelectorAll('.stats .num.err')[0];
        if (reqNum) reqNum.textContent = s.requestCount;
        if (errNum) errNum.textContent = s.errorCount;
      } catch {}
    }, 5000);
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativeTime(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "agora";
  if (diffSec < 60) return `${diffSec}s atrás`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min atrás`;
  return `${Math.floor(diffSec / 3600)}h atrás`;
}
