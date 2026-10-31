import { z } from "zod";

// Shared by the upload box (fast feedback), the routes (Zod) and the bucket
// limits in supabase/migrations/20261031120000_documents.sql (the backstop).
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type UploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** 10 MB: keeps extraction tokens and free-tier Storage small; the API itself allows far more. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DEFAULT_DAILY_UPLOAD_CAP = 20;

/** The `accept` attribute for the file input. */
export const UPLOAD_ACCEPT = [...ALLOWED_UPLOAD_TYPES, ".pdf", ".png", ".jpg", ".jpeg", ".webp"].join(",");

export const UploadRequest = z.object({
  fileName: z.string().trim().min(1, "The file needs a name.").max(255, "The file name is too long."),
  mimeType: z.enum(ALLOWED_UPLOAD_TYPES, {
    error: "Only PDF, PNG, JPEG or WebP files can be uploaded.",
  }),
  sizeBytes: z
    .number()
    .int()
    .positive("The file is empty.")
    .max(MAX_UPLOAD_BYTES, `Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`),
});

export type UploadRequest = z.infer<typeof UploadRequest>;

export const RegisterRequest = z.object({
  path: z.string().min(1).max(512),
  fileName: UploadRequest.shape.fileName,
});

export type RegisterRequest = z.infer<typeof RegisterRequest>;

/** The first problem with a file, in words a person can act on, or null when it can be uploaded. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  const result = UploadRequest.safeParse({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  return result.success ? null : result.error.issues[0].message;
}

/**
 * A file name that is safe as one Storage path segment: no folders, no control
 * characters, only letters, digits, dot, dash and underscore. Keeps the extension.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = clean(dot > 0 ? base.slice(0, dot) : base) || "document";
  const extension = dot > 0 ? clean(base.slice(dot + 1)).slice(0, 10) : "";
  const full = extension ? `${stem}.${extension}` : stem;
  return full.length > 100 ? full.slice(full.length - 100) : full;
}

function clean(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Uploads live under the uploader's id, so ownership and the daily cap can be checked from the path. */
export function userUploadPrefix(userId: string): string {
  return `uploads/${userId}/`;
}

export function storagePathFor(userId: string, fileId: string, fileName: string): string {
  return `${userUploadPrefix(userId)}${fileId}-${safeFileName(fileName)}`;
}

/** True only for a direct child of the caller's own prefix, without traversal tricks. */
export function isOwnedPath(path: string, userId: string): boolean {
  const prefix = userUploadPrefix(userId);
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("\\") && !rest.startsWith(".");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
