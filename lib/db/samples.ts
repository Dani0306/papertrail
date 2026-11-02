import "server-only";
import type { DocumentStatusValue } from "@/lib/document-status";
import type { UploadType } from "@/lib/uploads";
import { db, documentsBucket } from "./client";
import { dbError, toStatus } from "./documents";

// Public, read-only demo documents (uploaded_by null). Their files live under
// samples/ in the bucket, outside every user's uploads/<id>/ prefix, so they
// never count toward anyone's upload cap.

export type PublicSample = { id: string; status: DocumentStatusValue };

/** The public sample with this file name, or null. The newest wins if there are several. */
export async function findPublicSample(fileName: string): Promise<PublicSample | null> {
  const client = await db();
  const { data, error } = await client
    .from("documents")
    .select("id, status")
    .is("uploaded_by", null)
    .eq("original_filename", fileName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("Could not look up the sample", error);
  return data && { id: data.id, status: toStatus(data.status) };
}

/** Stores a sample's file at samples/<file> (replacing any earlier copy) and records it as a public document. */
export async function createPublicSample(file: { fileName: string; mediaType: UploadType; bytes: Uint8Array }): Promise<string> {
  const client = await db();
  const path = `samples/${file.fileName}`;
  const upload = await client.storage.from(documentsBucket()).upload(path, file.bytes, { contentType: file.mediaType, upsert: true });
  if (upload.error) throw new Error(`Could not upload ${path}: ${upload.error.message}`);
  const { data, error } = await client
    .from("documents")
    .insert({ storage_path: path, original_filename: file.fileName, mime_type: file.mediaType, size_bytes: file.bytes.length, uploaded_by: null })
    .select("id")
    .single();
  if (error) throw dbError("Could not record the sample", error);
  return data.id;
}
