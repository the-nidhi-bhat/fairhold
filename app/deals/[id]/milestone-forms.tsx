"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addMilestoneAction,
  updateMilestoneAction,
  type FormState,
} from "@/app/deals/actions";
import type { Milestone } from "@/lib/domain/types";

const initialState: FormState = { ok: false, errors: {} };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

function MilestoneFields({
  errors,
  defaults,
}: {
  errors: Record<string, string>;
  defaults?: {
    title: string;
    description: string;
    amount: string;
    dueDate: string;
    acceptanceCriteria: string;
  };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label
          htmlFor="ms-title"
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Title
        </label>
        <input
          id="ms-title"
          name="title"
          type="text"
          required
          maxLength={120}
          defaultValue={defaults?.title}
          aria-invalid={Boolean(errors.title)}
          className={inputClass}
          placeholder="Homepage design"
        />
        <FieldError message={errors.title} />
      </div>

      <div>
        <label
          htmlFor="ms-amount"
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Amount (USD)
        </label>
        <input
          id="ms-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          defaultValue={defaults?.amount}
          aria-invalid={Boolean(errors.amount)}
          className={inputClass}
          placeholder="1,200.00"
        />
        <FieldError message={errors.amount} />
      </div>

      <div>
        <label
          htmlFor="ms-dueDate"
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Due date (optional)
        </label>
        <input
          id="ms-dueDate"
          name="dueDate"
          type="date"
          defaultValue={defaults?.dueDate || ""}
          aria-invalid={Boolean(errors.dueDate)}
          className={inputClass}
        />
        <FieldError message={errors.dueDate} />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="ms-description"
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Description
        </label>
        <textarea
          id="ms-description"
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={defaults?.description}
          className={inputClass}
          placeholder="What will be delivered"
        />
        <FieldError message={errors.description} />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="ms-acceptanceCriteria"
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Acceptance criteria
        </label>
        <textarea
          id="ms-acceptanceCriteria"
          name="acceptanceCriteria"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          defaultValue={defaults?.acceptanceCriteria}
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

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <details className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">
        Add a milestone
      </summary>
      <form ref={formRef} action={formAction} className="mt-4" noValidate>
        <input type="hidden" name="dealId" value={dealId} />
        <MilestoneFields errors={state.errors} />
        {state.errors._form ? (
          <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
            {state.errors._form}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {state.errors._form}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
