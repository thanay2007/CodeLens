import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkFiles,
  detectStack,
  eligiblePath,
  sanitizeSource,
} from "../src/lib/server/source-analysis.ts";
import { graphToMermaid } from "../src/lib/server/generation.ts";

test("protects credential files and considers all other tracked files for text inspection", () => {
  for (const path of [
    ".env",
    ".env.example",
    "config/secrets.json",
    "id_rsa",
    "private.pem",
  ])
    assert.equal(eligiblePath(path), false, path);
  for (const path of [
    "src/app/page.tsx",
    "package.json",
    "requirements.txt",
    "Dockerfile",
    "schema.prisma",
    "node_modules/pkg/index.js",
    "dist/app.js",
    "package-lock.json",
    "image.png",
  ])
    assert.equal(eligiblePath(path), true, path);
});

test("redacts secret values without changing source line numbers", () => {
  const secret = "ghp_" + "A".repeat(36);
  const value = `export const token = '${secret}';\nconst password = 'this-is-a-real-long-secret';\nconst env = process.env.PASSWORD;`;
  const result = sanitizeSource("src/auth.ts", value);
  assert.equal(result.content.includes(secret), false);
  assert.equal(result.content.includes("this-is-a-real-long-secret"), false);
  assert.equal(result.content.split("\n").length, 3);
  assert.deepEqual(
    result.findings.map((item) => item.line),
    [1, 2],
  );
  assert.equal(result.content.includes("process.env.PASSWORD"), true);
});

test("detects frameworks from manifests, not arbitrary mentions", () => {
  const files = [
    {
      path: "package.json",
      content: JSON.stringify({
        dependencies: { next: "16", postgres: "3", "@clerk/nextjs": "7" },
        devDependencies: { typescript: "7" },
      }),
      language: "json",
      lines: 1,
    },
    {
      path: "README.md",
      content: "Maybe use Django someday",
      language: "markdown",
      lines: 1,
    },
  ];
  assert.deepEqual(
    detectStack(files).sort(),
    ["Next.js", "PostgreSQL", "Clerk", "TypeScript"].sort(),
  );
});

test("chunks preserve file and valid source line references", async () => {
  const content = Array.from(
    { length: 200 },
    (_, i) => `export function f${i}() { return ${i}; }`,
  ).join("\n");
  const chunks = await chunkFiles([
    { path: "src/index.ts", content, language: "typescript", lines: 200 },
  ]);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(chunk.path, "src/index.ts");
    assert.ok(chunk.startLine > 0);
    assert.ok(chunk.endLine >= chunk.startLine && chunk.endLine <= 200);
    const slice = content
      .split("\n")
      .slice(chunk.startLine - 1, chunk.endLine)
      .join("\n");
    assert.ok(
      slice.includes(chunk.content),
      `${chunk.startLine}-${chunk.endLine}`,
    );
  }
});

test("architecture serialization neutralizes directives and validates references", () => {
  const source = graphToMermaid({
    nodes: [{ id: "frontend", label: 'Web"]\nclick x "https://bad.test"' }],
    edges: [],
  });
  assert.equal(source.split("\n").length, 2);
  assert.throws(() =>
    graphToMermaid({
      nodes: [{ id: "a", label: "A" }],
      edges: [{ from: "a", to: "missing" }],
    }),
  );
  assert.throws(() =>
    graphToMermaid({
      nodes: [
        { id: "a", label: "A" },
        { id: "a", label: "B" },
      ],
      edges: [],
    }),
  );
});
