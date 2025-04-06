import { Pinecone } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECONE_API_KEY;
// Pinecone v3+ often doesn't require a separate 'environment' parameter during client init
// It's usually part of the index host or handled when connecting to an index.
// const environment = process.env.PINECONE_ENVIRONMENT;

if (!apiKey) {
  throw new Error(
    "Pinecone API key is not defined in environment variables (PINECONE_API_KEY)"
  );
}
// if (!environment) {
//     throw new Error('Pinecone environment is not defined in environment variables (PINECONE_ENVIRONMENT)');
// }

const pinecone = new Pinecone({
  apiKey: apiKey,
});

export const getPineconeIndex = (indexName: string) => {
  if (!indexName) {
    throw new Error("Pinecone index name cannot be empty.");
  }
  return pinecone.index(indexName);
};

export { pinecone };
