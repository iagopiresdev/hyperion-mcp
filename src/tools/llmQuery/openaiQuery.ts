import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { config } from "../../utils/config";
import { logger } from "../../utils/logger";
import { StreamingToolResponse } from "../utils";

/**
 * A more sophisticated MCP tool that demonstrates integration with OpenAI API
 * This tool allows querying OpenAI models with various parameters
 */

const llmLogger = logger.child({ component: "openai-query" });

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
}

interface OpenAICompletionParams {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: any;
}

/**
 * Helper function to call the OpenAI API
 */
async function callOpenAI(params: OpenAICompletionParams): Promise<Response> {
  const apiKey = config.apiKeys.openai;

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
    );
  }

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });
}

/**
 * Handle OpenAI query in non-streaming mode
 */
async function handleNonStreaming(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    // Build the OpenAI request
    const messages: OpenAIMessage[] = [];

    // Add system prompt if provided
    if (params.systemPrompt) {
      messages.push({
        role: "system" as const,
        content: params.systemPrompt,
      });
    }

    // Add user prompt
    messages.push({
      role: "user" as const,
      content: params.prompt,
    });

    const openAIParams: OpenAICompletionParams = {
      model: params.model || "gpt-3.5-turbo",
      messages,
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
    };

    llmLogger.info("Sending request to OpenAI", { model: openAIParams.model });

    // Make the API call
    const response = await callOpenAI(openAIParams);

    if (!response.ok) {
      const errorText = await response.text();
      llmLogger.error("OpenAI API error", new Error(errorText));
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return {
      content: {
        completion: result.choices[0].message.content,
        model: result.model,
        usage: result.usage,
      },
      metadata: {
        finishReason: result.choices[0].finish_reason,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    llmLogger.error("Error querying OpenAI", error as Error);
    throw error;
  }
}

/**
 * Process OpenAI streaming response
 */
async function processStream(
  response: Response,
  streaming: StreamingToolResponse
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk and add it to our buffer
      buffer += decoder.decode(value, { stream: true });

      // Process each line in the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.trim() === "data: [DONE]") continue;

        // Lines should start with "data: "
        if (line.startsWith("data: ")) {
          try {
            // Parse the JSON content
            const json = JSON.parse(line.slice(6));

            if (
              json.choices &&
              json.choices[0].delta &&
              json.choices[0].delta.content
            ) {
              const content = json.choices[0].delta.content;
              fullText += content;

              // Send the chunk to the client
              streaming.send(
                {
                  delta: content,
                  text: fullText,
                },
                {
                  model: json.model,
                  partial: true,
                }
              );
            }
          } catch (e) {
            llmLogger.warn("Error parsing streaming response line", {
              line,
              error: e,
            });
          }
        }
      }
    }

    // Send final complete message
    streaming.complete(
      {
        completion: fullText,
      },
      {
        model: "gpt-3.5-turbo", // This would come from the final response in a real implementation
        timestamp: new Date().toISOString(),
      }
    );
  } catch (error) {
    llmLogger.error("Error processing stream", error as Error);
    streaming.error(error as Error);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle OpenAI query with streaming support
 */
async function openAIQueryHandler(
  params: Record<string, any>,
  controller?: TransformStreamDefaultController
): Promise<MCPToolResponse> {
  // If not streaming mode, use regular handler
  if (!controller) {
    return handleNonStreaming(params);
  }

  // Set up streaming
  const streaming = new StreamingToolResponse(controller);

  try {
    // Build the OpenAI request with streaming enabled
    const messages: OpenAIMessage[] = [];

    // Add system prompt if provided
    if (params.systemPrompt) {
      messages.push({
        role: "system" as const,
        content: params.systemPrompt,
      });
    }

    // Add user prompt
    messages.push({
      role: "user" as const,
      content: params.prompt,
    });

    const openAIParams: OpenAICompletionParams = {
      model: params.model || "gpt-3.5-turbo",
      messages,
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
      stream: true,
    };

    llmLogger.info("Sending streaming request to OpenAI", {
      model: openAIParams.model,
    });

    // Send initial status to client
    streaming.send({
      status: "started",
      model: openAIParams.model,
    });

    // Make the API call
    const response = await callOpenAI(openAIParams);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    // Process the streaming response
    await processStream(response, streaming);

    // This return is just for TypeScript, it won't actually be used
    // since we're streaming the response
    return {
      content: { status: "completed via streaming" },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error) {
    llmLogger.error("Error in streaming OpenAI query", error as Error);
    streaming.error(error as Error);
    throw error;
  }
}

// Register the tool with the registry
registerTool(
  "openai_query",
  "Query OpenAI models with various parameters",
  {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to send to the model",
      },
      systemPrompt: {
        type: "string",
        description: "Optional system prompt to set context for the model",
      },
      model: {
        type: "string",
        description: "The OpenAI model to use",
        enum: ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"],
        default: "gpt-3.5-turbo",
      },
      temperature: {
        type: "number",
        description: "Controls randomness (0-2, lower is more deterministic)",
        minimum: 0,
        maximum: 2,
        default: 0.7,
      },
      top_p: {
        type: "number",
        description: "Controls diversity via nucleus sampling",
        minimum: 0,
        maximum: 1,
        default: 1,
      },
      max_tokens: {
        type: "integer",
        description: "Maximum number of tokens to generate",
        minimum: 1,
        maximum: 4096,
        default: 1024,
      },
    },
    required: ["prompt"],
  },
  openAIQueryHandler,
  {
    category: "ai",
    tags: ["llm", "openai", "streaming"],
  }
);
