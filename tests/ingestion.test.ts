import test from "node:test";
import assert from "node:assert/strict";
import { GitHubClient, limitedResponse } from "../src/lib/server/github.ts";
import {
  openDatabase,
  initializeDatabase,
} from "../src/lib/server/database.ts";
import { WorkspaceStore } from "../src/lib/server/store.ts";
import { runIngestion } from "../src/lib/server/ingestion.ts";
import { namespaceFor } from "../src/lib/server/vectors.ts";

const sha = "a".repeat(40),
  blobSha = "b".repeat(40);

test("full ingestion fetches pinned blobs, saves real source, and exposes missing-service states", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/repos/acme/repo"))
      return Response.json({
        full_name: "acme/repo",
        private: false,
        default_branch: "main",
        language: "TypeScript",
        stargazers_count: 7,
      });
    if (url.includes("/git/ref/")) return Response.json({ object: { sha } });
    if (url.includes("/git/commits/"))
      return Response.json({ sha, tree: { sha } });
    if (url.includes("/git/trees/"))
      return Response.json({
        truncated: false,
        tree: [
          {
            path: "src/main.ts",
            type: "blob",
            mode: "100644",
            size: 100,
            sha: blobSha,
          },
          {
            path: ".env",
            type: "blob",
            mode: "100644",
            size: 20,
            sha: "c".repeat(40),
          },
        ],
      });
    if (url.endsWith(`/git/blobs/${blobSha}`))
      return Response.json({
        encoding: "base64",
        content: Buffer.from(
          "export function hello() { return 'world'; }",
        ).toString("base64"),
      });
    throw new Error("Unexpected request " + url);
  };
  const db = await initializeDatabase(await openDatabase(":memory:"));
  try {
    const store = new WorkspaceStore(db),
      repo = await store.create(
        "alice",
        "https://github.com/acme/repo",
        "acme/repo",
      );
    await runIngestion("alice", repo.id, store, {
      github: (signal) => new GitHubClient(signal, fetcher),
      generate: async () => {
        throw new Error("Must not call Groq without keys");
      },
      index: async () => {
        throw new Error("Must not call Pinecone without keys");
      },
      services: { groq: false, pinecone: false },
    });
    const result = await store.get("alice", repo.id);
    assert.equal(result.status, "ready");
    assert.equal(result.progress, 100);
    assert.equal(result.data?.commitSha, sha);
    assert.equal(result.data?.files.length, 1);
    assert.equal(result.data?.skippedFiles, 1);
    assert.ok(result.data?.chunks.length);
    assert.equal(result.data?.assets, null);
    assert.equal(result.data?.namespace, null);
    assert.ok(result.data?.warnings.some((w) => w.includes("GROQ_API_KEY")));
    assert.ok(calls.some((url) => url.includes(`/git/trees/${sha}`)));
    assert.equal(calls.length, 5);
  } finally {
    await db.close();
  }
});

test("private repositories are refused even with a server token", async () => {
  let calls = 0;
  const client = new GitHubClient(new AbortController().signal, async () => {
    calls++;
    return Response.json({ private: true });
  });
  await assert.rejects(client.snapshot("https://github.com/a/b"), /public/);
  assert.equal(calls, 1);
});

test("streamed upstream responses are bounded even without content-length", async () => {
  await assert.rejects(
    limitedResponse(new Response("x".repeat(200)), 100),
    /size/,
  );
});

test("vector namespaces vary by user, repository and indexing attempt", () => {
  assert.notEqual(namespaceFor("a", "r", "run"), namespaceFor("b", "r", "run"));
  assert.notEqual(
    namespaceFor("a", "r", "run"),
    namespaceFor("a", "r", "retry"),
  );
  assert.notEqual(
    namespaceFor("a", "r", "run"),
    namespaceFor("a", "other", "run"),
  );
});
