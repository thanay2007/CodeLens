# Deploy CodeLens

CodeLens needs Node.js 22.18+, Clerk authentication in production, persistent SQL storage, and a runtime supporting background work for up to 300 seconds. Gemini and Groq are optional providers for documentation, architecture, and chat. Pinecone provides optional semantic search.

## Required configuration

1. Create a Clerk application and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Configure your production domain in Clerk. The publishable key must be available **during the Next.js build**; restart/rebuild when changing it. It is public by design.
2. Configure [Supabase history](#supabase-history) for encrypted per-user repository history. An existing installation can continue using its PostgreSQL connection via `DATABASE_URL`.
3. Set `GEMINI_API_KEY` for the primary model. Set `GROQ_API_KEY` for fallback. Override model IDs with `GEMINI_MODEL` or `GROQ_MODEL` as needed.
4. In Pinecone, create a **dense vector index** with cosine similarity and **1024 dimensions** for `multilingual-e5-large`. Set `PINECONE_API_KEY`, `PINECONE_INDEX`, and `PINECONE_EMBEDDING_MODEL=multilingual-e5-large`. The app uses Pinecone hosted inference for embeddings and validates index dimensions. Do not use an incompatible integrated-record/document index with this SDK path.
5. Optionally add a least-privilege `GITHUB_TOKEN` for higher public REST request limits. Only public repositories are supported even if this token can read private repositories.

## Supabase history

1. Apply [the private workspace migration](supabase/migrations/20261114000000_private_workspace.sql) in the Supabase SQL Editor. Keep `codelens_private` out of the Data API's exposed schemas.
2. Set a strong password for the new `codelens_app` role using the SQL Editor or `psql`. Copy the project connection details from **Connect** and set `SUPABASE_DATABASE_URL` with that role and its URL-encoded password. With Supabase's shared pooler, use the username `codelens_app.<project-ref>`. The application uses certificate-verified TLS and disables prepared statements for pooler compatibility.
3. Generate a 32-byte secret using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it as `CODELENS_HISTORY_KEY` in the server's secret store and keep a secure backup outside the database. Use the same key across app instances and deployments. Changing it without migrating encrypted rows makes the old history inaccessible.
4. Configure Clerk and restart CodeLens. Signed-in users have independent history across devices. Existing local SQLite or legacy PostgreSQL history stays in its original database. Analyze those repositories again to create history in Supabase.

Supabase stores encrypted repository URLs, names, and analysis summaries, alongside pseudonymous owner IDs and operational status and timestamps. It has no tables for raw source, embeddings, or chats. The app restricts workspace APIs to the signed-in account and blocks [Clerk impersonation sessions](https://clerk.com/docs/guides/users/impersonation). Supabase operators with direct database privileges can see ciphertext and operational fields. Anyone with both the database contents and app encryption key can decrypt the history. Deleting an entry removes its live database row and associated Pinecone index data. Provider backup retention is configured separately.

See [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

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

Ingestion uses Next.js `after()` plus SQL leases. An interrupted job can resume when its owner polls the repository after the 270-second lease expires, up to three attempts. The full tree is visited and eligible text is inspected without app-level file or chunk caps. Large repositories are still subject to the hosting runtime's execution and memory constraints and upstream provider limits.

## AWS

Publish the Docker image to ECR and run it in ECS Fargate behind an HTTPS load balancer. Supply Clerk/Gemini/Groq/Pinecone credentials through Secrets Manager and use an RDS PostgreSQL endpoint reachable from the application's security group. Allow sufficient CPU/memory for the Next.js server and configure a health check against `/api/health`. Use rolling deployments and allow in-flight jobs to drain; interrupted jobs are recoverable through their SQL leases.

## Validation before launch

Run `npm test`, `npm run typecheck`, `npm run format:check`, and `npm run build`. Sign in as two distinct Clerk users and verify their histories are isolated. Analyze a small public repository, verify the immutable commit link, check generated assets against source, ask a cited question, refresh the page to verify saved history, and test cancellation/error behavior.

Automated tests cover SQLite persistence, encryption, tenant isolation, leasing, quotas, source handling, and streamed-response parsing. Live Supabase, Clerk, Gemini, Groq, and Pinecone verification requires configured credentials.
