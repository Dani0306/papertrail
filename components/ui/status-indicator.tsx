import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { toneClasses, type Tone } from "./tone";

/** Icon plus label. Colour is never the only signal: the label always shows. */
export function StatusIndicator({
  icon: Icon,
  label,
  tone = "neutral",
  spin = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  tone?: Tone;
  spin?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-body text-neutral-700",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          toneClasses[tone].icon,
          spin && "animate-spin motion-reduce:animate-none",
        )}
      />
      {label}
    </span>
  );
}
