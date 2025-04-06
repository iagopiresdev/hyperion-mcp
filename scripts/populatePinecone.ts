import { Pinecone } from "@pinecone-database/pinecone";
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../src/utils/logger";

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SOURCE_FILE_PATH = path.resolve(__dirname, "../AI_INSTRUCTIONS.md");
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100;

const popLogger = logger.child({ component: "populate-pinecone" });

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
 * Simple chunking by paragraph (adjust as needed for different content).
 */
function chunkTextByParagraph(text: string): string[] {
  return text
    .split(/\r?\n\r?\n+/) // Split by one or more blank lines
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0); // Remove empty chunks
}

/**
 * Generates embeddings for a batch of texts using OpenAI.
 */
async function generateEmbeddingsBatch(
  texts: string[],
  model: string = EMBEDDING_MODEL
): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured (OPENAI_API_KEY).");
  }
  if (texts.length === 0) return [];

  popLogger.info(
    `Generating embeddings for ${texts.length} text chunks using model ${model}...`
  );
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: texts,
        model: model,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      popLogger.error(
        `OpenAI Embeddings API error (${response.status}): ${errorBody}`
      );
      throw new Error(
        `OpenAI Embeddings API error: ${response.status} ${errorBody}`
      );
    }

    const result = (await response.json()) as OpenAIEmbeddingResponse;

    if (!result.data || result.data.length !== texts.length) {
      popLogger.error(
        `Mismatch between input texts and embeddings received. Response: ${JSON.stringify(
          result
        )}`
      );
      throw new Error("Failed to get embeddings for all input texts.");
    }

    popLogger.info(
      `Generated embeddings. Usage: ${result.usage.total_tokens} tokens.`
    );
    // Sort embeddings back into original order based on index
    result.data.sort((a, b) => a.index - b.index);
    return result.data.map((item) => item.embedding);
  } catch (error) {
    popLogger.error("Failed to call OpenAI Embeddings API", error as Error);
    throw error;
  }
}

/**
 * Upserts vectors in batches to Pinecone.
 */
async function upsertVectorsBatch(index: any, vectors: any[]) {
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    popLogger.info(
      `Upserting batch of ${batch.length} vectors (starting index ${i})...`
    );
    try {
      await index.upsert(batch);
    } catch (error) {
      popLogger.error(
        `Failed to upsert batch starting at index ${i}`,
        error as Error
      );
    }
  }
}

async function main() {
  popLogger.info("Starting Pinecone population script...");

  if (!PINECONE_INDEX_NAME) {
    popLogger.error("PINECONE_INDEX_NAME environment variable is not set.");
    process.exit(1);
  }
  if (!OPENAI_API_KEY) {
    popLogger.error("OPENAI_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  if (!pineconeApiKey) {
    popLogger.error("PINECONE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // 1. Initialize Pinecone Client and Index
  popLogger.info(`Connecting to Pinecone index: ${PINECONE_INDEX_NAME}`);
  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  // TODO: Add check if index exists? Pinecone client v3 might not have listIndexes easily accessible here.
  // Requires separate API call or assumes index exists.
  const index = pinecone.index(PINECONE_INDEX_NAME);
  popLogger.info("Pinecone client initialized.");

  // 2. Read and Chunk Source Data
  popLogger.info(`Reading source file: ${SOURCE_FILE_PATH}`);
  let fileContent: string;
  try {
    fileContent = await fs.readFile(SOURCE_FILE_PATH, "utf-8");
  } catch (error) {
    popLogger.error(
      `Failed to read source file: ${SOURCE_FILE_PATH}`,
      error as Error
    );
    process.exit(1);
  }

  const chunks = chunkTextByParagraph(fileContent);
  popLogger.info(
    `Split source file into ${chunks.length} chunks (paragraphs).`
  );
  if (chunks.length === 0) {
    popLogger.warn("No text chunks found in the source file. Exiting.");
    process.exit(0);
  }

  // 3. Generate Embeddings (in batches if needed, though OpenAI supports array input)
  //TODO: For very large numbers of chunks, lets batch the call to generateEmbeddingsBatch itself
  const embeddings = await generateEmbeddingsBatch(chunks);

  if (embeddings.length !== chunks.length) {
    popLogger.error(
      `Number of embeddings (${embeddings.length}) does not match number of chunks (${chunks.length}). Aborting.`
    );
    process.exit(1);
  }

  // 4. Prepare Vectors for Upsert
  const vectors = chunks.map((chunk, i) => ({
    id: uuidv4(),
    values: embeddings[i],
    metadata: {
      text: chunk,
      source: path.basename(SOURCE_FILE_PATH),
      chunkIndex: i,
    },
  }));
  popLogger.info(`Prepared ${vectors.length} vectors for upsert.`);

  // 5. Upsert Vectors to Pinecone (in batches)
  await upsertVectorsBatch(index, vectors);

  popLogger.info("Pinecone population script finished successfully.");
}

main().catch((error) => {
  popLogger.error("Script failed with error:", error);
  process.exit(1);
});
