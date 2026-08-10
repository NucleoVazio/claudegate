/**
 * @typedef {Object} ProviderConfig
 * @property {"openai-compatible"} type      - Tipo do provider (por enquanto só este é suportado)
 * @property {string} baseUrl                  - URL base da API do provider (ex: https://openrouter.ai/api/v1)
 * @property {string} apiKey                   - Chave de API principal do provider
 * @property {string[]} apiKeys                - Chaves de API extras, com o mesmo acesso ao mesmo baseUrl/modelos da apiKey principal. Usadas em rodízio (round-robin) junto com apiKey para distribuir requisições entre várias contas/chaves na mesma porta.
 * @property {string} label                    - Nome amigável exibido no dashboard
 * @property {string} defaultModel             - Modelo principal — obrigatório. Mapeia para ANTHROPIC_MODEL no wrapper.
 * @property {string} opusModel                - Modelo para o tier "opus" do /model do Claude Code. Vazio cai para defaultModel no wrapper.
 * @property {string} sonnetModel              - Modelo para o tier "sonnet". Vazio cai para defaultModel.
 * @property {string} haikuModel               - Modelo para o tier "haiku". Vazio cai para defaultModel.
 */

/**
 * @typedef {Object} InstanceState
 * @property {number} port                     - Porta ímpar do gateway desta instância
 * @property {number} dashboardPort            - Porta par do dashboard desta instância
 * @property {ProviderConfig|null} provider    - Configuração do provider, ou null se ainda não configurada
 * @property {number} createdAt                - Timestamp de criação (epoch ms)
 * @property {number} requestCount             - Total de requisições recebidas
 * @property {number} errorCount               - Total de requisições que resultaram em erro
 * @property {string|null} lastError           - Mensagem do último erro ocorrido
 * @property {number|null} lastRequestAt       - Timestamp da última requisição recebida
 * @property {number} totalInputTokens         - Total de tokens de entrada (input) processados
 * @property {number} totalOutputTokens        - Total de tokens de saída (output) processados
 */

// Este arquivo não exporta nada em runtime — serve apenas como documentação
// de tipos via JSDoc, consumida pelo editor/linter. Mantido em .js (não .ts)
// porque o projeto não usa um passo de build (Node puro, sem TypeScript).
export {};
