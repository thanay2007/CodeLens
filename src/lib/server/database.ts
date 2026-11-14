import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HistoryEncryption } from "./history-encryption";

type Value = string | number | null;
type Query = (
  sql: string,
  values?: Value[],
) => Promise<Record<string, unknown>[]>;
export type Database = {
  query: Query;
  transaction: <T>(work: (query: Query) => Promise<T>) => Promise<T>;
  dialect: "postgresql" | "sqlite";
  historyEncryption?: HistoryEncryption;
  scope?: (owner: string) => Database;
  close: () => Promise<void>;
};

export async function openDatabase(filename?: string): Promise<Database> {
  const supabase = !filename && process.env.SUPABASE_DATABASE_URL;
  const connection = !filename && (supabase || process.env.DATABASE_URL);
  if (connection) {
    const encryption = supabase
      ? new HistoryEncryption(process.env.CODELENS_HISTORY_KEY || "")
      : undefined;
    const { default: postgres } = await import("postgres");
    const client = postgres(connection, {
      max: supabase ? 1 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ...(supabase ? { ssl: "verify-full" as const, prepare: false } : {}),
    });
    const db: Database = {
      dialect: "postgresql",
      historyEncryption: encryption,
      query: async (sql, values = []) =>
        Array.from(await client.unsafe(sql, values)),
      transaction: async (work) =>
        client.begin((tx) =>
          work(async (sql, values = []) =>
            Array.from(await tx.unsafe(sql, values)),
          ),
        ),
      close: async () => {
        await client.end();
      },
    };
    if (supabase)
      db.scope = (owner) => {
        const transaction: Database["transaction"] = (work) =>
          db.transaction(async (query) => {
            await query("SET LOCAL search_path TO codelens_private");
            await query("SELECT set_config('codelens.owner_id', $1, true)", [
              owner,
            ]);
            return work(query);
          });
        return {
          ...db,
          transaction,
          query: (sql, values) => transaction((query) => query(sql, values)),
        };
      };
    return db;
  }
  if (
    !filename &&
    process.env.NODE_ENV === "production" &&
    !process.env.CODELENS_DATA_DIR
  ) {
    throw new Error(
      "Set SUPABASE_DATABASE_URL, DATABASE_URL, or a persistent CODELENS_DATA_DIR before starting the production workspace.",
    );
  }
  const path =
    filename ||
    resolve(process.env.CODELENS_DATA_DIR || ".data", "codelens.sqlite");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  const query: Query = async (sql, values = []) => {
    const bindings: Value[] = [];
    const statement = db.prepare(
      sql.replace(/\$(\d+)/g, (_, index) => {
        bindings.push(values[Number(index) - 1]);
        return "?";
      }),
    );
    return statement.all(...bindings) as Record<string, unknown>[];
  };
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(work: () => Promise<T>) {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    dialect: "sqlite",
    query: (sql, values) => serialize(() => query(sql, values)),
    transaction: (work) =>
      serialize(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await work(query);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }),
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
  if (db.scope) return db;
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
