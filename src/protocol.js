// Tradução de protocolo Anthropic Messages API <-> OpenAI-compatible Chat Completions.
//
// O Claude Code fala SOMENTE o formato Anthropic (/v1/messages) com o cliente.
// A maioria dos provedores reais (OpenRouter, DeepSeek, xAI, etc) fala formato
// OpenAI (/chat/completions). Este módulo faz a ponte nos dois sentidos:
//   - anthropicRequestToOpenAI: request que chega do Claude Code -> request pro provider
//   - openAIResponseToAnthropic: resposta do provider (não-streaming) -> resposta pro Claude Code
//   - StreamTranslator: tradução de streaming SSE, que é o modo padrão do Claude Code

import { randomUUID } from "node:crypto";

/**
 * Converte um request no formato Anthropic Messages API para o formato
 * OpenAI Chat Completions.
 *
 * @param {object} anthropicReq - body recebido em /v1/messages
 * @param {string} model - nome do modelo a usar no provider de destino
 * @returns {object} body pronto para enviar ao provider OpenAI-compatible
 */
export function anthropicRequestToOpenAI(anthropicReq, model) {
  const messages = [];

  // Anthropic trata "system" como campo separado; OpenAI trata como mensagem role:"system"
  if (anthropicReq.system) {
    const systemText = Array.isArray(anthropicReq.system)
      ? anthropicReq.system.map((block) => block.text ?? "").join("\n")
      : anthropicReq.system;
    if (systemText) {
      messages.push({ role: "system", content: systemText });
    }
  }

  for (const msg of anthropicReq.messages ?? []) {
    messages.push(...anthropicMessageToOpenAI(msg));
  }

  /** @type {object} */
  const openAIReq = {
    model,
    messages,
    stream: Boolean(anthropicReq.stream),
  };

  if (typeof anthropicReq.max_tokens === "number") {
    openAIReq.max_tokens = anthropicReq.max_tokens;
  }
  if (typeof anthropicReq.temperature === "number") {
    openAIReq.temperature = anthropicReq.temperature;
  }
  if (typeof anthropicReq.top_p === "number") {
    openAIReq.top_p = anthropicReq.top_p;
  }
  if (Array.isArray(anthropicReq.stop_sequences) && anthropicReq.stop_sequences.length > 0) {
    openAIReq.stop = anthropicReq.stop_sequences;
  }

  // Tools: Anthropic usa input_schema, OpenAI usa parameters dentro de function
  if (Array.isArray(anthropicReq.tools) && anthropicReq.tools.length > 0) {
    openAIReq.tools = anthropicReq.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.input_schema ?? { type: "object", properties: {} },
      },
    }));

    if (anthropicReq.tool_choice) {
      openAIReq.tool_choice = anthropicToolChoiceToOpenAI(anthropicReq.tool_choice);
    }
  }

  return openAIReq;
}

/**
 * @param {object} toolChoice
 */
function anthropicToolChoiceToOpenAI(toolChoice) {
  if (toolChoice.type === "auto") return "auto";
  if (toolChoice.type === "any") return "required";
  if (toolChoice.type === "tool" && toolChoice.name) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return "auto";
}

/**
 * Converte uma única mensagem Anthropic (que pode ter content em blocos) para
 * uma ou mais mensagens OpenAI. Necessário porque tool_result em Anthropic vira
 * uma mensagem role:"tool" separada em OpenAI.
 *
 * @param {object} msg
 * @returns {object[]}
 */
function anthropicMessageToOpenAI(msg) {
  // Conteúdo simples (string) — caso mais comum em mensagens de usuário sem tools
  if (typeof msg.content === "string") {
    return [{ role: msg.role, content: msg.content }];
  }

  if (!Array.isArray(msg.content)) {
    return [{ role: msg.role, content: "" }];
  }

  const textParts = [];
  const toolCalls = [];
  const toolResultMessages = [];
  const imageParts = [];

  for (const block of msg.content) {
    switch (block.type) {
      case "text":
        textParts.push(block.text ?? "");
        break;

      case "image":
        // Anthropic: { type: "image", source: { type: "base64", media_type, data } }
        // OpenAI: { type: "image_url", image_url: { url: "data:<media_type>;base64,<data>" } }
        if (block.source?.type === "base64") {
          imageParts.push({
            type: "image_url",
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        }
        break;

      case "tool_use":
        // Vira um tool_call dentro da mensagem assistant
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
        break;

      case "tool_result": {
        // Vira uma mensagem role:"tool" separada, referenciando tool_call_id
        const resultContent = Array.isArray(block.content)
          ? block.content.map((c) => c.text ?? "").join("\n")
          : (block.content ?? "");
        toolResultMessages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: typeof resultContent === "string" ? resultContent : JSON.stringify(resultContent),
        });
        break;
      }

      default:
        // Tipo de bloco desconhecido: ignora silenciosamente em vez de quebrar a request
        break;
    }
  }

  const result = [];

  // Se há tool_results, eles formam mensagens próprias (role:"tool") e não se misturam
  // com texto/tool_calls do mesmo bloco de content nesse caso de uso do Claude Code.
  if (toolResultMessages.length > 0) {
    result.push(...toolResultMessages);
  }

  if (textParts.length > 0 || imageParts.length > 0 || toolCalls.length > 0) {
    /** @type {object} */
    const message = { role: msg.role };

    if (imageParts.length > 0) {
      // Conteúdo multimodal: precisa ser array de parts, não string simples
      const parts = [];
      if (textParts.length > 0) parts.push({ type: "text", text: textParts.join("\n") });
      parts.push(...imageParts);
      message.content = parts;
    } else {
      message.content = textParts.join("\n");
    }

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
      if (!message.content) message.content = null;
    }

    result.push(message);
  }

  return result;
}

/**
 * Converte uma resposta NÃO-streaming do formato OpenAI Chat Completions
 * para o formato Anthropic Messages API.
 *
 * @param {object} openAIRes
 * @param {string} requestedModel - nome do modelo originalmente pedido pelo Claude Code
 * @returns {object}
 */
export function openAIResponseToAnthropic(openAIRes, requestedModel) {
  const choice = openAIRes.choices?.[0];
  const message = choice?.message ?? {};

  const contentBlocks = [];

  if (message.content) {
    contentBlocks.push({ type: "text", text: message.content });
  }

  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(call.function?.arguments ?? "{}");
      } catch {
        input = {};
      }
      contentBlocks.push({
        type: "tool_use",
        id: call.id ?? `toolu_${randomUUID()}`,
        name: call.function?.name ?? "",
        input,
      });
    }
  }

  return {
    id: openAIRes.id ?? `msg_${randomUUID()}`,
    type: "message",
    role: "assistant",
    model: requestedModel,
    content: contentBlocks,
    stop_reason: mapFinishReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: openAIRes.usage?.prompt_tokens ?? 0,
      output_tokens: openAIRes.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * @param {string|undefined} reason
 */
function mapFinishReason(reason) {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "content_filter":
      return "end_turn";
    default:
      return "end_turn";
  }
}

export { mapFinishReason };
