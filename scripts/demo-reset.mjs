#!/usr/bin/env node
/**
 * Reset the development JSON store to a curated, repeatable demo fixture.
 *
 * Safe by design:
 *   - refuses to run when a real DATABASE_URL is configured (the JSON store is
 *     not the source of truth in that case);
 *   - only writes `.data/fairhold.json` inside this repository;
 *   - never touches payment provider state. Every provider reference below is a
 *     `demo-` fixture string: the demo provider is selected, so no PayPal
 *     request is ever made from this data.
 *
 * The fixture holds three deals in different lifecycle states so a judge can
 * see a deal before authorization, a deal with money partly captured and
 * partly awaiting settlement, and a deal where the whole hold was captured.
 *
 * Usage: npm run demo:reset
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The fingerprint stored on an approval must match the one the rules engine
// recomputes from the evidence, otherwise the UI marks the approval stale.
// Reuse the real function instead of duplicating its format here.
import { evidenceFingerprint } from "../lib/domain/rules.ts";

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "fairhold.json");

function realDatabaseUrl(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "" || /^your_/i.test(trimmed)) return null;
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

if (realDatabaseUrl(process.env.DATABASE_URL)) {
  console.error(
    "Refusing to reset: DATABASE_URL is configured, so PostgreSQL is the data source.\n" +
      "Reset demo data in the database instead; this script only manages the JSON store.",
  );
  process.exit(1);
}

const now = new Date();
const iso = (offsetDays = 0) =>
  new Date(now.getTime() + offsetDays * 86_400_000).toISOString();
const day = (offsetDays = 0) =>
  new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const BUYER = "Alex Buyer";
const SELLER = "Jamie Seller";
const REVIEWER_ACTOR = `buyer:${BUYER}`;
const PROVIDER = "demo-payment-provider";

/** An approval whose fingerprint matches the evidence it reviewed. */
function approval({ evidence, action, paymentStatus, providerReference, reviewedAt, explanation }) {
  return {
    id: `approval-${evidence.id}`,
    decision: "approve",
    action,
    reasonCodes: ["EVIDENCE_ACCEPTED", "DEADLINE_MET"],
    explanation,
    evidenceFingerprint: evidenceFingerprint([evidence]),
    evidenceReviewedCount: 1,
    reviewedBy: REVIEWER_ACTOR,
    reviewedAt,
    providerReference,
    providerName: PROVIDER,
    simulated: true,
    paymentStatus,
    note: null,
  };
}

function acceptedEvidence({ id, milestoneId, note, url, submittedAt, reviewedAt }) {
  return {
    id,
    milestoneId,
    note,
    url,
    file: null,
    submittedAt,
    submittedBy: `seller:${SELLER}`,
    decision: "accepted",
    reviewedAt,
    reviewNote: "Acceptance criteria verified against the submitted link.",
  };
}

// ---------------------------------------------------------------------------
// Deal A — agreed but not yet authorized (the guided first run)
// ---------------------------------------------------------------------------

const DEAL_A = "8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10";
const DESIGN_MILESTONE = "a1d4c7e2-3f58-4b90-8e21-7c6a5b4d3e01";
const BUILD_MILESTONE = "b2e5d8f3-4a69-4c01-9f32-8d7b6c5e4f12";
const EVIDENCE_ID = "c3f6e9a4-5b70-4d12-a043-9e8c7d6f5a23";

// ---------------------------------------------------------------------------
// Deal B — authorized hold, one capture settled, one still pending, one open
// ---------------------------------------------------------------------------

const DEAL_B = "1b7d3c94-2a5e-4f60-8c31-9e4f2a6d7b58";
const B_DISCOVERY = "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69";
const B_REVIEW = "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70";
const B_BUILD = "4ea06127-5d81-4c93-bf64-c1725d90ae81";
const B_DISCOVERY_EVIDENCE = "5fb17238-6e92-4da4-c075-d2836ea1bf92";
const B_REVIEW_EVIDENCE = "6ac28349-7fa3-4eb5-d186-e3947fb2ca03";
const B_HOLD = "demo-auth-fixture-b-7d3c94";

