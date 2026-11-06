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
    "border-[var(--border-strong)] bg-white/[0.04] text-[var(--muted-strong)]",
  info: "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  success:
    "border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
  warning:
    "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]",
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
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
