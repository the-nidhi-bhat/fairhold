/**
 * Testable advisory workflows.
 *
 * These functions join untrusted input to the advisory layer behind explicit
 * role and deal-access checks. They are pure server helpers: no `next/*`, no
 * `server-only`, no path aliases. Every workflow receives its caller's session
 * explicitly and never infers identity from the environment.
 *
 * Advisory output is a plain value. Nothing here persists state, approves or
 * rejects evidence, changes a deal/milestone/approval, creates a payment
 * operation, calls the payment provider, or writes an audit event.
 */
import {
  ADVISORY_LIMITS,
  analyzeAgreement,
  analyzeEvidence,
  resolveEvidenceAdvisory,
  resolveMilestoneProposal,
  type AgreementAnalysis,
  type EvidenceAdvisory,
  type EvidenceAnalysis,
  type MilestoneProposal,
} from "./advisory.ts";
import { canAccessDeal } from "../auth/deal-access.ts";
import type { DemoSession } from "../auth/session-token.ts";
import { validateEvidenceInput } from "../domain/evidence.ts";
import type { Deal } from "../domain/types.ts";
import { validateAgreementText } from "../domain/validation.ts";

export interface AdvisoryWorkflowDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export type AdvisoryOutcome<T> =
  | {
      ok: true;
      source: "ai" | "deterministic";
      label: "AI advisory" | "Deterministic advisory";
      data: T;
    }
  | { ok: false; code: "forbidden" | "not_found" | "invalid"; error: string };

const FORBIDDEN_MESSAGE = "Deal not found or you do not have access.";
const ROLE_MESSAGE = "This advisory is not available for your current role.";
const MILESTONE_NOT_FOUND_MESSAGE = "Milestone not found.";
const DRAFT_FILES_NOT_SENT_MESSAGE =
  "Add a note or link to check a draft (files are not sent to the advisor).";

function resolved(deps: AdvisoryWorkflowDeps): {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
} {
  return { env: deps.env ?? process.env, fetchImpl: deps.fetchImpl ?? fetch };
}

function success<T>(
  source: "ai" | "deterministic",
  data: T,
): AdvisoryOutcome<T> {
  return {
    ok: true,
    source,
    label: source === "ai" ? "AI advisory" : "Deterministic advisory",
    data,
  };
}

function failure<T>(
  code: "forbidden" | "not_found" | "invalid",
  error: string,
): AdvisoryOutcome<T> {
  return { ok: false, code, error };
}

/** Analyze an agreement draft supplied to the new-deal form. */
export async function analyzeAgreementDraft(
  input: { session: DemoSession; agreement: string },
  deps: AdvisoryWorkflowDeps = {},
): Promise<AdvisoryOutcome<AgreementAnalysis>> {
  const { session, agreement } = input;
  if (session.role !== "buyer" && session.role !== "seller") {
    return failure("forbidden", ROLE_MESSAGE);
  }

  const validation = validateAgreementText(agreement);
  if (!validation.ok) return failure("invalid", validation.errors.agreement);

  const { env, fetchImpl } = resolved(deps);
  const { analysis, source } = await analyzeAgreement(
    validation.value,
    env,
    fetchImpl,
  );
  return success(source, analysis);
}

/** Suggest a milestone from the server-side deal agreement. */
export async function suggestMilestoneForDeal(
  input: { session: DemoSession; deal: Deal },
  deps: AdvisoryWorkflowDeps = {},
): Promise<AdvisoryOutcome<MilestoneProposal>> {
  const { session, deal } = input;
  if (session.role !== "seller" && session.role !== "reviewer") {
    return failure("forbidden", ROLE_MESSAGE);
  }
  if (!canAccessDeal(session, deal)) {
    return failure("forbidden", FORBIDDEN_MESSAGE);
  }

  const { env, fetchImpl } = resolved(deps);
  const { proposal, source } = await resolveMilestoneProposal(
    deal.agreement,
    env,
    fetchImpl,
  );
  return success(source, proposal);
}

/**
 * Analyze stored evidence for one milestone. Criteria and evidence text are
 * always rebuilt from the server-side deal object, never from client input.
 */
