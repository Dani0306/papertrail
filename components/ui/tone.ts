/**
 * Semantic tones shared by badges, status indicators and progress bars.
 * Class names are written out in full so Tailwind can find them.
 */
export type Tone =
  | "neutral"
  | "primary"
  | "review"
  | "success"
  | "danger"
  | "escalated";

export const toneClasses: Record<
  Tone,
  { badge: string; icon: string; fill: string }
> = {
  neutral: {
    badge: "border-neutral-200 bg-neutral-50 text-neutral-600",
    icon: "text-neutral-500",
    fill: "bg-neutral-500",
  },
  primary: {
    badge: "border-primary-200 bg-primary-50 text-primary-700",
    icon: "text-primary-500",
    fill: "bg-primary-500",
  },
  review: {
    badge: "border-review-200 bg-review-50 text-review-700",
    icon: "text-review-500",
    fill: "bg-review-500",
  },
  success: {
    badge: "border-success-200 bg-success-50 text-success-700",
    icon: "text-success-500",
    fill: "bg-success-500",
  },
  danger: {
    badge: "border-danger-200 bg-danger-50 text-danger-700",
    icon: "text-danger-500",
    fill: "bg-danger-500",
  },
  escalated: {
    badge: "border-escalated-200 bg-escalated-50 text-escalated-700",
    icon: "text-escalated-500",
    fill: "bg-escalated-500",
  },
};
