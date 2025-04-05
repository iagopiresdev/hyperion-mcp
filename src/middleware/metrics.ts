import type { Context, MiddlewareHandler, Next } from "hono";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const metricsLogger = logger.child({ component: "metrics-middleware" });

/**
 * Middleware to track request performance
 */
export const requestMetrics: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const start = Date.now();
  const requestPath = c.req.path;
  const method = c.req.method;

  const endTracker = metrics.trackRequest();

  try {
    await next();

    const duration = Date.now() - start;

    metricsLogger.debug("Request completed", {
      path: requestPath,
      method,
      status: c.res.status,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    metrics.trackError(errorType);

    const contextData = {
      path: requestPath,
      method,
      errorType,
    };

    metricsLogger.error(
      "Request error",
      error instanceof Error ? error : undefined,
      contextData
    );

    throw error;
  } finally {
    endTracker();
  }
};

/**
 * Middleware to track tool execution metrics
 */
export const toolMetrics: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const path = c.req.path;
  const toolName = path.split("/").pop() || "unknown";

  const endTracker = metrics.trackTool(toolName);

  try {
    await next();
  } finally {
    endTracker();
  }
};

/**
 * Handler for exposing metrics data via API
 */
export const metricsHandler = (c: Context) => {
  return c.json(metrics.getMetrics());
};
