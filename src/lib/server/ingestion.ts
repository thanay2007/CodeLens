import "server-only";
import { GitHubClient } from "./github";
import { workspaceStore, type WorkspaceStore } from "./store";
import { chunkFiles, detectStack, selectCoreFiles } from "./source-analysis";
import { generateAssets } from "./generation";
import { describeRepository } from "./repository-insights";
import { configuration } from "./access";
import { embeddingModel, indexChunks, deleteNamespace } from "./vectors";
import { AppError } from "./errors";
import type { RepositoryData, RepositoryRecord } from "../types";

export type IngestionDependencies = {
  github: (signal: AbortSignal) => GitHubClient;
  generate: typeof generateAssets;
  index: typeof indexChunks;
  services: { gemini?: boolean; groq: boolean; pinecone: boolean };
};

export async function runIngestion(
  owner: string,
  id: string,
  store?: WorkspaceStore,
  dependencies?: IngestionDependencies,
) {
  const db = store || (await workspaceStore(owner));
  const repo = await db.claim(owner, id);
  if (!repo) return;
  const deps = dependencies || {
    github: (signal) => new GitHubClient(signal),
    generate: generateAssets,
    index: indexChunks,
    services: configuration(),
  };
  const signal = AbortSignal.timeout(240_000);
  const deadline = Date.now() + 240_000;
  const optionalWorkSignal = () =>
    AbortSignal.timeout(Math.max(1, deadline - Date.now() - 20_000));
  let completedNamespace: string | null = null;
  async function update(
    progress: number,
    stage: string,
    data?: RepositoryData,
  ) {
    await db.checkLease(repo!);
    await db.save(repo!, { progress, stage, data });
  }
  try {
    const github = deps.github(signal);
    const snapshot = await github.snapshot(repo.url);
    await update(8, "Reading committed files");
    const source = await github.contents(snapshot, async (done, total) =>
      update(
        8 + Math.round((done / total) * 35),
        `Scanning repository entries · ${done}/${total}`,
      ),
    );
    const languages: Record<string, number> = {};
    for (const file of source.files)
      languages[file.language] = (languages[file.language] || 0) + file.lines;
    const data: RepositoryData = {
      repository: snapshot.repository,
      commitSha: snapshot.sha,
      files: source.files,
      chunks: [],
      coreFiles: selectCoreFiles(source.files),
      techStack: detectStack(source.files),
      languages,
      findings: [],
      healthScore: 100,
      assets: null,
      namespace: null,
      embeddingModel: null,
      warnings: [],
      indexedFiles: source.files.length,
      skippedFiles: source.skippedFiles,
    };
    if (source.skippedFiles)
      data.warnings.push(
        `${source.skippedFiles} entries are listed in Code Tour without an inline source preview (binary, protected, symlink, or submodule).`,
      );
    data.assets = describeRepository(data);
    await update(52, "Mapping repository components", data);
    if (
      (deps.services.gemini || deps.services.groq) &&
      deadline - Date.now() > 22_000
    ) {
      await update(57, "Writing repository documentation and architecture");
      try {
        data.assets = await deps.generate(data, optionalWorkSignal());
      } catch {
        data.warnings.push(
          "AI enrichment was unavailable for this run. The source-based guide and architecture are ready.",
        );
      }
    } else if (deps.services.gemini || deps.services.groq) {
      data.warnings.push(
        "The scan used the available time. The source-based guide and architecture are ready.",
      );
    }
    await update(
      75,
      deps.services.pinecone
        ? "Generating embeddings and indexing code chunks"
        : "Saving source snapshot",
      data,
    );
    if (
      data.indexedFiles > 0 &&
      deps.services.pinecone &&
      deadline - Date.now() > 22_000
    ) {
      try {
        const budget = optionalWorkSignal();
        const chunks = await chunkFiles(source.files, budget);
        data.chunks = chunks;
        if (chunks.length) {
          data.namespace = await deps.index(
            repo,
            chunks,
            budget,
            async (done) =>
              update(
                75 + Math.round((done / Math.max(1, chunks.length)) * 22),
                `Indexing embeddings · ${done}/${chunks.length}`,
              ),
          );
          data.embeddingModel = embeddingModel();
          completedNamespace = data.namespace;
        }
      } catch (error) {
        data.warnings.push(
          error instanceof AppError
            ? error.message
            : "The semantic index could not finish. CodeLens can still answer using source search.",
        );
      }
    }
    await db.save(repo, {
      progress: 100,
      stage: "Source snapshot ready",
      status: "ready",
      data,
    });
  } catch (error) {
    if (completedNamespace && !dependencies)
      await deleteNamespace(completedNamespace).catch(() => undefined);
    const message =
      error instanceof AppError
        ? error.message
        : signal.aborted
          ? "Source scanning reached the server's execution timeout."
          : "Analysis could not finish. Check GitHub connectivity and retry.";
    await db
      .save(repo, {
        progress: repo.progress,
        stage: "Analysis failed",
        status: "failed",
        error: message,
      })
      .catch(() => undefined);
  }
}

export function resumable(repo: RepositoryRecord) {
  return (
    repo.status === "queued" ||
    (repo.status === "processing" &&
      repo.leaseUntil < Date.now() &&
      repo.attempts < 3)
  );
}
