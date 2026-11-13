import "server-only";
import Groq from "groq-sdk";
import { Pinecone } from "@pinecone-database/pinecone";

// Lazy factories: importing this module never needs credentials at build time.
export function getGroq() {
  if (!process.env.GROQ_API_KEY)
    throw new Error("Set GROQ_API_KEY to enable generation.");
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 60000,
    maxRetries: 1,
  });
}

export function getPinecone(signal?: AbortSignal) {
  if (!process.env.PINECONE_API_KEY)
    throw new Error("Set PINECONE_API_KEY to enable retrieval.");
  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    maxRetries: 1,
    fetchApi: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(30000),
        ]),
      }),
  });
}

export const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
