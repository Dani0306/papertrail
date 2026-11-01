"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  type ReviewField,
  NUMBER_HINT,
  editableText,
  effectiveValue,
  fieldLabel,
  formatFieldValue,
  isNumericField,
  parseCorrection,
} from "@/lib/review/fields";
import { FieldRow } from "./field-row";

/**
 * One field on the review screen. Read-only for visitors; for the uploader, one
 * Edit, one input and Save (Enter) stores a correction next to the model's value
 * through PATCH /api/documents/[id]/fields. Esc cancels.
 */
export function FieldEditor({
  documentId,
  field,
  currency,
  threshold,
  editable,
  preview,
}: {
  documentId: string;
  field: ReviewField;
  currency: string | null;
  threshold: number;
  editable: boolean;
  /** Opens the editor with fixed contents for /design-system; nothing is saved. */
  preview?: { input: string; error?: string };
}) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const label = fieldLabel(field.name);
  const numeric = isNumericField(field.name);
  const corrected = field.correctedAt !== null;

  const [editing, setEditing] = useState(preview !== undefined);
  const [input, setInput] = useState(preview?.input ?? editableText(effectiveValue(field)));
  const [absent, setAbsent] = useState(false);
  const [error, setError] = useState<string | null>(preview?.error ?? null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;

  function open() {
    setInput(editableText(effectiveValue(field)));
    setAbsent(corrected && field.correctedValue === null);
    setError(null);
    setEditing(true);
  }

  async function send(body: object, onDone: () => void) {
    if (preview) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldName: field.name, ...body }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Something went wrong on our side. Try again.");
        return;
      }
      startRefresh(() => {
        router.refresh();
        onDone();
      });
    } catch {
      setError("The correction didn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseCorrection(field.name, input, absent);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    void send({ value: parsed.value }, () => setEditing(false));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <FieldRow
        label={label}
        value={formatFieldValue(field.name, field.value, currency)}
        confidence={field.confidence}
        sourceQuote={field.sourceQuote}
        corrected={corrected}
        correctedValue={corrected ? formatFieldValue(field.name, field.correctedValue, currency) : undefined}
        numeric={numeric}
        threshold={threshold}
        action={
          editable && (
            <span className="flex items-center gap-1.5">
              {corrected && (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => void send({ revert: true }, () => {})}
                  disabled={busy}
                  aria-label={`Revert ${label} to the model's value`}
                  title="Revert to the model's value"
                >
                  {busy ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Undo2 aria-hidden />}
                  <span className="sr-only sm:not-sr-only">Revert</span>
                </Button>
              )}
              <Button size="sm" variant="tertiary" onClick={open} disabled={busy} aria-label={`Edit ${label}`}>
                <Pencil aria-hidden />
                Edit
              </Button>
            </span>
          )
        }
      />
    );
  }

  // Same <div><dt/><dd/></div> shape as FieldRow, so the list stays valid HTML.
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-l-4 border-l-primary-500 bg-primary-50 px-4 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="pt-2 text-body font-medium text-neutral-700">
        <label htmlFor={inputId}>{label}</label>
      </dt>
      <dd className="min-w-0">
        <form onSubmit={save} onKeyDown={onKeyDown} aria-label={`Correct ${label}`} className="flex flex-col gap-2">
          <Input
            id={inputId}
            size="sm"
            value={absent ? "" : input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            disabled={absent || busy}
            inputMode={numeric ? "decimal" : undefined}
            autoComplete="off"
            autoFocus={!preview}
            aria-invalid={error ? true : undefined}
            aria-describedby={hintId}
            className={cn(numeric && "tabular-nums")}
          />
          <div id={hintId} className="flex flex-col gap-1 text-small">
            {field.sourceQuote && (
              <span className="truncate font-mono text-neutral-500" title={field.sourceQuote}>
                <span className="font-sans">Printed: </span>“{field.sourceQuote}”
              </span>
            )}
            {error ? (
              <span role="alert" className="flex items-start gap-1.5 text-danger-700">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </span>
            ) : (
              numeric && <span className="text-neutral-500">{NUMBER_HINT}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-small text-neutral-700">
              <input
                type="checkbox"
                checked={absent}
                onChange={(event) => {
                  setAbsent(event.target.checked);
                  setError(null);
                }}
                disabled={busy}
                className="size-4 rounded-xs accent-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              />
              Not on the document
            </label>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="tertiary" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={busy}>
                {busy && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
                {busy ? "Saving…" : "Save"}
              </Button>
            </span>
          </div>
        </form>
      </dd>
    </div>
  );
}
