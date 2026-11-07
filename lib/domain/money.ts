/**
 * Authorized / captured / pending / remaining money summary — pure and
 * deterministic.
 *
 * The dashboard and deal page must never overstate financial reality, so this
 * module is the single place that turns stored milestone approvals into the
 * numbers a user sees:
 *
 *   - captured: only approvals the provider CONFIRMED as COMPLETED.
 *   - pending:  captures the provider has not settled yet. They are deliberately
 *               NOT counted as captured, and they are also withheld from the
 *               remaining balance because the money is still reserved.
 *   - released: the remainder of a voided authorization. A void releases the
 *               whole hold, so the remaining balance becomes zero.
 *   - remaining: authorized - captured - pending - released, never negative.
 *
 * A FAILED capture moved no money and therefore never reduces the balance.
 */
import type { Deal } from "./types.ts";

export interface DealMoneySummary {
  authorizedCents: number;
  capturedCents: number;
  pendingCents: number;
  releasedCents: number;
  remainingCents: number;
  /** True when the authorization exists and every authorized cent is captured. */
  fullyCaptured: boolean;
  /** True when the deal has an authorization hold at all. */
  hasAuthorization: boolean;
}

type MoneyDeal = Pick<Deal, "authorization" | "milestones">;

export function summarizeDealMoney(deal: MoneyDeal): DealMoneySummary {
  const authorizedCents = deal.authorization?.amountCents ?? 0;

  let capturedCents = 0;
  let pendingCents = 0;
  let voided = false;

  for (const milestone of deal.milestones) {
    const approval = milestone.approval;
    if (!approval) continue;
    if (approval.action === "CAPTURE" && approval.paymentStatus === "COMPLETED") {
      capturedCents += milestone.amountCents;
    } else if (approval.action === "CAPTURE" && approval.paymentStatus === "PENDING") {
      pendingCents += milestone.amountCents;
    } else if (approval.action === "VOID" && approval.paymentStatus === "VOIDED") {
      voided = true;
    }
  }

  // A voided authorization releases everything that was not captured and is
  // not still reserved by an unresolved capture.
  const releasedCents = voided
    ? Math.max(0, authorizedCents - capturedCents - pendingCents)
    : 0;

  const remainingCents = Math.max(
    0,
    authorizedCents - capturedCents - pendingCents - releasedCents,
  );

  return {
    authorizedCents,
    capturedCents,
    pendingCents,
    releasedCents,
    remainingCents,
    fullyCaptured: authorizedCents > 0 && capturedCents === authorizedCents,
    hasAuthorization: deal.authorization !== null,
  };
}
