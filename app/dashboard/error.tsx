"use client";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="page-frame py-10">
      <div
        role="alert"
        className="rounded-xl border border-rose-300 bg-rose-50 p-6 dark:border-rose-800 dark:bg-rose-950"
      >
        <h1 className="text-base font-semibold text-rose-900 dark:text-rose-200">
          Could not load the dashboard
        </h1>
        <p className="mt-2 text-sm text-rose-800 dark:text-rose-300">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 rounded-md border border-rose-400 px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-900"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
