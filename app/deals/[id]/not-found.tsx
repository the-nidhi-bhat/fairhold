import Link from "next/link";

export default function DealNotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
        Deal not found
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        This deal does not exist or has been removed.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
