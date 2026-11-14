import "server-only";
import { parseGitHubUrl } from "../github-url";
import { AppError } from "./errors";
import {
  eligiblePath,
  filePriority,
  languageFor,
  sanitizeSource,
} from "./source-analysis";
import type { Finding, RepositoryPreview, SourceFile } from "../types";

type TreeFile = {
  type: string;
  path: string;
  sha: string;
  size?: number;
  mode: string;
};
export async function limitedResponse(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new AppError("GitHub response exceeded the allowed size.", 422);
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("GitHub returned an empty response.", 502);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new AppError("GitHub response exceeded the allowed size.", 422);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export class GitHubClient {
  constructor(
    private signal: AbortSignal,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(path: string, limit = 200_000) {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]),
      redirect: "error",
      cache: "no-store",
    });
    if (response.status === 404)
      throw new AppError(
        "Repository not found. Use a public GitHub repository URL.",
        404,
      );
    if (response.status === 403 || response.status === 429)
      throw new AppError(
        "GitHub API limit reached. Wait before retrying or configure GITHUB_TOKEN on the server.",
        429,
      );
    if (response.status === 409)
      throw new AppError("The repository has no commits to analyze.", 422);
    if (!response.ok)
      throw new AppError("GitHub could not complete this request.", 502);
    return limitedResponse(response, limit);
  }
  async snapshot(url: string) {
    const { owner, repo } = parseGitHubUrl(url);
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const metadata = await this.request(path);
    if (metadata.private)
      throw new AppError("Only public repositories can be analyzed.", 403);
    const ref = await this.request(
      `${path}/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
    );
    const commitSha = ref.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(commitSha))
      throw new AppError("GitHub returned an invalid commit identifier.", 502);
    // The Git commit endpoint avoids downloading a potentially huge commit diff.
    const commit = await this.request(`${path}/git/commits/${commitSha}`);
    const treeSha = commit.tree?.sha;
    if (!/^[a-f0-9]{40}$/.test(treeSha))
      throw new AppError("GitHub returned an invalid tree identifier.", 502);
    const tree = await this.request(
      `${path}/git/trees/${treeSha}?recursive=1`,
      6_000_000,
    );
    const files = (tree.tree as TreeFile[]).filter(
      (item) => item.type === "blob" && item.mode !== "120000",
    );
    const repository: RepositoryPreview = {
      fullName: metadata.full_name,
      description: metadata.description || "No description provided.",
      url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      branch: metadata.default_branch,
      language: metadata.language,
      stars: metadata.stargazers_count,
      fileCount: files.length,
      truncated: Boolean(tree.truncated),
      paths: files.slice(0, 60).map((file) => file.path),
    };
    return { repository, sha: commitSha as string, files, apiPath: path };
  }
  async contents(
    snapshot: Awaited<ReturnType<GitHubClient["snapshot"]>>,
    progress: (done: number, total: number) => Promise<void>,
  ) {
    const candidates = snapshot.files
      .filter(
        (file) => eligiblePath(file.path) && (file.size ?? Infinity) <= 32_000,
      )
      .sort((a, b) => filePriority(b.path) - filePriority(a.path))
      .slice(0, 36);
    const files: SourceFile[] = [],
      findings: Finding[] = [];
    let totalBytes = 0;
    // Bounded sequential requests preserve GitHub's public unauthenticated request budget.
    for (const [index, file] of candidates.entries()) {
      this.signal.throwIfAborted();
      if (totalBytes + (file.size || 0) > 160_000) break;
      if (!/^[a-f0-9]{40}$/.test(file.sha)) continue;
      const blob = await this.request(
        `${snapshot.apiPath}/git/blobs/${file.sha}`,
        60_000,
      );
      if (blob.encoding !== "base64" || typeof blob.content !== "string")
        continue;
      const buffer = Buffer.from(blob.content, "base64");
      if (buffer.length > 32_000 || buffer.includes(0)) continue;
      const raw = buffer.toString("utf8");
      if (raw.includes("\uFFFD")) continue;
      const sanitized = sanitizeSource(file.path, raw);
      files.push({
        path: file.path,
        content: sanitized.content,
        language: languageFor(file.path),
        lines: raw.split("\n").length,
      });
      findings.push(...sanitized.findings);
      totalBytes += buffer.length;
      await progress(index + 1, candidates.length);
    }
    if (!files.length)
      throw new AppError(
        "No eligible text source files were found within the analysis limits.",
        422,
      );
    return {
      files,
      findings,
      skippedFiles: snapshot.files.length - files.length,
    };
  }
}
