import Link from "next/link";
import { getDemoSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

export async function SessionNavigation() {
  const session = await getDemoSession();
  if (!session) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Link
          href="/demo"
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-muted hover:bg-white/5 hover:text-[var(--foreground)]"
        >
          Guided demo
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center rounded-lg px-2 font-medium text-accent hover:bg-white/5"
        >
          Demo sign in
        </Link>
      </div>
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
