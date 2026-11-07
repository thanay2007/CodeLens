# CodeLens

**Big codebase. Clear picture.** An AI-powered developer onboarding and codebase intelligence workspace, built with Next.js App Router, Tailwind CSS v4, Framer Motion, shadcn-style Radix UI components, an adapted Aceternity Spotlight, and Mermaid.

## Run locally

Use **Node.js 22.18+** and npm:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The development server binds to loopback. Without credentials, the app can still ingest public source files, save history, detect frameworks, inspect code health signals, and show code tours. The fictional storefront remains available as an explicitly labeled demo.

The scripts use Next.js's supported Webpack bundler because the development Windows host's Turbopack CSS worker crashes. Remove `--webpack` if you prefer Turbopack in a compatible environment.

## Configure integrations

Copy `.env.example` to `.env.local`. Never put service secrets in browser variables or commit them.

| Variable                            | Purpose                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public browser configuration; available at build time                             |
| `CLERK_SECRET_KEY`                  | Server authentication; required for production workspace access                         |
| `GITHUB_TOKEN`                      | Optional server-side token to increase GitHub public API limits                         |
| `GROQ_API_KEY`                      | Generates README, architecture, file explanations, deployment guides, and streamed chat |
| `GROQ_MODEL`                        | Defaults to `llama-3.3-70b-versatile`; confirm availability in your Groq account        |
| `PINECONE_API_KEY`                  | Pinecone vector storage and hosted embedding inference                                  |
| `PINECONE_INDEX`                    | Existing dense vector index name                                                        |
| `PINECONE_EMBEDDING_MODEL`          | Defaults to `multilingual-e5-large`; use a 1024-dimensional cosine index for this model |
| `DATABASE_URL`                      | PostgreSQL persistence for hosted/serverless deployments                                |
| `CODELENS_DATA_DIR`                 | Optional persistent SQLite directory; defaults to `.data` during development            |

**Groq does not supply the embedding model.** This implementation uses Pinecone's hosted inference for document and query embeddings, validates dimensions before upsert, and saves the embedding model with each snapshot. The current Pinecone SDK/adapter uses the legacy dense vector API. Create a compatible vector index rather than a document/records-only index. The app does not create paid resources automatically.

Restart after changing configuration, then **reanalyze** a repository to generate assets or create its vector index. Settings distinguish configured services from missing integrations. An enabled configuration is not proof that its credentials are valid; failures appear as explicit analysis warnings.

## Implemented flow

1. A public GitHub URL starts a saved background analysis job. GitHub metadata, the default branch commit, and its immutable tree are fetched through the REST API.
2. Up to **36 eligible source files / 160 KB total** are downloaded by blob SHA. Files above 32 KB, binaries, symlinks, common generated directories, lockfiles, environment files, credential files, and private-key files are excluded. Detected credential patterns are redacted before storage, embeddings, or AI processing. Redaction is best effort, not a guarantee that every secret is detected.
3. Language-aware LangChain splitting produces up to 300 chunks with file and line metadata. Framework detection reads manifests; file ranking chooses up to five source/configuration files. The health score is a disclosed heuristic on inspected files, not a security audit or whole-repository guarantee.
4. When Groq is configured, one validated structured response generates documentation, explanations, and deployment guides. A bounded architecture graph is serialized to safe Mermaid syntax; the browser parses and renders it in strict mode. Explanations cannot replace the stored source code. Unavailable/failed generation never falls back to unrelated demo assets.

   Groq also proposes code-health review findings. Suggestions are kept only when their exact evidence matches a known source line, and are labeled as AI suggestions. They do not change the deterministic pattern-based inspection score.

5. When Pinecone is configured, chunks are embedded in batches and upserted into a dedicated namespace derived server-side from the user, repository, and indexing attempt. Missing services leave source inspection usable with a clear setup warning.
6. Chat embeds the question with the snapshot's embedding model, retrieves up to six matching chunks, streams Groq output as newline-delimited events, and presents immutable GitHub source links. Complete user/assistant turns are saved; interrupted or truncated answers are not persisted. Client-supplied namespaces, source text, and chat roles are not accepted.

The dashboard includes responsive navigation, workspace search (`Ctrl/Cmd + K`), progress, cancellation, saved repository history, generated/original README previews and exports, interactive Mermaid diagrams, a code tour, tech badges, health findings, deployment guide downloads, and a sliding chat drawer. The Pro button remains a mock product preview with no billing.

## Persistence, authentication, and limits

Local development uses SQLite in ignored `.data/` storage. Configure `DATABASE_URL` to use PostgreSQL instead. Tables and indexes are created on first access. Production refuses the unauthenticated development fallback and requires either PostgreSQL or an explicitly configured persistent SQLite directory. SQL reads/writes, job status, chat history, quotas, and vector namespaces are scoped to the authenticated Clerk user.

