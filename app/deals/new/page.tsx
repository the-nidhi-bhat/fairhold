import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/lib/auth/session";
import { NewDealForm } from "./new-deal-form";

export const metadata = { title: "New deal" };
export const instant = false;

export default async function NewDealPage() {
  if (!(await getDemoSession())) redirect("/login");
  return (
    <div className="page-frame py-12 md:py-16">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-[var(--accent)] hover:text-[var(--foreground)]"
      >
        &larr; Dashboard
      </Link>
      <p className="eyebrow mt-8">New record</p>
      <h1 className="headline mt-3 text-[clamp(1.9rem,3.4vw,2.6rem)]">
        Create a deal
      </h1>
      <p className="lede mt-4 max-w-2xl">
        Record the parties and the agreement. After creating the deal you can
        add milestones with amounts, deadlines, and acceptance criteria.
      </p>
      <div className="surface mt-8 max-w-3xl p-6 sm:p-8"><NewDealForm /></div>
    </div>
  );
}
