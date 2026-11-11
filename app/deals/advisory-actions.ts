"use server";

/**
 * Server actions for AI advisory features.
 *
 * Each action authenticates the caller, loads the deal server-side, and calls
 * one advisory workflow. Advisory output is returned to the UI as display text
 * only: these actions never persist anything, never change deal, milestone,
 * approval or payment state, never call the payment provider, and never write
 * audit events. A human decides every outcome.
 */
import {
  advisoryForEvidenceDraft,
  analyzeAgreementDraft,
  analyzeDealEvidence,
  suggestMilestoneForDeal,
} from "@/lib/ai/advisory-workflows";
import { getDemoSession } from "@/lib/auth/session";
import { getDeal } from "@/lib/data";

export interface AdvisoryState {
  status: "idle" | "ok" | "error";
  source?: "ai" | "deterministic";
  label?: string;
  summary?: string;
  items?: { label: string; value: string }[];
  message?: string;
}

/**
 * Milestone suggestions carry the proposal as typed data so the client never
 * has to scrape display labels.
 */
export interface MilestoneSuggestionState extends AdvisoryState {
  proposal?: {
    title: string;
    description: string;
    acceptanceCriteria: string;
  };
}

const NO_DEAL_MESSAGE = "Deal not found or you do not have access.";

function field(input: FormData, key: string): string {
  const value = input.get(key);
  return typeof value === "string" ? value : "";
}

function list(values: string[]): string {
  return values.length > 0 ? values.join("; ") : "None";
}

function errorState(message: string): AdvisoryState {
  return { status: "error", message };
}

export async function analyzeAgreementAction(
  input: FormData,
): Promise<AdvisoryState> {
  const session = await getDemoSession();
  if (!session) return errorState("Sign in to use advisory features.");

  const outcome = await analyzeAgreementDraft({
    session,
    agreement: field(input, "agreement"),
  });
  if (!outcome.ok) return errorState(outcome.error);

  const analysis = outcome.data;
  return {
    status: "ok",
    source: outcome.source,
    label: outcome.label,
    summary: `Estimated ${analysis.estimatedMilestones} milestone${
      analysis.estimatedMilestones === 1 ? "" : "s"
    }.`,
    items: [
      { label: "Deliverables", value: list(analysis.deliverables) },
      { label: "Acceptance criteria", value: list(analysis.acceptanceCriteria) },
      { label: "Missing details", value: list(analysis.missingDetails) },
      {
        label: "Ambiguous requirements",
        value: list(analysis.ambiguousRequirements),
      },
      {
        label: "Estimated milestones",
        value: String(analysis.estimatedMilestones),
      },
    ],
  };
}

export async function suggestMilestoneAction(
  input: FormData,
): Promise<MilestoneSuggestionState> {
  const session = await getDemoSession();
  if (!session) return errorState("Sign in to use advisory features.");

  const dealId = field(input, "dealId");
  const deal = dealId ? await getDeal(dealId) : null;
  if (!deal) return errorState(NO_DEAL_MESSAGE);

  const outcome = await suggestMilestoneForDeal({ session, deal });
  if (!outcome.ok) return errorState(outcome.error);

  const proposal = outcome.data;
  return {
    status: "ok",
    source: outcome.source,
    label: outcome.label,
    summary: "Suggested milestone from the stored agreement.",
    items: [
      { label: "Title", value: proposal.title },
      { label: "Description", value: proposal.description },
      { label: "Acceptance criteria", value: proposal.acceptanceCriteria },
    ],
    proposal: {
      title: proposal.title,
      description: proposal.description,
      acceptanceCriteria: proposal.acceptanceCriteria,
    },
  };
}

export async function analyzeEvidenceAction(
  input: FormData,
): Promise<AdvisoryState> {
  const session = await getDemoSession();
  if (!session) return errorState("Sign in to use advisory features.");

  const dealId = field(input, "dealId");
  const milestoneId = field(input, "milestoneId");
  const deal = dealId ? await getDeal(dealId) : null;
  if (!deal) return errorState(NO_DEAL_MESSAGE);
  if (!milestoneId) return errorState("Milestone not found.");

  const outcome = await analyzeDealEvidence({ session, deal, milestoneId });
  if (!outcome.ok) return errorState(outcome.error);

  const analysis = outcome.data;
  return {
    status: "ok",
    source: outcome.source,
    label: outcome.label,
    summary: `${analysis.evidenceCount} evidence submission${
      analysis.evidenceCount === 1 ? "" : "s"
    } analyzed.`,
    items: [
      { label: "Evidence count", value: String(analysis.evidenceCount) },
      { label: "Supported criteria", value: list(analysis.supportedCriteria) },
      { label: "Missing criteria", value: list(analysis.missingCriteria) },
      {
        label: "Contradictory evidence",
        value: list(analysis.contradictoryEvidence),
      },
      {
        label: "Insufficient evidence",
        value: list(analysis.insufficientEvidence),
      },
      { label: "Reasoning", value: analysis.reasoning },
      { label: "Limitations", value: list(analysis.limitations) },
    ],
  };
}

export async function advisoryForEvidenceDraftAction(
  input: FormData,
): Promise<AdvisoryState> {
  const session = await getDemoSession();
  if (!session) return errorState("Sign in to use advisory features.");

  const dealId = field(input, "dealId");
  const milestoneId = field(input, "milestoneId");
  const deal = dealId ? await getDeal(dealId) : null;
  if (!deal) return errorState(NO_DEAL_MESSAGE);
  if (!milestoneId) return errorState("Milestone not found.");

  const outcome = await advisoryForEvidenceDraft({
    session,
    deal,
    milestoneId,
    note: field(input, "note"),
    url: field(input, "url"),
  });
  if (!outcome.ok) return errorState(outcome.error);

  const advisory = outcome.data;
  return {
    status: "ok",
    source: outcome.source,
    label: outcome.label,
    summary: advisory.summary,
    items: [
      { label: "Summary", value: advisory.summary },
      { label: "Matched criteria", value: list(advisory.matchedCriteria) },
      { label: "Concerns", value: list(advisory.concerns) },
    ],
  };
}
