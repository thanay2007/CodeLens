import "server-only";
import { createHash, createHmac } from "node:crypto";
import { AppError, publicError } from "./errors";
import type { ServiceConfiguration } from "../types";

export function configuration(): ServiceConfiguration {
  return {
    clerk: Boolean(
      process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    pinecone: Boolean(
      process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX,
    ),
    database: process.env.SUPABASE_DATABASE_URL
      ? "supabase"
      : process.env.DATABASE_URL
        ? "postgresql"
        : "sqlite",
    local: process.env.NODE_ENV !== "production",
  };
}
export async function actor() {
  if (configuration().clerk) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, actor: impersonator } = await auth();
    if (!userId) throw new AppError("Sign in to access your workspace.", 401);
    if (impersonator)
      throw new AppError(
        "Open your workspace from your own signed-in session.",
        403,
      );
    if (process.env.SUPABASE_DATABASE_URL) {
      const key = process.env.CODELENS_HISTORY_KEY;
      if (!key || !/^[\da-f]{64}$/i.test(key))
        throw new AppError(
          "The server history key is missing or invalid.",
          503,
        );
      return createHmac("sha256", Buffer.from(key, "hex"))
        .update("CodeLens history owner:")
        .update(userId)
        .digest("hex");
    }
    return createHash("sha256").update(userId).digest("hex");
  }
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SUPABASE_DATABASE_URL
  )
    throw new AppError(
      "Configure Clerk authentication before using a production workspace.",
      503,
    );
  return "local-development";
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    fetchSite === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  )
    throw new AppError("Cross-origin requests are not allowed.", 403);
}
export async function readJson(request: Request, maxBytes = 8000) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new AppError("Request body is too large.", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON body.");
  }
}
export function errorResponse(error: unknown) {
  const result = publicError(error);
  return Response.json(
    { error: result.error },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
