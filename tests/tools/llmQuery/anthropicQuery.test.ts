import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { anthropicQueryHandler } from "../../../src/tools/llmQuery/anthropicQuery";
import { config } from "../../../src/utils/config";

// Spy on the global fetch function because anthropicQueryHandler uses fetch
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

describe("Tool: anthropic_query (non-streaming)", () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = config.apiKeys.anthropic;
    config.apiKeys.anthropic = originalApiKey || "test-anthropic-key";

    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    config.apiKeys.anthropic = originalApiKey;
    fetchSpy.mockRestore();
  });

  it("should call Anthropic API and return completion successfully", async () => {
    const params = { prompt: "Why is the sky blue?" };
    const mockApiResponse = {
      id: "msg_01X1Y1Z1",
      type: "message",
      role: "assistant",
      model: "claude-3-haiku-20240307",
      content: [{ type: "text", text: "Because of Rayleigh scattering." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 15, output_tokens: 10 },
    };

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    const response = await anthropicQueryHandler(params); // Non-streaming call

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": config.apiKeys.anthropic,
          "anthropic-version": "2023-06-01",
        }),
        body: expect.stringContaining('"stream":false'),
      })
    );

    expect(response.content).toEqual({
      completion: mockApiResponse.content[0].text,
      model: mockApiResponse.model,
      usage: {
        prompt_tokens: mockApiResponse.usage.input_tokens,
        completion_tokens: mockApiResponse.usage.output_tokens,
      },
      stopReason: mockApiResponse.stop_reason,
    });
    expect(response.metadata?.anthropicId).toBe(mockApiResponse.id);
  });

  it("should handle Anthropic API errors gracefully", async () => {
    const params = { prompt: "This will fail" };
    const mockApiError = {
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid API key",
      },
    };

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiError), { status: 401 })
    );

    expect(anthropicQueryHandler(params)).rejects.toThrow(
      /Anthropic API error: 401/
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should throw an error if Anthropic API key is not configured", async () => {
    config.apiKeys.anthropic = undefined;
    const params = { prompt: "No key" };

    expect(anthropicQueryHandler(params)).rejects.toThrow(
      "Anthropic API key not configured"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should pass optional parameters correctly", async () => {
    const params = {
      prompt: "Test prompt",
      model: "claude-3-sonnet-20240229",
      temperature: 0.2,
      systemPrompt: "You are concise.",
      max_tokens: 50,
      metadata: { user_id: "user-123" },
    };
    const mockApiResponse = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Concise." }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 10, output_tokens: 50 },
    };

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    await anthropicQueryHandler(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);

    expect(requestBody.model).toBe(params.model);
    expect(requestBody.temperature).toBe(params.temperature);
    expect(requestBody.system).toBe(params.systemPrompt);
    expect(requestBody.max_tokens).toBe(params.max_tokens);
    expect(requestBody.metadata).toEqual(params.metadata);
    expect(requestBody.messages[0].role).toBe("user");
    expect(requestBody.messages[0].content).toBe(params.prompt);
  });
});

// TODO: Add tests for the streaming path
