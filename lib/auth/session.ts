import { cookies } from "next/headers";
import type { Deal } from "@/lib/domain/types";
import { authorizeDemoLogin, authorizeReviewerDeal } from "./demo-allowlist.ts";
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
export type { DemoRole, DemoSession };

export async function getDemoSession(): Promise<DemoSession | null> {
  const store = await cookies();
  const session = decodeDemoSession(store.get(COOKIE_NAME)?.value);
  return session && authorizeDemoLogin(session) ? session : null;
}

export async function setDemoSession(session: DemoSession): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeDemoSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearDemoSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function canAccessDeal(session: DemoSession, deal: Deal): boolean {
  const normalizedName = session.name.trim().toLowerCase();
  if (session.role === "reviewer") {
    return authorizeReviewerDeal(normalizedName, deal.id);
  }
  return session.role === "buyer"
    ? deal.clientName.trim().toLowerCase() === normalizedName
    : deal.freelancerName.trim().toLowerCase() === normalizedName;
}
