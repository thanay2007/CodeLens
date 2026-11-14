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

test("ingestion inspects the entire pinned tree and generates source-based assets without Groq", async () => {
  const calls: string[] = [];
  const manyFiles = Array.from({ length: 48 }, (_, index) => ({
    path: `${index === 0 ? "shared" : "src/nested"}/file-${index}.ts`,
    type: "blob",
    mode: "100644",
    sha: blobSha,
  }));
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
          ...manyFiles,
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
          {
            path: "assets/image.png",
            type: "blob",
            mode: "100644",
            sha: blobSha,
          },
          {
            path: "vendor/submodule",
            type: "commit",
            mode: "160000",
            sha: blobSha,
          },
          { path: "link", type: "blob", mode: "120000", sha: blobSha },
        ],
      });
    if (url.endsWith("assets/image.png"))
      return new Response(new Uint8Array([0, 0xff]));
    if (url.includes(`raw.githubusercontent.com/acme/repo/${sha}/`)) {
      return new Response(
        (url.endsWith("src/main.ts")
          ? 'import { value } from "../shared/file-0";\n'
          : "") +
          'const router = {}; router.get("/hello", handler);\n' +
          "// source evidence\n".repeat(2000),
      );
    }
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
      index: async (_repo, chunks, _signal, progress) => {
        assert.ok(chunks.length > 300);
        await progress(chunks.length - 1);
        throw new DOMException("Embedding timed out", "TimeoutError");
      },
      services: { groq: false, pinecone: true },
    });
    const result = await store.get("alice", repo.id);
    assert.equal(
      result.status,
      "ready",
      result.error || "Analysis should complete",
    );
    assert.equal(result.progress, 100);
    assert.equal(result.data?.commitSha, sha);
    assert.equal(result.data?.files.length, 49);
    assert.equal(result.data?.skippedFiles, 4);
    assert.equal(result.data?.repository.entries?.length, 53);
    assert.ok(result.data!.chunks.length > 300);
    assert.match(result.data!.assets!.readme, /GET \/hello/);
    assert.match(result.data!.assets!.architecture, /^flowchart LR/);
    assert.match(result.data!.assets!.architecture, /-->\|imports\|/);
    assert.match(
      result.data!.assets!.readme,
      /Imports across top-level folders/,
    );
    assert.equal(result.data?.namespace, null);
    assert.ok(
      result.data?.warnings.some((w) =>
        w.includes("semantic index could not finish"),
      ),
    );
    assert.ok(calls.some((url) => url.includes(`/git/trees/${sha}`)));
    assert.equal(calls.length, 54);
    assert.ok(!calls.some((url) => url.endsWith("/.env")));
    await db.query(
      "UPDATE repositories SET status='failed',progress=88,error=$1 WHERE id=$2",
      ["Analysis reached the server's execution timeout.", repo.id],
    );
    await store.expire("alice", repo.id);
    const recovered = await store.get("alice", repo.id);
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.error, null);
    assert.equal(recovered.data?.commitSha, sha);
  } finally {
    await db.close();
  }
});

test("truncated recursive trees are rebuilt from individual GitHub directories", async () => {
  const client = new GitHubClient(
    new AbortController().signal,
    async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/repo"))
        return Response.json({
          full_name: "acme/repo",
          default_branch: "main",
        });
      if (url.includes("/git/ref/")) return Response.json({ object: { sha } });
      if (url.includes("/git/commits/"))
        return Response.json({ tree: { sha } });
      if (url.endsWith("?recursive=1"))
        return Response.json({ tree: [], truncated: true });
      if (url.endsWith(sha))
        return Response.json({
          tree: [{ path: "src", type: "tree", sha: blobSha }],
        });
      return Response.json({
        tree: [{ path: "index", type: "blob", mode: "100644" }],
      });
    },
  );
  const snapshot = await client.snapshot("https://github.com/acme/repo");
  assert.deepEqual(snapshot.repository.paths, ["src/index"]);
  assert.equal(snapshot.repository.truncated, false);
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
