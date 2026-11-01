// Who sees and who edits a document (owner decision, 1 Nov: uploader only).
// Uploads are private to their uploader; preloaded samples (uploaded_by null)
// are public and read-only. Not multi-tenancy: no roles, no sharing.

export type DocumentAccess = "owner" | "public" | "hidden";

export function documentAccess(uploadedBy: string | null, viewerId: string | null): DocumentAccess {
  if (uploadedBy === null) return "public";
  return viewerId !== null && uploadedBy === viewerId ? "owner" : "hidden";
}

/** Someone else's upload doesn't exist as far as the viewer can tell; a public sample is visible but not theirs. */
export function accessFailure(access: DocumentAccess): "missing" | "forbidden" | null {
  if (access === "hidden") return "missing";
  if (access === "public") return "forbidden";
  return null;
}
