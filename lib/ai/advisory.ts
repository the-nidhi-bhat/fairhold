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

export interface AdvisoryProviderConfig {
  apiKey: string;
  model: string;
  url: string;
}

export function readAdvisoryProviderConfig(
  env: Record<string, string | undefined> = process.env,
): AdvisoryProviderConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!apiKey || !model || /^your_/i.test(apiKey) || /^your_/i.test(model)) return null;
  return {
    apiKey,
    model,
    url: env.AI_API_URL?.trim() || "https://api.openai.com/v1/chat/completions",
  };
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export async function resolveMilestoneProposal(
  agreement: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ proposal: MilestoneProposal; source: "ai" | "deterministic" }> {
  const fallback = deterministicMilestoneProposal(agreement);
  const config = readAdvisoryProviderConfig(env);
  if (!config) return { proposal: fallback, source: "deterministic" };
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return only JSON with title, description, and acceptanceCriteria. This advisory does not authorize payment or accept evidence.",
          },
          { role: "user", content: `Agreement: ${agreement.slice(0, 10000)}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { proposal: fallback, source: "deterministic" };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { proposal: fallback, source: "deterministic" };
    const proposal = parseMilestoneProposal(parseJsonObject(content));
    return proposal ? { proposal, source: "ai" } : { proposal: fallback, source: "deterministic" };
  } catch {
    return { proposal: fallback, source: "deterministic" };
  }
}

export async function resolveEvidenceAdvisory(
  acceptanceCriteria: string,
  evidence: string[],
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ advisory: EvidenceAdvisory; source: "ai" | "deterministic" }> {
  const fallback = deterministicEvidenceAdvisory(acceptanceCriteria, evidence);
  const config = readAdvisoryProviderConfig(env);
  if (!config) return { advisory: fallback, source: "deterministic" };
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Assess the supplied evidence against the acceptance criteria. Return only JSON with summary (string), matchedCriteria (array of strings), and concerns (array of strings). Do not decide or recommend acceptance: a human reviewer decides. This advisory never changes deal state.",
          },
          {
            role: "user",
            content: JSON.stringify({ acceptanceCriteria, evidence }).slice(0, 10000),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { advisory: fallback, source: "deterministic" };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { advisory: fallback, source: "deterministic" };
    const advisory = parseEvidenceAdvisory(parseJsonObject(content));
    return advisory ? { advisory, source: "ai" } : { advisory: fallback, source: "deterministic" };
  } catch {
    return { advisory: fallback, source: "deterministic" };
  }
}
