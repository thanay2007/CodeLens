import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl } from "../src/lib/github-url.ts";

test("accepts repository and clone URLs", () => {
  assert.deepEqual(
    parseGitHubUrl(" https://github.com/thanay2007/CodeLens.git "),
    { owner: "thanay2007", repo: "CodeLens" },
  );
  assert.deepEqual(parseGitHubUrl("https://github.com/vercel/next.js/"), {
    owner: "vercel",
    repo: "next.js",
  });
});

test("rejects non-GitHub destinations and embedded credentials", () => {
  for (const input of [
    "http://github.com/a/b",
    "https://github.com.evil.test/a/b",
    "https://github.com@evil.test/a/b",
    "https://user@github.com/a/b",
    "https://github.com:4430/a/b",
    "https://localhost/a/b",
  ]) {
    assert.throws(() => parseGitHubUrl(input));
  }
});

test("rejects branch URLs, query strings, encoded paths, and malformed input", () => {
  for (const input of [
    "https://github.com/a/b/tree/main",
    "https://github.com/a/b?ref=main",
    "https://github.com/a/b#section",
    "https://github.com/a%2fb/c",
    "https://github.com/a/.git",
    "https://github.com/a",
    "not a url",
  ]) {
    assert.throws(() => parseGitHubUrl(input));
  }
});
