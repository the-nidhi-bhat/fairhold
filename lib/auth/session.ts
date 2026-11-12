import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { authorizeDemoLogin } from "./demo-allowlist.ts";
import { sessionCookieRequiresSecure } from "./secure-cookie.ts";
import {
  decodeDemoSession,
  DEMO_ROLES,
  encodeDemoSession,
  type DemoRole,
  type DemoSession,
} from "./session-token.ts";

const COOKIE_NAME = "fairhold_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export { DEMO_ROLES };
export { canAccessDeal } from "./deal-access.ts";
export type { DemoRole, DemoSession };

export async function getDemoSession(): Promise<DemoSession | null> {
  await connection();
  const store = await cookies();
  const session = decodeDemoSession(store.get(COOKIE_NAME)?.value);
  return session && authorizeDemoLogin(session) ? session : null;
}

export async function setDemoSession(session: DemoSession): Promise<void> {
  const store = await cookies();
  const requestHeaders = await headers();
  store.set(COOKIE_NAME, encodeDemoSession(session), {
    httpOnly: true,
    sameSite: "lax",
    // Follow the actual request scheme, not NODE_ENV: a production build over
    // plain HTTP must still work (WebKit drops Secure cookies on http origins),
    // and TLS proxies (Vercel) mark requests https so the cookie stays Secure.
    secure: sessionCookieRequiresSecure(requestHeaders.get("x-forwarded-proto")),
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
