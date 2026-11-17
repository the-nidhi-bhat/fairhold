import Link from "next/link";
import { CinematicHero } from "@/components/landing/cinematic-hero";
import { Reveal } from "@/components/landing/reveal";
import { DESKTOP_SEQUENCE, MOBILE_SEQUENCE } from "@/components/landing/frame-sequences";

export const metadata = {
  title: "Trust isn't a promise. It's a process.",
  description:
    "FairHold turns informal buyer-seller work into a structured agreement: written scope, milestones, evidence, review and payment progress that only moves per the agreed process.",
};

const PROBLEM_ROWS = [
  {
    label: "Scope",
    quote: "\u201CYou'll know it when you see it.\u201D",
    body: "Informal agreements leave deliverables undefined. Without written scope, both sides discover the real expectations after the work has already started — and every disagreement becomes a matter of memory.",
  },
  {
    label: "Evidence",
    quote: "Screenshots buried in a chat thread.",
    body: "Progress lives in scattered messages and attachments. There is no single place that shows what was delivered, what was accepted, and what is still missing.",
  },
  {
    label: "Payment",
    quote: "\u201CTransfer now, we'll sort it out later.\u201D",
    body: "When payment is driven by reminders and goodwill, delays turn into disputes. Nobody can point to an agreed process, so every step forward needs another negotiation.",
  },
] as const;

const SOLUTION_POINTS = [
  {
    title: "A written agreement",
    body: "Parties, deliverables and payment terms are captured in one readable record both sides approved.",
  },
  {
    title: "Clear responsibilities",
    body: "Each milestone states what “done” means with explicit, human-readable acceptance criteria.",
  },
  {
    title: "Evidence, not claims",
    body: "Sellers submit notes, links and files against each milestone. Progress is shown as it actually is.",
  },
  {
    title: "Controlled progression",
    body: "Payment moves only through the agreed process — reviewed milestones, recorded decisions, no shortcuts.",
  },
] as const;

const STEPS = [
  {
    title: "Create an agreement",
    body: "Record the parties, deliverables and payment terms in writing. The agreement becomes the single source both sides work from.",
  },
  {
    title: "Both parties review and approve",
    body: "Nothing starts on a handshake. Each side reviews the same document and approves it explicitly before work begins.",
  },
  {
    title: "Complete the agreed milestones",
    body: "Work is broken into milestones with acceptance criteria. Sellers deliver against the criteria, not against a moving target.",
  },
  {
    title: "Verify completion",
    body: "Evidence is attached to each milestone. The buyer — or an authorised reviewer — accepts, rejects with feedback, or requests a revision.",
  },
  {
    title: "Release funds according to the agreed process",
    body: "Payment progresses only when the agreed conditions are met and a decision is recorded. Every outcome keeps its reason on the record.",
  },
] as const;

