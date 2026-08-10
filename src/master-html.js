// Gera o HTML do dashboard-mãe, servido pelo master na porta 4419.
// Lista todas as instâncias vivas no momento (em memória) e permite
// criar uma nova, derrubar uma existente, ou ativar (install) diretamente
// pelo dashboard sem precisar abrir terminal.

import { MASCOT_DATA_URI } from "./mascot-data.js";

/**
 * @param {Array<{ port: number, dashboardPort: number, createdAt: number, pid: number|undefined }>} instances
 */
export function renderMasterHtml(instances) {
  const rows = instances
    .sort((a, b) => a.port - b.port)
    .map(
      (inst) => `
      <tr data-port="${inst.port}">
        <td><span class="dot"></span></td>
        <td class="mono">:${inst.port}</td>
        <td class="mono dim">pid ${inst.pid ?? "—"}</td>
        <td><a href="http://127.0.0.1:${inst.dashboardPort}" target="_blank" class="dash-link">configurar →</a></td>
        <td class="mono dim">${relativeTime(inst.createdAt)}</td>
        <td><button class="btn-kill" data-port="${inst.port}">encerrar</button></td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>claudegate · master</title>
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
  .frame { max-width: 880px; margin: 0 auto; padding: 48px 24px 96px; }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--signal);
    margin-bottom: 8px;
  }
  h1 { font-size: 26px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .subtitle { color: var(--ink-dim); margin: 0 0 36px; max-width: 56ch; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .count { color: var(--ink-dim); font-size: 12px; }
  button.btn-new, button.btn-install {
    background: var(--signal);
    color: #1a0d05;
    border: none;
    font-family: var(--mono);
    font-weight: 600;
    font-size: 13px;
    padding: 10px 18px;
    border-radius: 5px;
    cursor: pointer;
    margin-left: 8px;
  }
  button.btn-new:hover, button.btn-install:hover { opacity: 0.88; }
  button.btn-install { background: var(--ok); color: #0a1f0a; }
  a.btn-getapi {
    display: inline-block;
    background: transparent;
    color: var(--info);
    border: 1px solid var(--info);
    font-family: var(--mono);
    font-weight: 600;
    font-size: 13px;
    padding: 9px 18px;
    border-radius: 5px;
    cursor: pointer;
    margin-left: 8px;
    text-decoration: none;
  }
  a.btn-getapi:hover { background: rgba(96, 165, 250, 0.1); }
  table { width: 100%; border-collapse: collapse; background: var(--bg-raised); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--line); }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-dim); font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: var(--mono); }
  .dim { color: var(--ink-dim); font-size: 12px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .dash-link { color: var(--signal); text-decoration: none; font-size: 12px; }
  .dash-link:hover { text-decoration: underline; }
  .btn-kill {
    background: transparent;
    border: 1px solid var(--line-bright);
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-kill:hover { color: #f87171; border-color: #f87171; }
  .empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--ink-dim);
    background: var(--bg-raised);
    border: 1px dashed var(--line-bright);
    border-radius: 8px;
  }
  .info-box {
    margin-top: 28px;
    padding: 14px 16px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-dim);
    font-size: 12px;
  }
  .info-box code { color: var(--ink); }
  .universal-box {
    margin-top: 16px;
    padding: 14px 16px;
    background: rgba(96, 165, 250, 0.06);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 8px;
    color: var(--ink-dim);
    font-size: 12px;
  }
  .universal-box code { color: var(--info); }
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
</style>
</head>
<body>
  <div class="frame">
    <div class="eyebrow">claudegate · porta 4419</div>
    <h1><span class="header-logo"></span>Instâncias</h1>
    <p class="subtitle">Cada instância é uma porta isolada falando o protocolo Anthropic e OpenAI-compatible. Configure o provider de cada uma no dashboard individual.</p>

    <div class="toolbar">
      <span class="count">${instances.length} instância${instances.length === 1 ? "" : "s"} ativa${instances.length === 1 ? "" : "s"}</span>
      <div>
        <a class="btn-getapi" href="/get-api">Pegar API</a>
        <button class="btn-install" id="install-btn">Ativar (install)</button>
        <button class="btn-new" id="new-btn">+ nova instância</button>
      </div>
    </div>

    ${
      instances.length === 0
        ? `<div class="empty">Nenhuma instância criada ainda.<br>Clique em "+ nova instância" ou rode <code>claudegate new</code> no terminal.</div>`
        : `<table>
            <thead>
              <tr><th></th><th>porta</th><th>processo</th><th>dashboard</th><th>criada</th><th></th></tr>
            </thead>
            <tbody id="instance-rows">${rows}</tbody>
          </table>`
    }

    <div class="info-box">
      Depois de configurar uma instância, clique em <strong>Ativar (install)</strong> acima para gerar os atalhos de terminal, ou acesse a porta diretamente — ela já funciona como gateway assim que o provider é salvo no dashboard individual.
    </div>

    <div class="universal-box">
      <strong>Uso universal (OpenAI-compatible):</strong> Qualquer porta configurada também aceita requisições no formato OpenAI:<br><br>
      <code>OPENAI_API_KEY="gateway"</code><br>
      <code>OPENAI_BASE_URL="http://127.0.0.1:PORTA/v1"</code><br>
      <code>OPENAI_MODEL="modelo_escolhido"</code><br><br>
      A senha <code>gateway</code> autentica no proxy local. O gateway substitui pela API key real ao repassar para o provider.
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    document.getElementById('new-btn').addEventListener('click', async () => {
      const res = await fetch('/instances/new', { method: 'POST' });
      if (res.ok) location.reload();
    });

    document.getElementById('install-btn').addEventListener('click', async () => {
      showToast('Gerando atalhos…');
      try {
        const res = await fetch('/install', { method: 'POST' });
        const json = await res.json();
        if (json.ok) {
          showToast('Atalhos gerados com sucesso!');
        } else {
          showToast('Erro: ' + (json.error || 'falha'));
        }
      } catch (err) {
        showToast('Erro de rede: ' + err.message);
      }
    });

    document.querySelectorAll('.btn-kill').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const port = btn.dataset.port;
        if (!confirm('Encerrar a instância :' + port + '?')) return;
        await fetch('/instances/' + port, { method: 'DELETE' });
        location.reload();
      });
    });
  </script>
</body>
</html>`;
}

function relativeTime(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "agora";
  if (diffSec < 60) return `${diffSec}s atrás`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min atrás`;
  return `${Math.floor(diffSec / 3600)}h atrás`;
}
