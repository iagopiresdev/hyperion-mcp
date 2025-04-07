import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { config } from "../../utils/config";
import { logger } from "../../utils/logger";
import { StreamingToolResponse } from "../utils";

/**
 * MCP tool for querying Anthropic models (Claude) via the Messages API.
 */

const llmLogger = logger.child({ component: "anthropic-query" });

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | any[]; // Can contain text or blocks (for images later)
}

interface AnthropicCompletionParams {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  metadata?: Record<string, any>; // Optional user metadata
  tool_choice?: {
    type: "auto" | "any" | "tool";
    name?: string;
  };
}

/**
 * Helper function to call the Anthropic Messages API
 */
async function callAnthropic(
  params: AnthropicCompletionParams
): Promise<Response> {
  const apiKey = config.apiKeys.anthropic;

  if (!apiKey) {
    throw new Error(
      "Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable."
    );
  }

  // Anthropic requires specific headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (params.stream) {
    headers["anthropic-beta"] = "messages-2023-12-15"; // Required for streaming
  }

  // Remove stream param before sending, as it's controlled by header
  const { stream, ...bodyParams } = params;

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...bodyParams, stream: params.stream }),
  });
}

/**
 * Handle Anthropic query in non-streaming mode
 */
async function handleNonStreaming(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    const messages: AnthropicMessage[] = [
      { role: "user", content: params.prompt },
    ];

    const anthropicParams: AnthropicCompletionParams = {
      model: params.model || "claude-3-haiku-20240307",
      messages,
      system: params.systemPrompt,
      max_tokens: params.max_tokens || 1024,
      temperature: params.temperature,
      top_p: params.top_p,
      top_k: params.top_k,
      metadata: params.metadata,
      stream: false,
      tool_choice: params.tool_choice,
    };

    llmLogger.info("Sending request to Anthropic", {
      model: anthropicParams.model,
    });

    const response = await callAnthropic(anthropicParams);

    if (!response.ok) {
      const errorText = await response.text();
      llmLogger.error(`Anthropic API error ${response.status}: ${errorText}`);
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return {
      content: {
        completion: result.content[0]?.text,
        model: result.model,
        usage: {
          prompt_tokens: result.usage?.input_tokens,
          completion_tokens: result.usage?.output_tokens,
        },
        stopReason: result.stop_reason,
      },
      metadata: {
        anthropicId: result.id,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      llmLogger.error("Error querying Anthropic", error as Error);
    }
    throw error;
  }
}

/**
 * Process Anthropic streaming response (Server-Sent Events)
 */
async function processStream(
  response: Response,
  streaming: StreamingToolResponse
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let currentEvent = "";
  let eventData: Record<string, any> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.substring(7).trim();
          eventData = {}; // Reset data for new event
        } else if (line.startsWith("data: ")) {
          try {
            const jsonData = JSON.parse(line.substring(6));
            eventData = { ...eventData, ...jsonData };

            switch (currentEvent) {
              case "message_start":
                streaming.send(
                  {
                    status: "started",
                    model: eventData.message?.model,
                    usage: {
                      prompt_tokens: eventData.message?.usage?.input_tokens,
                    },
                  },
                  {
                    anthropicId: eventData.message?.id,
                    partial: true,
                  }
                );
                break;
              case "content_block_delta":
                if (eventData.delta?.type === "text_delta") {
                  const textDelta = eventData.delta.text;
                  fullText += textDelta;
                  streaming.send(
                    {
                      delta: textDelta,
                      text: fullText,
                    },
                    {
                      partial: true,
                    }
                  );
                }
                break;
              case "message_delta":
                streaming.send(
                  {
                    usage: {
                      completion_tokens: eventData.usage?.output_tokens,
                    },
                  },
                  { partial: true }
                );
                break;
              case "message_stop":
                streaming.complete(
                  {
                    completion: fullText,
                    stopReason: eventData.message?.stop_reason,
                  },
                  {
                    usage: {
                      completion_tokens:
                        eventData.message?.usage?.output_tokens,
                    },
                    anthropicStopSequence: eventData.message?.stop_sequence,
                    timestamp: new Date().toISOString(),
                  }
                );
                break;

              case "ping":
                break; // Ignore pings
              case "error":
                llmLogger.error(
                  "Anthropic stream error event",
                  eventData.error
                );
                streaming.error(
                  eventData.error?.message || "Unknown streaming error"
                );
                break;
              default:
                llmLogger.warn("Unknown Anthropic stream event", {
                  event: currentEvent,
                });
            }
          } catch (e) {
            llmLogger.warn("Error parsing Anthropic stream data", {
              data: line.substring(6),
              error: e,
            });
          }
        }
      }
    }

    // If stream ended without message_stop, attempt completion
    if (!streaming["isComplete"]) {
      llmLogger.warn("Stream ended without explicit message_stop event");
      streaming.complete(
        { completion: fullText },
        { timestamp: new Date().toISOString() }
      );
    }
  } catch (error) {
    llmLogger.error("Error processing Anthropic stream", error as Error);
    streaming.error(error as Error);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle Anthropic query with streaming support
 */
export async function anthropicQueryHandler(
  params: Record<string, any>,
  controller?: TransformStreamDefaultController
): Promise<MCPToolResponse> {
  if (!controller) {
    return handleNonStreaming(params);
  }

  const streaming = new StreamingToolResponse(controller);

  try {
    const messages: AnthropicMessage[] = [
      { role: "user", content: params.prompt },
    ];

    const anthropicParams: AnthropicCompletionParams = {
      model: params.model || "claude-3-haiku-20240307",
      messages,
      system: params.systemPrompt,
      max_tokens: params.max_tokens || 1024,
      temperature: params.temperature,
      top_p: params.top_p,
      top_k: params.top_k,
      metadata: params.metadata,
      stream: true,
      tool_choice: params.tool_choice,
    };

    llmLogger.info("Sending streaming request to Anthropic", {
      model: anthropicParams.model,
    });

    const response = await callAnthropic(anthropicParams);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    await processStream(response, streaming);

    return {
      content: { status: "completed via streaming" },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      llmLogger.error("Error in streaming Anthropic query", error as Error);
    }
    streaming.error(error as Error);
    throw error;
  }
}

registerTool(
  "anthropic_query",
  "Query Anthropic (Claude) models via the Messages API",
  {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to send to the model",
      },
      systemPrompt: {
        type: "string",
        description: "Optional system prompt to set context",
      },
      model: {
        type: "string",
        description: "The Anthropic model ID to use",
        enum: [
          "claude-3-opus-20240229",
          "claude-3-sonnet-20240229",
          "claude-3-haiku-20240307",
          "claude-2.1",
          "claude-2.0",
          "claude-instant-1.2",
        ],
        default: "claude-3-haiku-20240307",
      },
      max_tokens: {
        type: "integer",
        description: "Maximum number of tokens to generate",
        minimum: 1,
        default: 1024,
      },
      temperature: {
        type: "number",
        description: "Controls randomness (0-1, higher is more random)",
        minimum: 0,
        maximum: 1,
        default: 0.7,
      },
      top_p: {
        type: "number",
        description: "Use nucleus sampling (alternative to temperature)",
        minimum: 0,
        maximum: 1,
      },
      top_k: {
        type: "integer",
        description: "Sample from the K most likely tokens",
        minimum: 1,
      },
      metadata: {
        type: "object",
        description: "Optional key-value metadata (e.g., user_id)",
        additionalProperties: true,
      },
      tool_choice: {
        type: "object",
        description:
          "How the model should use tools (if tools are provided elsewhere). 'auto', 'any', or {'type': 'tool', 'name': 'tool_name'}",
        properties: {
          type: { type: "string", enum: ["auto", "any", "tool"] },
          name: { type: "string" },
        },
        required: ["type"],
      },
    },
    required: ["prompt"],
  },
  anthropicQueryHandler,
  "public",
  {
    category: "ai",
    tags: ["llm", "anthropic", "claude", "streaming"],
  }
);
