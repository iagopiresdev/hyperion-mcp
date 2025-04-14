import type {
  ListResourcesRequestParams,
  ListResourcesResponse,
  McpResource,
  McpResourceContent,
  ReadResourceRequestParams,
  ReadResourceResponse,
} from "../mcp/types";
import type { JsonRpcErrorResponse, JsonRpcId } from "../types/json-rpc";
import {
  createJsonRpcErrorResponse,
  createJsonRpcResponse,
} from "../utils/jsonrpc_helpers";

//TODO: Replace with actual resources
const mockResources: McpResource[] = [
  {
    uri: "file:///home/user/docs/example.txt",
    name: "Example Document",
    description: "A sample text document.",
    mimeType: "text/plain",
  },
  {
    uri: "config:///app/settings.json",
    name: "Application Settings",
    description: "Core configuration file for the application.",
    mimeType: "application/json",
  },
  {
    uri: "image:///logo.png",
    name: "Company Logo",
    mimeType: "image/png",
  },
];

const mockResourceContents: Record<string, McpResourceContent[]> = {
  "file:///home/user/docs/example.txt": [
    {
      uri: "file:///home/user/docs/example.txt",
      mimeType: "text/plain",
      text: "This is the content of the example text document.\nIt has multiple lines.",
    },
  ],
  "config:///app/settings.json": [
    {
      uri: "config:///app/settings.json",
      mimeType: "application/json",
      text: JSON.stringify(
        { theme: "dark", fontSize: 14, autoSave: true },
        null,
        2
      ),
    },
  ],
  "image:///logo.png": [
    {
      uri: "image:///logo.png",
      mimeType: "image/png",
      //TODO: Placeholder base64 string for a small PNG
      blob: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    },
  ],
};

/**
 * Handles the 'resources/list' MCP method.
 * Returns a static list of available resources.
 */
export function handleListResources(
  params: ListResourcesRequestParams, // Currently unused
  requestId: JsonRpcId
): Promise<ListResourcesResponse | JsonRpcErrorResponse> {
  console.log(`Handling resources/list request (ID: ${requestId})`);
  //TODO: Filter resources based on permissions or context
  return Promise.resolve(
    createJsonRpcResponse(requestId, {
      resources: mockResources,
    })
  );
}

/**
 * Handles the 'resources/read' MCP method.
 * Returns the content for a requested resource URI.
 */
export function handleReadResource(
  params: ReadResourceRequestParams,
  requestId: JsonRpcId
): Promise<ReadResourceResponse | JsonRpcErrorResponse> {
  const { uri } = params;
  console.log(
    `Handling resources/read request for URI: ${uri} (ID: ${requestId})`
  );

  const content = mockResourceContents[uri];

  if (content) {
    return Promise.resolve(
      createJsonRpcResponse(requestId, {
        contents: content,
      })
    );
  } else {
    console.warn(`Resource not found for URI: ${uri} (ID: ${requestId})`);
    return Promise.resolve(
      createJsonRpcErrorResponse(
        requestId,
        -32602,
        `Resource not found: ${uri}`
      )
    );
  }
}
