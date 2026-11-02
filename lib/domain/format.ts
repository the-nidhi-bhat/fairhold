/**
 * Money formatting. Amounts are stored as integer cents; this only renders
 * them. Pure and dependency-free so it can run on the server or in the UI.
 */

export function formatCents(cents: number, currency = "USD"): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(safe / 100);
  } catch {
    return `${(safe / 100).toFixed(2)} ${currency}`;
  }
}
