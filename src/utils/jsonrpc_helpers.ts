import type {
  JsonRpcErrorObject,
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcSuccessResponse,
} from "../types/json-rpc";

/**
 * Creates a successful JSON-RPC response object.
 *
 * @param id The request ID.
 * @param result The result payload.
 * @returns A JsonRpcSuccessResponse object.
 */
export function createJsonRpcResponse<Result = unknown>(
  id: JsonRpcId,
  result: Result
): JsonRpcSuccessResponse<Result> {
  return {
    jsonrpc: "2.0",
    result,
    id,
  };
}

/**
 * Creates an error JSON-RPC response object.
 *
 * @param id The request ID (can be null if parsing failed before ID was read).
 * @param code The JSON-RPC error code.
 * @param message The error message.
 * @param data Optional error data.
 * @returns A JsonRpcErrorResponse object.
 */
export function createJsonRpcErrorResponse<ErrorData = unknown>(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: ErrorData
): JsonRpcErrorResponse<ErrorData> {
  const error: JsonRpcErrorObject<ErrorData> = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: "2.0",
    error,
    id,
  };
}
