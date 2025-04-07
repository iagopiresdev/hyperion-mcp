import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { config } from "../../utils/config";
import { logger } from "../../utils/logger";
import { getPineconeIndex } from "../../utils/pineconeClient";

const isPineconeEnabled = !!(
  process.env.PINECONE_API_KEY &&
  config.pinecone.indexName &&
  config.apiKeys.openai
);

const searchLogger = logger.child({ component: "pinecone-search" });

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface OpenAIEmbeddingResponse {
  object: string;
  data: {
    object: string;
    embedding: number[];
    index: number;
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generates an embedding for the given text using the OpenAI API.
 * @param text The text to embed.
 * @param model The embedding model to use.
 * @returns The embedding vector.
 */
export async function generateOpenAIEmbedding(
  text: string,
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) {
    searchLogger.error("OpenAI API key not configured for embeddings.");
    throw new Error("OpenAI API key not configured.");
  }

  searchLogger.info(`Generating embedding for text using model: ${model}`);
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: model,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      searchLogger.error(
        `OpenAI Embeddings API error (${response.status}): ${errorBody}`
      );
      throw new Error(
        `OpenAI Embeddings API error: ${response.status} ${errorBody}`
      );
    }

    const result = (await response.json()) as OpenAIEmbeddingResponse;

    if (!result.data || result.data.length === 0 || !result.data[0].embedding) {
      searchLogger.error(
        `Invalid response structure from OpenAI Embeddings API: ${JSON.stringify(
          result
        )}`
      );
      throw new Error("Failed to get embedding from OpenAI API response.");
    }

    searchLogger.info(
      `Successfully generated embedding. Usage: ${result.usage.total_tokens} tokens.`
    );
    return result.data[0].embedding;
  } catch (error) {
    searchLogger.error("Failed to call OpenAI Embeddings API", error as Error);
    throw error;
  }
}

/**
 * Handles semantic search requests using Pinecone.
 */
export async function pineconeSearchHandler(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const queryText = params.query as string;
  const topK = (params.top_k as number) || 5;
  const pineconeIndexName = config.pinecone.indexName;

  if (!queryText || typeof queryText !== "string") {
    throw new Error(
      "Missing or invalid 'query' parameter (string) is required."
    );
  }
  if (typeof topK !== "number" || topK <= 0) {
    throw new Error("'top_k' parameter must be a positive number.");
  }
  if (!pineconeIndexName) {
    searchLogger.error("Pinecone index name not configured.");
    throw new Error(
      "Pinecone index name not configured. Set PINECONE_INDEX_NAME environment variable."
    );
  }

  searchLogger.info(
    `Received Pinecone search request: query="${queryText}", topK=${topK}, index=${pineconeIndexName}`
  );

  try {
    // 1. Get the Pinecone index
    const index = getPineconeIndex(pineconeIndexName);

    // 2. Generate embedding for the query
    // TODO: Make embedding model configurable
    const queryEmbedding = await generateOpenAIEmbedding(queryText);

    if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
      // This check might be overly strict depending on model variations
      searchLogger.warn(
        `Generated embedding dimension (${queryEmbedding.length}) differs from expected (${EMBEDDING_DIMENSIONS}) for index ${pineconeIndexName}`
      );
    }

    // 3. Query Pinecone
    searchLogger.info(`Querying Pinecone index ${pineconeIndexName}...`);
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true, // Fetch metadata associated with vectors
      includeValues: false, // Usually don't need the vectors themselves back
      // TODO: Add metadata filtering based on params.filter if implemented
    });
    searchLogger.info(
      `Pinecone query completed. Found ${
        queryResponse.matches?.length ?? 0
      } matches.`
    );

    // 4. Format results
    const results =
      queryResponse.matches?.map((match) => ({
        id: match.id,
        score: match.score,
        // Assuming metadata contains the original text or relevant info
        metadata: match.metadata,
        // You might want to explicitly pull 'text' from metadata if stored there
        // text: match.metadata?.text as string | undefined
      })) || [];

    return {
      content: {
        results: results,
      },
      metadata: {
        indexName: pineconeIndexName,
        modelUsed: DEFAULT_EMBEDDING_MODEL, // TODO: Reflect actual model if configurable
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    searchLogger.error("Error during Pinecone search:", error as Error);
    throw error;
  }
}

const parametersSchema = {
  type: "object" as const,
  properties: {
    query: {
      type: "string" as const,
      description: "The natural language query to search for.",
    },
    top_k: {
      type: "number" as const,
      description: "The number of top results to return (default: 5).",
    },
    //TODO: Potential future filters based on metadata could be added here
    // filter: {
    //     type: "object",
    //     description: "Metadata filter to apply during search (Pinecone filter syntax).",
    // }
  },
  required: ["query"],
};

const registrationOptions = {
  category: "search",
  tags: ["vector", "pinecone", "search", "query", "embedding"],
  enabled: isPineconeEnabled,
};

registerTool(
  "pinecone_semantic_search",
  "Performs semantic search on a knowledge base using Pinecone vector database.",
  parametersSchema,
  pineconeSearchHandler,
  undefined,
  registrationOptions
);

searchLogger.info("Pinecone semantic search tool registered.");
