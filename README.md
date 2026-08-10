# 🚪 claudegate

Gateway local **multi-porta**, feito para o **Claude Code** e **uso universal**.

Cada porta ímpar é uma instância isolada que fala dois protocolos:
- **Anthropic Messages API** (`/v1/messages`) — para o Claude Code
- **OpenAI Chat Completions** (`/v1/chat/completions`, `/chat/completions`) — para qualquer projeto

Por baixo, cada instância traduz/repassa para o provider real que você configurar: OpenRouter, DeepSeek, xAI, Gemini-via-OpenAI-compat, ou qualquer outro endpoint OpenAI-compatible.

```
claudegate           (porta 4419, master + dashboard-mãe, em background)
   │
   ├── instância :4421  (gateway)  +  :4422  (dashboard de config)
   ├── instância :4423  (gateway)  +  :4424  (dashboard de config)
   ├── instância :4425  (gateway)  +  :4426  (dashboard de config)
   └── ... infinitas, criadas sob demanda
```

> Node.js puro. Sem dependências de runtime. Sem banco de dados. Tudo em memória.

---

## Por que portas separadas, e não um único roteador por modelo?

Porque o objetivo aqui não é "escolher o modelo por requisição" — é **isolar contas/credenciais por sessão de terminal**. Você abre `claude-4421` numa aba e está, na prática, "dentro" daquele provider/conta. Útil quando você tem várias chaves de várias contas e quer trocar de uma sessão pra outra sem editar nada.

---

## Instalação

```bash
git clone <este-repo>
cd claudegate
npm install
sudo npm install -g .                 (global)
```

Isso deixa o comando `claudegate` disponível em qualquer lugar do terminal.

## Primeiros passos

### 1. Suba o master (em background)

```bash
claudegate
```

```
🚪 claudegate master iniciado em background (PID 12345)
   Dashboard: http://127.0.0.1:4419
   Para parar: claudegate stop
   ✅ Master ativo e respondendo
```

O master roda em **background** — você não precisa manter a aba de terminal aberta. Para parar: `claudegate stop`.

O dashboard-mãe (`http://127.0.0.1:4419`) abre **automaticamente** no navegador padrão assim que o comando confirma que o master está ativo e respondendo (também abre se você rodar `claudegate` de novo com o master já no ar).

### 2. Crie uma instância

```bash
claudegate new
```

```
✅ nova instância criada
   gateway:   http://127.0.0.1:4421
   dashboard: http://127.0.0.1:4422  (configure o provider aqui)
   uso universal: OPENAI_API_KEY="gateway" OPENAI_BASE_URL="http://127.0.0.1:4421/v1"
```

Ou clique em **"+ nova instância"** no dashboard-mãe (`http://127.0.0.1:4419`).

A instância nasce **vazia** — sem provider configurado. Tentar usá-la nesse estado retorna erro `503` explicando o que falta.

### 3. Configure o provider e os modelos

Acesse `http://127.0.0.1:4422` (a porta par retornada acima) e preencha:

- **Nome** — só para identificação no dashboard
- **Base URL** — endpoint OpenAI-compatible do provider, sem `/chat/completions` no final (ex: `https://openrouter.ai/api/v1`)
- **API Key** — sua chave real desse provider
- **4 modelos** (mapa direto pros slots que o Claude Code respeita):
  - **Modelo principal** (`ANTHROPIC_MODEL`) — obrigatório
  - **Opus** (`ANTHROPIC_DEFAULT_OPUS_MODEL`) — opcional, cai pro principal se vazio
  - **Sonnet** (`ANTHROPIC_DEFAULT_SONNET_MODEL`) — opcional
  - **Haiku** (`ANTHROPIC_DEFAULT_HAIKU_MODEL`) — opcional

Há também um botão **"Buscar modelos disponíveis no provider"** que chama `GET /models` no endpoint configurado e lista todos os modelos como chips clicáveis — clique num chip para inseri-lo no campo de modelo em foco (não precisa adivinhar nome de modelo).

Salvar aplica a configuração **na hora** (hot-reload), sem reiniciar nada. A configuração (incluindo a chave) também é gravada em `~/.claudegate/providers.json`, associada à porta daquela instância — assim, se essa instância for encerrada e uma nova nascer na mesma porta, ela já volta configurada, sem precisar preencher tudo de novo.

### Cofre de Chaves API

