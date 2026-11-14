import "server-only";
import { randomUUID } from "node:crypto";
import { database, type Database } from "./database";
import { AppError } from "./errors";
import { deleteNamespace } from "./vectors";
import type {
  ChatMessage,
  RepositoryData,
  RepositoryRecord,
  RepositorySummary,
} from "../types";

function record(row: Record<string, unknown>): RepositoryRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    url: String(row.url),
    name: String(row.name),
    status: row.status as RepositoryRecord["status"],
    stage: String(row.stage),
    progress: Number(row.progress),
    error: row.error ? String(row.error) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    attempts: Number(row.attempts),
    leaseToken: row.lease_token ? String(row.lease_token) : null,
    leaseUntil: Number(row.lease_until),
    data: row.data ? JSON.parse(String(row.data)) : null,
  };
}
export function summary(repo: RepositoryRecord): RepositorySummary {
  const {
    data: _data,
    ownerId: _owner,
    leaseToken: _token,
    leaseUntil: _until,
    ...result
  } = repo;
  return result;
}
export class WorkspaceStore {
  constructor(private db: Database) {}
  get historyOnly() {
    return Boolean(this.db.historyEncryption);
  }
  private repository(row: Record<string, unknown>) {
    const encryption = this.db.historyEncryption;
    if (!encryption) return record(row);
    const result = { ...row };
    for (const field of ["url", "name", "data"]) {
      if (typeof result[field] === "string")
        result[field] = encryption.open(
          String(row.owner_id),
          String(row.id),
          field,
          result[field],
        );
    }
    return record(result);
  }
  private protect(owner: string, id: string, field: string, value: string) {
    return this.db.historyEncryption?.seal(owner, id, field, value) ?? value;
  }
  async list(owner: string) {
    return (
      await this.db.query(
        "SELECT id,owner_id,url,name,status,stage,progress,error,created_at,updated_at,attempts,lease_token,lease_until FROM repositories WHERE owner_id=$1 ORDER BY created_at DESC, id DESC",
        [owner],
      )
    ).map((row) => summary(this.repository(row)));
  }
  async get(owner: string, id: string) {
    const rows = await this.db.query(
      "SELECT * FROM repositories WHERE owner_id=$1 AND id=$2",
      [owner, id],
    );
    if (!rows[0]) throw new AppError("Repository not found.", 404);
    return this.repository(rows[0]);
  }
  async create(owner: string, url: string, name: string) {
    const release = await this.lockChat(
      owner,
      "create-ingestion",
      "Another analysis is being scheduled. Please try again.",
    );
    try {
      const active = await this.db.query(
        "SELECT id FROM repositories WHERE owner_id=$1 AND status IN ('queued','processing')",
        [owner],
      );
      if (active.length >= 2)
        throw new AppError(
          "Two analyses are already running. Wait for one to finish or cancel it.",
          429,
        );
      const id = randomUUID(),
        now = Date.now();
      const rows = await this.db.query(
        "INSERT INTO repositories (id,owner_id,url,name,status,stage,progress,created_at,updated_at) VALUES ($1,$2,$3,$4,'queued','Waiting to start',0,$5,$5) RETURNING *",
        [
          id,
          owner,
          this.protect(owner, id, "url", url),
          this.protect(owner, id, "name", name),
          now,
        ],
      );
      return this.repository(rows[0]);
    } finally {
      await release();
    }
  }
  async claim(owner: string, id: string) {
    const now = Date.now();
    const rows = await this.db.query(
      "UPDATE repositories SET status='processing',stage='Fetching repository',lease_token=$1,lease_until=$2,updated_at=$3,attempts=attempts+1 WHERE id=$4 AND owner_id=$5 AND attempts<3 AND (status='queued' OR (status='processing' AND lease_until<$3)) RETURNING *",
      [randomUUID(), now + 270_000, now, id, owner],
    );
    return rows[0] ? this.repository(rows[0]) : null;
  }
  async save(
    repo: RepositoryRecord,
    patch: {
      progress: number;
      stage: string;
      data?: RepositoryData;
      status?: "ready" | "failed";
      error?: string;
    },
  ) {
    const data =
      patch.data && this.historyOnly
        ? {
            ...patch.data,
            files: [],
            chunks: [],
            coreFiles: patch.data.coreFiles.map((file) => ({
              ...file,
              code: "",
            })),
            assets: patch.data.assets && {
              ...patch.data.assets,
              coreFiles: patch.data.assets.coreFiles.map((file) => ({
                ...file,
                code: "",
              })),
            },
          }
        : patch.data;
    const now = Date.now();
    const status = patch.status || "processing";
    const error = patch.error || null;
    const rows = await this.db.query(
      "UPDATE repositories SET progress=$1,stage=$2,data=COALESCE($3,data),status=$4,error=$5,updated_at=$6 WHERE id=$7 AND owner_id=$8 AND lease_token=$9 AND status='processing' RETURNING id",
      [
        patch.progress,
        patch.stage,
        data
          ? this.protect(repo.ownerId, repo.id, "data", JSON.stringify(data))
          : null,
        status,
        error,
        now,
        repo.id,
        repo.ownerId,
        repo.leaseToken,
      ],
    );
    if (!rows[0]) throw new AppError("Analysis cancelled or superseded.", 409);
    Object.assign(repo, {
      data: data ?? repo.data,
      status,
      error,
      updatedAt: now,
      progress: patch.progress,
      stage: patch.stage,
    });
    return repo;
  }
  async cancel(owner: string, id: string) {
    await this.get(owner, id);
    await this.db.query(
      "UPDATE repositories SET status='cancelled',stage='Cancelled',updated_at=$1 WHERE id=$2 AND owner_id=$3 AND status IN ('queued','processing')",
      [Date.now(), id, owner],
    );
  }
  async checkLease(repo: RepositoryRecord) {
    const [current] = await this.db.query(
      "SELECT status,lease_token FROM repositories WHERE owner_id=$1 AND id=$2",
      [repo.ownerId, repo.id],
    );
    if (
      current?.status !== "processing" ||
      current.lease_token !== repo.leaseToken
    )
      throw new AppError("Analysis cancelled or superseded.", 409);
  }
  async delete(owner: string, id: string) {
    await this.db.transaction(async (query) => {
      const lock = this.db.dialect === "postgresql" ? " FOR UPDATE" : "";
      const [row] = await query(
        "SELECT * FROM repositories WHERE owner_id=$1 AND id=$2" + lock,
        [owner, id],
      );
      if (!row) throw new AppError("Repository not found.", 404);
      const namespace = this.repository(row).data?.namespace;
      if (namespace) await deleteNamespace(namespace);
      if (!this.historyOnly)
        await query(
          "DELETE FROM conversations WHERE owner_id=$1 AND repository_id=$2",
          [owner, id],
        );
      await query("DELETE FROM chat_locks WHERE bucket=$1", [`${owner}:${id}`]);
      await query("DELETE FROM repositories WHERE owner_id=$1 AND id=$2", [
        owner,
        id,
      ]);
    });
  }
  async expire(owner: string, id: string) {
    // A worker that already committed the source snapshot can leave it usable
    // even if the host terminated it during provider work.
    await this.db.query(
      `UPDATE repositories SET status='ready',stage='Source snapshot ready',
        error=NULL,progress=100,updated_at=$1 WHERE id=$2 AND owner_id=$3 AND data IS NOT NULL
        AND ((status='processing' AND lease_until<$1) OR
          (status='failed' AND progress>=75 AND error=$4))`,
      [
        Date.now(),
        id,
        owner,
        "Analysis reached the server's execution timeout.",
      ],
    );
    await this.db.query(
      "UPDATE repositories SET status='failed',stage='Interrupted',error='Analysis was interrupted. Retry to start a new analysis.',updated_at=$1 WHERE id=$2 AND owner_id=$3 AND status='processing' AND lease_until<$1 AND attempts>=3",
      [Date.now(), id, owner],
    );
  }
  async quota(owner: string, action: string, limit: number, windowMs: number) {
    const now = Date.now(),
      bucket = `${owner}:${action}:${Math.floor(now / windowMs)}`;
    const rows = await this.db.query(
      "INSERT INTO quotas(bucket,count,expires_at) VALUES($1,1,$2) ON CONFLICT(bucket) DO UPDATE SET count=quotas.count+1 RETURNING count",
      [bucket, now + windowMs],
    );
    if (Number(rows[0].count) > limit)
      throw new AppError(
        "Workspace request limit reached. Please try again later.",
        429,
      );
    await this.db.query("DELETE FROM quotas WHERE expires_at<$1", [
      now - windowMs,
    ]);
  }
  async messages(owner: string, id: string): Promise<ChatMessage[]> {
    if (this.historyOnly) {
      await this.get(owner, id);
      return [];
    }
    const rows = await this.db.query(
      "SELECT c.messages FROM repositories r LEFT JOIN conversations c ON c.owner_id=r.owner_id AND c.repository_id=r.id WHERE r.owner_id=$1 AND r.id=$2",
      [owner, id],
    );
    if (!rows[0]) throw new AppError("Repository not found.", 404);
    return rows[0].messages ? JSON.parse(String(rows[0].messages)) : [];
  }
  async saveMessages(owner: string, id: string, messages: ChatMessage[]) {
    await this.db.transaction(async (query) => {
      const lock = this.db.dialect === "postgresql" ? " FOR UPDATE" : "";
      const [repo] = await query(
        "SELECT id FROM repositories WHERE owner_id=$1 AND id=$2" + lock,
        [owner, id],
      );
      if (!repo) throw new AppError("Repository not found.", 404);
      if (this.historyOnly) return;
      if (messages.length === 0)
        await query(
          "DELETE FROM conversations WHERE owner_id=$1 AND repository_id=$2",
          [owner, id],
        );
      else
        await query(
          "INSERT INTO conversations(repository_id,owner_id,messages,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(repository_id,owner_id) DO UPDATE SET messages=excluded.messages,updated_at=excluded.updated_at",
          [id, owner, JSON.stringify(messages.slice(-40)), Date.now()],
        );
    });
  }
  async lockChat(
    owner: string,
    id: string,
    message = "An answer is already being generated for this repository.",
  ) {
    const token = randomUUID(),
      bucket = `${owner}:${id}`,
      now = Date.now();
    const rows = await this.db.query(
      "INSERT INTO chat_locks(bucket,token,expires_at) VALUES($1,$2,$3) ON CONFLICT(bucket) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE chat_locks.expires_at<$4 RETURNING token",
      [bucket, token, now + 100_000, now],
    );
    if (!rows[0]) throw new AppError(message, 409);
    return async () => {
      await this.db.query(
        "DELETE FROM chat_locks WHERE bucket=$1 AND token=$2",
        [bucket, token],
      );
    };
  }
}
export async function workspaceStore(owner?: string) {
  const db = await database();
  if (db.scope && !owner) throw new Error("A workspace owner is required.");
  return new WorkspaceStore(db.scope ? db.scope(owner!) : db);
}
