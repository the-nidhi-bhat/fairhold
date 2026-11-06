"use client";

/**
 * Client forms for milestone evidence and human approval decisions.
 *
 * These are thin: all validation, recommendation, gating, and identity are
 * decided on the server. Nothing here can set a payment status or actor.
 */
import { useActionState, useEffect, useRef } from "react";
import type {
  MilestoneApproval,
  Recommendation,
} from "@/lib/domain/types";
import {
  recordApprovalAction,
  reviewEvidenceAction,
  submitEvidenceAction,
  type FormState,
} from "../actions";

const initialState: FormState = { ok: false, errors: {} };

const inputClass =
  "field mt-1";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
      {message}
    </p>
  );
}

export function AddEvidenceForm({
  dealId,
  milestoneId,
}: {
  dealId: string;
  milestoneId: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitEvidenceAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <details className="surface-subtle mt-4 p-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--foreground-soft)]">
        Submit evidence
      </summary>
      <form ref={formRef} action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="dealId" value={dealId} />
        <input type="hidden" name="milestoneId" value={milestoneId} />
        <div>
          <label
            htmlFor={`ev-note-${milestoneId}`}
            className="text-xs font-medium text-[var(--foreground-soft)]"
          >
            Note
          </label>
          <textarea
            id={`ev-note-${milestoneId}`}
            name="note"
            rows={3}
            maxLength={1000}
            placeholder="Describe the work delivered (and how to verify it)."
            className={inputClass}
            aria-invalid={state.errors.note ? true : undefined}
          />
          <FieldError message={state.errors.note} />
        </div>
        <div>
          <label
            htmlFor={`ev-url-${milestoneId}`}
            className="text-xs font-medium text-[var(--foreground-soft)]"
          >
            Link (http/https)
          </label>
          <input
            id={`ev-url-${milestoneId}`}
            name="url"
            type="url"
            inputMode="url"
            maxLength={500}
            placeholder="https://…"
            className={inputClass}
            aria-invalid={state.errors.url ? true : undefined}
          />
          <FieldError message={state.errors.url} />
        </div>
        <div>
          <label
            htmlFor={`ev-file-${milestoneId}`}
            className="text-xs font-medium text-[var(--foreground-soft)]"
          >
            File (PNG, JPEG, PDF, or text; max 3 MB)
          </label>
          <input
            id={`ev-file-${milestoneId}`}
            name="file"
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.txt,.md,.csv"
            className="mt-1 block w-full text-sm text-[var(--foreground-soft)] file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground-soft)] hover:file:bg-white/[0.08]"
            aria-invalid={state.errors.file ? true : undefined}
          />
          <FieldError message={state.errors.file} />
        </div>
        <FieldError message={state.errors._form} />
        {state.ok ? (
          <p className="text-xs text-[var(--success)]">
            Evidence recorded.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="primary-button disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit evidence"}
        </button>
      </form>
    </details>
  );
}

export function ReviewEvidenceForm({
  dealId,
  submissionId,
}: {
  dealId: string;
  submissionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    reviewEvidenceAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <label
        htmlFor={`rv-note-${submissionId}`}
        className="text-xs font-medium text-[var(--foreground-soft)]"
      >
        Review note (optional)
      </label>
      <textarea
        id={`rv-note-${submissionId}`}
        name="reviewNote"
        rows={2}
        maxLength={1000}
        className={inputClass}
      />
      <FieldError message={state.errors._form} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="accepted"
          disabled={pending}
          className="rounded-md bg-[var(--success)] px-3 py-1.5 text-sm font-semibold text-[#06120c] hover:brightness-105 disabled:opacity-60"
        >
          Accept evidence
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className="rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-60"
        >
          Reject evidence
        </button>
      </div>
    </form>
  );
}

export function ApprovalPanel({
  dealId,
  milestoneId,
  recommendation,
  approval,
  stale,
}: {
  dealId: string;
  milestoneId: string;
  recommendation: Recommendation;
  approval: MilestoneApproval | null;
  stale: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    recordApprovalAction,
    initialState,
  );
  const canApprove =
    recommendation.action === "CAPTURE" || recommendation.action === "VOID";

  return (
    <div className="mt-4">
      {approval ? (
        <div className="surface-inset p-3 text-xs">
          <p className="font-medium text-[var(--foreground-soft)]">
            Last decision: {approval.decision} → {approval.action}
            {stale ? " (stale)" : ""}
          </p>
          <p className="mt-1 text-muted">
            {approval.reviewedAt} · {approval.reviewedBy}
            {approval.providerReference
              ? ` · ${approval.providerName}: ${approval.providerReference}`
              : ""}
          </p>
          {approval.providerReference && approval.simulated ? (
            <p className="mt-1 text-[var(--warning)]">
              Simulated action — no PayPal request was made.
            </p>
          ) : null}
          {stale ? (
            <p className="mt-1 text-[var(--warning)]">
              Evidence changed after this decision, so it no longer applies.
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="dealId" value={dealId} />
        <input type="hidden" name="milestoneId" value={milestoneId} />
        <label
          htmlFor={`ap-note-${milestoneId}`}
          className="text-xs font-medium text-[var(--foreground-soft)]"
        >
          Decision note (optional)
        </label>
        <textarea
          id={`ap-note-${milestoneId}`}
          name="note"
          rows={2}
          maxLength={1000}
          className={inputClass}
        />
        <FieldError message={state.errors._form} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending || !canApprove}
            className="rounded-md bg-[var(--accent-strong)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            Approve recommendation
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="secondary-button px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Reject / keep on hold
          </button>
        </div>
        {!canApprove ? (
          <p className="text-xs text-muted">
            The current recommendation ({recommendation.action}) cannot be
            approved directly. Resolve it first, or reject to keep it on hold.
          </p>
        ) : null}
      </form>
    </div>
  );
}
