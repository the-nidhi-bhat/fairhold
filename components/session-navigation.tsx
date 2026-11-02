import Link from "next/link";
import { getDemoSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

export async function SessionNavigation() {
  const session = await getDemoSession();
  if (!session) {
    return (
      <Link href="/login" className="font-medium text-accent">
        Demo sign in
      </Link>
    );
  }

  return (
    <form action={logoutAction}>
      <button className="max-w-[180px] truncate text-sm font-medium text-muted hover:text-[var(--foreground)] sm:max-w-none">
        {session.name} · {session.role} · Sign out
      </button>
    </form>
  );
}
