// Tradução de streaming: o Claude Code consome Server-Sent Events no formato
// de eventos da Anthropic Messages API (message_start, content_block_start,
// content_block_delta, content_block_stop, message_delta, message_stop).
//
// A maioria dos provedores OpenAI-compatible manda streaming chunks no formato
// `data: {"choices":[{"delta":{...}}]}`. Esta classe consome esses chunks
// (já parseados, um JSON por vez) e emite, via callback, os eventos SSE prontos
// no formato Anthropic correspondente.

import { randomUUID } from "node:crypto";
import { mapFinishReason } from "./protocol.js";

export class StreamTranslator {
  /**
   * @param {(eventName: string, data: object) => void} emit - chamado para cada evento SSE a enviar
   * @param {string} requestedModel - nome do modelo pedido originalmente pelo Claude Code
   */
  constructor(emit, requestedModel) {
    this.emit = emit;
    this.requestedModel = requestedModel;
    this.messageId = `msg_${randomUUID()}`;
    this.started = false;
    /** índice do bloco de conteúdo atualmente aberto (texto ou tool_use) */
    this.currentBlockIndex = -1;
    /** "text" | "tool_use" | null — tipo do bloco atualmente aberto */
    this.currentBlockType = null;
    /** acumula argument-deltas de tool_calls por índice do OpenAI (podem chegar fragmentados) */
    this.toolCallBuffers = new Map();
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.finishReason = null;
  }

  /** Envia o evento inicial message_start. Idempotente. */
  _ensureStarted() {
    if (this.started) return;
    this.started = true;
    this.emit("message_start", {
      type: "message_start",
      message: {
        id: this.messageId,
        type: "message",
        role: "assistant",
        model: this.requestedModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
  }

  /** Fecha o bloco de conteúdo atualmente aberto, se houver. */
  _closeCurrentBlock() {
    if (this.currentBlockType === null) return;
    this.emit("content_block_stop", {
      type: "content_block_stop",
      index: this.currentBlockIndex,
    });
    this.currentBlockType = null;
  }

  /**
   * Processa um chunk JSON já parseado de streaming OpenAI-compatible.
   * @param {object} chunk
   */
  push(chunk) {
    this._ensureStarted();

    const choice = chunk.choices?.[0];

    // Processar usage ANTES do return pois o chunk final de usage nao tem choices
    if (chunk.usage) {
      this.inputTokens = chunk.usage.prompt_tokens ?? this.inputTokens;
      this.outputTokens = chunk.usage.completion_tokens ?? this.outputTokens;
    }

    const delta = choice.delta ?? {};

    // Texto incremental
    if (typeof delta.content === "string" && delta.content.length > 0) {
      if (this.currentBlockType !== "text") {
        this._closeCurrentBlock();
        this.currentBlockIndex += 1;
        this.currentBlockType = "text";
        this.emit("content_block_start", {
          type: "content_block_start",
          index: this.currentBlockIndex,
          content_block: { type: "text", text: "" },
        });
      }
      this.emit("content_block_delta", {
        type: "content_block_delta",
        index: this.currentBlockIndex,
        delta: { type: "text_delta", text: delta.content },
      });
    }

    // Tool calls incrementais — podem vir fragmentadas em vários chunks por índice
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const tcIndex = tc.index ?? 0;

        if (!this.toolCallBuffers.has(tcIndex)) {
          // Início de uma nova tool_call: fecha bloco anterior, abre bloco tool_use
          this._closeCurrentBlock();
          this.currentBlockIndex += 1;
          this.currentBlockType = "tool_use";

          const toolId = tc.id ?? `toolu_${randomUUID()}`;
          const toolName = tc.function?.name ?? "";

          this.toolCallBuffers.set(tcIndex, {
            blockIndex: this.currentBlockIndex,
            id: toolId,
            name: toolName,
          });

          this.emit("content_block_start", {
            type: "content_block_start",
            index: this.currentBlockIndex,
            content_block: { type: "tool_use", id: toolId, name: toolName, input: {} },
          });
        }

        const argsFragment = tc.function?.arguments;
        if (typeof argsFragment === "string" && argsFragment.length > 0) {
          const buf = this.toolCallBuffers.get(tcIndex);
          this.emit("content_block_delta", {
            type: "content_block_delta",
            index: buf.blockIndex,
            delta: { type: "input_json_delta", partial_json: argsFragment },
          });
        }
      }
    }

    if (choice.finish_reason) {
      this.finishReason = choice.finish_reason;
    }
  }

  /** Finaliza o stream: fecha bloco aberto e emite message_delta + message_stop. */
  finish() {
    this._ensureStarted();
    this._closeCurrentBlock();

    this.emit("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: mapFinishReason(this.finishReason),
        stop_sequence: null,
      },
      usage: { output_tokens: this.outputTokens },
    });

    this.emit("message_stop", { type: "message_stop" });
  }
}
