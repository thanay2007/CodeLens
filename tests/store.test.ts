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
import { HistoryEncryption } from "../src/lib/server/history-encryption.ts";

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
    await assert.rejects(store.delete("bob", id), /not found/);
    const lease = await store.claim("alice", id);
    assert.ok(lease);
    await store.saveMessages("alice", id, [
      { id: "1", role: "user", content: "Example" },
    ]);
    await store.delete("alice", id);
    await assert.rejects(store.saveMessages("alice", id, []), /not found/);
    await assert.rejects(
      store.save(lease, { progress: 100, stage: "Ready" }),
      /cancelled/,
    );
    assert.deepEqual(await store.list("alice"), []);
    assert.deepEqual(await second.query("SELECT * FROM conversations"), []);
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

test("private history stores encrypted repository identifiers bound to the owner and row", async () => {
  const db = await initializeDatabase(await openDatabase(":memory:"));
  try {
    const encryption = new HistoryEncryption("ab".repeat(32));
    const store = new WorkspaceStore({ ...db, historyEncryption: encryption });
    const { id } = await store.create("alice", "https://github.com/a/b", "a/b");
    const [row] = await db.query("SELECT * FROM repositories");
    assert.notEqual(row.url, "https://github.com/a/b");
    assert.notEqual(row.name, "a/b");
    assert.throws(() => encryption.open("bob", id, "name", String(row.name)));
    assert.throws(() => encryption.open("alice", id, "url", String(row.name)));
    await store.saveMessages("alice", id, [
      { id: "1", role: "user", content: "Private" },
    ]);
    assert.deepEqual(await db.query("SELECT * FROM conversations"), []);
    assert.equal((await store.list("alice"))[0].name, "a/b");
    assert.deepEqual(await store.list("bob"), []);
    await store.delete("alice", id);
    assert.deepEqual(await db.query("SELECT * FROM repositories"), []);
  } finally {
    await db.close();
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
