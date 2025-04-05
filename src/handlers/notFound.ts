import type { Context } from "hono";
import { logger } from "../utils/logger";

const notFoundLogger = logger.child({ component: "not-found-handler" });

/**
 * Handle 404 Not Found responses
 */
export const notFound = (c: Context) => {
  const path = c.req.path;
  notFoundLogger.debug(`Not found: ${path}`);

  return c.json(
    {
      error: `Not found: ${path}`,
      message: "The requested resource does not exist",
      timestamp: new Date().toISOString(),
    },
    404
  );
};
