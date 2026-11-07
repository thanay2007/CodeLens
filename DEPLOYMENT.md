# Deploy CodeLens

CodeLens needs Node.js 22.18+, Clerk authentication in production, persistent SQL storage, and a runtime supporting background work for up to 300 seconds. Groq and Pinecone are optional for source inspection and required for the corresponding AI features.

## Required configuration

1. Create a Clerk application and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Configure your production domain in Clerk. The publishable key must be available **during the Next.js build**; restart/rebuild when changing it. It is public by design.
2. Set `DATABASE_URL` to a PostgreSQL connection string. Database tables and indexes are created on first workspace access. The database principal needs schema creation rights for this initial setup; use your provider's TLS configuration and connection pooling endpoint where appropriate.
3. Add `GROQ_API_KEY` and optionally `GROQ_MODEL` for generated assets and streaming chat.
4. In Pinecone, create a **dense vector index** with cosine similarity and **1024 dimensions** for `multilingual-e5-large`. Set `PINECONE_API_KEY`, `PINECONE_INDEX`, and `PINECONE_EMBEDDING_MODEL=multilingual-e5-large`. The app uses Pinecone hosted inference for embeddings and validates index dimensions. Do not use an incompatible integrated-record/document index with this SDK path.
5. Optionally add a least-privilege `GITHUB_TOKEN` for higher public REST request limits. Only public repositories are supported even if this token can read private repositories.

Source snapshots, job status, quotas, and complete chat turns are persisted in SQL. Vectors live in distinct server-derived namespaces for each user, repository snapshot, and indexing attempt. The app never creates paid indexes or deploys users' repositories automatically.

## Docker / single Node server

```bash
docker build --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_public_key -t codelens .
docker run --env-file .env.production -p 3000:3000 codelens
```

Provide runtime credentials and `DATABASE_URL` through `.env.production` or your host's secret store. No environment files are copied into the image. The runtime runs as the unprivileged `node` user. Next.js standalone output is enabled.

On a **single-instance** deployment you may use SQLite instead of PostgreSQL: omit `DATABASE_URL`, set `CODELENS_DATA_DIR=/data`, and mount a persistent volume at `/data`. The volume must be writable by the runtime user. Production authentication is still required. SQLite is not suitable for multiple app replicas, and Node 22 currently labels its SQLite API experimental.

For a direct Node deployment, run `npm ci`, `npm run build`, then `npm start` with production configuration. Next.js's standard start command also works with the standalone build present; the Docker image runs the standalone server directly.

## Vercel

Import this repository, supply the Clerk publishable key at build time and all secrets at runtime, and use **external PostgreSQL**. Never use SQLite on ephemeral function storage. The ingestion route exports `maxDuration = 300`; select a plan/runtime that supports this duration. Chat exports `maxDuration = 90`.

Ingestion uses Next.js `after()` plus SQL leases. An interrupted job can resume when its owner polls the repository after the 270-second lease expires, up to three attempts. This is a bounded background execution mechanism, not an independent continuously running queue. For larger workloads or guaranteed processing without an active client, move `runIngestion` to a durable queue/worker and retain SQL job leasing. Requests currently inspect up to 36 source files / 160 KB and process at most 300 chunks.

## AWS

Publish the Docker image to ECR and run it in ECS Fargate behind an HTTPS load balancer. Supply Clerk/Groq/Pinecone credentials through Secrets Manager and use an RDS PostgreSQL endpoint reachable from the application's security group. Allow sufficient CPU/memory for the Next.js server and configure a health check against `/api/health`. Use rolling deployments and allow in-flight jobs to drain; interrupted jobs are recoverable through their SQL leases.

## Validation before launch

Run `npm test`, `npm run typecheck`, `npm run format:check`, and `npm run build`. Sign in as two distinct Clerk users and verify their histories are isolated. Analyze a small public repository, verify the immutable commit link, check generated assets against source, ask a cited question, refresh the page to verify saved history, and test cancellation/error behavior.

Automated tests cover SQLite persistence, tenant isolation, leasing, quotas, source handling, and streamed-response parsing. A real hosted PostgreSQL instance, Clerk account, Groq generation, and Pinecone retrieval require your configured credentials for live verification. Browser visual QA is also pending because the earlier local browser preview permission was declined.