const CLARITY_ITEMS = [
  {
    title: "Milestones",
    body: "Work is structured into explicit stages with acceptance criteria agreed before anything starts.",
  },
  {
    title: "Approvals",
    body: "Buyers approve what they can see. Sellers always know what is waiting and what changed.",
  },
  {
    title: "Verification",
    body: "Evidence is read against the criteria it was written for — accept, reject with feedback, or request a revision.",
  },
  {
    title: "Controlled releases",
    body: "Funds move according to the agreed process, with the decision and its reason recorded every time.",
  },
  {
    title: "Agreement visibility",
    body: "One readable record of scope, milestones, evidence and payment state — for everyone the agreement belongs to.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="fl-page">
      {/* Chapter 01 — Hero: scroll-controlled canvas sequence */}
      <CinematicHero
        desktop={DESKTOP_SEQUENCE}
        mobile={MOBILE_SEQUENCE}
        label="FairHold — a scroll-controlled cinematic introduction"
      >
        <p className="eyebrow">FairHold · Proof-backed payment workflow</p>
        <h1 className="fl-title">
          Trust isn&apos;t a promise.
          <span className="fl-title-accent">It&apos;s a process.</span>
        </h1>
        <p className="fl-lede">
          FairHold turns informal buyer–seller work into a structured agreement — written scope, clear
          milestones, submitted evidence and payment progress that only moves per the agreed process.
          Every step is recorded; nothing hides in a chat thread.
        </p>
        <div className="fl-cta-row">
          <Link href="/deals/new" className="primary-button fl-cta">
            Create an Agreement
          </Link>
          <Link href="#how-it-works" className="secondary-button fl-cta">
            Explore How It Works
          </Link>
        </div>
        <ul className="fl-chips" aria-label="Product boundaries">
          <li>Human approval required</li>
          <li>Demo payments are simulated</li>
          <li>AI is advisory only</li>
        </ul>
      </CinematicHero>

      {/* Chapter 02 — The problem */}
      <section className="fl-chapter" id="the-problem">
        <div className="page-frame">
          <Reveal>
            <p className="eyebrow">Chapter 02 · The problem</p>
            <h2 className="fl-h2">
              Deals shouldn&apos;t depend on <span className="fl-title-accent">blind trust.</span>
            </h2>
            <p className="fl-chapter-copy">
              Most buyer–seller work still runs on goodwill: a conversation, a promise and a payment
              that has to be chased. The structure that protects both sides is missing exactly where it
              matters most.
            </p>
          </Reveal>
          <div className="fl-rows">
            {PROBLEM_ROWS.map((row) => (
              <Reveal key={row.label} className="fl-row">
                <p className="fl-row-label">{row.label}</p>
                <div>
                  <p className="fl-row-quote">{row.quote}</p>
                  <p className="fl-row-body">{row.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Chapter 03 — The solution */}
      <section className="fl-chapter" id="the-solution">
        <div className="page-frame">
          <Reveal>
            <p className="eyebrow">Chapter 03 · The solution</p>
            <h2 className="fl-h2">
              Introducing <span className="fl-title-accent">structured trust.</span>
            </h2>
            <p className="fl-chapter-copy">
              FairHold replaces goodwill with structure. The agreement, the responsibilities and the
              payment process are written down once — then the work progresses against them, step by
              step, with a record both sides can read at any moment.
            </p>
          </Reveal>
          <div className="fl-rows">
            {SOLUTION_POINTS.map((point) => (
              <Reveal key={point.title} className="fl-row">
                <p className="fl-row-label">{point.title}</p>
                <div>
                  <p className="fl-row-body">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Chapter 04 — How it works */}
      <section className="fl-chapter" id="how-it-works">
        <div className="page-frame">
          <Reveal>
            <p className="eyebrow">Chapter 04 · How it works</p>
            <h2 className="fl-h2">
              One process, <span className="fl-title-accent">five steps.</span>
            </h2>
            <p className="fl-chapter-copy">
              The workflow is the same for every deal — which is exactly what makes it trustworthy.
            </p>
          </Reveal>
          <ol className="fl-steps">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} as="li" className="fl-step">
                <span className="fl-step-no" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Chapter 05 — Built around clarity */}
      <section className="fl-chapter" id="clarity">
        <div className="page-frame">
          <Reveal>
            <p className="eyebrow">Chapter 05 · Built around clarity</p>
            <h2 className="fl-h2">
              Nothing to interpret. <span className="fl-title-accent">Everything to read.</span>
            </h2>
          </Reveal>
          <ul className="fl-index">
            {CLARITY_ITEMS.map((item, index) => (
              <Reveal key={item.title} as="li" className="fl-index-item">
                <span className="fl-index-no" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Reveal>
            ))}
          </ul>
          <Reveal>
            <p className="fl-note">
              Where a payment authorization is shown, it reflects the capability actually being used: a
              provider hold — it is never described as escrow. Demo payments are simulated and make no
              provider request.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Chapter 06 — Final CTA */}
      <section className="fl-final" id="get-started">
        <div className="page-frame">
          <Reveal>
            <p className="eyebrow fl-eyebrow-center">Chapter 06 · Begin</p>
            <h2 className="fl-title fl-final-title">
              Make agreements.
              <span className="fl-title-accent">Not assumptions.</span>
            </h2>
            <p className="fl-lede fl-final-lede">
              Set the terms once, record the evidence, and let payment follow the process you both
              agreed to.
            </p>
          </Reveal>
          <Reveal>
            <div className="fl-cta-row fl-cta-center">
              <Link href="/deals/new" className="primary-button fl-cta">
                Create an Agreement
              </Link>
              <Link href="/demo" className="secondary-button fl-cta">
                Open the guided demo
              </Link>
            </div>
          </Reveal>
          <Reveal>
            <p className="fl-boundaries">
              FairHold is a demonstration product. Demo payments are simulated. An authorization is a
              provider hold — it is never described as escrow. AI output is advisory only: it may
              interpret agreements, propose conditions and summarise evidence, but it never authorizes,
              captures, releases or refunds a payment. People decide; deterministic rules explain why.
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
