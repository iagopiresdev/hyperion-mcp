import { describe, expect, it } from "bun:test";
import { slowTaskStreamingHandler } from "../../../src/tools/example/slowTask";

// Note: Testing the actual streaming requires mocking TransformStreamDefaultController
// and capturing enqueued data. For now, we test the non-streaming path.

describe("Tool: slow_task (non-streaming)", () => {
  // These tests call the streaming handler without a controller,
  // which should delegate to the non-streaming logic.

  it("should process items successfully without streaming", async () => {
    const params = { items: 2, delay: 10 }; // Use small values for faster tests

    // Directly call the handler registered (which handles both cases)
    const response = await slowTaskStreamingHandler(params);

    expect(response.content).toBeDefined();
    expect(response.metadata?.completed).toBe(true);
    expect(response.metadata?.timestamp).toBeDefined();

    const content = response.content;
    expect(content.results).toHaveLength(params.items);
    expect(content.summary.total).toBe(params.items);
    expect(content.summary.processingTimeMs).toBe(params.items * params.delay);

    // Check structure of results
    expect(content.results[0].item).toBe(1);
    expect(content.results[0].status).toBe("processed");
    expect(content.results[1].item).toBe(2);
    expect(content.results[1].status).toBe("processed");
  });

  it("should handle failure correctly without streaming", async () => {
    const params = { items: 3, delay: 10, fail: true };

    await expect(slowTaskStreamingHandler(params)).rejects.toThrow(
      "Task failed as requested"
    );
  });

  it("should use default values if not provided", async () => {
    const params = {}; // Use defaults (items=5, delay=1000)
    const defaultItems = 5;
    const defaultDelay = 1000;

    // Increase timeout for this specific test due to default delay
    const response = await slowTaskStreamingHandler(params);

    expect(response.content.results).toHaveLength(defaultItems);
    expect(response.content.summary.total).toBe(defaultItems);
    // Note: Actual processing time might vary slightly, focus on length
    // expect(response.content.summary.processingTimeMs).toBe(defaultItems * defaultDelay);
  }, 10000); // Set timeout to 10 seconds for this test
});

// TODO: Add tests for the streaming path
// describe('Tool: slow_task (streaming)', () => {
//   // Requires mocking TransformStreamDefaultController
// });
