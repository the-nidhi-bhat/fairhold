import Link from "next/link";
import { getDemoSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/login/actions";

export async function SessionNavigation() {
  const session = await getDemoSession();
  if (!session) {
    return (
      <Link href="/login" className="font-medium text-indigo-600 dark:text-indigo-400">
        Demo sign in
      </Link>
    );
  }

  return (
    <form action={logoutAction}>
      <button className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50">
        {session.name} · {session.role} · Sign out
      </button>
    </form>
  );
}
