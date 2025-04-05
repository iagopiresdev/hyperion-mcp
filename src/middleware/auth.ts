import type { Context, MiddlewareHandler, Next } from "hono";
import { toolRegistry } from "../registry";
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
 * Authentication middleware that validates API keys and sets auth context
 */
export const authentication: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  try {
    const client = authService.authenticate(c.req.raw.headers);

    c.set("auth", {
      isAuthenticated: !!client,
      clientId: client?.id,
      clientName: client?.name,
      permissions: client?.permissions,
    });

    if (client) {
      authLogger.debug("Request authenticated", {
        clientId: client.id,
        permissions: client.permissions,
        path: c.req.path,
      });
    } else {
      authLogger.debug("Unauthenticated request", {
        path: c.req.path,
      });
    }

    await next();
  } catch (error) {
    authLogger.error("Authentication error", error as Error);
    return c.json({ error: "Authentication failed" }, 401);
  }
};

/**
 * Authorization middleware that checks permissions for tool access
 */
export const toolAuthorization: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  // TODO: This is a temporary solution, we need to add a proper permission system
  if (c.req.path !== "/tools" || c.req.method !== "POST") {
    await next();
    return;
  }

  try {
    const auth = c.get("auth") as AuthContext["auth"];

    const body = await c.req.json();
    const toolName = body.name;

    if (!toolName) {
      return c.json({ error: "Tool name is required" }, 400);
    }

    const tool = toolRegistry.getToolDefinition(toolName);

    if (!tool) {
      return c.json(
        {
          error: `Unknown tool: ${toolName}`,
          availableTools: toolRegistry.getAllTools().map((t) => t.name),
        },
        404
      );
    }

    const requiredPermission = tool.permissionLevel || "public";

    const hasPermission = authService.hasPermission(
      auth.isAuthenticated
        ? {
            id: auth.clientId!,
            name: auth.clientName!,
            permissions: auth.permissions as any,
          }
        : null,
      requiredPermission
    );

    if (!hasPermission) {
      authLogger.warn("Unauthorized tool access attempt", {
        toolName,
        clientId: auth.clientId,
        requiredPermission,
      });

      return c.json(
        {
          error: `Access denied: insufficient permissions to use the '${toolName}' tool`,
          requiredPermission,
        },
        403
      );
    }

    await next();
  } catch (error) {
    authLogger.error("Authorization error", error as Error);
    return c.json({ error: "Authorization failed" }, 403);
  }
};
