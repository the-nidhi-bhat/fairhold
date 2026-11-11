/**
 * Application URL resolution for provider callbacks (PayPal return/cancel).
 *
 * Resolves the public base URL used for provider redirect URLs. Preference:
 *   1. NEXT_PUBLIC_APP_URL (explicitly configured)
 *   2. VERCEL_URL (Vercel Preview/deployment, HTTPS)
 *   3. localhost:3000 only when NODE_ENV !== "production" (local dev)
 *
 * Rejects localhost/loopback/private hosts and insecure HTTP in production so
 * provider callbacks can never be redirected to a private/internal address.
 */
export interface AppUrlResolutionError extends Error {
  code: "MISSING_URL" | "INSECURE_URL" | "PRIVATE_HOST" | "INVALID_URL";
}

class AppUrlError extends Error implements AppUrlResolutionError {
  readonly code: AppUrlResolutionError["code"];
  constructor(code: AppUrlResolutionError["code"], message: string) {
    super(message);
    this.name = "AppUrlError";
    this.code = code;
  }
}

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower.startsWith("127.") ||
    lower.startsWith("10.") ||
    lower.startsWith("172.16.") ||
    lower.startsWith("172.17.") ||
    lower.startsWith("172.18.") ||
    lower.startsWith("172.19.") ||
    lower.startsWith("172.20.") ||
    lower.startsWith("172.21.") ||
    lower.startsWith("172.22.") ||
    lower.startsWith("172.23.") ||
    lower.startsWith("172.24.") ||
    lower.startsWith("172.25.") ||
    lower.startsWith("172.26.") ||
    lower.startsWith("172.27.") ||
    lower.startsWith("172.28.") ||
    lower.startsWith("172.29.") ||
    lower.startsWith("172.30.") ||
    lower.startsWith("172.31.") ||
    lower.startsWith("192.168.")
  );
}

export function resolveAppUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_APP_URL ?? env.VERCEL_URL;
  if (!raw || /^\s*$/.test(raw)) {
    throw new AppUrlError("MISSING_URL", "No public application URL configured. Set NEXT_PUBLIC_APP_URL or ensure VERCEL_URL is available.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppUrlError("INVALID_URL", `Invalid APP_URL: "${raw}". Must be a valid absolute URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppUrlError("INVALID_URL", `Invalid APP_URL scheme "${parsed.protocol}". Only http: and https: are allowed.`);
  }

  const isDev = env.NODE_ENV !== "production";

  // In production (or non-dev), only https is allowed and no local/private hosts.
  if (!isDev) {
    if (parsed.protocol !== "https:") {
      throw new AppUrlError("INSECURE_URL", `APP_URL uses "${parsed.protocol}". Production requires https:.`);
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new AppUrlError("PRIVATE_HOST", `APP_URL host "${parsed.hostname}" is not allowed in production.`);
    }
  }

  // Normalize: strip trailing slash from origin so path concatenation is stable.
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.origin + parsed.pathname;
}

export function buildDealUrl(dealId: string, path: string, env: Record<string, string | undefined> = process.env): string {
  const base = resolveAppUrl(env);
  // Ensure the dealId is a safe path segment (UUID validated elsewhere at the page layer).
  const safeDealId = String(dealId).replace(/[^A-Za-z0-9_-]/g, "");
  return `${base}/deals/${safeDealId}${path}`;
}
