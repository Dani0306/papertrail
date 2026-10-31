import "server-only";
import { randomUUID } from "node:crypto";
import { DOCUMENT_STATUSES, type DocumentStatusValue } from "@/lib/document-status";
import {
  ALLOWED_UPLOAD_TYPES,
  DEFAULT_DAILY_UPLOAD_CAP,
  MAX_UPLOAD_BYTES,
  type RegisterRequest,
  type UploadRequest,
  isOwnedPath,
  storagePathFor,
  userUploadPrefix,
} from "@/lib/uploads";
import { db, documentsBucket } from "./client";
import type { Database } from "./types";

type Row = Database["papertrail"]["Tables"]["documents"]["Row"];

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  status: DocumentStatusValue;
  createdAt: string;
};

/** Newest first. Every document is listed: demo mode has no per-user data. */
export async function listDocuments(limit = 60): Promise<DocumentSummary[]> {
  const client = await db();
  const { data, error } = await client
    .from("documents")
    .select("id, original_filename, mime_type, size_bytes, page_count, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError("Could not load documents", error);
  return data.map(toSummary);
}

export function dailyUploadCap(): number {
  const value = Number.parseInt(process.env.PAPERTRAIL_DAILY_UPLOAD_CAP ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_UPLOAD_CAP;
}

/**
 * Files this user put in Storage since 00:00 UTC. Counts objects, not rows, so
 * asking for upload URLs without registering them still counts.
 */
export async function countUploadsToday(userId: string): Promise<number> {
  const client = await db();
  const { data, error } = await client.storage
    .from(documentsBucket())
    .list(userUploadPrefix(userId).slice(0, -1), {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (error) throw new Error(`Could not count today's uploads: ${error.message}`);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return data.filter((file) => file.created_at && new Date(file.created_at) >= startOfDay).length;
}

export type UploadUrlResult =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; reason: "cap"; cap: number };

export async function createUploadUrl(userId: string, file: UploadRequest): Promise<UploadUrlResult> {
  const cap = dailyUploadCap();
  if ((await countUploadsToday(userId)) >= cap) return { ok: false, reason: "cap", cap };

  const client = await db();
  const path = storagePathFor(userId, randomUUID(), file.fileName);
  const { data, error } = await client.storage.from(documentsBucket()).createSignedUploadUrl(path);
  if (error) throw new Error(`Could not create an upload URL: ${error.message}`);
  return { ok: true, path: data.path, signedUrl: data.signedUrl };
}

export type RegisterResult =
  | { ok: true; id: string }
  | { ok: false; reason: "forbidden" | "missing" | "invalid" | "duplicate" };

/**
 * Records a file that is already in Storage. Size and type are read back from
 * Storage, not taken from the browser; a file that breaks the rules is deleted.
 */
export async function registerDocument(userId: string, request: RegisterRequest): Promise<RegisterResult> {
  if (!isOwnedPath(request.path, userId)) return { ok: false, reason: "forbidden" };

  const client = await db();
  const bucket = client.storage.from(documentsBucket());
  const { data: object, error: infoError } = await bucket.info(request.path);
  if (infoError || !object) return { ok: false, reason: "missing" };

  const mimeType = object.contentType ?? "";
  const sizeBytes = object.size ?? 0;
  const allowedType = (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType);
  if (!allowedType || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    await bucket.remove([request.path]);
    return { ok: false, reason: "invalid" };
  }

  const { data, error } = await client
    .from("documents")
    .insert({
      storage_path: request.path,
      original_filename: request.fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  // 23505: unique_violation on storage_path, i.e. registered twice.
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error) throw dbError("Could not save the document", error);
  return { ok: true, id: data.id };
}

/** PGRST106 is a setup step, not a bug, so name the fix instead of passing on "Invalid schema". */
function dbError(context: string, error: { code?: string; message: string }): Error {
  if (error.code === "PGRST106") {
    return new Error(
      `${context}: the papertrail schema isn't exposed to the Data API. ` +
        "Add it in Supabase → Settings → API → Exposed schemas.",
    );
  }
  return new Error(`${context}: ${error.message}`);
}

function toSummary(row: Pick<Row, "id" | "original_filename" | "mime_type" | "size_bytes" | "page_count" | "status" | "created_at">): DocumentSummary {
  return {
    id: row.id,
    fileName: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    status: toStatus(row.status),
    createdAt: row.created_at,
  };
}

// The column has a check constraint with the same six values; this narrows the type.
function toStatus(value: string): DocumentStatusValue {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value) ? (value as DocumentStatusValue) : "uploaded";
}
