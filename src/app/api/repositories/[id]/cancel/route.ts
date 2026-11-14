import { actor, errorResponse, sameOrigin } from "@/lib/server/access";
import { workspaceStore } from "@/lib/server/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await actor(),
      { id } = await context.params;
    const store = await workspaceStore(owner);
    await store.cancel(owner, id);
    return Response.json({ cancelled: true });
  } catch (error) {
    return errorResponse(error);
  }
}
