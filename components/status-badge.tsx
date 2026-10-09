/**
 * Status badge. Label-driven (text, not color alone) for accessibility.
 */
import type { DealStatus, MilestoneStatus } from "@/lib/domain/types";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  info: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {label}
    </span>
  );
}

const DEAL_TONES: Record<DealStatus, BadgeTone> = {
  Draft: "neutral",
  "Awaiting Agreement": "info",
  "Ready for Authorization": "info",
  Authorized: "warning",
  "In Progress": "info",
  "Awaiting Review": "warning",
  Completed: "success",
  Disputed: "danger",
  Cancelled: "neutral",
};

const MILESTONE_TONES: Record<MilestoneStatus, BadgeTone> = {
  Draft: "neutral",
  "In Progress": "info",
  "Awaiting Review": "warning",
  Completed: "success",
  Disputed: "danger",
  Cancelled: "neutral",
};

export function dealStatusTone(status: DealStatus): BadgeTone {
  return DEAL_TONES[status] ?? "neutral";
}

export function milestoneStatusTone(status: MilestoneStatus): BadgeTone {
  return MILESTONE_TONES[status] ?? "neutral";
}