const bDiscoveryEvidence = acceptedEvidence({
  id: B_DISCOVERY_EVIDENCE,
  milestoneId: B_DISCOVERY,
  note: "Discovery summary, sitemap and content inventory are published in the shared folder.",
  url: "https://example.com/fairhold-demo/discovery",
  submittedAt: iso(-5),
  reviewedAt: iso(-4),
});
const bReviewEvidence = acceptedEvidence({
  id: B_REVIEW_EVIDENCE,
  milestoneId: B_REVIEW,
  note: "Interaction prototype covers the checkout flow; the review recording is linked.",
  url: "https://example.com/fairhold-demo/interaction-review",
  submittedAt: iso(-2),
  reviewedAt: iso(-1),
});

// ---------------------------------------------------------------------------
// Deal C — every milestone accepted and captured; the whole hold is settled
// ---------------------------------------------------------------------------

const DEAL_C = "7bd3945a-8ab4-4fc6-e297-f4a580c3db14";
const C_RESEARCH = "8ce4a56b-9bc5-40d7-f3a8-05b691d4ec25";
const C_DELIVERY = "9df5b67c-acd6-41e8-04b9-16c7a2e5fd36";
const C_RESEARCH_EVIDENCE = "ae06c78d-bde7-42f9-15ca-27d8b3f60e47";
const C_DELIVERY_EVIDENCE = "bf17d89e-cef8-4301-26db-38e9c4071f58";
const C_HOLD = "demo-auth-fixture-c-a56b9bc";

const cResearchEvidence = acceptedEvidence({
  id: C_RESEARCH_EVIDENCE,
  milestoneId: C_RESEARCH,
  note: "Research report and interview notes are published; the summary was read in the review call.",
  url: "https://example.com/fairhold-demo/research-report",
  submittedAt: iso(-14),
  reviewedAt: iso(-13),
});
const cDeliveryEvidence = acceptedEvidence({
  id: C_DELIVERY_EVIDENCE,
  milestoneId: C_DELIVERY,
  note: "Final delivery includes the source files, the usage guide and a checklist of known limitations.",
  url: "https://example.com/fairhold-demo/final-delivery",
  submittedAt: iso(-8),
  reviewedAt: iso(-7),
});

