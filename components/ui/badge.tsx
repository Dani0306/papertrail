import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneClasses, type Tone } from "./tone";

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-small font-semibold tracking-wide uppercase [&_svg]:size-3",
        toneClasses[tone].badge,
        className,
      )}
    >
      {children}
    </span>
  );
}
