import "server-only";
import { createHash } from "node:crypto";
import { getPinecone } from "./clients";
import { AppError } from "./errors";
import { GitHubClient } from "./github";
import { chunkFiles } from "./source-analysis";
import type { CodeChunk, RepositoryRecord } from "../types";

export function namespaceFor(owner: string, id: string, run: string) {
  return `cl-${createHash("sha256").update(`${owner}:${id}:${run}`).digest("hex")}`;
}
export const embeddingModel = () =>
  process.env.PINECONE_EMBEDDING_MODEL || "multilingual-e5-large";
export async function indexChunks(
  repo: RepositoryRecord,
  chunks: CodeChunk[],
  signal: AbortSignal,
  progress: (n: number) => Promise<void>,
) {
  const client = getPinecone(signal),
    name = process.env.PINECONE_INDEX;
  if (!name || !repo.leaseToken)
    throw new AppError("Configure PINECONE_INDEX before indexing.", 503);
  const indexInfo = await client.describeIndex(name);
  const namespace = namespaceFor(repo.ownerId, repo.id, repo.leaseToken);
  const index = client.index(name).namespace(namespace);
  try {
    for (let start = 0; start < chunks.length; start += 32) {
      signal.throwIfAborted();
      const batch = chunks.slice(start, start + 32);
      const embeddings = await client.inference.embed(
        embeddingModel(),
        batch.map((chunk) => `${chunk.path}\n${chunk.content}`),
        { inputType: "passage", truncate: "END" },
      );
      if (embeddings.data.length !== batch.length)
        throw new Error("Embedding count mismatch.");
      const records = embeddings.data.map((embedding, i) => {
        if (
          embedding.vectorType !== "dense" ||
          !embedding.values?.length ||
          embedding.values.length !== indexInfo.dimension
        )
          throw new AppError(
            "Pinecone index dimension must match the configured dense embedding model. multilingual-e5-large requires 1024 dimensions.",
            422,
          );
        const chunk = batch[i];
        return {
          id: chunk.id,
          values: embedding.values,
          metadata: {
            path: chunk.path,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            commitSha: repo.data!.commitSha,
          },
        };
      });
      await index.upsert(records);
      await progress(Math.min(start + batch.length, chunks.length));
    }
    return namespace;
  } catch (error) {
    // Each run has a dedicated namespace; cleanup never touches another user's vectors.
    await getPinecone(AbortSignal.timeout(5000))
      .index(name)
      .namespace(namespace)
      .deleteAll()
      .catch(() => undefined);
    throw error;
  }
}
export async function deleteNamespace(namespace: string) {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX)
    throw new AppError(
      "Configure the snapshot's Pinecone index to delete its embeddings.",
      503,
    );
  try {
    await getPinecone()
      .index(process.env.PINECONE_INDEX)
      .namespace(namespace)
      .deleteAll();
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "PineconeNotFoundError")
      throw error;
  }
}
export async function retrieve(
  repo: RepositoryRecord,
  question: string,
  signal: AbortSignal,
) {
  const data = repo.data;
  if (!data) return [];
  if (
    data.namespace &&
    data.embeddingModel &&
    process.env.PINECONE_INDEX &&
    process.env.PINECONE_API_KEY
  ) {
    try {
      const matches = await semanticMatches(
        data,
        question,
        AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      );
      if (matches.length) return matches;
    } catch {
      signal.throwIfAborted();
    }
  }
  const terms = [
    ...new Set(question.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []),
  ].filter(
    (word) =>
      !/^(the|and|why|how|what|where|does|this|with|can|for|are|explain|work)$/.test(
        word,
      ),
  );
  const score = (path: string, content: string) => {
    const name = path.toLowerCase();
    const text = content.toLowerCase();
    return terms.reduce(
      (sum, term) =>
        sum + (name.includes(term) ? 4 : 0) + (text.includes(term) ? 1 : 0),
      0,
    );
  };
  let chunks = data.chunks;
  if (!chunks.length) {
    const github = new GitHubClient(signal);
    const files = data.files.length
      ? data.files
      : await Promise.all(
          (data.repository.entries ?? [])
            .filter((entry) => entry.preview === "text")
            .sort((a, b) => score(b.path, "") - score(a.path, ""))
            .slice(0, 5)
            .map((entry) =>
              github.source(data.repository.url, data.commitSha, entry.path),
            ),
        ).then((results) =>
          results.flatMap((result) => (result ? [result.file] : [])),
        );
    chunks = await chunkFiles(files, signal);
  }
  return chunks
    .map((chunk) => ({ chunk, score: score(chunk.path, chunk.content) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ chunk }) => chunk);
}

async function semanticMatches(
  data: NonNullable<RepositoryRecord["data"]>,
  question: string,
  signal: AbortSignal,
) {
  const client = getPinecone(signal);
  const result = await client.inference.embed(
    data.embeddingModel!,
    [question],
    {
      inputType: "query",
      truncate: "END",
    },
  );
  const embedding = result.data[0];
  if (!embedding || embedding.vectorType !== "dense")
    throw new Error("A dense query embedding is required.");
  const matches = await client
    .index(process.env.PINECONE_INDEX!)
    .namespace(data.namespace!)
    .query({
      vector: embedding.values,
      topK: 6,
      includeMetadata: true,
      filter: { commitSha: { $eq: data.commitSha } },
    });
  const byId = new Map(data.chunks.map((chunk) => [chunk.id, chunk]));
  if (!byId.size) {
    // Supabase stores history and analysis summaries. Fetch matched source on demand.
    const paths = new Set(
      matches.matches
        .map((match) => match.metadata?.path)
        .filter(
          (path): path is string =>
            typeof path === "string" &&
            Boolean(
              data.repository.entries?.some(
                (entry) =>
                  entry.path === path &&
                  entry.kind === "file" &&
                  entry.preview === "text",
              ),
            ),
        ),
    );
    const github = new GitHubClient(signal);
    await Promise.all(
      [...paths].map(async (path) => {
        const source = await github.source(
          data.repository.url,
          data.commitSha,
          path,
        );
        if (source)
          for (const chunk of await chunkFiles([source.file]))
            byId.set(chunk.id, chunk);
      }),
    );
  }
  return matches.matches
    .map((match) => byId.get(match.id))
    .filter((chunk): chunk is CodeChunk => Boolean(chunk));
}
