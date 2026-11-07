import "server-only";
import Groq from "groq-sdk";
import { Pinecone } from "@pinecone-database/pinecone";

// Lazy factories: importing this module never needs credentials at build time.
export function getGroq() {
  if (!process.env.GROQ_API_KEY)
    throw new Error("Set GROQ_API_KEY to enable generation.");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

export function getPinecone() {
  if (!process.env.PINECONE_API_KEY)
    throw new Error("Set PINECONE_API_KEY to enable retrieval.");
  return new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
}

export const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
