/**
 * Whether the session cookie must carry the Secure attribute.
 *
 * Derived from the request's forwarded scheme (`X-Forwarded-Proto`), not from
 * NODE_ENV: a production build served over plain HTTP must still be able to
 * log in (WebKit rejects Secure cookies on non-secure origins, silently
 * dropping the session), while TLS deployments (Vercel always sets the
 * header) keep the cookie Secure.
 *
 * The first comma-separated segment wins because proxies append values;
 * matching is case-insensitive. No header (a directly served plain-HTTP
 * server) means not-Secure — HttpOnly and SameSite=Lax still apply.
 */
export function sessionCookieRequiresSecure(xForwardedProto: string | null): boolean {
  const first = (xForwardedProto ?? "").split(",")[0]?.trim().toLowerCase();
  return first === "https";
}
