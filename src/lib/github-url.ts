export function parseGitHubUrl(input: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(
      "Enter a full GitHub URL, such as https://github.com/owner/repository.",
    );
  }
  const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 2
  ) {
    throw new Error(
      "Use a public repository URL: https://github.com/owner/repository.",
    );
  }
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) ||
    repo === "." ||
    repo === ".."
  ) {
    throw new Error("This GitHub owner or repository name is invalid.");
  }
  return { owner, repo };
}
