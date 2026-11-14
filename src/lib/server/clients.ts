import "server-only";
import Groq from "groq-sdk";
import { Pinecone } from "@pinecone-database/pinecone";
import { AppError } from "./errors";

// Both endpoints speak the same completions protocol, including SSE for chat.
export async function withModel<T>(
  signal: AbortSignal,
  run: (
    client: Groq,
    model: string,
    signal: AbortSignal,
    provider: "gemini" | "groq",
  ) => Promise<T>,
) {
  const providers = [
    {
      name: "gemini" as const,
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    },
    {
      name: "groq" as const,
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    },
  ].filter((provider) => provider.key);
  if (!providers.length)
    throw new AppError(
      "Configure GEMINI_API_KEY or GROQ_API_KEY to enable AI features.",
      503,
    );
  let failure: unknown;
  for (const { name, key, model } of providers) {
    signal.throwIfAborted();
    const client = new Groq({
      apiKey: key,
      maxRetries: 0,
      logLevel: "off",
      ...(name === "gemini" && {
        // Keep the installed client's SSE parser and target Google's compatible path.
        fetch: (_input, init) =>
          fetch(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            { ...init, redirect: "error" },
          ),
      }),
    });
    try {
      return await run(
        client,
        model,
        AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        name,
      );
    } catch (error) {
      failure = error;
    }
  }
  signal.throwIfAborted();
  throw failure;
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
