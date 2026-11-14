import { after } from "next/server";
import {
  actor,
  errorResponse,
  readJson,
  sameOrigin,
} from "@/lib/server/access";
import { parseGitHubUrl } from "@/lib/github-url";
import { workspaceStore, summary } from "@/lib/server/store";
import { runIngestion } from "@/lib/server/ingestion";
import { AppError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    const owner = await actor(),
      store = await workspaceStore(owner);
    await store.quota(owner, "read", 120, 60_000);
    return Response.json(
      { repositories: await store.list(owner) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await actor(),
      body = await readJson(request, 1000);
    if (!body || typeof body.url !== "string" || body.url.length > 300)
      throw new AppError("Enter a public GitHub repository URL.");
    let parsed;
    try {
      parsed = parseGitHubUrl(body.url);
    } catch (error) {
      throw new AppError((error as Error).message);
    }
    const store = await workspaceStore(owner);
    await store.quota(owner, "ingestion-hour", 10, 3_600_000);
    await store.quota(owner, "ingestion-day", 30, 86_400_000);
    const repo = await store.create(
      owner,
      `https://github.com/${parsed.owner}/${parsed.repo}`,
      `${parsed.owner}/${parsed.repo}`,
    );
    after(() => runIngestion(owner, repo.id));
    return Response.json(summary(repo), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
