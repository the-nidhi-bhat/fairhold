/**
 * Server-side validation for deal and milestone input.
 *
 * Every mutation routes through these pure functions. Nothing here trusts the
 * client: amounts are re-parsed from strings into integer cents, currency is
 * pinned to USD, and dates are validated structurally. Validation is
 * deliberately dependency-free so it can be unit-tested with node:test.
 */

export interface DealFormValues {
  title: string;
  clientName: string;
  freelancerName: string;
  currency: "USD";
  agreement: string;
}

export interface MilestoneFormValues {
  title: string;
  description: string;
  amountCents: number;
  dueDate: string | null;
  acceptanceCriteria: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse a user-entered money string into integer cents.
 * Accepts "90", "90.5", "90.50", "$1,200.00". Rejects anything else.
 * Returns null on invalid input so callers can surface a field error.
 */
export function parseAmountToCents(input: unknown): number | null {
  const raw = str(input).replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validate that a string is a UUID. Used before passing route parameters to
 * PostgreSQL queries that expect UUID columns, preventing database errors
 * from non-UUID path segments such as "new".
 */
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validateAgreementText(raw: unknown): ValidationResult<string> {
  const agreement = str(raw);
  if (agreement.length < 20) {
    return {
      ok: false,
      errors: { agreement: "Agreement must be at least 20 characters." },
    };
  }
  if (agreement.length > 20000) {
    return {
      ok: false,
      errors: { agreement: "Agreement is too long (20,000 character limit)." },
    };
  }
  return { ok: true, value: agreement };
}

export function validateDealInput(
  raw: Record<string, unknown>,
): ValidationResult<DealFormValues> {
  const errors: Record<string, string> = {};

  const title = str(raw.title);
  if (title.length < 3) errors.title = "Title must be at least 3 characters.";
  else if (title.length > 120)
    errors.title = "Title must be 120 characters or fewer.";

  const clientName = str(raw.clientName);
  if (clientName.length < 1) errors.clientName = "Client name is required.";
  else if (clientName.length > 80)
    errors.clientName = "Client name must be 80 characters or fewer.";

  const freelancerName = str(raw.freelancerName);
  if (freelancerName.length < 1)
    errors.freelancerName = "Freelancer name is required.";
  else if (freelancerName.length > 80)
    errors.freelancerName = "Freelancer name must be 80 characters or fewer.";

  const currency = (str(raw.currency) || "USD").toUpperCase();
  if (currency !== "USD")
    errors.currency = "Only USD is supported in this build.";

  const agreementResult = validateAgreementText(raw.agreement);
  if (!agreementResult.ok) errors.agreement = agreementResult.errors.agreement;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      clientName,
      freelancerName,
      currency: "USD",
      agreement: agreementResult.ok ? agreementResult.value : "",
    },
  };
}

export function validateMilestoneInput(
  raw: Record<string, unknown>,
): ValidationResult<MilestoneFormValues> {
  const errors: Record<string, string> = {};

  const title = str(raw.title);
  if (title.length < 3) errors.title = "Milestone title is required.";
  else if (title.length > 120)
    errors.title = "Milestone title must be 120 characters or fewer.";

  const description = str(raw.description);
  if (description.length > 2000)
    errors.description = "Description must be 2,000 characters or fewer.";

  const amountCents = parseAmountToCents(raw.amount);
  if (amountCents === null)
    errors.amount = "Enter an amount greater than 0 (e.g. 500 or 500.00).";
  else if (amountCents > 100_000_000)
    errors.amount = "Milestone amount is too large.";

  const dueDateRaw = str(raw.dueDate);
  let dueDate: string | null = null;
  if (dueDateRaw.length > 0) {
    if (!isIsoDate(dueDateRaw)) errors.dueDate = "Due date must be a valid date.";
    else dueDate = dueDateRaw;
  }

  const acceptanceCriteria = str(raw.acceptanceCriteria);
  if (acceptanceCriteria.length < 10)
    errors.acceptanceCriteria =
      "Describe how this milestone is accepted (at least 10 characters).";
  else if (acceptanceCriteria.length > 2000)
    errors.acceptanceCriteria = "Acceptance criteria are too long.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { title, description, amountCents: amountCents as number, dueDate, acceptanceCriteria },
  };
}
