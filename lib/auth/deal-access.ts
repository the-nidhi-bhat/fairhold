import { authorizeReviewerDeal } from "./demo-allowlist.ts";
import type { DemoSession } from "./session-token.ts";

export interface DealAccessTarget {
  id: string;
  clientName: string;
  freelancerName: string;
}

export function canAccessDeal(session: DemoSession, deal: DealAccessTarget): boolean {
  const normalizedName = session.name.trim().toLowerCase();
  if (session.role === "reviewer") {
    return authorizeReviewerDeal(normalizedName, deal.id);
  }
  return session.role === "buyer"
    ? deal.clientName.trim().toLowerCase() === normalizedName
    : deal.freelancerName.trim().toLowerCase() === normalizedName;
}
