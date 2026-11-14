import { after } from "next/server";
import { actor, errorResponse, sameOrigin } from "@/lib/server/access";
import { workspaceStore, summary } from "@/lib/server/store";
import { resumable, runIngestion } from "@/lib/server/ingestion";
import { describeRepository } from "@/lib/server/repository-insights";
import { sourceArchitecture } from "@/lib/server/architecture-tree";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await actor();
    const { id } = await context.params;
    const store = await workspaceStore(owner);
    await store.delete(owner, id);
    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await actor(),
      { id } = await context.params,
      store = await workspaceStore(owner);
    await store.quota(owner, "read", 120, 60_000);
    await store.expire(owner, id);
    const repo = await store.get(owner, id);
    if (resumable(repo)) after(() => runIngestion(owner, id));
    const data = repo.data;
    const assets =
      data &&
      (() => {
        if (!data.assets) return describeRepository(data);
        if (data.assets.architectureTree) return data.assets;
        if (!data.files.length)
          return { ...data.assets, architectureTree: sourceArchitecture(data) };
        const guide = describeRepository(data);
        return data.assets.generatedBy
          ? {
              ...data.assets,
              architectureTree: guide.architectureTree,
              flows: guide.flows,
            }
          : guide;
      })();
    return Response.json(
      {
        ...summary(repo),
        data: data
          ? {
              ...data,
              assets: assets && {
                ...assets,
                coreFiles: assets.coreFiles.map((file) => ({
                  ...file,
                  code: "",
                })),
              },
              coreFiles: data.coreFiles.map((file) => ({ ...file, code: "" })),
              chunks: [],
              files: data.repository.entries
                ? []
                : data.files.map(({ content: _content, ...file }) => file),
              namespace: data.namespace ? "indexed" : null,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
