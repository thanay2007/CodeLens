import assert from "node:assert/strict";

const base = process.env.CODELENS_SMOKE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error(
    "Live smoke tests only run against a local development server.",
  );
const request = async (path, options) => {
  const response = await fetch(base + path, {
    ...options,
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error}`);
  return body;
};
const services = await request("/api/workspace");
assert.equal(
  services.clerk,
  false,
  "Use an unconfigured development server for CLI smoke tests; Clerk-enabled servers require an authenticated browser session.",
);
assert.equal(
  services.local,
  true,
  "Use a development server for this smoke test.",
);
const invalid = await fetch(base + "/api/repositories", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com/private" }),
});
assert.equal(invalid.status, 400);
const crossOrigin = await fetch(base + "/api/repositories", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://other.example",
  },
  body: JSON.stringify({ url: "https://github.com/octocat/Spoon-Knife" }),
});
assert.equal(crossOrigin.status, 403);
const created = await request("/api/repositories", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://github.com/octocat/Spoon-Knife" }),
});
console.log(JSON.stringify({ id: created.id, status: created.status }));
let result;
for (let attempt = 0; attempt < 60; attempt++) {
  result = await request(`/api/repositories/${created.id}`);
  if (!["queued", "processing"].includes(result.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
assert.equal(result.status, "ready", result.error || result.stage);
assert.ok(result.data.files.length > 0);
assert.match(result.data.commitSha, /^[a-f0-9]{40}$/);
assert.equal("ownerId" in result, false);
assert.equal("leaseToken" in result, false);
const history = await request("/api/repositories");
assert.ok(history.repositories.some((item) => item.id === created.id));
console.log(
  JSON.stringify({
    status: result.status,
    files: result.data.files.length,
    commit: result.data.commitSha,
    warnings: result.data.warnings,
  }),
);
