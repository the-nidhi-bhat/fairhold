"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addMilestoneAction,
  updateMilestoneAction,
  type FormState,
} from "@/app/deals/actions";
import {
  suggestMilestoneAction,
  type AdvisoryState,
} from "../advisory-actions";
import type { Milestone } from "@/lib/domain/types";

const initialState: FormState = { ok: false, errors: {} };

interface MilestoneFieldValues {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  acceptanceCriteria: string;
}

const emptyMilestoneValues: MilestoneFieldValues = {
  title: "",
  description: "",
  amount: "",
  dueDate: "",
  acceptanceCriteria: "",
};

const inputClass =
  "mt-1 block w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]  dark:bg-[var(--surface-inset)] dark:text-[var(--foreground)]";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

function MilestoneFields({
  idPrefix,
  errors,
  defaults,
  values,
  onChange,
}: {
  idPrefix: string;
  errors: Record<string, string>;
  defaults?: MilestoneFieldValues;
  values?: MilestoneFieldValues;
  onChange?: (patch: Partial<MilestoneFieldValues>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-title`}
          className="block text-sm font-medium text-[var(--foreground-soft)]"
        >
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          type="text"
          required
          maxLength={120}
          value={values?.title}
          defaultValue={values ? undefined : defaults?.title}
          onChange={
            values ? (event) => onChange?.({ title: event.target.value }) : undefined
          }
          aria-invalid={Boolean(errors.title)}
          className={inputClass}
          placeholder="Homepage design"
        />
        <FieldError message={errors.title} />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-amount`}
          className="block text-sm font-medium text-[var(--foreground-soft)]"
        >
          Amount (USD)
        </label>
        <input
          id={`${idPrefix}-amount`}
          name="amount"
          type="text"
          inputMode="decimal"
          required
          value={values?.amount}
          defaultValue={values ? undefined : defaults?.amount}
          onChange={
            values ? (event) => onChange?.({ amount: event.target.value }) : undefined
          }
          aria-invalid={Boolean(errors.amount)}
          className={inputClass}
          placeholder="1,200.00"
        />
        <FieldError message={errors.amount} />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-dueDate`}
          className="block text-sm font-medium text-[var(--foreground-soft)]"
        >
          Due date (optional)
        </label>
        <input
          id={`${idPrefix}-dueDate`}
          name="dueDate"
          type="date"
          value={values?.dueDate}
          defaultValue={values ? undefined : defaults?.dueDate || ""}
          onChange={
            values
              ? (event) => onChange?.({ dueDate: event.target.value })
              : undefined
          }
          aria-invalid={Boolean(errors.dueDate)}
          className={inputClass}
        />
        <FieldError message={errors.dueDate} />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-description`}
          className="block text-sm font-medium text-[var(--foreground-soft)]"
        >
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          maxLength={2000}
          value={values?.description}
          defaultValue={values ? undefined : defaults?.description}
          onChange={
            values
              ? (event) => onChange?.({ description: event.target.value })
              : undefined
          }
          className={inputClass}
          placeholder="What will be delivered"
        />
        <FieldError message={errors.description} />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-acceptanceCriteria`}
          className="block text-sm font-medium text-[var(--foreground-soft)]"
        >
          Acceptance criteria
        </label>
        <textarea
          id={`${idPrefix}-acceptanceCriteria`}
          name="acceptanceCriteria"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          value={values?.acceptanceCriteria}
          defaultValue={values ? undefined : defaults?.acceptanceCriteria}
          onChange={
            values
              ? (event) =>
                  onChange?.({ acceptanceCriteria: event.target.value })
              : undefined
          }
          aria-invalid={Boolean(errors.acceptanceCriteria)}
          className={inputClass}
          placeholder="What must be true for this milestone to be accepted"
        />
        <FieldError message={errors.acceptanceCriteria} />
      </div>
    </div>
  );
}

export function AddMilestoneForm({ dealId }: { dealId: string }) {
  const [state, formAction, pending] = useActionState(
    addMilestoneAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<MilestoneFieldValues>(
    emptyMilestoneValues,
  );
  const [advisory, setAdvisory] = useState<AdvisoryState | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    // The form's onReset handler clears the controlled values and advisory.
    if (state.ok) formRef.current?.reset();
  }, [state]);

  async function handleSuggest() {
    const formData = new FormData();
    formData.set("dealId", dealId);

    setSuggesting(true);
    try {
      const result = await suggestMilestoneAction(formData);
      setAdvisory(result);
      if (result.status !== "ok") return;

      setValues((current) => ({
        ...current,
        title: result.proposal?.title ?? current.title,
        description: result.proposal?.description ?? current.description,
        acceptanceCriteria:
          result.proposal?.acceptanceCriteria ?? current.acceptanceCriteria,
      }));
    } catch {
      setAdvisory({
        status: "error",
        message: "Advisory unavailable. Try again.",
      });
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <details className="surface-subtle p-5">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">
        Add a milestone
      </summary>
      <form
        ref={formRef}
        action={formAction}
        className="mt-4"
        noValidate
        onReset={() => {
          setValues(emptyMilestoneValues);
          setAdvisory(null);
        }}
      >
        <input type="hidden" name="dealId" value={dealId} />
        <MilestoneFields
          idPrefix="ms-add"
          errors={state.errors}
          values={values}
          onChange={(patch) =>
            setValues((current) => ({ ...current, ...patch }))
          }
        />
        {state.errors._form ? (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {state.errors._form}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting || pending}
            aria-busy={suggesting}
            className="secondary-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {suggesting ? "Suggesting…" : "Suggest from agreement"}
          </button>
          {advisory?.status === "ok" ? (
            <span role="status" aria-live="polite" className="text-xs text-muted">
              {advisory.label} — Advisory only — review before adding the
              milestone.
            </span>
          ) : null}
        </div>
        {advisory?.status === "error" ? (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {advisory.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="primary-button mt-4 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add milestone"}
        </button>
      </form>
    </details>
  );
}

export function EditMilestoneForm({
  dealId,
  milestone,
}: {
  dealId: string;
  milestone: Milestone;
}) {
  const [state, formAction, pending] = useActionState(
    updateMilestoneAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3" noValidate>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="milestoneId" value={milestone.id} />
      <MilestoneFields
        idPrefix={`ms-${milestone.id}`}
        errors={state.errors}
        defaults={{
          title: milestone.title,
          description: milestone.description,
          amount: (milestone.amountCents / 100).toFixed(2),
          dueDate: milestone.dueDate ?? "",
          acceptanceCriteria: milestone.acceptanceCriteria,
        }}
      />
      {state.errors._form ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {state.errors._form}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="secondary-button mt-4 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
