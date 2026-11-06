import Link from "next/link";

const FLOW = [
  {
    title: "Agreement",
    body: "Capture the scope in writing: parties, deliverables and payment terms.",
  },
  {
    title: "Payment setup",
    body: "Record an authorization hold through the configured provider. A hold is not escrow.",
  },
  {
    title: "Conditions",
    body: "Break the work into milestones with explicit, human-readable acceptance criteria.",
  },
  {
    title: "Evidence",
    body: "The seller submits notes, links and files against each milestone.",
  },
  {
    title: "Review",
    body: "The buyer or an authorised reviewer accepts, rejects with feedback, or asks for a revision.",
  },
  {
    title: "Rule-based decision",
    body: "Deterministic rules evaluate verified payment state and the recorded decision. AI never decides.",
  },
  {
    title: "Release, refund or dispute",
    body: "The outcome is recorded with reasons, and the activity trail stays readable.",
  },
] as const;

const AI_MAY = [
  "Interpret a natural-language agreement",
  "Propose structured, reviewable conditions",
  "Summarise evidence against those conditions",
  "Surface concerns for a human reviewer",
] as const;

const AI_MAY_NOT = [
  "Authorize, capture, release or refund a payment",
  "Modify payment or deal state",
  "Bypass authentication or deal access",
  "Override the rules engine",
  "Invent provider success or audit records",
] as const;

const BUYER_POINTS = [
  "See which evidence is waiting for review",
  "Accept, reject with feedback, or request a revision",
  "Approve a capture only after a recorded decision",
  "Read the full activity trail behind every outcome",
] as const;

const SELLER_POINTS = [
  "Know which milestones are active and what is missing",
  "Submit evidence with a note, link and file",
  "See buyer feedback and resubmit against the same criteria",
  "Track payment progress without guessing",
] as const;

