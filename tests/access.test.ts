import test from "node:test";
import assert from "node:assert/strict";
import { actor, readJson, sameOrigin } from "../src/lib/server/access.ts";

test("production workspace refuses unauthenticated development fallback", async () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  };
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try {
    await assert.rejects(actor(), /Configure Clerk/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("cross-site writes and oversized request streams are rejected", async () => {
  assert.throws(
    () =>
      sameOrigin(
        new Request("http://localhost/api/repositories", {
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    /Cross-origin/,
  );
  assert.throws(
    () =>
      sameOrigin(
        new Request("http://localhost/api/repositories", {
          headers: { "Sec-Fetch-Site": "cross-site" },
        }),
      ),
    /Cross-origin/,
  );
  await assert.rejects(
    readJson(
      new Request("http://localhost/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "x".repeat(200) }),
      }),
      100,
    ),
    /too large/,
  );
});
