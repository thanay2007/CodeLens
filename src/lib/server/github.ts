import "server-only";
import { parseGitHubUrl } from "../github-url";
import { setTimeout as delay } from "node:timers/promises";
import { AppError } from "./errors";
import { eligiblePath, languageFor, sanitizeSource } from "./source-analysis";
import type {
  Finding,
  RepositoryEntry,
  RepositoryPreview,
  SourceFile,
} from "../types";

type TreeFile = {
  type: string;
  path: string;
  sha: string;
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
  async source(url: string, sha: string, path: string) {
    const segments = path.split("/");
    if (
      !/^[a-f0-9]{40}$/.test(sha) ||
      segments.some((part) => !part || part === "." || part === "..") ||
      !eligiblePath(path)
    )
      return null;
    const { owner, repo } = parseGitHubUrl(url);
    const encoded = segments.map(encodeURIComponent).join("/");
    const endpoint = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encoded}`;
    const load = () =>
      this.fetcher(endpoint, {
        signal: AbortSignal.any([this.signal, AbortSignal.timeout(30_000)]),
        redirect: "error",
        cache: "no-store",
      });
    let response = await load();
    for (
      let attempt = 0;
      attempt < 2 && (response.status === 429 || response.status >= 500);
      attempt++
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.body?.cancel().catch(() => undefined);
      await delay(
        retryAfter > 0
          ? Math.min(retryAfter * 1000, 15_000)
          : 500 * (attempt + 1),
        undefined,
        { signal: this.signal },
      );
      response = await load();
    }
    if (!response.ok)
      throw new AppError(
        response.status === 429
          ? "GitHub is throttling source requests. Try again shortly."
          : "GitHub could not return a file from the pinned commit.",
        response.status === 429 ? 429 : 502,
      );
    const stream = response.body?.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let raw = "";
    if (stream) {
      try {
        while (true) {
          const { done, value } = await stream.read();
          if (done) break;
          if (value.includes(0)) return null;
          try {
            raw += decoder.decode(value, { stream: true });
          } catch {
            return null;
          }
        }
        try {
          raw += decoder.decode();
        } catch {
          return null;
        }
      } finally {
        await stream.cancel().catch(() => undefined);
      }
    }
    const sanitized = sanitizeSource(path, raw);
    return {
      file: {
        path,
        content: sanitized.content,
        language: languageFor(path),
        lines: raw.split("\n").length,
      },
      findings: sanitized.findings,
    };
  }
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
      8_000_000,
    );
    const files: RepositoryEntry[] = [];
    const add = (item: TreeFile, prefix = "") => {
      if (item.type === "blob" || item.type === "commit") {
        files.push({
          path: prefix + item.path,
          kind:
            item.type === "commit"
              ? "submodule"
              : item.mode === "120000"
                ? "symlink"
                : "file",
        });
      }
    };
    if (tree.truncated) {
      // Request individual trees because GitHub can truncate recursive responses.
      const pending = [{ sha: treeSha, prefix: "" }];
      const subtrees = new Map<string, TreeFile[]>();
      while (pending.length) {
        const current = pending.pop()!;
        let entries = subtrees.get(current.sha);
        if (!entries) {
          const subtree = await this.request(
            `${path}/git/trees/${current.sha}`,
            8_000_000,
          );
          if (subtree.truncated)
            throw new AppError(
              "GitHub truncated a directory listing. The complete snapshot is unavailable.",
              422,
            );
          entries = subtree.tree as TreeFile[];
          subtrees.set(current.sha, entries);
        }
        for (const entry of entries) {
          if (entry.type === "tree") {
            if (!/^[a-f0-9]{40}$/.test(entry.sha))
              throw new AppError(
                "GitHub returned an invalid directory identifier.",
                502,
              );
            pending.push({
              sha: entry.sha,
              prefix: current.prefix + entry.path + "/",
            });
          } else add(entry, current.prefix);
        }
      }
    } else {
      for (const item of tree.tree as TreeFile[]) add(item);
    }
    const repository: RepositoryPreview = {
      fullName: metadata.full_name,
      description: metadata.description
        ? sanitizeSource("repository description", String(metadata.description))
            .content
        : "No description provided.",
      url: `https://github.com/${metadata.full_name}`,
      branch: metadata.default_branch,
      language: metadata.language,
      stars: metadata.stargazers_count,
      fileCount: files.length,
      truncated: false,
      paths: files.map((file) => file.path),
      entries: files,
    };
    return { repository, sha: commitSha as string, files };
  }
  async contents(
    snapshot: Awaited<ReturnType<GitHubClient["snapshot"]>>,
    progress: (done: number, total: number) => Promise<void>,
  ) {
    const files: SourceFile[] = [];
    const findings: Finding[] = [];
    const total = snapshot.files.length;
    const stop = new AbortController();
    const reader = new GitHubClient(
      AbortSignal.any([this.signal, stop.signal]),
      this.fetcher,
    );
    // Batch progress writes and bound request concurrency while visiting the full tree.
    for (let start = 0; start < total; start += 12) {
      try {
        const results = await Promise.all(
          snapshot.files.slice(start, start + 12).map(async (entry) => {
            if (entry.kind !== "file") return null;
            if (!eligiblePath(entry.path)) {
              entry.preview = "protected";
              return null;
            }
            const result = await reader.source(
              snapshot.repository.url,
              snapshot.sha,
              entry.path,
            );
            entry.preview = result ? "text" : "binary";
            return result;
          }),
        );
        for (const result of results) {
          if (!result) continue;
          files.push(result.file);
          findings.push(...result.findings);
        }
        await progress(Math.min(start + 12, total), total);
      } catch (error) {
        stop.abort();
        throw error;
      }
    }
    return {
      files,
      findings,
      skippedFiles: snapshot.files.length - files.length,
    };
  }
}
