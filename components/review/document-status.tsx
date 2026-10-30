import {
  BadgeCheck,
  CircleArrowUp,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  UserPen,
  type LucideIcon,
} from "lucide-react";
import { StatusIndicator } from "@/components/ui/status-indicator";
import type { Tone } from "@/components/ui/tone";
import type { DocumentStatusValue } from "@/lib/document-status";

const STATUS_DISPLAY: Record<
  DocumentStatusValue,
  { label: string; icon: LucideIcon; tone: Tone }
> = {
  uploaded: { label: "Uploaded", icon: CircleDashed, tone: "neutral" },
  extracting: { label: "Extracting", icon: LoaderCircle, tone: "primary" },
  extracted: { label: "Extracted", icon: CircleCheck, tone: "success" },
  escalated: { label: "Escalated to Sonnet", icon: CircleArrowUp, tone: "escalated" },
  needs_human: { label: "Needs human entry", icon: UserPen, tone: "danger" },
  reviewed: { label: "Reviewed", icon: BadgeCheck, tone: "success" },
};

export function DocumentStatus({ status }: { status: DocumentStatusValue }) {
  const { label, icon, tone } = STATUS_DISPLAY[status];
  return (
    <StatusIndicator
      icon={icon}
      label={label}
      tone={tone}
      spin={status === "extracting"}
    />
  );
}
