import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  confidenceLevel,
} from "@/lib/design/confidence";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "./confidence-badge";

/** Wraps FieldRows; each row renders a <dt>/<dd> pair. */
export function FieldList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl className={cn("divide-y overflow-hidden rounded-lg border bg-white", className)}>
      {children}
    </dl>
  );
}

/**
 * One extracted field: the value, the model's confidence, and the literal text it
 * read the value from. Rows below the threshold are tinted amber with a left rule.
 */
export function FieldRow({
  label,
  value,
  confidence,
  sourceQuote,
  correctedValue,
  numeric = false,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
  action,
}: {
  label: string;
  value: string | null;
  confidence: number;
  sourceQuote: string | null;
  correctedValue?: string | null;
  numeric?: boolean;
  threshold?: number;
  /** Slot for an edit control, rendered on the right. */
  action?: ReactNode;
}) {
  const level = confidenceLevel(value, confidence, threshold);
  const isCorrected = correctedValue != null;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-1.5 border-l-4 px-4 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-start",
        level === "review" ? "border-l-review-500 bg-review-50" : "border-l-transparent",
      )}
    >
      <dt className="pt-0.5 text-body font-medium text-neutral-600">{label}</dt>
      <dd className="min-w-0">
        {isCorrected ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn("text-body-lg text-neutral-900", numeric && "tabular-nums")}>
              {correctedValue}
            </span>
            {value !== null && (
              <del className={cn("text-body text-neutral-400", numeric && "tabular-nums")}>
                {value}
              </del>
            )}
            <Badge tone="primary">Corrected</Badge>
          </p>
        ) : value === null ? (
          <p className="text-body-lg text-neutral-500 italic">Not found</p>
        ) : (
          <p className={cn("text-body-lg break-words text-neutral-900", numeric && "tabular-nums")}>
            {value}
          </p>
        )}
        {sourceQuote && (
          <p className="mt-1 truncate font-mono text-small text-neutral-500" title={sourceQuote}>
            <span className="sr-only">Source text: </span>“{sourceQuote}”
          </p>
        )}
      </dd>
      <dd className="flex items-center gap-2 sm:justify-end">
        <ConfidenceBadge level={level} confidence={confidence} />
        {action}
      </dd>
    </div>
  );
}
