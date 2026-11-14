import {
  actor,
  errorResponse,
  readJson,
  sameOrigin,
} from "@/lib/server/access";
import { workspaceStore } from "@/lib/server/store";
import { AppError } from "@/lib/server/errors";

export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    sameOrigin(request);
    const owner = await actor(),
      body = await readJson(request, 1000),
      store = await workspaceStore();
    if (!body || typeof body.repositoryId !== "string")
      throw new AppError("Select a repository.");
    await store.get(owner, body.repositoryId);
    await store.quota(owner, "reset-chat", 10, 60_000);
    release = await store.lockChat(owner, body.repositoryId);
    await store.saveMessages(owner, body.repositoryId, []);
    return Response.json({ reset: true });
  } catch (error) {
    return errorResponse(error);
  } finally {
    await release?.().catch(() => undefined);
  }
}