export default function Home() {
  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="page-frame grid items-center gap-12 pb-16 pt-14 md:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] md:pb-24 md:pt-20">
        <div>
          <p className="eyebrow reveal">Proof-backed payment workflow</p>
          <h1 className="display reveal reveal-1 mt-6 max-w-[16ch] text-[clamp(2.75rem,7vw,5.25rem)] text-[var(--foreground)]">
            Work moves forward.
            <span className="mt-1 block text-[var(--accent)]">
              Payments move with proof.
            </span>
          </h1>
          <p className="lede reveal reveal-2 mt-7 max-w-[46ch]">
            Coordinate milestones, review evidence and manage payment progress
            with clarity at every step.
          </p>
          <div className="reveal reveal-3 mt-9 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="primary-button px-5">
              Open the dashboard
            </Link>
            <Link href="/deals/new" className="secondary-button px-5">
              Start a deal
            </Link>
          </div>
          <ul className="reveal reveal-4 mt-9 flex flex-wrap gap-2" aria-label="Product boundaries">
            <li className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden="true" />
              Human approval required
            </li>
            <li className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" aria-hidden="true" />
              Demo payments are simulated
            </li>
            <li className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              AI is advisory only
            </li>
          </ul>
        </div>

        {/* Product preview: a real milestone sequence, no invented metrics */}
        <div className="reveal reveal-2 relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 rounded-[36px] bg-[radial-gradient(420px_260px_at_70%_10%,var(--accent-soft),transparent_70%)]"
          />
          <div className="deal-hero p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-label">Deal workspace</p>
                <p className="mt-1.5 text-lg font-semibold tracking-[-0.025em]">
                  Website redesign
                </p>
                <p className="mt-1 text-xs text-muted">Buyer → Seller · USD</p>
              </div>
              <span className="rounded-full border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--success)]">
                On track
              </span>
            </div>

            <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent)]" />
            </div>
            <p className="mt-2 flex justify-between font-mono text-[11px] text-muted">
              <span>Milestone 1 of 2</span>
              <span>50%</span>
            </p>

            <ol className="mt-6 space-y-3">
              {[
                { title: "Discovery and scope", state: "Accepted", tone: "success" as const },
                { title: "Responsive build", state: "Evidence in review", tone: "warning" as const },
                { title: "Handoff and sign-off", state: "Not started", tone: "neutral" as const },
              ].map((item, index) => (
                <li
                  key={item.title}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-black/20 px-3.5 py-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                        index === 0
                          ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                          : "border-[var(--border-strong)] text-muted"
                      }`}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-sm text-[var(--foreground-soft)]">
                      {item.title}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[11px] ${
                      item.tone === "success"
                        ? "text-[var(--success)]"
                        : item.tone === "warning"
                          ? "text-[var(--warning)]"
                          : "text-muted"
                    }`}
                  >
                    {item.state}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-xl border border-[var(--hairline)] bg-black/25 p-4">
              <p className="section-label">Deterministic recommendation</p>
              <p className="mt-2 font-mono text-sm text-[var(--foreground-soft)]">
                HOLD → human review required
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Evidence exists, but the latest submission has not been accepted.
                No payment action is available yet.
              </p>
            </div>
          </div>
          <p className="mt-3 px-1 text-right text-[11px] text-muted">
            Illustrative workspace · not live data
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[var(--hairline)]">
        <div className="page-frame py-16 md:py-20">
          <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <p className="section-label">One readable path</p>
              <h2 className="headline mt-3 text-[clamp(1.9rem,3.4vw,2.75rem)]">
                From agreement to outcome, nothing hides in a chat thread.
              </h2>
            </div>
            <p className="lede max-w-[54ch] md:justify-self-end">
              Each step produces a durable record. Evidence is attached to a
              milestone, decisions carry a reason, and payment state is shown as
              it actually is.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FLOW.map((step, index) => (
              <li
                key={step.title}
                className="panel panel-hover group p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--accent)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px w-10 bg-[linear-gradient(90deg,var(--border-strong),transparent)]"
                  />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-[-0.015em]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
            <li className="panel p-5 sm:col-span-2 lg:col-span-1">
              <p className="section-label">Illustrative pricing</p>
              <p className="mt-3 font-mono text-2xl tabular-nums">$0.00</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                This workspace is a demonstration. No funds are moved by demo
                actions, and no revenue or savings figures are claimed.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* Two sides, distinct views */}
      <section className="border-t border-[var(--hairline)]">
        <div className="page-frame py-16 md:py-20">
          <p className="section-label">Two sides, one record</p>
          <h2 className="headline mt-3 max-w-[22ch] text-[clamp(1.9rem,3.4vw,2.75rem)]">
            The buyer and the seller see the work that belongs to them.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="panel p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-[-0.02em]">Buyer</h3>
                <span className="chip">Review and approve</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                A review queue, not a wall of notifications. Approval controls are
                available only to the buyer and authorised reviewers.
              </p>
              <ul className="mt-5 space-y-3">
                {BUYER_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-[var(--foreground-soft)]">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
            <article className="panel p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-[-0.02em]">Seller</h3>
                <span className="chip">Deliver and submit</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                Assigned milestones, rejected evidence and the next action, with
                no payment controls exposed to the seller.
              </p>
              <ul className="mt-5 space-y-3">
                {SELLER_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-[var(--foreground-soft)]">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* Separation of responsibilities */}
      <section className="border-t border-[var(--hairline)]">
        <div className="page-frame py-16 md:py-20">
          <div className="grid gap-8 md:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="section-label">Separation of responsibilities</p>
              <h2 className="headline mt-3 text-[clamp(1.9rem,3.4vw,2.75rem)]">
                AI may read. People decide. Rules explain.
              </h2>
              <p className="lede mt-4 max-w-[46ch]">
                Advisory output is labelled by source and never changes deal or
                payment state. A reviewer can always act without it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">AI may</h3>
                <ul className="mt-4 space-y-2.5">
                  {AI_MAY.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-6 text-muted">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--success)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="panel p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">AI may never</h3>
                <ul className="mt-4 space-y-2.5">
                  {AI_MAY_NOT.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-6 text-muted">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="panel mt-6 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-label">Deterministic rules decide</span>
              <span className="code-chip">WAITING</span>
              <span className="code-chip">RELEASE</span>
              <span className="code-chip">REFUND</span>
              <span className="code-chip">DISPUTE</span>
            </div>
            <p className="mt-4 max-w-[80ch] text-sm leading-6 text-muted">
              The rules engine evaluates agreed conditions against verified
              payment state and records the reasons behind every decision. It is
              not a model, and it does not infer success from a screenshot.
            </p>
          </div>
        </div>
      </section>

      {/* Payment honesty */}
      <section className="border-t border-[var(--hairline)]">
        <div className="page-frame py-16 md:py-20">
          <div className="deal-hero grid gap-8 p-7 sm:p-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <p className="section-label">Payment integrity</p>
              <h2 className="headline mt-3 text-[clamp(1.8rem,3.2vw,2.5rem)]">
                A hold is a hold. It is never described as escrow.
              </h2>
              <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted">
                FairHold uses PayPal as payment infrastructure where configured.
                Where a hold is shown, it reflects the capability actually being
                used. Simulated demo actions make no provider request.
              </p>
            </div>
            <div className="space-y-3">
              {[
                ["Authorization", "A provider hold, awaiting a later decision."],
                ["Capture", "Only after a human approval and a recorded rule outcome."],
                ["Void / refund", "A definite provider result — never inferred."],
                ["Ambiguity", "Timeouts stay pending until reconciled, not reported as success."],
              ].map(([label, body]) => (
                <div key={label} className="rounded-xl border border-[var(--hairline)] bg-black/25 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--accent)]">
                    {label}
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--foreground-soft)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="page-frame pb-8">
        <div className="panel flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-9">
          <div>
            <h2 className="headline text-2xl sm:text-3xl">
              Read the record before you move the money.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Demo workspace · signed demo sessions · simulated payments by default.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="primary-button px-5">
              Open dashboard
            </Link>
            <Link href="/login" className="secondary-button px-5">
              Demo sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
