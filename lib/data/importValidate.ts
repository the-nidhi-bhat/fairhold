/**
 * Validation of JSON records before they are imported into PostgreSQL.
 *
 * Pure and dependency-free so the import command (scripts/db-import-json.mjs)
 * and the unit tests share the exact same rules. The import must never silently
 * accept corrupted or inconsistent payment state: a deal whose status claims a
 * payment authorization happened, but whose record says otherwise, must be
 * rejected with a clear reason instead of imported.
 */
import {
  APPROVAL_DECISIONS,
  DEAL_STATUSES,
  EVIDENCE_DECISIONS,
  MILESTONE_STATUSES,
  type Deal,
  type DealEventType,
} from "../domain/types.ts";

export interface ImportValidationResult {
  ok: boolean;
  issues: string[];
}

/** Deal statuses that require an authorization record to be present. */
const POST_AUTHORIZATION_STATUSES = new Set([
  "Authorized",
  "In Progress",
  "Awaiting Review",
  "Completed",
  "Disputed",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

function isPositiveSafeCents(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 100_000_000
  );
}

function push(issues: string[], issue: string, id: string | undefined): void {
  issues.push(`${issue} (deal ${id ?? "?"})`);
}

/**
 * Validate one deal (as read from the JSON store) for import. Returns every
 * problem found, never stopping at the first. `issues` is empty exactly when
 * the deal is importable.
 */
export function validateDealForImport(raw: unknown): ImportValidationResult {
  const issues: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: ["Imported record is not a deal object."] };
  }
  const deal = raw as Record<string, unknown>;
  const id = typeof deal.id === "string" ? deal.id : undefined;

  // --- Deal-level structure ---
  for (const key of [
    "id",
    "title",
    "agreement",
    "clientName",
    "freelancerName",
    "currency",
    "createdAt",
    "updatedAt",
  ]) {
    if (!isNonEmptyString(deal[key])) push(issues, `Missing/invalid '${key}'.`, id);
  }
  if (deal.currency !== undefined && deal.currency !== "USD") {
    push(issues, `Currency must be USD (got '${String(deal.currency)}').`, id);
  }
  if (!(DEAL_STATUSES as readonly string[]).includes(deal.status as string)) {
    push(issues, `Unknown deal status '${String(deal.status)}'.`, id);
  } else {
    const status = deal.status as string;
    const authorization = deal.authorization as Record<string, unknown> | null;
    const pending = deal.pendingAuthorization as Record<string, unknown> | null;

    if (POST_AUTHORIZATION_STATUSES.has(status) && !authorization) {
      push(
        issues,
        `Status '${status}' requires an authorization record, but none exists.`,
        id,
      );
    }
    if (
      !POST_AUTHORIZATION_STATUSES.has(status) &&
      authorization !== undefined &&
      authorization !== null
    ) {
      push(
        issues,
        `Status '${status}' cannot have an authorization record.`,
        id,
      );
    }
    if (pending !== undefined && pending !== null && status !== "Ready for Authorization") {
      push(
        issues,
        `Status '${status}' cannot have a pending authorization (only 'Ready for Authorization' can).`,
        id,
      );
    }
    if (pending !== undefined && pending !== null && authorization) {
      push(
        issues,
        "A deal cannot have both a pending and an authorized payment record.",
        id,
      );
    }
  }

  // --- Authorization record (payment-state integrity) ---
  const authorization = deal.authorization as Record<string, unknown> | null;
  if (authorization !== null && authorization !== undefined) {
    if (!isNonEmptyString(authorization.providerName)) {
      push(issues, "Authorization is missing providerName.", id);
    }
    if (!isNonEmptyString(authorization.providerReference)) {
      push(
        issues,
        "Authorization is missing providerReference (a real hold must be traceable to the provider).",
        id,
      );
    }
    if (!isPositiveSafeCents(authorization.amountCents)) {
      push(issues, "Authorization amountCents must be a positive safe integer.", id);
    }
    if (typeof authorization.simulated !== "boolean") {
      push(issues, "Authorization is missing a boolean 'simulated' flag.", id);
    }
    if (!isIsoTimestamp(authorization.createdAt)) {
      push(issues, "Authorization is missing a valid createdAt timestamp.", id);
    }
  }

  // --- Pending order record ---
  const pending = deal.pendingAuthorization as Record<string, unknown> | null;
  if (pending !== null && pending !== undefined) {
    if (!isNonEmptyString(pending.providerName)) {
      push(issues, "Pending authorization is missing providerName.", id);
    }
    if (!isNonEmptyString(pending.providerOrderId)) {
      push(issues, "Pending authorization is missing providerOrderId.", id);
    }
    if (!isPositiveSafeCents(pending.amountCents)) {
      push(issues, "Pending authorization amountCents must be a positive safe integer.", id);
    }
  }

  // --- Milestones ---
  if (!Array.isArray(deal.milestones)) {
    push(issues, "Missing 'milestones' array.", id);
  } else {
    for (const m of deal.milestones) {
      const milestone = m as Record<string, unknown>;
      const mId = typeof milestone.id === "string" ? milestone.id : undefined;
      if (!isNonEmptyString(milestone.id)) push(issues, "Milestone missing id.", mId);
      if (!isNonEmptyString(milestone.title)) {
        push(issues, "Milestone missing title.", mId);
      }
      if (!(MILESTONE_STATUSES as readonly string[]).includes(milestone.status as string)) {
        push(issues, `Unknown milestone status '${String(milestone.status)}'.`, mId);
      }
      if (!isPositiveSafeCents(milestone.amountCents)) {
        push(issues, "Milestone amountCents must be a positive safe integer.", mId);
      }
      if (typeof milestone.description !== "string") {
        push(issues, "Milestone description must be a string.", mId);
      }
      if (typeof milestone.acceptanceCriteria !== "string") {
        push(issues, "Milestone acceptanceCriteria must be a string.", mId);
      }
      if (milestone.dueDate !== null && typeof milestone.dueDate !== "string") {
        push(issues, "Milestone dueDate must be a string or null.", mId);
      }
      if (!isIsoTimestamp(milestone.createdAt) || !isIsoTimestamp(milestone.updatedAt)) {
        push(issues, "Milestone missing valid createdAt/updatedAt.", mId);
      }
      const approval = milestone.approval as Record<string, unknown> | null;
      if (approval !== null && approval !== undefined) {
        if (!(APPROVAL_DECISIONS as readonly string[]).includes(approval.decision as string)) {
          push(issues, `Unknown approval decision '${String(approval.decision)}'.`, mId);
        }
        if (!isNonEmptyString(approval.evidenceFingerprint)) {
          push(issues, "Approval missing evidenceFingerprint.", mId);
        }
        if (!Array.isArray(approval.reasonCodes)) {
          push(issues, "Approval missing reasonCodes array.", mId);
        }
        if (!isIsoTimestamp(approval.reviewedAt)) {
          push(issues, "Approval missing valid reviewedAt.", mId);
        }
      }
    }
  }

  // --- Evidence ---
  if (!Array.isArray(deal.evidence)) {
    push(issues, "Missing 'evidence' array.", id);
  } else {
    for (const e of deal.evidence) {
      const evidence = e as Record<string, unknown>;
      const eId = typeof evidence.id === "string" ? evidence.id : undefined;
      if (!isNonEmptyString(evidence.id)) push(issues, "Evidence missing id.", eId);
      if (!isNonEmptyString(evidence.milestoneId)) {
        push(issues, "Evidence missing milestoneId.", eId);
      }
      if (!(EVIDENCE_DECISIONS as readonly string[]).includes(evidence.decision as string)) {
        push(issues, `Unknown evidence decision '${String(evidence.decision)}'.`, eId);
      }
      if (!isIsoTimestamp(evidence.submittedAt)) {
        push(issues, "Evidence missing valid submittedAt.", eId);
      }
      if (evidence.decision !== "pending" && !isIsoTimestamp(evidence.reviewedAt)) {
        push(issues, `Reviewed evidence '${String(evidence.decision)}' is missing reviewedAt.`, eId);
      }
      if (evidence.reviewedAt !== null && evidence.reviewedAt !== undefined) {
        if (evidence.decision === "pending") {
          push(issues, "Pending evidence cannot have reviewedAt.", eId);
        }
        if (!isIsoTimestamp(evidence.reviewedAt)) {
          push(issues, "Evidence reviewedAt must be a valid timestamp or null.", eId);
        }
      }
    }
  }

  // --- Audit events ---
  if (!Array.isArray(deal.events)) {
    push(issues, "Missing 'events' array.", id);
  } else {
    const knownTypes = new Set<string>([
      "deal.created",
      "deal.status_changed",
      "deal.authorization_simulated",
      "deal.authorization_sandbox",
      "deal.authorization_pending",
      "milestone.created",
      "milestone.updated",
      "milestone.status_changed",
      "evidence.submitted",
      "evidence.reviewed",
      "milestone.approval_recorded",
      "milestone.payment_simulated",
    ]);
    for (const e of deal.events) {
      const event = e as Record<string, unknown>;
      const eId = typeof event.id === "string" ? event.id : undefined;
      if (!isNonEmptyString(event.id)) push(issues, "Event missing id.", eId);
      if (!knownTypes.has(event.type as DealEventType)) {
        push(issues, `Unknown event type '${String(event.type)}'.`, eId);
      }
      if (!isIsoTimestamp(event.createdAt)) {
        push(issues, "Event missing valid createdAt.", eId);
      }
      if (!isNonEmptyString(event.actor)) push(issues, "Event missing actor.", eId);
    }
  }

  // --- Timestamps ---
  if (!isIsoTimestamp(deal.createdAt)) push(issues, "Missing valid createdAt.", id);
  if (!isIsoTimestamp(deal.updatedAt)) push(issues, "Missing valid updatedAt.", id);

  return { ok: issues.length === 0, issues };
}

/** Validate an imported deal and, if valid, cast it to the domain type. */
export function validateDealForImportTyped(raw: unknown):
  | { ok: true; deal: Deal }
  | { ok: false; issues: string[] } {
  const result = validateDealForImport(raw);
  if (!result.ok) return { ok: false, issues: result.issues };
  return { ok: true, deal: raw as Deal };
}