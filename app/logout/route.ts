import { NextResponse } from "next/server";
import { clearDemoSession } from "@/lib/auth/session";
import { resolveAppUrl } from "@/lib/url";

/**
 * Native sign-out endpoint.
 *
 * The sign-out control posts here with a plain HTML form instead of calling a
 * React server action. A server-action form is inert until React has hydrated
 * and taken the form over; a click landing inside that takeover window was
 * swallowed and the user stayed signed in. That was reproducible in WebKit and
 * documented for months in the archived QA report as a test-side timing
 * problem, when the cause was in the product.
 *
 * A native POST has no takeover window: the browser submits the form itself.
 * It also means sign-out keeps working when client JavaScript is unavailable.
 *
 * Cross-site request forgery: two layers, and neither of them is a token.
 *
 * - POST only closes the trivial `<img src="/logout">` vector, which is a GET.
 *   It does not close the cross-site form: `<form method="post"
 *   action="/logout">` on a third-party page is a POST. `sameSite=lax`
 *   withholds the session cookie from that request, but it does not stop the
 *   response from deleting the cookie in the victim's browser, so a
 *   third-party page could force a signed-in user out.
 * - The `Sec-Fetch-Site` / `Origin` check below closes that form. The browser
 *   states where the request came from, and a request that claims another site
 *   is refused before the cookie is touched.
 *
 * Neither layer is a full CSRF token scheme. A per-session synchroniser token
 * rendered into the form and compared on submit is the strongest option; if
 * one is ever added, this check becomes a second layer rather than the only
 * one.
 */

/**
 * First value of a header that may carry a comma-separated list.
 */
function firstValue(header: string | null): string | null {
  const value = header?.split(",")[0]?.trim();
  return value ? value : null;
}

/**
 * Hosts this request may legitimately claim to come from.
 *
 * The request itself is the primary source. Next.js defaults
 * `X-Forwarded-Host` to `Host` when no proxy set it, and the request URL
 * names the same host, so both describe the host the browser addressed. The
 * forwarded header is compared directly as well, because a proxy may rewrite
 * it while the request URL keeps the server's own address.
 *
 * The configured application URL (`resolveAppUrl`, the same resolution used
 * for provider callbacks) is added when it resolves in this environment.
 */
function allowedHosts(request: Request): string[] {
  const hosts = new Set<string>();

  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // No absolute request URL: nothing to add from it.
  }

  for (const header of ["x-forwarded-host", "host"]) {
    const host = firstValue(request.headers.get(header))?.toLowerCase();
    if (host) hosts.add(host);
  }

  try {
    hosts.add(new URL(resolveAppUrl()).host.toLowerCase());
  } catch {
    // No usable application URL here: unset, or rejected by the production
    // rules in lib/url.ts. The request-derived hosts above still stand.
  }

  return [...hosts];
}

/**
 * Whether the request came from another site.
 *
 * `Sec-Fetch-Site` is set by the browser and a page cannot forge it, so
 * `cross-site` is decisive. `Origin` is the fallback for clients that do not
 * send it: an origin whose host is not this host is refused, and `null` (an
 * opaque or sandboxed origin) is refused too. A missing `Origin` proves
 * nothing — handcrafted clients do not send one — so the request is let
 * through rather than failing closed on a legitimate non-browser client.
 *
 * The comparison is on the host rather than on the whole origin, which is the
 * rule Next.js applies to Server Action requests (it compares the `Origin`
 * host against `X-Forwarded-Host`/`Host`). A browser cannot present another
 * site's host as ours, and a same-host origin is this site either way, so
 * comparing hosts keeps a legitimate request working when a proxy reports a
 * different scheme than the browser used.
 */
function isCrossSiteRequest(request: Request): boolean {
  const site = firstValue(request.headers.get("sec-fetch-site"))?.toLowerCase();
  if (site === "cross-site") return true;

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;
  if (origin.toLowerCase() === "null") return true;

  let presented: string;
  try {
    presented = new URL(origin).host.toLowerCase();
  } catch {
    // An Origin that names no origin cannot be this one.
    return true;
  }

  const allowed = allowedHosts(request);
  if (allowed.length === 0) return false;
  return !allowed.includes(presented);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    // No redirect: a redirect would carry the victim off to a URL the
    // attacker chose. The session is left exactly as it was.
    return new NextResponse("Forbidden: cross-site sign-out request refused.\n", {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  await clearDemoSession();
  // 303 See Other: the browser follows up with a GET, so the landing page is
  // fetched rather than re-posted.
  return NextResponse.redirect(new URL("/", request.url), 303);
}
