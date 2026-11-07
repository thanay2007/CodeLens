import "server-only";
import { randomUUID } from "node:crypto";
import { database, type Database } from "./database";
import { AppError } from "./errors";
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
  async list(owner: string) {
    return (
      await this.db.query(
        "SELECT id,owner_id,url,name,status,stage,progress,error,created_at,updated_at,attempts,lease_token,lease_until FROM repositories WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30",
        [owner],
      )
    ).map((row) => summary(record(row)));
  }
  async get(owner: string, id: string) {
    const rows = await this.db.query(
      "SELECT * FROM repositories WHERE owner_id=$1 AND id=$2",
      [owner, id],
    );
    if (!rows[0]) throw new AppError("Repository not found.", 404);
    return record(rows[0]);
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
        [id, owner, url, name, now],
      );
      return record(rows[0]);
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
    return rows[0] ? record(rows[0]) : null;
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
    const rows = await this.db.query(
      "UPDATE repositories SET progress=$1,stage=$2,data=$3,status=$4,error=$5,updated_at=$6 WHERE id=$7 AND owner_id=$8 AND lease_token=$9 AND status='processing' RETURNING *",
      [
        patch.progress,
        patch.stage,
        JSON.stringify(patch.data ?? repo.data),
        patch.status || "processing",
        patch.error || null,
        Date.now(),
        repo.id,
        repo.ownerId,
        repo.leaseToken,
      ],
    );
    if (!rows[0]) throw new AppError("Analysis cancelled or superseded.", 409);
    Object.assign(repo, record(rows[0]));
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
    const current = await this.get(repo.ownerId, repo.id);
    if (
      current.status !== "processing" ||
      current.leaseToken !== repo.leaseToken
    )
      throw new AppError("Analysis cancelled or superseded.", 409);
  }
  async expire(owner: string, id: string) {
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
    await this.get(owner, id);
    const rows = await this.db.query(
      "SELECT messages FROM conversations WHERE owner_id=$1 AND repository_id=$2",
      [owner, id],
    );
    return rows[0] ? JSON.parse(String(rows[0].messages)) : [];
  }
  async saveMessages(owner: string, id: string, messages: ChatMessage[]) {
    await this.get(owner, id);
    await this.db.query(
      "INSERT INTO conversations(repository_id,owner_id,messages,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(repository_id,owner_id) DO UPDATE SET messages=excluded.messages,updated_at=excluded.updated_at",
      [id, owner, JSON.stringify(messages.slice(-40)), Date.now()],
    );
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
export async function workspaceStore() {
  return new WorkspaceStore(await database());
}
