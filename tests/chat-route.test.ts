import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { database } from "../src/lib/server/database.ts";
import { workspaceStore } from "../src/lib/server/store.ts";
import { POST } from "../src/app/api/chat/route.ts";
import { indexChunks } from "../src/lib/server/vectors.ts";
import type { RepositoryData } from "../src/lib/types.ts";

test("RAG routes use server-owned namespaces, emit citations, persist only completed turns, and reject bad dimensions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codelens-chat-"));
  const originalFetch = globalThis.fetch;
  const keys = [
    "CODELENS_DATA_DIR",
    "GROQ_API_KEY",
    "PINECONE_API_KEY",
    "PINECONE_INDEX",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  process.env.CODELENS_DATA_DIR = directory;
  process.env.GROQ_API_KEY = "test-not-a-real-key";
  process.env.PINECONE_API_KEY = "test-not-a-real-key";
  process.env.PINECONE_INDEX = "codelens-test";
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  let complete = true,
    dimension = 3,
    deletedNamespace = false;
  const queries: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith("/indexes/codelens-test"))
      return Response.json({
        name: "codelens-test",
        dimension,
        metric: "cosine",
        host: "codelens-test.example.pinecone.io",
        status: { ready: true, state: "Ready" },
        spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      });
    if (url.endsWith("/embed"))
      return Response.json({
        model: "multilingual-e5-large",
        vector_type: "dense",
        data: [{ values: [0.1, 0.2, 0.3], vector_type: "dense" }],
        usage: { total_tokens: 10 },
      });
    if (url.endsWith("/query")) {
      queries.push(body);
      return Response.json({
        matches: [{ id: "chunk-1", score: 0.9 }],
        namespace: "server-namespace",
        usage: { readUnits: 1 },
      });
    }
    if (url.endsWith("/vectors/delete")) {
      deletedNamespace = true;
      return Response.json({});
    }
    if (url.includes("api.groq.com") && url.endsWith("/chat/completions")) {
      assert.ok(body.messages[0].content.includes("Retrieved sources"));
      assert.ok(body.messages[0].content.includes("src/db.ts"));
      const events = [
        {
          choices: [
            {
              delta: {
                content: "The database is configured in src/db.ts [1].",
              },
              finish_reason: null,
            },
          ],
        },
        ...(complete
          ? [{ choices: [{ delta: {}, finish_reason: "stop" }] }]
          : []),
      ];
      return new Response(
        events.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("") +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    throw new Error("Unexpected network request in mocked test: " + url);
  };
  try {
    const store = await workspaceStore(),
      created = await store.create(
        "local-development",
        "https://github.com/a/b",
        "a/b",
      ),
      repo = await store.claim("local-development", created.id);
    assert.ok(repo);
    const data: RepositoryData = {
      repository: {
        fullName: "a/b",
        url: "https://github.com/a/b",
        branch: "main",
        description: "Test",
        fileCount: 1,
        language: "TypeScript",
        stars: 0,
        truncated: false,
        paths: ["src/db.ts"],
      },
      commitSha: "a".repeat(40),
      files: [
        {
          path: "src/db.ts",
          content: "export const db = connect();",
          lines: 1,
          language: "typescript",
        },
      ],
      chunks: [
        {
          id: "chunk-1",
          path: "src/db.ts",
          startLine: 1,
          endLine: 1,
          content: "export const db = connect();",
        },
      ],
      coreFiles: [],
      techStack: [],
      languages: { typescript: 1 },
      findings: [],
      healthScore: 100,
      assets: null,
      namespace: "server-namespace",
      embeddingModel: "multilingual-e5-large",
      warnings: [],
      indexedFiles: 1,
      skippedFiles: 0,
    };
    await store.save(repo, {
      data,
      progress: 100,
      stage: "Ready",
      status: "ready",
    });
    const ask = () =>
      POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repositoryId: repo.id,
            question: "Where is the database?",
            namespace: "attacker-namespace",
          }),
        }),
      );
    const first = await ask();
    assert.equal(first.status, 200);
    const events = (await first.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.type === "done"));
    assert.equal(
      events[0].sources[0].url,
      `https://github.com/a/b/blob/${data.commitSha}/src/db.ts#L1-L1`,
    );
    assert.equal(queries[0].namespace, "server-namespace");
    assert.equal(
      (await store.messages("local-development", repo.id)).length,
      2,
    );
    complete = false;
    const interrupted = await ask();
    const incomplete = await interrupted.text();
    assert.ok(incomplete.includes('"type":"error"'));
    assert.equal(
      (await store.messages("local-development", repo.id)).length,
      2,
      "Interrupted answers must not overwrite history",
    );
    dimension = 4;
    await assert.rejects(
      indexChunks(
        repo,
        data.chunks,
        new AbortController().signal,
        async () => {},
      ),
      /dimension/,
    );
    assert.equal(deletedNamespace, true);
  } finally {
    globalThis.fetch = originalFetch;
    await (await database()).close();
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    const safe =
      resolve(directory).startsWith(resolve(tmpdir()) + "/") ||
      resolve(directory).startsWith(resolve(tmpdir()) + "\\");
    if (!safe) throw new Error("Unsafe test cleanup");
    await rm(directory, { recursive: true });
  }
});
