import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/** A single measured number: cost, latency, accuracy. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-body text-neutral-500">
        {Icon && <Icon aria-hidden className="size-4" />}
        {label}
      </p>
      <p className="text-h1 text-neutral-900 tabular-nums">{value}</p>
      {hint && <p className="text-small text-neutral-500">{hint}</p>}
    </Card>
  );
}
