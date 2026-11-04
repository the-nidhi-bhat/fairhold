export interface CapturePlan {
  allowed: boolean;
  remainingCents: number;
  captureCents: number;
  finalCapture: boolean;
  error?: string;
}

export function planCapture(
  authorizationCents: number,
  capturedCents: number,
  requestedCents: number,
): CapturePlan {
  const remainingCents = authorizationCents - capturedCents;
  if (!Number.isSafeInteger(authorizationCents) || authorizationCents <= 0) {
    return { allowed: false, remainingCents: 0, captureCents: 0, finalCapture: false, error: "Invalid authorization amount." };
  }
  if (capturedCents < 0 || capturedCents >= authorizationCents) {
    return { allowed: false, remainingCents, captureCents: 0, finalCapture: false, error: "Authorization has no remaining amount." };
  }
  if (!Number.isSafeInteger(requestedCents) || requestedCents <= 0) {
    return { allowed: false, remainingCents, captureCents: 0, finalCapture: false, error: "Invalid capture amount." };
  }
  if (requestedCents > remainingCents) {
    return { allowed: false, remainingCents, captureCents: 0, finalCapture: false, error: "Capture exceeds the remaining authorization." };
  }
  return {
    allowed: true,
    remainingCents,
    captureCents: requestedCents,
    finalCapture: requestedCents === remainingCents,
  };
}

export function isFinalPaymentOutcome(
  status: "COMPLETED" | "VOIDED" | "PENDING" | "FAILED",
  ok: boolean,
): boolean {
  return ok && status === "COMPLETED";
}
