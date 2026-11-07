# CodeLens

**Big codebase. Clear picture.**

A dark, animated developer workspace for AI-powered onboarding and codebase intelligence. Built with Next.js App Router, TypeScript, Tailwind CSS v4, Framer Motion, shadcn-style UI primitives, an adapted Aceternity Spotlight, and Mermaid.

## Start locally

Requires **Node.js 22.18+** (the URL tests use Node's built-in TypeScript support) and npm.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No API keys are needed for the demo or unauthenticated public GitHub preview.

The scripts select Next.js's supported Webpack bundler because Turbopack's CSS worker crashes on the development Windows host. Remove `--webpack` if you prefer Turbopack on a compatible environment.

## Initial folder structure

```text
CodeLens/
├── .github/workflows/ci.yml
├── .env.example
├── components.json                  # shadcn CLI configuration
├── next.config.ts
├── postcss.config.mjs
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── api/repositories/route.ts  # Live public GitHub metadata + tree
│   │   ├── globals.css               # Theme, layout, responsive styles
│   │   ├── icon.svg
│   │   ├── layout.tsx                # Optional ClerkProvider
│   │   └── page.tsx                  # Server entry point
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── dashboard.tsx         # Main dashboard shell + repository views
│   │   │   ├── architecture-map.tsx  # Lazy, strict-mode Mermaid renderer
│   │   │   ├── chat-drawer.tsx       # Animated, accessible demo assistant
│   │   │   ├── code-tour.tsx         # Four sample files + explanations
│   │   │   └── markdown.tsx          # GFM + One Dark syntax highlighting
│   │   └── ui/
│   │       ├── button.tsx            # shadcn-style CVA + Radix Slot button
│   │       ├── github-icon.tsx       # Local brand SVG
│   │       ├── modal.tsx             # Radix dialog with focus trapping
│   │       └── spotlight.tsx         # Adapted Aceternity effect
│   ├── lib/
│   │   ├── server/
│   │   │   ├── clients.ts            # Lazy, server-only Groq/Pinecone factories
│   │   │   └── split-code.ts         # Language-aware LangChain chunking helper
│   │   ├── demo.ts                   # Explicit fictional sample data
│   │   ├── github-url.ts             # Strict public repository URL parsing
│   │   ├── types.ts
│   │   └── utils.ts
│   └── proxy.ts                      # Optional Clerk middleware, Next.js 16
└── tests/github-url.test.ts
```

## Dependency installation commands

The lockfile is committed; use `npm ci` for this checkout. To recreate the dependency set manually:

```bash
npm install next react react-dom framer-motion lucide-react @clerk/nextjs groq-sdk @pinecone-database/pinecone@^5.1.2 @langchain/core @langchain/textsplitters @langchain/pinecone mermaid react-markdown remark-gfm react-syntax-highlighter class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-dialog server-only

npm install -D typescript @types/node @types/react @types/react-dom @types/react-syntax-highlighter tailwindcss @tailwindcss/postcss prettier
```

Pinecone is deliberately pinned to the v5 range to match `@langchain/pinecone@1.0.3`'s peer dependency. Update the adapter and SDK together. The starter uses the legacy vector-index client interface; it does not create an index automatically.

shadcn/ui and Aceternity distribute component source rather than a single application dependency. The initial local components are included and styled for CodeLens. To add more components later:

```bash
npx shadcn@latest add dialog tooltip tabs
npx shadcn@latest add @aceternity/background-beams
```

Review CLI changes before replacing the existing styled components. The animations in this starter use `framer-motion`; some newer Aceternity components install the equivalent `motion` package themselves.

## What works in this iteration

- Responsive deep-space dashboard with sidebar, repository navigation, workspace search (`Ctrl/Cmd + K`), gradient accents, glass panels, and reduced-motion support.
- Public GitHub URL validation and real repository metadata/file-tree preview with errors, timeouts, and an indeterminate progress bar. Clone URLs ending in `.git` are supported. Preview history lasts for the current page session.
- Interactive Mermaid architecture with zoom/reset and `.mmd` export.
- Markdown README preview with GFM tables, syntax highlighting, and download.
- Four-file guided code tour, copy action, and explanations.
- Illustrative tech-stack badges and animated health score.
- Downloadable example deployment checklists for Vercel, Docker, and AWS.
- Accessible right-side chat drawer with preset demo answers and formatted code blocks.
- Optional Clerk sign-in/user profile when both Clerk keys are set.

**All analysis cards, architecture, documentation, health scores, deployment guides, and chat replies use a fictional `acme/storefront` fixture.** Inspecting a real repository opens a separate live metadata preview; it does not replace these sample assets or generate AI results. No AST parsing, embeddings, security audit, or LLM request runs in the demo. The Pro button opens a mock feature preview; billing is not connected.

## Environment and authentication

Copy `.env.example` to `.env.local`, then populate only the services you want to configure. Never commit actual credentials.

| Variable                            | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk's public browser configuration                                             |
| `CLERK_SECRET_KEY`                  | Server authentication; both Clerk keys enable auth UI                            |
| `GITHUB_TOKEN`                      | Optional server token to increase GitHub REST rate limits                        |
| `GROQ_API_KEY`                      | Future generation and streaming integration                                      |
| `GROQ_MODEL`                        | Defaults to `llama-3.3-70b-versatile`; confirm availability in your Groq account |
| `PINECONE_API_KEY`                  | Future embedding/index/retrieval integration                                     |
| `PINECONE_INDEX`                    | Planned index name; defaults in the example to `codelens`                        |

The demo page remains public. When Clerk is configured, the repository preview endpoint requires a signed-in user. It refuses private repositories even if `GITHUB_TOKEN` could read them. API keys remain server-side; only the Clerk publishable key uses the `NEXT_PUBLIC_` prefix.

Without Clerk, the read-only public preview endpoint is available anonymously for local development. Before offering it as a hosted service, enable Clerk and add durable per-user request quotas/rate limits.

## Next iterations

1. **Ingestion:** authenticate the user; pin an immutable commit SHA; fetch allowlisted source files through the GitHub API with size/concurrency limits, exclusions for generated files, binaries, lockfiles, and credential files, and a cancellable background job. Store repository ownership and real progress. The current endpoint reads metadata and the tree only.
2. **Documentation and architecture:** summarize bounded source content and call Groq from authenticated route handlers or Server Actions. Treat repository content as untrusted data. Validate Mermaid with `mermaid.parse` and keep strict rendering. Persist generated assets with the commit SHA and model ID.
3. **RAG:** use `splitCode` for language-aware chunking, then generate embeddings with a dedicated embedding provider or a Pinecone integrated-embedding index. **Groq's Llama inference does not supply embeddings.** Match the vector dimension and metric to the embedding model. Use the same model for documents and queries. Scope namespaces and queries by authenticated user/repository/commit, attach file and line metadata, and remove stale vectors when reindexing. Recursive character splitting prefers function boundaries but may split long functions; use AST-aware splitting if intact functions are a strict requirement.
4. **Chat:** retrieve relevant chunks server-side, include citations, delimit untrusted source content, and stream Groq output through an authenticated `POST /api/chat` endpoint. Replace `getDemoAnswer` with this streaming flow. Do not expose an unauthenticated paid API proxy.
5. **Insights:** detect frameworks from manifests, rank core files, generate evidence-backed health findings and deployment guides. A health score is an indicator, not a security guarantee.

Suggested additions (not implemented yet):

```text
src/app/api/ingestion/route.ts
src/app/api/chat/route.ts
src/app/actions/generate-assets.ts
src/lib/server/github-content.ts
src/lib/server/embeddings.ts
src/lib/server/retrieval.ts
src/lib/server/prompts.ts
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

GitHub Actions runs these checks on pull requests and pushes to `main` and `thanay`. Builds do not require service credentials.

## Documentation and component credits

- [Next.js App Router setup](https://nextjs.org/docs/app/getting-started/installation)
- [Clerk App Router setup](https://clerk.com/docs/nextjs/getting-started/quickstart) — Next.js 16 uses `proxy.ts`.
- [shadcn/ui Button](https://ui.shadcn.com/docs/components/button) — composable source pattern used by the styled local button.
- [Aceternity Spotlight](https://ui.aceternity.com/components/spotlight) — effect adapted in the local SVG component.
- [LangChain code splitting](https://docs.langchain.com/oss/javascript/integrations/splitters/code_splitter)
- [Groq supported models](https://console.groq.com/docs/models)
- [Pinecone indexes](https://docs.pinecone.io/guides/indexes/create-an-index)
