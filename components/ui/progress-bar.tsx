import { cn } from "@/lib/cn";
import { toneClasses, type Tone } from "./tone";

/** `value` is 0–1. Pass `label` to show the percentage text next to the bar. */
export function ProgressBar({
  value,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", toneClasses[tone].fill)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {label && (
        <span className="shrink-0 text-small text-neutral-500 tabular-nums">
          {percent}% {label}
        </span>
      )}
    </div>
  );
}
