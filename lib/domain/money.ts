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

/**
 * Parse a human-typed decimal amount into integer cents without ever touching
 * binary floating point. "1200.5" becomes 120050, not 120049.99999999999.
 */
export function parseAmountToCents(
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const text = raw.trim().replace(/^\$/, "");
  if (text === "") return { ok: false, error: "Enter an amount." };
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) {
    return {
      ok: false,
      error: "Use digits with at most two decimal places, for example 1200.00.",
    };
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  return { ok: true, value: cents };
}

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
