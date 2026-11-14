import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  openDatabase,
  initializeDatabase,
} from "../src/lib/server/database.ts";
import { WorkspaceStore } from "../src/lib/server/store.ts";

test("persisted repository history survives reopening and remains user-scoped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codelens-store-"));
  const path = join(directory, "test.sqlite");
  const first = await initializeDatabase(await openDatabase(path));
  const id = (
    await new WorkspaceStore(first).create(
      "alice",
      "https://github.com/a/b",
      "a/b",
    )
  ).id;
  await first.close();
  const second = await initializeDatabase(await openDatabase(path));
  try {
    const store = new WorkspaceStore(second);
    assert.equal((await store.get("alice", id)).name, "a/b");
    assert.deepEqual(await store.list("bob"), []);
    await assert.rejects(store.get("bob", id), /not found/);
    await assert.rejects(store.cancel("bob", id), /not found/);
    await assert.rejects(store.messages("bob", id), /not found/);
  } finally {
    await second.close();
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + "\\") &&
      !resolve(directory).startsWith(resolve(tmpdir()) + "/")
    )
      throw new Error("Unsafe test cleanup");
    await rm(directory, { recursive: true });
  }
});

test("job claims are exclusive; cancellation prevents late worker writes", async () => {
  const db = await initializeDatabase(await openDatabase(":memory:"));
  try {
    const store = new WorkspaceStore(db),
      repo = await store.create("alice", "https://github.com/a/b", "a/b");
    const claimed = await store.claim("alice", repo.id);
    assert.ok(claimed);
    assert.equal(await store.claim("alice", repo.id), null);
    await store.cancel("alice", repo.id);
    await assert.rejects(
      store.save(claimed, { progress: 100, stage: "Ready", status: "ready" }),
      /cancelled/,
    );
    assert.equal((await store.get("alice", repo.id)).status, "cancelled");
  } finally {
    await db.close();
  }
});

test("durable quotas and conversation leases isolate users", async () => {
  const db = await initializeDatabase(await openDatabase(":memory:"));
  try {
    const store = new WorkspaceStore(db);
    await store.quota("alice", "chat", 1, 60000);
    await assert.rejects(store.quota("alice", "chat", 1, 60000), /limit/);
    await store.quota("bob", "chat", 1, 60000);
    const release = await store.lockChat("alice", "repo");
    await assert.rejects(store.lockChat("alice", "repo"), /already/);
    await release();
    const releaseAgain = await store.lockChat("alice", "repo");
    await releaseAgain();
  } finally {
    await db.close();
  }
});
