import { type DemoRole } from "./session-token.ts";

function allowedNames(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

export function authorizeDemoLogin(
  input: { name: string; role: DemoRole },
  env: Record<string, string | undefined> = process.env,
): boolean {
  const normalized = input.name.trim().toLowerCase();
  if (!normalized) return false;

  const configured =
    input.role === "buyer"
      ? allowedNames(env.FAIRHOLD_DEMO_BUYERS ?? "Alex Buyer")
      : input.role === "seller"
        ? allowedNames(env.FAIRHOLD_DEMO_SELLERS ?? "Jamie Seller")
        : allowedNames(env.FAIRHOLD_DEMO_REVIEWERS);

  return configured.includes(normalized);
}

export function authorizeReviewerDeal(
  reviewerName: string,
  dealId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!authorizeDemoLogin({ name: reviewerName, role: "reviewer" }, env)) {
    return false;
  }

  return (env.FAIRHOLD_REVIEWER_DEALS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const separator = entry.lastIndexOf(":");
      if (separator < 1) return false;
      return (
        entry.slice(0, separator).trim().toLowerCase() === reviewerName.trim().toLowerCase() &&
        entry.slice(separator + 1).trim() === dealId
      );
    });
}
