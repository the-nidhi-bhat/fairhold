"use client";

export default function DealError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div
        role="alert"
        className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-6  "
      >
        <h1 className="text-base font-semibold text-[var(--danger)]">
          Could not load this deal
        </h1>
        <p className="mt-2 text-sm text-[var(--danger)]">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
