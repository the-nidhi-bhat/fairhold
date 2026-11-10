"use client";

import { useState } from "react";
import {
  analyzeAgreementAction,
  type AdvisoryState,
} from "../advisory-actions";

/**
 * Advisory-only agreement analysis for the new-deal form. It never submits the
 * form or creates a deal; the button is `type="button"`.
 */
export function AgreementAdvisory({ textareaId }: { textareaId: string }) {
  const [state, setState] = useState<AdvisoryState | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAnalyze() {
    const textarea = document.getElementById(
      textareaId,
    ) as HTMLTextAreaElement | null;
    const formData = new FormData();
    formData.set("agreement", textarea?.value ?? "");

    setPending(true);
    try {
      setState(await analyzeAgreementAction(formData));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={pending}
        className="secondary-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Analyzing…" : "Analyze agreement"}
      </button>

      {state ? (
        <div className="surface-inset mt-3 p-4">
          {state.status === "ok" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
                {state.label}
              </p>
              {state.summary ? (
                <p className="mt-1 text-sm text-[var(--foreground-soft)]">
                  {state.summary}
                </p>
              ) : null}
              <dl className="mt-2 space-y-2 text-sm">
                {(state.items ?? []).map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-[var(--foreground-soft)]">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">
                Advisory only. You decide what to create.
              </p>
            </>
          ) : (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {state.message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