Jobs execute with Next.js `after()` and a 270-second SQL lease. A stopped job may be reclaimed when its owner polls after the lease expires, for up to three attempts. Cancellation prevents further persisted worker writes. In-flight provider requests may finish before cancellation is observed. This is not a standalone durable queue; use a dedicated worker for guaranteed processing without client polling or for larger repositories.

Durable quotas currently permit 10 analysis starts/hour, 30/day, two active analyses, 15 chat requests/minute, and 150/day per workspace. Chat generation is serialized per repository to prevent overlapping turns from overwriting history. Development without Clerk uses a single local workspace. No AST parsing is claimed: recursive splitting prefers language boundaries but can split long functions.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker, Vercel, AWS, database, Clerk, and Pinecone setup. A non-root multi-stage Dockerfile and `/api/health` endpoint are included. Hosting, external accounts/indexes, billing, and a continuously running job queue are not provisioned automatically.

## Folder structure

```text
src/
  app/
    api/
      repositories/route.ts          # List snapshots / enqueue analysis
      repositories/[id]/route.ts     # Progress, assets, resume interrupted jobs
      repositories/[id]/cancel/route.ts
      chat/route.ts                  # Saved history + cited streaming RAG
      chat/reset/route.ts
      workspace/route.ts             # Non-secret integration configuration
      health/route.ts
    globals.css                     # Dark theme and responsive layout
    layout.tsx                      # Optional ClerkProvider
    page.tsx
  components/
    dashboard/                      # Main shell, Mermaid, code tour, Markdown, chat
    ui/                             # Radix/CVA button, modal, Spotlight, brand SVG
  lib/
    server/
      access.ts                     # Clerk identity, request guards
      database.ts                   # SQLite/PostgreSQL adapter and schema
      store.ts                      # Tenant-scoped history, leases, quotas, chat
      github.ts                     # Immutable, size-bounded GitHub ingestion
      source-analysis.ts            # Filtering, redaction, detection, chunking
      ingestion.ts                  # Background analysis pipeline
      generation.ts                 # Groq schema validation and graph serialization
      vectors.ts                    # Pinecone embedding, index, retrieval
      clients.ts                    # Server-only service clients
      errors.ts
    chat-stream.ts                  # Incremental NDJSON/UTF-8 decoder
    demo.ts                         # Explicit fictional fixture
    github-url.ts
    types.ts
    utils.ts
  proxy.ts                          # Clerk middleware for Next.js 16
tests/                              # Source, storage, isolation, generation, RAG tests
scripts/smoke-live.mjs               # Explicit local-server / real GitHub smoke test
Dockerfile
DEPLOYMENT.md
.env.example
.github/workflows/ci.yml
```

## Dependency commands

For this checkout use `npm ci`. To recreate the dependency set manually:

```bash
npm install next react react-dom framer-motion lucide-react @clerk/nextjs groq-sdk @pinecone-database/pinecone@^5.1.2 @langchain/core @langchain/textsplitters @langchain/pinecone mermaid react-markdown remark-gfm react-syntax-highlighter class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-dialog server-only postgres zod
npm install -D typescript @types/node @types/react @types/react-dom @types/react-syntax-highlighter tailwindcss @tailwindcss/postcss prettier tsx
```

Pinecone's v5 range matches `@langchain/pinecone@1.0.3`'s peer dependency. Upgrade the adapter and SDK together. shadcn/ui and Aceternity distribute component source; the local source is included. Additional components can be added with `npx shadcn@latest add dialog tooltip tabs` or `npx shadcn@latest add @aceternity/background-beams`; review changes before replacing existing styles.

## Verification

```bash
npm test
npm run typecheck
npm run format:check
npm run build
```

To test a **running local development server** against a real public GitHub repository:

```bash
npm run smoke
```

The smoke script creates a saved `octocat/Spoon-Knife` snapshot and consumes GitHub API requests. It checks invalid URLs, cross-origin rejection, full ingestion, immutable commits, and saved history. It does not make paid AI requests.

Tests use temporary SQLite databases and mocked provider responses to check tenant isolation, quotas, exclusive leases, cancellation, redaction, source line citations, schema validation, dimension checks, streaming, and incomplete-turn handling. CI repeats tests, type checking, formatting, and production compilation. Real Clerk login, Groq/Pinecone services, and hosted PostgreSQL still require your credentials for live verification. Visual browser verification remains pending because the earlier preview permission was declined.

## Documentation and component credits

- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation) and [after()](https://nextjs.org/docs/app/api-reference/functions/after)
- [Clerk Next.js setup](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [shadcn/ui Button](https://ui.shadcn.com/docs/components/button)
- [Aceternity Spotlight](https://ui.aceternity.com/components/spotlight)
- [LangChain code splitting](https://docs.langchain.com/oss/javascript/integrations/splitters/code_splitter)
- [Groq text generation](https://console.groq.com/docs/text-chat)
- [Pinecone embeddings](https://docs.pinecone.io/guides/inference/generate-embeddings)
- [GitHub blob API](https://docs.github.com/en/rest/git/blobs)
