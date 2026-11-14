import "server-only";
import { GitHubClient } from "./github";
import { workspaceStore, type WorkspaceStore } from "./store";
import {
  chunkFiles,
  detectStack,
  healthScore,
  selectCoreFiles,
} from "./source-analysis";
import { generateAssets } from "./generation";
import { configuration } from "./access";
import { embeddingModel, indexChunks, deleteNamespace } from "./vectors";
import { AppError } from "./errors";
import type { RepositoryData, RepositoryRecord } from "../types";

export type IngestionDependencies = {
  github: (signal: AbortSignal) => GitHubClient;
  generate: typeof generateAssets;
  index: typeof indexChunks;
  services: { groq: boolean; pinecone: boolean };
};

export async function runIngestion(
  owner: string,
  id: string,
  store?: WorkspaceStore,
  dependencies?: IngestionDependencies,
) {
  const db = store || (await workspaceStore());
  const repo = await db.claim(owner, id);
  if (!repo) return;
  const deps = dependencies || {
    github: (signal) => new GitHubClient(signal),
    generate: generateAssets,
    index: indexChunks,
    services: configuration(),
  };
  const signal = AbortSignal.timeout(240_000);
  let completedNamespace: string | null = null;
  async function update(
    progress: number,
    stage: string,
    data?: RepositoryData,
  ) {
    signal.throwIfAborted();
    await db.checkLease(repo!);
    await db.save(repo!, { progress, stage, data });
  }
  try {
    const github = deps.github(signal);
    const snapshot = await github.snapshot(repo.url);
    await update(
      8,
      "Reading source files at commit " + snapshot.sha.slice(0, 7),
    );
    const source = await github.contents(snapshot, async (done, total) =>
      update(
        8 + Math.round((done / total) * 35),
        `Reading source files · ${done}/${total}`,
      ),
    );
    await update(45, "Chunking codebase with language-aware separators");
    const chunks = await chunkFiles(source.files);
    const languages: Record<string, number> = {};
    for (const file of source.files)
      languages[file.language] = (languages[file.language] || 0) + file.lines;
    const data: RepositoryData = {
      repository: snapshot.repository,
      commitSha: snapshot.sha,
      files: source.files,
      chunks,
      coreFiles: selectCoreFiles(source.files),
      techStack: detectStack(source.files),
      languages,
      findings: source.findings.slice(0, 100),
      healthScore: healthScore(source.findings),
      assets: null,
      namespace: null,
      embeddingModel: null,
      warnings: [],
      indexedFiles: source.files.length,
      skippedFiles: source.skippedFiles,
    };
    if (snapshot.repository.truncated)
      data.warnings.push(
        "GitHub returned a truncated file tree; coverage is incomplete.",
      );
    if (source.skippedFiles)
      data.warnings.push(
        `${source.skippedFiles} files excluded by type, size, or the 36-file/160 KB analysis budget.`,
      );
    await update(52, "Detecting frameworks and inspecting code health", data);
    if (deps.services.groq) {
      await update(
        57,
        "Generating README, architecture, code tour, and deploy guides",
        data,
      );
      try {
        data.assets = await deps.generate(data, signal);
        data.findings.push(...data.assets.reviewFindings);
      } catch {
        data.warnings.push(
          "AI asset generation failed. Check Groq credentials/model availability, then retry. Source inspection remains available.",
        );
      }
    } else
      data.warnings.push(
        "Set GROQ_API_KEY to generate documentation, architecture, and deploy guides.",
      );
    await update(
      75,
      deps.services.pinecone
        ? "Generating embeddings and indexing code chunks"
        : "Saving source snapshot",
      data,
    );
    if (deps.services.pinecone) {
      try {
        data.namespace = await deps.index(repo, chunks, signal, async (done) =>
          update(
            75 + Math.round((done / Math.max(1, chunks.length)) * 22),
            `Indexing embeddings · ${done}/${chunks.length}`,
            data,
          ),
        );
        data.embeddingModel = embeddingModel();
        completedNamespace = data.namespace;
      } catch (error) {
        data.warnings.push(
          error instanceof AppError
            ? error.message
            : "Vector indexing failed. Check Pinecone credentials, index dimension, and embedding model, then retry.",
        );
      }
    } else
      data.warnings.push(
        "Set PINECONE_API_KEY and PINECONE_INDEX to enable semantic code retrieval.",
      );
    signal.throwIfAborted();
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
          ? "Analysis timed out. Retry with a smaller repository."
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
