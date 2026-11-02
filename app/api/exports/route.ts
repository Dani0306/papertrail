import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { exportSelection } from "@/lib/db/exports";
import { confidenceThreshold } from "@/lib/design/confidence";
import { toCsv } from "@/lib/export/csv";
import { toExportInvoice } from "@/lib/export/rows";
import { toXlsx } from "@/lib/export/xlsx";

const Query = z.object({
  format: z.enum(["csv", "xlsx"], "format must be csv or xlsx."),
  document: z.uuid("That isn't a document id.").optional(),
});

const TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/**
 * Downloads the viewer's extracted documents (their uploads plus public samples)
 * as CSV or XLSX, corrections applied. Spends nothing, so no sign-in: the same
 * visibility filter as every list decides what's in it.
 */
export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = Query.safeParse(params);
    if (!query.success) return Response.json({ error: query.error.issues[0].message }, { status: 400 });

    const viewer = await getUser();
    const selection = await exportSelection(viewer?.id ?? null, query.data.document);
    if (!selection) return Response.json({ error: "That document doesn't exist." }, { status: 404 });
    if (query.data.document && selection.documents.length === 0) {
      return Response.json({ error: "This document has no extracted fields to export yet." }, { status: 409 });
    }

    const invoices = selection.documents.map((document) => toExportInvoice(document, confidenceThreshold()));
    const body = query.data.format === "csv" ? toCsv(invoices) : new Uint8Array(toXlsx(invoices));
    const name = query.data.document ? baseName(selection.documents[0].fileName) : `papertrail-${new Date().toISOString().slice(0, 10)}`;
    return new Response(body, {
      headers: {
        "Content-Type": TYPES[query.data.format],
        "Content-Disposition": `attachment; filename="${name}.${query.data.format}"`,
        // A signed-in viewer's own invoices: never cached anywhere.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Lets Next's own signals through (the build bailing out of prerendering this dynamic route).
    unstable_rethrow(error);
    console.error(error);
    return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}

/** "synthetic-koyo-yen.pdf" → "synthetic-koyo-yen", limited to header-safe characters. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 80) || "invoice";
}
