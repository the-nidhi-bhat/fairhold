export interface MilestoneProposal {
  title: string;
  description: string;
  acceptanceCriteria: string;
}

export interface EvidenceAdvisory {
  summary: string;
  matchedCriteria: string[];
  concerns: string[];
}

export function deterministicMilestoneProposal(agreement: string): MilestoneProposal {
  const compact = agreement.trim().replace(/\s+/g, " ");
  const hasDelivery = /deliver|build|develop|design|website/i.test(compact);
  return {
    title: hasDelivery ? "Deliver agreed work" : "Complete agreed milestone",
    description: compact.slice(0, 500) || "Complete the agreed work.",
    acceptanceCriteria: "Complete the agreed work, provide reviewable evidence, and obtain buyer approval.",
  };
}

export function deterministicEvidenceAdvisory(
  criteria: string,
  evidence: string[],
): EvidenceAdvisory {
  const words = evidence.join(" ").trim();
  return {
    summary: evidence.length === 0
      ? "No evidence has been submitted."
      : `Evidence includes ${evidence.length} submission${evidence.length === 1 ? "" : "s"}.`,
    matchedCriteria: words.length > 0 ? [criteria.trim() || "Agreed acceptance criteria"] : [],
    concerns: words.length === 0 ? ["Evidence is missing."] : [],
  };
}

export function parseMilestoneProposal(raw: unknown): MilestoneProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const strings = ["title", "description", "acceptanceCriteria"] as const;
  if (!strings.every((key) => typeof record[key] === "string" && record[key].trim().length > 0)) {
    return null;
  }
  const title = record.title as string;
  const description = record.description as string;
  const acceptanceCriteria = record.acceptanceCriteria as string;
  return {
    title: title.trim().slice(0, 120),
    description: description.trim().slice(0, 500),
    acceptanceCriteria: acceptanceCriteria.trim().slice(0, 500),
  };
}

export function parseEvidenceAdvisory(raw: unknown): EvidenceAdvisory | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (
    typeof record.summary !== "string" ||
    !Array.isArray(record.matchedCriteria) ||
    !Array.isArray(record.concerns) ||
    !record.matchedCriteria.every((value) => typeof value === "string") ||
    !record.concerns.every((value) => typeof value === "string")
  ) {
    return null;
  }
  return {
    summary: record.summary.trim().slice(0, 1000),
    matchedCriteria: record.matchedCriteria.map((value) => value.trim().slice(0, 300)).slice(0, 20),
    concerns: record.concerns.map((value) => value.trim().slice(0, 300)).slice(0, 20),
  };
}