Cada dashboard de instância também tem um **cofre de chaves** — uma lista de pares Base URL + API Key que você salva manualmente para reaproveitar depois, em qualquer instância. É gravado em `~/.claudegate/vault.json` e agrupado por Base URL: cada URL diferente é tratada como um provider/empresa separado, então chaves de contas diferentes de um mesmo provider, ou de providers totalmente diferentes, ficam sempre organizadas em grupos distintos. No dashboard, clique em **"usar"** numa entrada do cofre para preencher automaticamente os campos de Base URL e API Key do formulário de provider (depois é só clicar em "Salvar e ativar").

### 4. Ative (sem precisar abrir terminal!)

Clique em **"Ativar (install)"** no dashboard-mãe (`http://127.0.0.1:4419`) para gerar os atalhos de terminal. Não precisa abrir outro terminal para rodar `claudegate install` — tudo é feito direto pelo dashboard.

Ou, se preferir o terminal:

```bash
claudegate install
```

### 5. Use

**Para Claude Code:**

```bash
claude-4421
```

Isso roda o Claude Code real, com `ANTHROPIC_BASE_URL` apontando para `http://127.0.0.1:4421`. Tudo que você conversar ali passa pela instância 4421, que fala com o provider que você configurou nela.

Dentro do Claude Code, digite `/model` — vão aparecer até **4 opções** (os modelos que você configurou naquela porta). Pra trocar de modelo, é só selecionar outro no `/model`.

**Para uso universal (qualquer projeto OpenAI-compatible):**

```bash
export OPENAI_API_KEY="gateway"
export OPENAI_BASE_URL="http://127.0.0.1:4421/v1"
export OPENAI_MODEL="modelo_escolhido"
```

A senha `"gateway"` autentica no proxy local. O gateway substitui pela API key real ao repassar para o provider. O modelo pode ser qualquer um suportado pelo provider — não precisa ser um dos 4 slots configurados (esses são só para Claude Code).

---

## Gastos de tokens

Cada instância rastreia os tokens de entrada e saída processados. Essa informação aparece no dashboard individual de cada porta e é atualizada automaticamente a cada 5 segundos. Não há limites de tokens — o uso é livre do usuário. O rastreamento serve apenas para análise de gastos.

---

## Comandos

```
claudegate            Sobe o processo master (porta 4419) em background
claudegate new        Cria uma nova instância na próxima porta livre
claudegate status     Lista as instâncias ativas no momento
claudegate install    Gera/atualiza os atalhos claude-<porta> em ~/.claudegate/bin
claudegate stop       Para o processo master rodando em background
claudegate help       Mostra a ajuda
```

> `claudegate gateway` continua funcionando como alias, por compatibilidade — mas o jeito atual é simplesmente `claudegate`.

---

## Uso universal (OpenAI-compatible)

Além do protocolo Anthropic para Claude Code, cada porta também aceita requisições no formato OpenAI Chat Completions. Isso permite usar o claudegate como proxy para qualquer projeto que precise de API + URL + modelo:

| Variável | Valor |
|----------|-------|
| `OPENAI_API_KEY` | `"gateway"` (senha local para autenticação no proxy) |
| `OPENAI_BASE_URL` | `http://127.0.0.1:PORTA/v1` (porta da instância) |
| `OPENAI_MODEL` | Qualquer modelo suportado pelo provider |

O proxy recebe a requisição, verifica se a API key é `"gateway"`, substitui pela API key real configurada no dashboard, e repassa para o provider. A resposta volta diretamente no formato OpenAI — sem tradução.

---

## Como funciona por dentro

### O master (porta 4419)

Processo orquestrador. Roda em **background** (não bloqueia o terminal). Mantém em memória um registro de quais instâncias existem e os processos filhos correspondentes. Serve o dashboard-mãe (lista todas as instâncias, link para o dashboard de cada uma, botão de criar/encerrar/ativar).

### Cada instância (porta ímpar + porta par)

Roda como processo filho (`node:child_process.fork`), isolado do master e das outras instâncias. Sobe dois servidores HTTP no mesmo processo:

- **Gateway (ímpar):** aceita DOIS protocolos:
  - `POST /v1/messages` — formato Anthropic (para Claude Code)
  - `POST /v1/chat/completions` e `/chat/completions` — formato OpenAI (uso universal)
  - `GET /v1/models` e `/models` — lista modelos do provider (uso universal)
  - Sem provider configurado, responde `503` com mensagem explicando o que falta.
  - Com provider configurado, traduz/repassa a requisição para o provider real.
  - No modo universal, a autenticação é via senha `"gateway"` (Bearer token).
