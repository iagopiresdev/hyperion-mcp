import { z } from "zod";
import type {
  HyperionClientOptions,
  ToolDefinition,
  ToolExecutionResponse,
} from "./types";

// --- Zod Schemas for Validation ---

const ToolParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.record(
    z
      .object({
        type: z.string(),
        description: z.string(),
      })
      .passthrough()
  ), // Allows additional properties like enum, default
  required: z.array(z.string()).optional(),
});

const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: ToolParametersSchema,
  permissionLevel: z.string().optional(), // Keep as string for now
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Schema for the response from the GET /tools endpoint
const ListToolsResponseSchema = z.object({
  tools: z.array(ToolDefinitionSchema),
});

// Schema for the response from the POST /tools endpoint (non-streaming)
const ToolExecutionResponseSchema = z.object({
  content: z.any(),
  metadata: z.record(z.any()).optional(),
});

// --- End of Zod Schemas ---

/**
 * Hyperion MCP Client
 *
 * Provides methods to interact with a Hyperion MCP server.
 */
export class HyperionClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImplementation: typeof fetch;

  /**
   * Creates an instance of HyperionClient.
   * @param options - Configuration options for the client.
   */
  constructor(options: HyperionClientOptions) {
    if (!options.baseUrl) {
      throw new Error("baseUrl is required");
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetch || globalThis.fetch;

    if (!this.fetchImplementation) {
      throw new Error(
        "Fetch API is not available. Please provide a fetch implementation."
      );
    }
  }

  /**
   * Constructs the full URL for an API endpoint.
   * @param path - The endpoint path (e.g., '/tools').
   * @returns The full URL.
   */
  private getUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * Creates the headers for an API request, including authentication.
   * @returns The headers object.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  /**
   * Lists the tools available on the server.
   * @returns A promise that resolves to an array of tool definitions.
   */
  async listTools(): Promise<ToolDefinition[]> {
    const url = this.getUrl("/tools"); // Assuming /tools endpoint
    const headers = this.getHeaders();

    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to list tools: ${response.statusText}`);
      }

      const rawData = await response.json();
      // Validate the response structure
      const validationResult = ListToolsResponseSchema.safeParse(rawData);
      if (!validationResult.success) {
        console.error(
          "Invalid data structure received from /tools:",
          validationResult.error.errors
        );
        throw new Error(
          `Invalid data structure received from /tools: ${validationResult.error.message}`
        );
      }

      // Return the validated data
      return validationResult.data.tools;
    } catch (error) {
      // Handle fetch errors and validation errors
      if (error instanceof z.ZodError) {
        // Error already logged by the validation block
      } else {
        console.error("Error listing tools:", error);
      }
      throw error; // Re-throw for the caller to handle
    }
  }

  /**
   * Executes a tool on the server.
   *
   * @param toolName - The name of the tool to execute.
   * @param input - The input parameters for the tool.
   * @returns A promise that resolves to the tool execution response.
   */
  async executeTool(
    toolName: string,
    input: Record<string, any>
  ): Promise<ToolExecutionResponse> {
    const url = this.getUrl("/tools");
    const headers = this.getHeaders();

    try {
      const response = await this.fetchImplementation(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: toolName,
          parameters: input,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to execute tool: ${response.status} ${response.statusText}`
        );
      }

      const rawData = await response.json();
      // Validate the response structure
      const validationResult = ToolExecutionResponseSchema.safeParse(rawData);
      if (!validationResult.success) {
        console.error(
          `Invalid data structure received from executing ${toolName}:`,
          validationResult.error.errors
        );
        throw new Error(
          `Invalid data structure received from executing ${toolName}: ${validationResult.error.message}`
        );
      }

      // Return the validated data, asserting its type
      return validationResult.data as ToolExecutionResponse;
    } catch (error) {
      // Handle fetch errors and validation errors
      if (error instanceof z.ZodError) {
        // Error already logged by the validation block
      } else {
        console.error(`Error executing tool ${toolName}:`, error);
      }
      throw error; // Re-throw for the caller to handle
    }
  }
}
