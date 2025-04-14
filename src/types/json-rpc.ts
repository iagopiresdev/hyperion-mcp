/**
 * Core JSON-RPC 2.0 Type Definitions
 * Based on: https://www.jsonrpc.org/specification
 */

/**
 * Represents a JSON-RPC request identifier (string or number).
 * Note: The spec allows null, but MCP forbids null IDs for requests.
 * We allow null here for general JSON-RPC compatibility, but MCP logic should enforce non-null for requests.
 */
export type JsonRpcId = string | number | null;

/**
 * Represents the `params` part of a JSON-RPC request or notification.
 * Can be a structured object or an array.
 */
export type JsonRpcParams = Record<string, unknown> | unknown[];

/**
 * Represents a JSON-RPC Request object.
 */
export interface JsonRpcRequest<Params = JsonRpcParams> {
  jsonrpc: "2.0";
  method: string;
  params?: Params;
  id?: JsonRpcId; // Optional for notifications, required (non-null) for MCP requests
}

/**
 * Represents the `error` object within a JSON-RPC error response.
 */
export interface JsonRpcErrorObject<Data = unknown> {
  code: number; // Integer
  message: string;
  data?: Data; // Optional, can be anything
}

/**
 * Represents a successful JSON-RPC Response object.
 */
export interface JsonRpcSuccessResponse<Result = unknown> {
  jsonrpc: "2.0";
  result: Result;
  id: JsonRpcId; // Must match the request ID
}

/**
 * Represents an error JSON-RPC Response object.
 */
export interface JsonRpcErrorResponse<ErrorData = unknown> {
  jsonrpc: "2.0";
  error: JsonRpcErrorObject<ErrorData>;
  id: JsonRpcId; // Must match the request ID, or null if error occurred before ID was parsed
}

/**
 * Represents any valid JSON-RPC Response (success or error).
 */
export type JsonRpcResponse<Result = unknown, ErrorData = unknown> =
  | JsonRpcSuccessResponse<Result>
  | JsonRpcErrorResponse<ErrorData>;

/**
 * Represents a JSON-RPC Notification object.
 */
export interface JsonRpcNotification<Params = JsonRpcParams> {
  jsonrpc: "2.0";
  method: string;
  params?: Params;
  // No 'id' field
}