- **Dashboard (par):** serve o HTML de configuração (provider + até 4 modelos) e uma API local (`GET /api/state`, `POST /api/config`, `POST /api/models`, `POST /api/clear`, `POST /api/reset-tokens`) usada pelo próprio HTML via fetch. Também exibe estatísticas de tokens.

Nada é persistido em disco. Reiniciar o master mata todos os processos filhos — você recria as instâncias e reconfigura os providers do zero.

### Tradução de protocolo

Implementada do zero em `src/protocol.js` (request/response não-streaming) e `src/stream-translator.js` (streaming SSE), sem reaproveitar nenhuma lib externa. Cobre:

- Texto simples e blocos de conteúdo (`content: [...]`)
- Imagens (`type: "image"` com `source.type: "base64"`)
- Tool use / tool calls, nos dois sentidos, incluindo o caso de argumentos fragmentados em múltiplos chunks de streaming
- Tool results (viram mensagens `role: "tool"` em formato OpenAI)
- `system` prompt (Anthropic trata como campo separado; OpenAI como mensagem `role: "system"`)
- Mapeamento de `finish_reason` ↔ `stop_reason`

Para o modo universal (OpenAI-compatible), não há tradução — a requisição e resposta são repassadas diretamente, apenas substituindo a API key e o modelo quando necessário.

### Sem limites artificiais

O claudegate não impõe limite de tokens, não faz retry automático, não tem cooldown nem corte de uso. Ele repassa fielmente para o provider configurado — qualquer limite real (rate limit, contexto máximo, quota) vem do provider, não do gateway. O rastreamento de tokens é apenas informativo.

### Segurança

- Tudo escuta em `127.0.0.1` — nenhuma porta é exposta para a rede, só para a própria máquina
- A configuração de provider (incluindo a chave) é persistida em `~/.claudegate/providers.json`, por porta, e o cofre de chaves em `~/.claudegate/vault.json` — ambos arquivos locais em texto simples, nunca enviados a lugar nenhum
- Sem telemetria, sem chamadas externas além das que você configurar explicitamente
- No modo universal, a senha `"gateway"` é um segredo local — como o gateway só escuta em localhost, isso é suficiente para uso pessoal

---

## Estrutura do projeto

```
claudegate/
├── src/
│   ├── cli.js                # comando `claudegate` — parseia argumentos, background mode
│   ├── master.js              # processo master (porta 4419) + endpoint /install
│   ├── master-html.js         # HTML do dashboard-mãe
│   ├── instance.js            # processo filho (gateway Anthropic + OpenAI + dashboard)
│   ├── dashboard-html.js      # HTML do dashboard individual (com stats de tokens)
│   ├── registry.js            # registro em memória das instâncias (no master)
│   ├── protocol.js            # tradução Anthropic <-> OpenAI (request/response simples)
│   ├── stream-translator.js   # tradução de streaming SSE
│   ├── install.js             # gera os wrappers claude-<porta> (4 slots)
│   ├── persistence.js         # persistência em disco: provider por porta + cofre de chaves
│   └── types.js                # documentação de tipos via JSDoc
├── package.json
└── README.md
```

---

## Limitações conhecidas

- Só suporta providers **OpenAI-compatible** (cobre a grande maioria: OpenRouter, DeepSeek, xAI, Gemini via endpoint OpenAI-compat, Ollama local, etc). Providers nativamente Anthropic-compatible (Bedrock, Vertex) ainda não têm um modo dedicado.
- Os processos das instâncias não sobrevivem a um restart do master — decisão deliberada. A configuração de provider por porta e o cofre de chaves, porém, ficam salvos em disco (`~/.claudegate/`) e são recuperados automaticamente quando uma nova instância nasce na mesma porta.
- O wrapper `claude-<porta>` usa um `ANTHROPIC_AUTH_TOKEN` placeholder fixo — o gateway local não valida esse token; a autenticação real acontece entre a instância e o provider configurado, usando a API key que você salvou no dashboard daquela porta.
- O botão "Buscar modelos" depende do provider implementar `GET /models` no padrão OpenAI. A maioria implementa, mas alguns providers menores não — nesses casos, preencha os nomes de modelo manualmente.
- O `/model` do Claude Code só mostra até 4 opções (limitação do próprio Claude Code, não do claudegate). Se você configurar os 4 slots, todos aparecem; se deixar algum vazio, ele cai para o Modelo principal no wrapper.
- O rastreamento de tokens depende do provider retornar `usage` nas respostas. Alguns providers (especialmente em streaming) podem não retornar contagens precisas.

## Licença

MIT
