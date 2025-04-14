import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import {
  generateOpenAIEmbedding,
  pineconeSearchHandler,
} from "../../../src/tools/vectorSearch/pineconeSearchTool";
import { getPineconeIndex } from "../../../src/utils/pineconeClient";

//TODO: Skip tests if Pinecone creds aren't set, prevents CI failures
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const runPineconeTests =
  PINECONE_INDEX_NAME && PINECONE_API_KEY && OPENAI_API_KEY;

const TEST_DATA_ID = `test-${uuidv4()}`;
const TEST_DATA_TEXT =
  "The quick brown fox jumps over the lazy dog near the context window.";
const TEST_SEARCH_QUERY = "quick brown fox lazy dog";

//FIXME: these are probably too high, but we need to test the retry logic
const INITIAL_WAIT_MS = 25000;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 5;

const TEST_NAMESPACE = "hyperion-integration-test"; // Must match the namespace in the Pinecone index

async function addTestData(index: any) {
  // Revert adding unique ID to text, rely on ID field only for uniqueness
  const textToIndex = TEST_DATA_TEXT;
  console.log(
    `Adding test vector (ID: ${TEST_DATA_ID}, Text: "${textToIndex.substring(
      0,
      50
    )}...") to index ${PINECONE_INDEX_NAME}, namespace ${TEST_NAMESPACE}...`
  );
  if (typeof generateOpenAIEmbedding !== "function") {
    throw new Error(
      "generateOpenAIEmbedding function not found or not exported from tool file."
    );
  }
  // Generate embedding based on the original text
  const embedding = await generateOpenAIEmbedding(textToIndex);
  try {
    const upsertResult = await index.namespace(TEST_NAMESPACE).upsert([
      {
        id: TEST_DATA_ID,
        values: embedding,
        metadata: {
          text: textToIndex, // Store original text
          source: "integration-test",
          testId: TEST_DATA_ID,
        },
      },
    ]);
    console.log(
      `Upsert call completed for ID: ${TEST_DATA_ID}. Result:`,
      upsertResult
    );
  } catch (upsertError) {
    console.error(`Upsert failed for ID: ${TEST_DATA_ID}:`, upsertError);
    throw upsertError;
  }
  console.log(
    `Waiting ${INITIAL_WAIT_MS / 1000} seconds for Pinecone index to update...`
  );
  await new Promise((resolve) => setTimeout(resolve, INITIAL_WAIT_MS));
  console.log("Test vector added.");
}

//FIXME: this is a bit of a hack, we should be able to delete the test data by ID
async function removeTestData() {
  console.log(
    `Attempting to remove test vectors from namespace ${TEST_NAMESPACE} in index ${PINECONE_INDEX_NAME}...`
  );
  if (!PINECONE_INDEX_NAME) {
    console.error("Cannot remove test data: PINECONE_INDEX_NAME is not set.");
    return;
  }
  try {
    const index = getPineconeIndex(PINECONE_INDEX_NAME);
    console.log(`Calling deleteAll on namespace ${TEST_NAMESPACE}...`);
    const deleteResult = await index.namespace(TEST_NAMESPACE).deleteAll();
    console.log(
      `deleteAll call completed for namespace ${TEST_NAMESPACE}. Result:`,
      deleteResult
    );
    console.log(`Waiting 5 seconds after deleteAll...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error: any) {
    console.error(
      `Error during deleteAll for namespace ${TEST_NAMESPACE}:`,
      error
    );
  }
}

describe.if(runPineconeTests ? true : false)(
  "Pinecone Search Integration Tests",
  () => {
    const setupPinecone = async () => {
      const index = getPineconeIndex(PINECONE_INDEX_NAME!);
      console.log(`Ensured connection to index: ${PINECONE_INDEX_NAME}`);
      console.log(
        `Adding test vector (ID: ${TEST_DATA_ID}) to index ${PINECONE_INDEX_NAME}...`
      );
      await addTestData(index);
      console.log(
        `Waiting ${
          INITIAL_WAIT_MS / 1000
        } seconds for Pinecone index to update...`
      );
      await new Promise((resolve) => setTimeout(resolve, INITIAL_WAIT_MS));
      console.log("Test vector added.");
    };

    beforeAll(setupPinecone);

    afterAll(async () => {
      console.log("Running afterAll cleanup...");
      await removeTestData();
      console.log("afterAll cleanup finished.");
    });

    it(
      "should find the test document using semantic search",
      async () => {
        console.log(`Attempting search for test vector ${TEST_DATA_ID}...`);
        let foundTestDoc: any = undefined;
        let attempts = 0;
        let response: any;

        while (!foundTestDoc && attempts < MAX_RETRIES) {
          attempts++;
          console.log(`  Search attempt ${attempts}/${MAX_RETRIES}...`);
          response = await pineconeSearchHandler({
            query: TEST_SEARCH_QUERY,
            top_k: 50,
            namespace: TEST_NAMESPACE,
          });
          foundTestDoc = response?.content?.results?.find(
            (doc: any) => doc.id === TEST_DATA_ID
          );

          if (!foundTestDoc && attempts < MAX_RETRIES) {
            console.log(
              `  Test vector not found, waiting ${RETRY_DELAY_MS}ms before retry...`
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

        if (!foundTestDoc) {
          console.error(
            "Final Response Content:",
            JSON.stringify(response?.content?.results, null, 2)
          );
          throw new Error(
            `Test document with ID ${TEST_DATA_ID} was not found in Pinecone after ${attempts} attempts.`
          );
        }

        expect(foundTestDoc).toBeDefined();

        expect(foundTestDoc.metadata?.source).toBe("integration-test");
        expect(foundTestDoc.score).toBeNumber();
      },
      INITIAL_WAIT_MS + MAX_RETRIES * RETRY_DELAY_MS + 15000
    );

    it("should handle missing query parameter", async () => {
      const params = { top_k: 3, namespace: TEST_NAMESPACE };
      await expect(pineconeSearchHandler(params)).rejects.toThrow(
        "Missing or invalid 'query' parameter (string) is required."
      );
    });

    it("should handle invalid top_k parameter", async () => {
      const params = {
        query: TEST_SEARCH_QUERY,
        top_k: -1,
        namespace: TEST_NAMESPACE,
      };
      await expect(pineconeSearchHandler(params)).rejects.toThrow(
        "'top_k' parameter must be a positive number."
      );
    });

    //TODO: Add more tests for edge cases, filters (if implemented), etc.
  }
);
