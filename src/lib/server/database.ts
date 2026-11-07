import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Value = string | number | null;
export type Database = {
  query: (sql: string, values?: Value[]) => Promise<Record<string, unknown>[]>;
  close: () => Promise<void>;
};

export async function openDatabase(filename?: string): Promise<Database> {
  if (!filename && process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    return {
      query: async (sql, values = []) =>
        Array.from(await client.unsafe(sql, values)),
      close: async () => {
        await client.end();
      },
    };
  }
  if (
    !filename &&
    process.env.NODE_ENV === "production" &&
    !process.env.CODELENS_DATA_DIR
  ) {
    throw new Error(
      "Set DATABASE_URL or a persistent CODELENS_DATA_DIR before starting the production workspace.",
    );
  }
  const path =
    filename ||
    resolve(process.env.CODELENS_DATA_DIR || ".data", "codelens.sqlite");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  return {
    query: async (sql, values = []) => {
      const bindings: Value[] = [];
      const statement = db.prepare(
        sql.replace(/\$(\d+)/g, (_, index) => {
          bindings.push(values[Number(index) - 1]);
          return "?";
        }),
      );
      return statement.all(...bindings) as Record<string, unknown>[];
    },
    close: async () => {
      db.close();
    },
  };
}

const schema = [
  `CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, url TEXT NOT NULL, name TEXT NOT NULL,
    status TEXT NOT NULL, stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
    error TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until BIGINT NOT NULL DEFAULT 0, data TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS repositories_owner ON repositories(owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS conversations (repository_id TEXT NOT NULL, owner_id TEXT NOT NULL, messages TEXT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(repository_id, owner_id))`,
  `CREATE TABLE IF NOT EXISTS quotas (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS chat_locks (bucket TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at BIGINT NOT NULL)`,
];

export async function initializeDatabase(db: Database) {
  for (const sql of schema) await db.query(sql);
  return db;
}

const globalDb = globalThis as unknown as {
  codelensDatabase?: Promise<Database>;
};
export function database() {
  globalDb.codelensDatabase ??= openDatabase()
    .then(initializeDatabase)
    .catch((error) => {
      globalDb.codelensDatabase = undefined;
      throw error;
    });
  return globalDb.codelensDatabase;
}
