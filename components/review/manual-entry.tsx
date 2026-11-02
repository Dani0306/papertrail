"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { type FieldValue, fieldLabel, isNumericField, parseCorrection, parseFieldName } from "@/lib/review/fields";
import { HEADER_FIELDS, LINE_FIELDS, MAX_LINES } from "@/lib/review/manual";

type Line = Record<(typeof LINE_FIELDS)[number], string>;
const emptyLine = (): Line => ({ description: "", qty: "", unitPrice: "", lineTotal: "" });

/**
 * Hand entry for a document the model couldn't read. Every value is checked
 * in the browser with the editor's own rule, then again by the route. Empty
 * means "not on the document". Saves through POST /api/documents/[id]/manual.
 */
export function ManualEntry({ documentId, preview }: { documentId: string; preview?: { errors: Record<string, string> } }) {
  const router = useRouter();
  const id = useId();
  const [header, setHeader] = useState<Record<string, string>>(Object.fromEntries(HEADER_FIELDS.map((name) => [name, ""])));
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>(preview?.errors ?? {});
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;

  function parse(name: string, input: string): { value: FieldValue; error?: string } {
    if (input.trim() === "") return { value: null };
    const parsed = parseCorrection(name, input, false);
    return parsed.ok ? { value: parsed.value } : { value: null, error: parsed.error };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (preview) return;
    const found: Record<string, string> = {};
    const values = Object.fromEntries(
      HEADER_FIELDS.map((name) => {
        const { value, error } = parse(name, header[name]);
        if (error) found[name] = error;
        return [name, value];
      }),
    );
    // Rows left completely blank are dropped, not saved as empty lines.
    const kept = lines.filter((line) => LINE_FIELDS.some((name) => line[name].trim() !== ""));
    const lineItems = kept.map((line, index) =>
      Object.fromEntries(
        LINE_FIELDS.map((name) => {
          const { value, error } = parse(`lineItems[${index}].${name}`, line[name]);
          if (error) found[`lineItems[${index}].${name}`] = error;
          return [name, value];
        }),
      ),
    );
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header: values, lineItems }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      if (!response.ok) {
        setErrors({ ...(body.fields ?? {}), form: body.error ?? "Something went wrong on our side. Try again." });
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setErrors({ form: "The entry didn't reach the server. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const input = (name: string, value: string, onChange: (next: string) => void, label = fieldLabel(name)) => {
    const inputId = `${id}-${name}`;
    return (
      <Field label={label} htmlFor={inputId} error={errors[name]} hint={numericHint(name)}>
        <Input
          id={inputId}
          size="sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={isNumericField(name) ? "decimal" : undefined}
          autoComplete="off"
          disabled={busy}
          aria-invalid={errors[name] ? true : undefined}
          className={cn(isNumericField(name) && "tabular-nums")}
        />
      </Field>
    );
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 text-neutral-900">Enter it by hand</h3>
        <p className="text-small text-neutral-600">
          Type what the document shows; leave a field empty if it isn&apos;t there. Amounts as digits with a dot, like 1284.50.
          Saving marks the document reviewed.
        </p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-5" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {HEADER_FIELDS.map((name) => (
            <div key={name}>{input(name, header[name], (next) => setHeader((current) => ({ ...current, [name]: next })))}</div>
          ))}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body font-medium text-neutral-900">Line items</legend>
          {lines.map((line, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-md border bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-small font-medium text-neutral-500 tabular-nums">Line {index + 1}</span>
                <Button
                  size="sm"
                  variant="text"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  disabled={busy || lines.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 aria-hidden />
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                {LINE_FIELDS.map((name) => (
                  <div key={name}>
                    {input(
                      `lineItems[${index}].${name}`,
                      line[name],
                      (next) => setLines((current) => current.map((row, i) => (i === index ? { ...row, [name]: next } : row))),
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              disabled={busy || lines.length >= MAX_LINES}
            >
              <Plus aria-hidden />
              Add line
            </Button>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p aria-live="polite" className="text-small">
            {errors.form && (
              <span className="flex items-start gap-1.5 text-danger-700">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {errors.form}
              </span>
            )}
          </p>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
            {busy ? "Saving…" : "Save and mark reviewed"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function numericHint(name: string): string | undefined {
  if (!isNumericField(name)) return undefined;
  return parseFieldName(name).key === "qty" ? "e.g. 2 or 2.5" : "e.g. 1284.50";
}
