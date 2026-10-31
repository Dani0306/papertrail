"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Upload } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, formatBytes, uploadProblem } from "@/lib/uploads";

export type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string; progress: number }
  | { kind: "done"; fileName: string }
  | { kind: "error"; message: string };

/**
 * Drop zone for one PDF or image. The file goes from the browser straight to
 * Storage through a signed URL; our routes only issue the URL and register it.
 */
export function UploadBox({
  remaining,
  cap,
  preview,
}: {
  remaining: number;
  cap: number;
  /** Renders a fixed state for /design-system; the box does nothing. */
  preview?: UploadState;
}) {
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>(preview ?? { kind: "idle" });
  const [dragging, setDragging] = useState(false);

  const busy = state.kind === "uploading";
  const capReached = remaining <= 0;
  const disabled = busy || capReached || preview !== undefined;

  async function start(file: File) {
    const problem = uploadProblem(file);
    if (problem) {
      setState({ kind: "error", message: `${file.name}: ${problem}` });
      return;
    }

    setState({ kind: "uploading", fileName: file.name, progress: 0 });
    try {
      const issued = await postJson<{ path: string; signedUrl: string }>("/api/uploads", {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await putWithProgress(issued.signedUrl, file, (progress) =>
        setState({ kind: "uploading", fileName: file.name, progress }),
      );
      await postJson("/api/documents", { path: issued.path, fileName: file.name });
      setState({ kind: "done", fileName: file.name });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "The upload failed. Try again.",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) void start(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="peer sr-only"
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void start(file);
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-disabled={disabled}
        className={[
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-500",
          disabled
            ? "cursor-not-allowed border-neutral-200 bg-neutral-50"
            : dragging
              ? "cursor-copy border-primary-500 bg-primary-50"
              : "cursor-pointer border-primary-200 bg-white hover:border-primary-400 hover:bg-primary-50",
        ].join(" ")}
      >
        <span
          className={
            disabled
              ? "flex size-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400"
              : "flex size-11 items-center justify-center rounded-full bg-primary-500 text-white"
          }
        >
          <Upload aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col gap-1">
          <span className={disabled ? "text-body font-medium text-neutral-500" : "text-body font-medium text-neutral-900"}>
            {capReached
              ? "Today's uploads are used up"
              : dragging
                ? "Drop to upload"
                : (
                    <>
                      <span className="text-primary-600 underline underline-offset-4">Choose a file</span> or
                      drop it here
                    </>
                  )}
          </span>
          <span id={helpId} className="text-small text-neutral-500">
            {capReached
              ? `You've used all ${cap} uploads for today. The limit resets at 00:00 UTC.`
              : `PDF, PNG, JPEG or WebP, up to ${formatBytes(MAX_UPLOAD_BYTES)}. Public or synthetic invoices only.`}
          </span>
        </span>
      </label>

      {!capReached && (
        <p className="text-small text-neutral-500 tabular-nums">
          {remaining} of {cap} uploads left today
        </p>
      )}

      {/* Last child, so while it's empty it adds no gap under the drop zone. */}
      <div aria-live="polite">
        {state.kind === "uploading" && (
          <div className="flex flex-col gap-1.5">
            <p className="truncate text-small text-neutral-600">
              Uploading <span className="font-mono">{state.fileName}</span>
            </p>
            <ProgressBar value={state.progress} label="uploaded" />
          </div>
        )}
        {state.kind === "done" && (
          <p className="flex items-center gap-1.5 text-small text-success-700">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            <span className="truncate">
              <span className="font-mono">{state.fileName}</span> uploaded. It&apos;s waiting for extraction.
            </span>
          </p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="flex items-start gap-1.5 text-small text-danger-700">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The upload failed. Try again.");
  }
  return data as T;
}

/** XHR rather than fetch: fetch can't report upload progress. */
function putWithProgress(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Storage refused the file. Check its type and size, then try again."));
    xhr.onerror = () => reject(new Error("The connection dropped during the upload. Try again."));
    xhr.send(file);
  });
}
