import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/lib/auth/session";
import { NewDealForm } from "./new-deal-form";

export const metadata = { title: "New deal" };
export const instant = false;

export default async function NewDealPage() {
  if (!(await getDemoSession())) redirect("/login");
  return (
    <div className="page-frame py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
      >
        &larr; Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
        Create a deal
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Record the parties and the agreement. After creating the deal you can
        add milestones with amounts, deadlines, and acceptance criteria.
      </p>
      <div className="surface mt-8 max-w-3xl p-6 sm:p-8"><NewDealForm /></div>
    </div>
  );
}
