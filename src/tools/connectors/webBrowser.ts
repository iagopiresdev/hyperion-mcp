import { z } from "zod";
import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { logger } from "../../utils/logger";

const webLogger = logger.child({ component: "web-browser-tool" });

const MAX_CONTENT_LENGTH = 5000; // Limit content size for LLM context

/**
 * Simple function to strip HTML tags.
 * Note: This is a very basic implementation and might not handle all cases perfectly.
 * TODO: A more robust HTML parsing library could be used for better results.
 */
function stripHtml(html: string): string {
  let cleaned = html.replace(/<script[^>]*>.*?<\/script>/gis, "");
  cleaned = cleaned.replace(/<style[^>]*>.*?<\/style>/gis, "");
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  cleaned = cleaned.replace(/\s\s+/g, " ").trim();
  return cleaned;
}

const FetchWebpageParamsSchema = z.object({
  url: z.string().url("Invalid URL format. Must include http:// or https://"),
  output_format: z.enum(["text", "html"]).optional().default("text"),
});

async function fetchWebpageHandler(
  //FIXME: Create a proper signature required by registerTool
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const validationResult = FetchWebpageParamsSchema.safeParse(params);
  if (!validationResult.success) {
    webLogger.warn("Invalid parameters for fetch_webpage", {
      errors: validationResult.error.errors,
    });
    return {
      content: null,
      metadata: {
        error: `Invalid input: ${validationResult.error.errors
          .map((e) => e.message)
          .join(", ")}`,
      },
    };
  }
  const { url, output_format } = validationResult.data;

  webLogger.info(`Fetching webpage: ${url}`, { format: output_format });

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HyperionMCPBot/0.1; +https://github.com/your-repo/hyperion-mcp)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      webLogger.warn(`Failed to fetch ${url}: Status ${response.status}`);
      return {
        content: null,
        metadata: {
          url,
          status: response.status,
          error: `HTTP Error: ${response.statusText}`,
        },
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      webLogger.warn(
        `Skipping non-text/html content type: ${contentType} at ${url}`
      );
      return {
        content: null,
        metadata: {
          url,
          status: response.status,
          error: `Unsupported content type: ${contentType}`,
        },
      };
    }

    let rawContent = await response.text();
    let processedContent = "";

    if (output_format === "text") {
      processedContent = stripHtml(rawContent);
    } else {
      processedContent = rawContent;
    }

    const truncatedContent =
      processedContent.length > MAX_CONTENT_LENGTH
        ? processedContent.substring(0, MAX_CONTENT_LENGTH) + "... [truncated]"
        : processedContent;

    webLogger.info(`Successfully fetched and processed ${url}`);
    return {
      content: truncatedContent,
      metadata: {
        url,
        status: response.status,
        contentType,
        contentLength: processedContent.length,
        truncated: processedContent.length > MAX_CONTENT_LENGTH,
      },
    };
  } catch (error: any) {
    webLogger.error(`Error fetching or processing ${url}: ${error.message}`);
    return {
      content: null,
      metadata: {
        url,
        status: 500,
        error: `Network or processing error: ${error.message}`,
      },
    };
  }
}

registerTool(
  "fetch_webpage",
  "Fetches the content of a given URL. Returns text content by default.",
  {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The URL of the webpage to fetch (must include http:// or https://)",
        format: "uri",
      },
      output_format: {
        type: "string",
        description: "The desired output format.",
        enum: ["text", "html"],
        default: "text",
      },
    },
    required: ["url"],
  },
  fetchWebpageHandler,
  "protected",
  {
    category: "connectors",
    tags: ["web", "http", "fetch", "browse"],
  }
);
