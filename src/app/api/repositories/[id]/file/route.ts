import { actor, errorResponse } from "@/lib/server/access";
import { AppError } from "@/lib/server/errors";
import { GitHubClient } from "@/lib/server/github";
import { workspaceStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await actor();
    const { id } = await context.params;
    const store = await workspaceStore(owner);
    await store.quota(owner, "file-preview", 120, 60_000);
    const { data } = await store.get(owner, id);
    const path = new URL(request.url).searchParams.get("path");
    if (!data || !path) throw new AppError("File not found.", 404);
    const cached = data.files.find((file) => file.path === path);
    const entry = data.repository.entries?.find((item) => item.path === path);
    if (!cached && (entry?.kind !== "file" || entry.preview !== "text"))
      throw new AppError("A text preview is unavailable for this entry.", 404);
    const file =
      cached ??
      (
        await new GitHubClient(request.signal).source(
          data.repository.url,
          data.commitSha,
          path,
        )
      )?.file;
    if (!file)
      throw new AppError("A text preview is unavailable for this entry.", 404);
    return Response.json(file, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
