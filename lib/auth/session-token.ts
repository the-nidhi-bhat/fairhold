import { createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_ROLES = ["buyer", "seller", "reviewer"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export interface DemoSession {
  name: string;
  role: DemoRole;
}

function secret(): string {
  const configured = process.env.FAIRHOLD_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FAIRHOLD_SESSION_SECRET is required in production.");
  }
  return "fairhold-development-only-session-secret";
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function isDemoRole(value: unknown): value is DemoRole {
  return DEMO_ROLES.includes(value as DemoRole);
}

export function encodeDemoSession(session: DemoSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeDemoSession(value: string | undefined): DemoSession | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const payload = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  const expected = signature(payload);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<DemoSession>;
    if (
      typeof parsed.name !== "string" ||
      parsed.name.trim().length === 0 ||
      !isDemoRole(parsed.role)
    ) {
      return null;
    }
    return { name: parsed.name.trim().slice(0, 100), role: parsed.role };
  } catch {
    return null;
  }
}