const database = {
  version: 1,
  deals: [
    // ---------------------------------------------------------------------
    // A: Ready for Authorization
    // ---------------------------------------------------------------------
    {
      id: DEAL_A,
      title: "Website redesign — milestone agreement",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "Ready for Authorization",
      agreement:
        "Jamie Seller will redesign the marketing site in two milestones: a design system and component library, then a responsive build and handoff. Each milestone is paid only after Alex Buyer accepts the submitted evidence and approves the recommendation. Payment is an authorization hold, not escrow, and no money moves in this demo.",
      authorization: null,
      pendingAuthorization: null,
      milestones: [
        {
          id: DESIGN_MILESTONE,
          title: "Design system and component library",
          description:
            "Deliver the colour, type and spacing tokens plus the core component library used by the marketing site.",
          amountCents: 120000,
          dueDate: day(7),
          acceptanceCriteria:
            "A published component library covering buttons, forms, cards and navigation, with tokens documented and a review link that opens without an account.",
          status: "In Progress",
          approval: null,
          createdAt: iso(-6),
          updatedAt: iso(-1),
        },
        {
          id: BUILD_MILESTONE,
          title: "Responsive build and handoff",
          description:
            "Implement the approved design across mobile, tablet and desktop, then hand over the source files.",
          amountCents: 80000,
          dueDate: day(21),
          acceptanceCriteria:
            "Responsive layouts verified at 375px, 768px and 1440px, no horizontal scrolling, and a handoff note listing source files and remaining known issues.",
          status: "Draft",
          approval: null,
          createdAt: iso(-6),
          updatedAt: iso(-6),
        },
      ],
      evidence: [
        {
          id: EVIDENCE_ID,
          milestoneId: DESIGN_MILESTONE,
          note: "First pass of the design system is published. Tokens are documented; the component library covers buttons, forms, cards and navigation.",
          url: "https://example.com/fairhold-demo/design-system",
          file: null,
          submittedAt: iso(-1),
          submittedBy: `seller:${SELLER}`,
          decision: "pending",
          reviewedAt: null,
          reviewNote: null,
        },
      ],
      events: [
        {
          id: "d4a7f0b5-6c81-4e23-b154-af9d8e7a6b34",
          type: "deal.created",
          message: `Deal created by buyer:${BUYER}.`,
          actor: `buyer:${BUYER}`,
          createdAt: iso(-6),
        },
        {
          id: "e5b8a1c6-7d92-4f34-c265-b0ae9f8b7c45",
          type: "milestone.created",
          message: "Milestone added: Design system and component library.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-6),
          milestoneId: DESIGN_MILESTONE,
        },
        {
          id: "f6c9b2d7-8ea3-4045-d376-c1bfa09c8d56",
          type: "milestone.created",
          message: "Milestone added: Responsive build and handoff.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-6),
          milestoneId: BUILD_MILESTONE,
        },
        {
          id: "07dac3e8-9fb4-4156-e487-d2cab1ad9e67",
          type: "evidence.submitted",
          message: "Evidence submitted for Design system and component library.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-1),
          milestoneId: DESIGN_MILESTONE,
        },
      ],
      createdAt: iso(-6),
      updatedAt: iso(-1),
    },

    // ---------------------------------------------------------------------
    // B: In Progress — $600.00 captured, $400.00 awaiting provider settlement
    // ---------------------------------------------------------------------
    {
      id: DEAL_B,
      title: "Brand launch site — discovery, review and build",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "In Progress",
      agreement:
        "Three milestones: discovery and content inventory, an interaction prototype review, then the production build. The buyer authorized a $1,500.00 hold. The first capture settled, the second is waiting on the provider, and the build milestone is still open.",
      authorization: {
        providerName: PROVIDER,
        providerReference: B_HOLD,
        providerOrderId: `${B_HOLD}-order`,
        simulated: true,
        amountCents: 150000,
        expiresAt: iso(24),
        createdAt: iso(-10),
      },
      pendingAuthorization: null,
      milestones: [
        {
          id: B_DISCOVERY,
          title: "Discovery and content inventory",
          description:
            "Audit the existing pages, inventory the content and agree the sitemap for the new site.",
          amountCents: 60000,
          dueDate: day(-6),
          acceptanceCriteria:
            "Sitemap, content inventory and a discovery summary published in the shared folder.",
          status: "Completed",
          approval: approval({
            evidence: bDiscoveryEvidence,
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-b-discovery",
            reviewedAt: iso(-4),
            explanation:
              "Evidence was accepted and the deadline was met. Captured $600.00 of the $1,500.00 hold.",
          }),
          createdAt: iso(-10),
          updatedAt: iso(-4),
        },
        {
          id: B_REVIEW,
          title: "Interaction prototype review",
          description:
            "Prototype the checkout flow and record a walkthrough for the buyer review.",
          amountCents: 40000,
          dueDate: day(-1),
          acceptanceCriteria:
            "A clickable prototype covering checkout, with a recorded walkthrough.",
          status: "Awaiting Review",
          approval: approval({
            evidence: bReviewEvidence,
            action: "CAPTURE",
            paymentStatus: "PENDING",
            providerReference: "demo-capture-fixture-b-review",
            reviewedAt: iso(-1),
            explanation:
              "Evidence was accepted and the deadline was met. The provider has not settled this $400.00 capture yet.",
          }),
          createdAt: iso(-10),
          updatedAt: iso(-1),
        },
        {
          id: B_BUILD,
          title: "Production build and launch",
          description:
            "Build the approved pages, connect the content and hand over the deployment runbook.",
          amountCents: 50000,
          dueDate: day(14),
          acceptanceCriteria:
            "Live site matches the prototype at 375px, 768px and 1440px, with a deployment runbook.",
          status: "In Progress",
          approval: null,
          createdAt: iso(-10),
          updatedAt: iso(-1),
        },
      ],
      evidence: [bDiscoveryEvidence, bReviewEvidence],
      events: [
        {
          id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
          type: "deal.created",
          message: `Deal created by buyer:${BUYER}.`,
          actor: `buyer:${BUYER}`,
          createdAt: iso(-10),
        },
        {
          id: "d2e3f4a5-b6c7-4d8e-9f01-b2c3d4e5f607",
          type: "deal.authorization_simulated",
          message:
            "Simulated authorization hold of $1,500.00 via demo-payment-provider (no PayPal request was made).",
          actor: `buyer:${BUYER}`,
          createdAt: iso(-10),
        },
        {
          id: "e3f4a5b6-c7d8-4e9f-a012-c3d4e5f60718",
          type: "evidence.submitted",
          message: "Evidence submitted for Discovery and content inventory.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-5),
          milestoneId: B_DISCOVERY,
        },
        {
          id: "f4a5b6c7-d8e9-4f01-b123-d4e5f6071829",
          type: "milestone.approval_recorded",
          message:
            "Reviewer decision for 'Discovery and content inventory': approve → CAPTURE (SIMULATED — no PayPal request).",
          actor: REVIEWER_ACTOR,
          createdAt: iso(-4),
          milestoneId: B_DISCOVERY,
        },
        {
          id: "05b6c7d8-e9f0-4102-c234-e5f60718293a",
          type: "evidence.submitted",
          message: "Evidence submitted for Interaction prototype review.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-2),
          milestoneId: B_REVIEW,
        },
        {
          id: "16c7d8e9-f001-4213-d345-f60718293a4b",
          type: "milestone.approval_recorded",
          message:
            "Reviewer decision for 'Interaction prototype review': approve → CAPTURE (SIMULATED — no PayPal request).",
          actor: REVIEWER_ACTOR,
          createdAt: iso(-1),
          milestoneId: B_REVIEW,
        },
      ],
      createdAt: iso(-10),
      updatedAt: iso(-1),
    },

    // ---------------------------------------------------------------------
    // C: Completed — every milestone accepted and fully captured
    // ---------------------------------------------------------------------
    {
      id: DEAL_C,
      title: "Podcast launch — research and delivery",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "Completed",
      agreement:
        "Two milestones: audience research, then the recorded delivery package. The buyer authorized a $900.00 hold; both milestones were accepted and captured, so the hold is fully settled.",
      authorization: {
        providerName: PROVIDER,
        providerReference: C_HOLD,
        providerOrderId: `${C_HOLD}-order`,
        simulated: true,
        amountCents: 90000,
        expiresAt: iso(19),
        createdAt: iso(-20),
      },
      pendingAuthorization: null,
      milestones: [
        {
          id: C_RESEARCH,
          title: "Audience research and positioning",
          description:
            "Interview five listeners, summarise the findings and recommend a positioning statement.",
          amountCents: 50000,
          dueDate: day(-14),
          acceptanceCriteria:
            "A written research report covering five interviews and a positioning recommendation.",
          status: "Completed",
          approval: approval({
            evidence: cResearchEvidence,
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-c-research",
            reviewedAt: iso(-13),
            explanation:
              "Evidence was accepted and the deadline was met. Captured $500.00 of the $900.00 hold.",
          }),
          createdAt: iso(-20),
          updatedAt: iso(-13),
        },
        {
          id: C_DELIVERY,
          title: "Recorded delivery package",
          description:
            "Deliver the intro, three episodes and the cover artwork, plus the usage guide.",
          amountCents: 40000,
          dueDate: day(-8),
          acceptanceCriteria:
            "Intro, three episodes and cover artwork delivered, with a usage guide and a list of known limitations.",
          status: "Completed",
          approval: approval({
            evidence: cDeliveryEvidence,
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-c-delivery",
            reviewedAt: iso(-7),
            explanation:
              "Evidence was accepted and the deadline was met. This $400.00 capture settled the remaining hold.",
          }),
          createdAt: iso(-20),
          updatedAt: iso(-7),
        },
      ],
      evidence: [cResearchEvidence, cDeliveryEvidence],
      events: [
        {
          id: "27d8e9f0-0112-4324-e456-0718293a4b5c",
          type: "deal.created",
          message: `Deal created by buyer:${BUYER}.`,
          actor: `buyer:${BUYER}`,
          createdAt: iso(-20),
        },
        {
          id: "38e9f001-1223-4435-f567-18293a4b5c6d",
          type: "deal.authorization_simulated",
          message:
            "Simulated authorization hold of $900.00 via demo-payment-provider (no PayPal request was made).",
          actor: `buyer:${BUYER}`,
          createdAt: iso(-20),
        },
        {
          id: "49f00112-2334-4546-0678-293a4b5c6d7e",
          type: "milestone.approval_recorded",
          message:
            "Reviewer decision for 'Audience research and positioning': approve → CAPTURE (SIMULATED — no PayPal request).",
          actor: REVIEWER_ACTOR,
          createdAt: iso(-13),
          milestoneId: C_RESEARCH,
        },
        {
          id: "5a011223-3445-4657-1789-3a4b5c6d7e8f",
          type: "milestone.approval_recorded",
          message:
            "Reviewer decision for 'Recorded delivery package': approve → CAPTURE (SIMULATED — no PayPal request).",
          actor: REVIEWER_ACTOR,
          createdAt: iso(-7),
          milestoneId: C_DELIVERY,
        },
        {
          id: "6b122334-4556-4768-2890-4b5c6d7e8f90",
          type: "deal.status_changed",
          message: "Deal moved from 'In Progress' to 'Completed'.",
          actor: `seller:${SELLER}`,
          createdAt: iso(-7),
        },
      ],
      createdAt: iso(-20),
      updatedAt: iso(-7),
    },
  ],

  // The durable capture ledger: one row per provider operation attempted.
  paymentOperations: [
    {
      id: "7c233445-5667-4879-3901-5c6d7e8f9012",
      dealId: DEAL_B,
      milestoneId: B_DISCOVERY,
      authorizationReference: B_HOLD,
      action: "CAPTURE",
      requestedAmountCents: 60000,
      currency: "USD",
      idempotencyKey: `capture:${DEAL_B}:${B_DISCOVERY}`,
      providerName: PROVIDER,
      providerReference: "demo-capture-fixture-b-discovery",
      status: "COMPLETED",
      finalCapture: false,
      createdAt: iso(-4),
      updatedAt: iso(-4),
    },
    {
      id: "8d344556-6778-4980-4a12-6d7e8f9012a3",
      dealId: DEAL_B,
      milestoneId: B_REVIEW,
      authorizationReference: B_HOLD,
      action: "CAPTURE",
      requestedAmountCents: 40000,
      currency: "USD",
      idempotencyKey: `capture:${DEAL_B}:${B_REVIEW}`,
      providerName: PROVIDER,
      providerReference: "demo-capture-fixture-b-review",
      status: "PENDING",
      finalCapture: false,
      createdAt: iso(-1),
      updatedAt: iso(-1),
    },
    {
      id: "9e455667-7889-4091-5b23-7e8f9012a3b4",
      dealId: DEAL_C,
      milestoneId: C_RESEARCH,
      authorizationReference: C_HOLD,
      action: "CAPTURE",
      requestedAmountCents: 50000,
      currency: "USD",
      idempotencyKey: `capture:${DEAL_C}:${C_RESEARCH}`,
      providerName: PROVIDER,
      providerReference: "demo-capture-fixture-c-research",
      status: "COMPLETED",
      finalCapture: false,
      createdAt: iso(-13),
      updatedAt: iso(-13),
    },
    {
      id: "af566778-8990-4102-6c34-8f9012a3b4c5",
      dealId: DEAL_C,
      milestoneId: C_DELIVERY,
      authorizationReference: C_HOLD,
      action: "CAPTURE",
      requestedAmountCents: 40000,
      currency: "USD",
      idempotencyKey: `capture:${DEAL_C}:${C_DELIVERY}`,
      providerName: PROVIDER,
      providerReference: "demo-capture-fixture-c-delivery",
      status: "COMPLETED",
      finalCapture: true,
      createdAt: iso(-7),
      updatedAt: iso(-7),
    },
  ],
};

await mkdir(DATA_DIR, { recursive: true });
await writeFile(DATA_FILE, `${JSON.stringify(database, null, 2)}\n`, "utf8");

console.log("Demo store reset.");
console.log(`  file: ${DATA_FILE}`);
console.log("  deals:");
console.log(`    ${DEAL_A} — Website redesign (Ready for Authorization)`);
console.log(`    ${DEAL_B} — Brand launch site (In Progress, $600.00 captured, $400.00 pending)`);
console.log(`    ${DEAL_C} — Podcast launch (Completed, $900.00 fully captured)`);
console.log("");
console.log("Demo identities (must be allowlisted on the server):");
console.log(`  buyer:  ${BUYER}`);
console.log(`  seller: ${SELLER}`);
console.log("");
console.log("Suggested run-through:");
console.log("  1. Sign in as Alex Buyer, open the website redesign deal, simulate the authorization hold.");
console.log("  2. Sign in as Jamie Seller, submit evidence for the second milestone.");
console.log("  3. Sign back in as Alex Buyer, accept the evidence and approve the recommendation.");
console.log("  4. Check the payment history, the money summary and the dashboard counters.");
