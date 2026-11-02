"use client";

import { useActionState } from "react";
import { createDealAction, type FormState } from "@/app/deals/actions";

const initialState: FormState = { ok: false, errors: {} };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

export function NewDealForm() {
  const [state, formAction, pending] = useActionState(
    createDealAction,
    initialState,
  );

  const inputClass =
    "field mt-2";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="title"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Deal title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={120}
            aria-invalid={Boolean(state.errors.title)}
            className={inputClass}
            placeholder="Website redesign — Phase 1"
          />
          <FieldError message={state.errors.title} />
        </div>

        <div>
          <label
            htmlFor="clientName"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Client
          </label>
          <input
            id="clientName"
            name="clientName"
            type="text"
            required
            maxLength={80}
            aria-invalid={Boolean(state.errors.clientName)}
            className={inputClass}
            placeholder="Acme Ltd."
          />
          <FieldError message={state.errors.clientName} />
        </div>

        <div>
          <label
            htmlFor="freelancerName"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Freelancer
          </label>
          <input
            id="freelancerName"
            name="freelancerName"
            type="text"
            required
            maxLength={80}
            aria-invalid={Boolean(state.errors.freelancerName)}
            className={inputClass}
            placeholder="Jordan Lee"
          />
          <FieldError message={state.errors.freelancerName} />
        </div>

        <div>
          <label
            htmlFor="currency"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue="USD"
            aria-invalid={Boolean(state.errors.currency)}
            className={inputClass}
          >
            <option value="USD">USD — US Dollar</option>
          </select>
          <FieldError message={state.errors.currency} />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="agreement"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Agreement
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Paste the agreed scope of work. Milestones and acceptance criteria
            will be added on the deal page.
          </p>
          <textarea
            id="agreement"
            name="agreement"
            required
            rows={8}
            minLength={20}
            maxLength={20000}
            aria-invalid={Boolean(state.errors.agreement)}
            className={inputClass}
            placeholder="Describe the work, deliverables, and payment terms agreed between both parties."
          />
          <FieldError message={state.errors.agreement} />
        </div>
      </div>

      {state.errors._form ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {state.errors._form}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create deal"}
        </button>
      </div>
    </form>
  );
}
