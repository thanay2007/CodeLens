import { createHash } from "node:crypto";
import type { CodeChunk, CoreFile, Finding, SourceFile } from "../types";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const protectedPath =
  /(^|\/)(\.env[^/]*|\.npmrc|\.pypirc|credentials[^/]*|secrets?[^/]*|id_rsa[^/]*|id_ed25519[^/]*)(\/|$)|\.(pem|key|p12|pfx|jks|keystore)$/i;
export function eligiblePath(path: string) {
  return !protectedPath.test(path);
}
export function filePriority(path: string) {
  if (
    /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|schema\.prisma)$/.test(
      path,
    )
  )
    return 100;
  if (/(^|\/)readme\.md$/i.test(path)) return 90;
  if (
    /(^|\/)(layout|page|main|app|index|server|db|database|auth|config)\.(tsx?|jsx?|py|go|rs)$/.test(
      path,
    )
  )
    return 80;
  if (/api\/|routes?\//.test(path)) return 70;
  return 50 - Math.min(path.split("/").length, 20);
}
export function languageFor(path: string) {
  if (/^dockerfile(?:\.|$)/i.test(path.split("/").at(-1) ?? ""))
    return "docker";
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    (
      {
        ts: "typescript",
        tsx: "tsx",
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        mts: "typescript",
        cts: "typescript",
        jsx: "jsx",
        py: "python",
        rs: "rust",
        go: "go",
        java: "java",
        json: "json",
        sh: "bash",
        md: "markdown",
        yml: "yaml",
        yaml: "yaml",
        sql: "sql",
        css: "css",
        html: "html",
        xml: "markup",
        svg: "markup",
        toml: "toml",
        cs: "csharp",
        cpp: "cpp",
        cc: "cpp",
        hpp: "cpp",
      } as Record<string, string>
    )[ext || ""] || "text"
  );
}
export function sanitizeSource(
  path: string,
  raw: string,
): { content: string; findings: Finding[] } {
  const findings: Finding[] = [];
  let content = raw.replace(
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    (match, offset: number) => {
      findings.push({
        path,
        line: raw.slice(0, offset).split("\n").length,
        severity: "high",
        message:
          "Private key material detected and redacted before storage and AI processing.",
      });
      return match.replace(/[^\r\n]/g, "*");
    },
  );
  const patterns = [
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk_live_[A-Za-z0-9]{16,}|gsk_[A-Za-z0-9]{30,})\b/g,
    /\b[\w-]*(?:api[_-]?key|secret(?:[_-]access[_-]key)?|password|(?:access[_-]?)?token)["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi,
  ];
  for (const pattern of patterns)
    content = content.replace(pattern, (match, ...args: unknown[]) => {
      const offset = args[args.length - 2] as number;
      if (
        /example|placeholder|your[_ -]|changeme|process\.env|os\.environ|\$\{|redacted/i.test(
          match,
        )
      )
        return match;
      findings.push({
        path,
        line: content.slice(0, offset).split("\n").length,
        severity: "high",
        message:
          "Potential hardcoded credential detected and redacted. Review this location and rotate any real credential.",
      });
      return match.replace(/[^\r\n]/g, "*");
    });
  content.split("\n").forEach((line, index) => {
    if (line.length > 300)
      findings.push({
        path,
        line: index + 1,
        severity: "low",
        message: "Very long line; consider simplifying it for maintainability.",
      });
  });
  // Multiple patterns may identify the same credential; count one signal per source line/severity.
  return {
    content,
    findings: [
      ...new Map(
        findings.map((finding) => [
          `${finding.path}:${finding.line}:${finding.severity}`,
          finding,
        ]),
      ).values(),
    ].slice(0, 30),
  };
}
export function detectStack(files: SourceFile[]) {
  const stack = new Set<string>();
  const dependencies = new Set<string>();
  for (const file of files) {
    if (file.path.endsWith("package.json")) {
      try {
        const value = JSON.parse(file.content);
        for (const key of Object.keys({
          ...value.dependencies,
          ...value.devDependencies,
        }))
          dependencies.add(key);
      } catch {
        /* Non-JSON/redacted manifests remain available in the file tour. */
      }
    }
    if (/(requirements\.txt|pyproject\.toml)$/.test(file.path))
      for (const name of [
        "fastapi",
        "django",
        "flask",
        "sqlalchemy",
        "pydantic",
      ])
        if (new RegExp(`\\b${name}\\b`, "i").test(file.content))
          stack.add(name);
    if (file.path.endsWith("schema.prisma")) {
      stack.add("Prisma");
      if (/provider\s*=\s*"postgresql"/.test(file.content))
        stack.add("PostgreSQL");
    }
    if (/(^|\/)Dockerfile$/.test(file.path)) stack.add("Docker");
  }
  const mapping: Record<string, string> = {
    next: "Next.js",
    react: "React",
    vue: "Vue",
    svelte: "Svelte",
    express: "Express",
    fastify: "Fastify",
    typescript: "TypeScript",
    tailwindcss: "Tailwind CSS",
    prisma: "Prisma",
    "@prisma/client": "Prisma",
    pg: "PostgreSQL",
    postgres: "PostgreSQL",
    mongoose: "MongoDB",
    "@clerk/nextjs": "Clerk",
    stripe: "Stripe",
    "groq-sdk": "Groq",
    "@pinecone-database/pinecone": "Pinecone",
    "@langchain/core": "LangChain",
  };
  for (const [key, label] of Object.entries(mapping))
    if (dependencies.has(key)) stack.add(label);
  return [...stack];
}
export function selectCoreFiles(files: SourceFile[]): CoreFile[] {
  const ranked = [...files]
    .filter((file) => !/readme|\.css$|\.md$/i.test(file.path))
    .sort((a, b) => filePriority(b.path) - filePriority(a.path));
  const manifest = ranked.find((file) =>
    /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(
      file.path,
    ),
  );
  const source = ranked.filter(
    (file) => file !== manifest && !/(^|\/)package\.json$/.test(file.path),
  );
  return [...(manifest ? [manifest] : []), ...source]
    .slice(0, 5)
    .map((file) => ({
      path: file.path,
      code: file.content,
      language: file.language,
      label: /package\.json|requirements|toml$/.test(file.path)
        ? "Dependencies & configuration"
        : /schema|db|database/.test(file.path)
          ? "Data layer"
          : /route|api\//.test(file.path)
            ? "Request handling"
            : "Application core",
      description: `Selected from the inspected source snapshot. ${file.path} is prioritized by its entry-point, configuration, or service-layer role; inspect the code below to confirm its responsibility.`,
    }));
}
export async function chunkFiles(
  files: SourceFile[],
  signal?: AbortSignal,
): Promise<CodeChunk[]> {
  const chunks: CodeChunk[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    const language =
      file.language === "python"
        ? "python"
        : ["typescript", "tsx", "javascript", "jsx"].includes(file.language)
          ? "js"
          : file.language === "markdown"
            ? "markdown"
            : null;
    const opts = { chunkSize: 1400, chunkOverlap: 180 };
    const splitter = language
      ? RecursiveCharacterTextSplitter.fromLanguage(language, opts)
      : new RecursiveCharacterTextSplitter(opts);
    const docs = await splitter.createDocuments(
      [file.content],
      [{ path: file.path }],
    );
    for (const [index, doc] of docs.entries()) {
      const loc = doc.metadata.loc?.lines;
      const startLine = Number(loc?.from || 1),
        endLine = Math.min(file.lines, Number(loc?.to || startLine));
      chunks.push({
        id: createHash("sha256")
          .update(`${file.path}:${index}:${doc.pageContent}`)
          .digest("hex")
          .slice(0, 32),
        path: file.path,
        startLine,
        endLine,
        content: doc.pageContent,
      });
    }
  }
  return chunks;
}
