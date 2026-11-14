import test from "node:test";
import assert from "node:assert/strict";
import { generateAssets } from "../src/lib/server/generation.ts";
import type { RepositoryData } from "../src/lib/types.ts";

test("Groq assets are validated, use real source code, and reject invalid architecture", async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.GROQ_API_KEY;
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
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).includes("api.groq.com"));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_object");
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
      deployment: {
        vercel:
          "Review the source and configure a suitable database before deploying this repository.",
        docker:
          "Use a supported Node runtime and configure the shared database connection at runtime.",
        aws: "Run the application on an appropriate compute service with a managed database connection.",
      },
      findings: [
        {
          path: "src/db.ts",
          line: 1,
          severity: "low",
          message:
            "Review the connection initialization for lifecycle management.",
          evidence: "database = connect()",
        },
        {
          path: "invented.ts",
          line: 99,
          severity: "high",
          message: "Unsupported finding must be discarded.",
          evidence: "not present in the repository",
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
    assert.equal(assets.reviewFindings.length, 1);
    assert.match(assets.reviewFindings[0].message, /^AI review suggestion:/);
    validGraph = false;
    await assert.rejects(
      generateAssets(data, new AbortController().signal),
      /unknown/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});
