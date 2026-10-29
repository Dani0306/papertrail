import { cn } from "@/lib/cn";

/** A sheet with a folded corner and three ruled rows: a document becoming a table. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-7", className)}>
      <path
        d="M5 3.5A1.5 1.5 0 0 1 6.5 2h8.4L20 7.1v13.4a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20.5z"
        className="fill-primary-500"
      />
      <path d="M14.9 2 20 7.1h-3.6a1.5 1.5 0 0 1-1.5-1.5z" className="fill-primary-300" />
      <path
        d="M8.5 11h7M8.5 14.5h7M8.5 18h4"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="stroke-white"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-h3 font-semibold tracking-tight text-neutral-900">
        PaperTrail
      </span>
    </span>
  );
}
