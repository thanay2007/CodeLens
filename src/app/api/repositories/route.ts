import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseGitHubUrl } from "@/lib/github-url";
import type { RepositoryPreview } from "@/lib/types";

export const runtime = "nodejs";

class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function github(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status === 404)
    throw new GitHubError(
      "Repository not found. Check the URL and make sure the repository is public.",
      404,
    );
  if (response.status === 403 || response.status === 429)
    throw new GitHubError(
      "GitHub's API limit was reached. Try again later, or configure a server-side GITHUB_TOKEN.",
      429,
    );
  if (response.status === 409)
    throw new GitHubError(
      "This repository is empty. Add a commit before inspecting its file tree.",
      422,
    );
  if (!response.ok)
    throw new GitHubError(
      "GitHub could not complete this request. Please try again.",
      502,
    );
  return response.json();
}

export async function POST(request: Request) {
  // Public, bounded preview without credentials; enabling Clerk requires a session.
  if (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  ) {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json(
        { error: "Sign in to inspect a repository." },
        { status: 401 },
      );
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== "string" || body.url.length > 300) {
    return NextResponse.json(
      { error: "Provide a valid GitHub repository URL." },
      { status: 400 },
    );
  }
  let repository: ReturnType<typeof parseGitHubUrl>;
  try {
    repository = parseGitHubUrl(body.url);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
  try {
    const path = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    const metadata = await github(path);
    // A server token must never turn this public-only endpoint into private repo access.
    if (metadata.private)
      throw new GitHubError(
        "Only public repositories are supported in this starter.",
        403,
      );
    const tree = await github(
      `${path}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`,
    );
    const files = (tree.tree as { type: string; path: string }[]).filter(
      (item) => item.type === "blob",
    );
    const preview: RepositoryPreview = {
      fullName: metadata.full_name,
      description:
        metadata.description || "No repository description provided.",
      url: metadata.html_url,
      branch: metadata.default_branch,
      language: metadata.language,
      stars: metadata.stargazers_count,
      fileCount: files.length,
      truncated: Boolean(tree.truncated),
      paths: files.slice(0, 60).map((item) => item.path),
    };
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof GitHubError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Unable to reach GitHub. Check your connection and try again." },
      { status: 502 },
    );
  }
}