export async function analyzeDealEvidence(
  input: { session: DemoSession; deal: Deal; milestoneId: string },
  deps: AdvisoryWorkflowDeps = {},
): Promise<AdvisoryOutcome<EvidenceAnalysis>> {
  const { session, deal, milestoneId } = input;
  if (session.role !== "buyer" && session.role !== "reviewer") {
    return failure("forbidden", ROLE_MESSAGE);
  }
  if (!canAccessDeal(session, deal)) {
    return failure("forbidden", FORBIDDEN_MESSAGE);
  }

  const milestone = deal.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return failure("not_found", MILESTONE_NOT_FOUND_MESSAGE);

  const criteriaLines = milestone.acceptanceCriteria
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const truncatedCriteria =
    criteriaLines.length > ADVISORY_LIMITS.maxEvidenceItems;
  const criteria = criteriaLines
    .slice(0, ADVISORY_LIMITS.maxEvidenceItems)
    .map((line) => line.slice(0, ADVISORY_LIMITS.maxCriteriaChars));

  const milestoneEvidence = deal.evidence.filter(
    (item) => item.milestoneId === milestoneId,
  );
  const truncatedEvidence =
    milestoneEvidence.length > ADVISORY_LIMITS.maxEvidenceItems;
  const evidence = milestoneEvidence
    .slice(0, ADVISORY_LIMITS.maxEvidenceItems)
    .map((item) =>
      [item.note, item.url, item.file?.name]
        .filter((value): value is string => Boolean(value))
        .join(" "),
    )
    .map((text) => text.slice(0, ADVISORY_LIMITS.maxEvidenceItemChars))
    .filter((text) => text.length > 0);

  const { env, fetchImpl } = resolved(deps);
  const { analysis, source } = await analyzeEvidence(
    criteria,
    evidence,
    env,
    fetchImpl,
  );

  // The model's own count is advisory text; never trust it over the number of
  // items the server actually sent.
  const limitations = [...analysis.limitations];
  if (truncatedCriteria) {
    limitations.push(
      `Only the first ${ADVISORY_LIMITS.maxEvidenceItems} acceptance criteria lines were assessed.`,
    );
  }
  if (truncatedEvidence) {
    limitations.push(
      `Only the first ${ADVISORY_LIMITS.maxEvidenceItems} evidence items were assessed.`,
    );
  }

  return success(source, {
    ...analysis,
    evidenceCount: evidence.length,
    limitations,
  });
}

/** Check a not-yet-submitted evidence draft against the milestone criteria. */
export async function advisoryForEvidenceDraft(
  input: {
    session: DemoSession;
    deal: Deal;
    milestoneId: string;
    note: unknown;
    url: unknown;
  },
  deps: AdvisoryWorkflowDeps = {},
): Promise<AdvisoryOutcome<EvidenceAdvisory>> {
  const { session, deal, milestoneId, note, url } = input;
  if (session.role !== "seller" && session.role !== "reviewer") {
    return failure("forbidden", ROLE_MESSAGE);
  }
  if (!canAccessDeal(session, deal)) {
    return failure("forbidden", FORBIDDEN_MESSAGE);
  }

  const milestone = deal.milestones.find((item) => item.id === milestoneId);
  if (!milestone) return failure("not_found", MILESTONE_NOT_FOUND_MESSAGE);

  const noteText = typeof note === "string" ? note.trim() : "";
  const urlText = typeof url === "string" ? url.trim() : "";
  if (noteText.length === 0 && urlText.length === 0) {
    return failure("invalid", DRAFT_FILES_NOT_SENT_MESSAGE);
  }

  const validation = validateEvidenceInput({ note, url, file: undefined });
  if (!validation.ok) {
    const message =
      validation.errors._form ??
      validation.errors.note ??
      validation.errors.url ??
      "Evidence draft is invalid.";
    return failure("invalid", message);
  }

  const draftText = [validation.value.note, validation.value.url]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const { env, fetchImpl } = resolved(deps);
  const { advisory, source } = await resolveEvidenceAdvisory(
    milestone.acceptanceCriteria,
    [draftText],
    env,
    fetchImpl,
  );
  return success(source, advisory);
}
