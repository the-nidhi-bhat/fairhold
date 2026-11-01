"use server";

import { redirect } from "next/navigation";
import { clearDemoSession, DEMO_ROLES, setDemoSession } from "@/lib/auth/session";
import { authorizeDemoLogin } from "@/lib/auth/demo-allowlist";

export async function loginAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const role = String(formData.get("role") ?? "");
  if (
    !name ||
    !DEMO_ROLES.includes(role as (typeof DEMO_ROLES)[number]) ||
    !authorizeDemoLogin({ name, role: role as (typeof DEMO_ROLES)[number] })
  ) {
    redirect("/login?error=invalid");
  }
  await setDemoSession({
    name,
    role: role as (typeof DEMO_ROLES)[number],
  });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearDemoSession();
  redirect("/");
}
