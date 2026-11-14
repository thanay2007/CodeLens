import test from "node:test";
import assert from "node:assert/strict";
import { generateAssets } from "../src/lib/server/generation.ts";
import type { RepositoryData } from "../src/lib/types.ts";

test("Gemini is preferred, Groq is the fallback, and architecture links are checked", async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.GROQ_API_KEY,
    originalGemini = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GROQ_API_KEY = "test-not-a-real-key";
  const data: RepositoryData = {
    repository: {
      fullName: "a/b",
      url: "https://github.com/a/b",
      description: "Test",
      branch: "main",
      language: "TypeScript",
      stars: 0,
      fileCount: 1,
      truncated: false,
      paths: ["src/db.ts"],
    },
    commitSha: "a".repeat(40),
    files: [
      {
        path: "src/db.ts",
        content: "export const database = connect();",
        language: "typescript",
        lines: 1,
      },
    ],
    chunks: [],
    coreFiles: [],
    techStack: [],
    languages: {},
    findings: [],
    healthScore: 100,
    assets: null,
    namespace: null,
    embeddingModel: null,
    warnings: [],
    indexedFiles: 1,
    skippedFiles: 0,
  };
  let validGraph = true;
  let geminiAvailable = true;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const gemini = String(input).includes("generativelanguage.googleapis.com");
    calls.push(gemini ? "gemini" : "groq");
    if (gemini && !geminiAvailable)
      return Response.json({ error: "rate limited" }, { status: 429 });
    const body = JSON.parse(String(init?.body));
    assert.equal(
      body.response_format.type,
      gemini ? "json_schema" : "json_object",
    );
    if (gemini) {
      assert.equal(body.model, "gemini-3.8-flash");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-gemini-key",
      );
    }
    assert.ok(body.messages[0].content.includes("UNTRUSTED DATA"));
    assert.ok(body.messages[1].content.includes(data.commitSha));
    const response = {
      readme: "# Repository\n\n" + "Source-based onboarding. ".repeat(8),
      architecture: {
        nodes: [{ id: "db", label: "Database" }],
        edges: validGraph ? [] : [{ from: "db", to: "unknown" }],
      },
      explanations: [
        {
          path: "src/db.ts",
          explanation:
            "Creates the shared database connection for this application.",
        },
      ],
      architectureTree: [
        {
          id: "storage",
          title: "Storage",
          description: "Manages the database connection used by the service.",
          paths: ["invented.ts", "src/db.ts"],
          children: [
            {
              id: "connection",
              title: "Connection",
              description: "Opens the shared database connection.",
              paths: ["src/db.ts"],
              children: [],
            },
          ],
        },
      ],
      flows: [
        {
          from: "storage",
          to: "missing",
          description: "An unverified connection should be discarded.",
        },
      ],
    };
    return Response.json({
      choices: [
        {
          message: { role: "assistant", content: JSON.stringify(response) },
          finish_reason: "stop",
        },
      ],
    });
  };
  try {
    const assets = await generateAssets(data, new AbortController().signal);
    assert.match(assets.architecture, /^flowchart LR/);
    assert.equal(assets.coreFiles[0].code, data.files[0].content);
    assert.match(assets.coreFiles[0].description, /shared database/);
    assert.deepEqual(calls, ["gemini"]);
    assert.deepEqual(assets.architectureTree?.[0].paths, ["src/db.ts"]);
    assert.equal(assets.architectureTree?.[0].children[0].title, "Connection");
    assert.deepEqual(assets.flows, []);
    assert.deepEqual(assets.reviewFindings, []);
    geminiAvailable = false;
    const fallback = await generateAssets(data, new AbortController().signal);
    assert.deepEqual(calls, ["gemini", "gemini", "groq"]);
    assert.match(fallback.generatedBy!, /gpt-oss/);
    validGraph = false;
    await assert.rejects(
      generateAssets(data, new AbortController().signal),
      /unknown/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGemini;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});
