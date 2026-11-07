import { after } from "next/server";
import { actor, errorResponse } from "@/lib/server/access";
import { workspaceStore, summary } from "@/lib/server/store";
import { resumable, runIngestion } from "@/lib/server/ingestion";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await actor(),
      { id } = await context.params,
      store = await workspaceStore();
    await store.quota(owner, "read", 120, 60_000);
    await store.expire(owner, id);
    const repo = await store.get(owner, id);
    if (resumable(repo)) after(() => runIngestion(owner, id));
    return Response.json(
      {
        ...summary(repo),
        data: repo.data
          ? {
              ...repo.data,
              chunks: [],
              namespace: repo.data.namespace ? "indexed" : null,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
