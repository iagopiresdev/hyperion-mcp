import type { Context, MiddlewareHandler, Next } from "hono";
import type { PermissionLevel } from "../utils/auth";
import { authService } from "../utils/auth";
import { logger } from "../utils/logger";

const authLogger = logger.child({ component: "auth-middleware" });

/**
 * Context extension for authenticated requests
 */
export interface AuthContext {
  auth: {
    isAuthenticated: boolean;
    clientId?: string;
    clientName?: string;
    permissions?: string;
  };
}

/**
 * Extracts credentials (API Key/Bearer Token and Client ID) from headers.
 */
function extractClientCredentials(headers: Headers): {
  key: string | null;
  clientId: string | null;
} {
  let key: string | null = null;
  const authHeader = headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    key = authHeader.slice(7).trim() || null;
  }

  // Extract Client ID from custom header (case-insensitive)
  const clientId =
    headers.get("X-Client-ID") || headers.get("x-client-id") || null;

  if (key && !clientId) {
    authLogger.warn(
      "Bearer token provided without X-Client-ID header. Authentication will likely fail."
    );
  }
  if (!key && clientId) {
    authLogger.warn(
      "X-Client-ID header provided without Bearer token. Authentication will likely fail."
    );
  }

  return { key, clientId };
}

/**
 * Authentication middleware that validates API keys/Client ID and sets auth context
 */
export const authentication: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  try {
    const { key, clientId } = extractClientCredentials(c.req.raw.headers);

    const client = await authService.authenticate(clientId, key);

    c.set("auth", {
      isAuthenticated: !!client,
      clientId: client?.id,
      clientName: client?.name,
      permissions: client?.permissions as PermissionLevel,
    });

    if (client) {
      authLogger.debug("Request authenticated", {
        clientId: client.id,
        permissions: client.permissions,
        path: c.req.path,
      });
    } else if (key || clientId) {
      authLogger.debug("Authentication failed for provided credentials", {
        hasKey: !!key,
        clientIdProvided: clientId,
        path: c.req.path,
      });
    } else {
      authLogger.debug("Unauthenticated request", {
        path: c.req.path,
      });
    }

    await next();
  } catch (error) {
    authLogger.error("Authentication middleware error", error as Error);
    return c.json({ error: "Authentication failed due to server error" }, 500);
  }
};
