import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/components/ui/tone";
import { formatConfidence, type ConfidenceLevel } from "@/lib/design/confidence";

const LEVEL_DISPLAY: Record<ConfidenceLevel, { tone: Tone; prefix?: string }> = {
  ok: { tone: "success" },
  review: { tone: "review", prefix: "Review" },
  missing: { tone: "neutral" },
};

export function ConfidenceBadge({
  level,
  confidence,
}: {
  level: ConfidenceLevel;
  confidence: number;
}) {
  const { tone, prefix } = LEVEL_DISPLAY[level];
  return (
    <Badge tone={tone} className="tabular-nums">
      {prefix && <span>{prefix}</span>}
      <span className="sr-only">confidence</span>
      {formatConfidence(confidence)}
    </Badge>
  );
}
