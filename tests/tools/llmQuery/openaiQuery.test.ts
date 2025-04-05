import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { openAIQueryHandler } from "../../../src/tools/llmQuery/openaiQuery";
import { config } from "../../../src/utils/config";

// Spy on the global fetch function
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

describe("Tool: openai_query (non-streaming)", () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    // Store original key and ensure it's set for most tests
    originalApiKey = config.apiKeys.openai;
    config.apiKeys.openai = originalApiKey || "test-api-key"; // Use original or a dummy key

    // Reset fetch mock before each test
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    // Restore original API key and fetch mock
    config.apiKeys.openai = originalApiKey;
    fetchSpy.mockRestore();
  });

  it("should call OpenAI API and return completion successfully", async () => {
    const params = { prompt: "Explain Bun in one sentence." };
    const mockApiResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1677652288,
      model: "gpt-3.5-turbo-0613",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              "Bun is a fast JavaScript runtime, bundler, transpiler, and package manager.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };

    // Mock successful fetch response
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    const response = await openAIQueryHandler(params); // Call without controller

    // Check that fetch was called correctly
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${config.apiKeys.openai}`,
        }),
        body: expect.any(String), // Check body structure more precisely if needed
      })
    );

    // Check the tool response
    expect(response.content).toEqual({
      completion: mockApiResponse.choices[0].message.content,
      model: mockApiResponse.model,
      usage: mockApiResponse.usage,
    });
    expect(response.metadata?.finishReason).toBe(
      mockApiResponse.choices[0].finish_reason
    );
  });

  it("should handle OpenAI API errors gracefully", async () => {
    const params = { prompt: "This will fail" };
    const mockApiError = {
      error: {
        message: "Invalid API key",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    };

    // Mock error fetch response
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiError), { status: 401 })
    );

    await expect(openAIQueryHandler(params)).rejects.toThrow(
      /OpenAI API error: 401/ // Check for status code in error message
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1); // Ensure fetch was still called
  });

  it("should throw an error if OpenAI API key is not configured", async () => {
    config.apiKeys.openai = undefined; // Unset the API key
    const params = { prompt: "Doesnt matter" };

    await expect(openAIQueryHandler(params)).rejects.toThrow(
      "OpenAI API key not configured"
    );

    expect(fetchSpy).not.toHaveBeenCalled(); // Fetch should NOT be called if key is missing
  });

  it("should pass optional parameters like model and temperature", async () => {
    const params = {
      prompt: "Test prompt",
      model: "gpt-4",
      temperature: 0.5,
      systemPrompt: "You are helpful.",
    };
    const mockApiResponse = {
      choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
      model: "gpt-4",
      usage: {},
    }; // Simplified

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    await openAIQueryHandler(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);

    expect(requestBody.model).toBe(params.model);
    expect(requestBody.temperature).toBe(params.temperature);
    expect(requestBody.messages[0].role).toBe("system");
    expect(requestBody.messages[0].content).toBe(params.systemPrompt);
    expect(requestBody.messages[1].role).toBe("user");
    expect(requestBody.messages[1].content).toBe(params.prompt);
  });
});

// TODO: Add tests for the streaming path
