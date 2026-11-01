import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
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
import { documentAccess } from "@/lib/review/access";
import { effectiveValue, reviewCounts, reviewFieldFromRow } from "@/lib/review/fields";
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
  /** The viewer uploaded it, so they may extract and correct it. */
  isOwner: boolean;
  /** From the latest extraction, corrections applied; null before extraction. */
  vendor: string | null;
  total: number | null;
  currency: string | null;
  toReview: number;
};

const ViewerId = z.uuid();

/**
 * Newest first: public samples plus the viewer's own uploads (owner decision,
 * 1 Nov). The filter is in the query, so other people's uploads never leave the database.
 */
export async function listDocuments(viewerId: string | null, threshold: number, limit = 60): Promise<DocumentSummary[]> {
  const client = await db();
  let query = client
    .from("documents")
    .select(
      "id, original_filename, mime_type, size_bytes, page_count, status, created_at, uploaded_by, " +
        "extractions(created_at, extraction_fields(field_name, value, confidence, source_quote, corrected_value, corrected_at))",
    )
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "extractions", ascending: false })
    .limit(1, { referencedTable: "extractions" })
    .limit(limit);
  // The id is interpolated into a PostgREST filter, so only a real uuid gets that far.
  query = viewerId && ViewerId.safeParse(viewerId).success
    ? query.or(`uploaded_by.is.null,uploaded_by.eq.${viewerId}`)
    : query.is("uploaded_by", null);

  const { data, error } = await query.overrideTypes<ListRow[], { merge: false }>();
  if (error) throw dbError("Could not load documents", error);
  return data.map((row) => toSummary(row, viewerId, threshold));
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
  // 23505: unique_violation on storage_path, i.e. registered twice. The file belongs to the existing row.
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error) {
    // No row means nothing points at the file: remove it so it doesn't linger or count toward the cap.
    await bucket.remove([request.path]);
    throw dbError("Could not save the document", error);
  }
  return { ok: true, id: data.id };
}

/** PGRST106 is a setup step, not a bug, so name the fix instead of passing on "Invalid schema". */
export function dbError(context: string, error: { code?: string; message: string }): Error {
  if (error.code === "PGRST106") {
    return new Error(
      `${context}: the papertrail schema isn't exposed to the Data API. ` +
        "Add it in Supabase → Settings → API → Exposed schemas.",
    );
  }
  return new Error(`${context}: ${error.message}`);
}

type ListRow = Pick<Row, "id" | "original_filename" | "mime_type" | "size_bytes" | "page_count" | "status" | "created_at" | "uploaded_by"> & {
  extractions: Array<{ created_at: string; extraction_fields: Parameters<typeof reviewFieldFromRow>[0][] }>;
};

function toSummary(row: ListRow, viewerId: string | null, threshold: number): DocumentSummary {
  const fields = (row.extractions[0]?.extraction_fields ?? []).map(reviewFieldFromRow);
  const value = (name: string) => {
    const field = fields.find((candidate) => candidate.name === name);
    return field ? effectiveValue(field) : null;
  };
  const vendor = value("vendor");
  const total = value("total");
  const currency = value("currency");
  return {
    id: row.id,
    fileName: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    status: toStatus(row.status),
    createdAt: row.created_at,
    isOwner: documentAccess(row.uploaded_by, viewerId) === "owner",
    vendor: typeof vendor === "string" ? vendor : null,
    total: typeof total === "number" ? total : null,
    currency: typeof currency === "string" ? currency : null,
    toReview: reviewCounts(fields, threshold).toReview,
  };
}

// The column has a check constraint with the same six values; this narrows the type.
export function toStatus(value: string): DocumentStatusValue {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value) ? (value as DocumentStatusValue) : "uploaded";
}
