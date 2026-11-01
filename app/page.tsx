import Link from "next/link";

const FLOW = [
  "Agreement",
  "Payment",
  "Conditions",
  "Evidence",
  "Verification",
  "Deterministic decision",
  "Release / Refund / Dispute",
] as const;

const PROBLEMS = [
  "The buyer pays before receiving the promised work.",
  "The seller delivers work without knowing whether payment will happen.",
  "Requirements are buried inside informal messages.",
  "Disagreements arise over whether a condition was satisfied.",
  "There is little structured evidence to point at.",
  "Users do not understand why a payment decision was made.",
] as const;

const AI_MAY = [
  "Interpret a natural-language agreement",
  "Propose structured, reviewable conditions",
  "Analyse submitted evidence against those conditions",
  "Summarise a dispute and its supporting evidence",
  "Generate a recommendation with stated reasoning",
] as const;

const AI_MAY_NOT = [
  "Release or refund a payment",
  "Authorise a payment",
  "Modify payment state",
  "Bypass authentication or authorisation",
  "Override the rules engine",
  "Invent a successful payment",
] as const;

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">
          FairHold
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
          AI-assisted conditional payments for buyer-seller transactions.
        </h1>
        <p className="mt-6 max-w-2xl text-xl font-medium text-slate-800 dark:text-slate-200">
          AI proposes. Rules decide.
        </p>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
          FairHold helps structure agreements, payment conditions, evidence, and
          decision-making around a transaction. AI can help interpret
          agreements and analyse evidence. Deterministic application rules
          remain responsible for final decisions.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Open dashboard
          </Link>
          <Link
            href="/deals/new"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Create a deal
          </Link>
        </div>
      </section>

      {/* The problem */}
      <section className="border-t border-slate-200 py-14 dark:border-slate-800">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          The problem
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
          Many online transactions rely on trust between a buyer and a seller.
          That trust is usually unstructured.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {PROBLEMS.map((problem) => (
            <li
              key={problem}
              className="rounded-lg border border-slate-200 p-4 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:text-slate-300"
            >
              {problem}
            </li>
          ))}
        </ul>
      </section>

      {/* How it is designed to work */}
      <section className="border-t border-slate-200 py-14 dark:border-slate-800">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          How FairHold is designed to work
        </h2>
        <ol className="mt-6 flex flex-wrap items-center gap-2">
          {FLOW.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {step}
              </span>
              {index < FLOW.length - 1 ? (
                <span aria-hidden className="text-slate-400">
                  &rarr;
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Separation of responsibilities */}
      <section className="border-t border-slate-200 py-14 dark:border-slate-800">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Separation of responsibilities
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              AI may
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
              {AI_MAY.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              AI may never
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
              {AI_MAY_NOT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-slate-200 p-5 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Deterministic rules decide
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
            A rules engine, not a model, evaluates agreed conditions against
            verified payment state and returns a decision —{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
              WAITING
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
              RELEASE
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
              REFUND
            </code>
            , or{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
              DISPUTE
            </code>
            . Every decision records the reasons behind it.
          </p>
        </div>
      </section>

      {/* PayPal note */}
      <section className="border-t border-slate-200 py-14 dark:border-slate-800">
        <div className="rounded-lg border border-slate-300 p-5 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            About PayPal in FairHold
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
            PayPal is used as the payment infrastructure. FairHold does not
            claim that PayPal provides native escrow for this application.
            Where a hold is shown, it reflects the PayPal capability actually
            being used, described in those terms.
          </p>
        </div>
      </section>
    </div>
  );
}
