/**
 * Guided demo fixture and identities.
 *
 * The public demo has to work on a serverless host where the filesystem is
 * read-only, so it does not touch the JSON store, PostgreSQL or any payment
 * provider. Everything below is plain data that the browser reducer mutates in
 * memory and mirrors to localStorage.
 *
 * The fixture deliberately matches `scripts/demo-reset.mjs` so the guided demo
 * and the server-rendered demo start from the same story.
 */
import type { Deal } from "../domain/types.ts";

export const DEMO_ROLES = ["buyer", "seller", "reviewer"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export interface DemoIdentity {
  /** Human name shown in the switcher. */
  name: string;
  /** Audit actor string, e.g. "buyer:Alex Buyer". */
  actor: string;
  /** One-line description of what the role may do. */
  responsibility: string;
}

export const DEMO_IDENTITIES: Record<DemoRole, DemoIdentity> = {
  buyer: {
    name: "Alex Buyer",
    actor: "buyer:Alex Buyer",
    responsibility: "Holds the funds, reviews proof, approves or requests changes.",
  },
  seller: {
    name: "Jamie Seller",
    actor: "seller:Jamie Seller",
    responsibility: "Delivers the work and submits evidence for each milestone.",
  },
  reviewer: {
    name: "Morgan Reviewer",
    actor: "reviewer:Morgan Reviewer",
    responsibility: "Reads the advisory notes. Never approves or moves money.",
  },
};

export const DEMO_DEAL_ID = "8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10";
export const DEMO_DESIGN_MILESTONE_ID = "a1d4c7e2-3f58-4b90-8e21-7c6a5b4d3e01";
export const DEMO_BUILD_MILESTONE_ID = "b2e5d8f3-4a69-4c01-9f32-8d7b6c5e4f12";
export const DEMO_EVIDENCE_ID = "c3f6e9a4-5b70-4d12-a043-9e8c7d6f5a23";

/** Stable ISO timestamps relative to `now`, so the demo never looks stale. */
function iso(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString();
}

function day(now: Date, offsetDays: number): string {
  return iso(now, offsetDays).slice(0, 10);
}

/**
 * The starting scenario: a two-milestone design agreement where the seller has
 * already submitted a first round of evidence and nobody has authorized a hold
 * yet. That puts the visitor one click away from the core lifecycle.
 */
export function createDemoDeal(now: Date = new Date()): Deal {
  return {
    id: DEMO_DEAL_ID,
    title: "Website redesign — milestone agreement",
    clientName: DEMO_IDENTITIES.buyer.name,
    freelancerName: DEMO_IDENTITIES.seller.name,
    currency: "USD",
    status: "Ready for Authorization",
    agreement:
      "Jamie Seller will redesign the marketing site in two milestones: a design " +
      "system and component library, then a responsive build and handoff. Each " +
      "milestone is paid only after Alex Buyer accepts the submitted evidence and " +
      "approves the recommendation. Payment is an authorization hold, not escrow, " +
      "and no money moves in this demo.",
    authorization: null,
    pendingAuthorization: null,
    milestones: [
      {
        id: DEMO_DESIGN_MILESTONE_ID,
        title: "Design system and component library",
        description:
          "Deliver the colour, type and spacing tokens plus the core component " +
          "library used by the marketing site.",
        amountCents: 120_000,
        dueDate: day(now, 7),
        acceptanceCriteria:
          "A published component library covering buttons, forms, cards and " +
          "navigation, with tokens documented and a review link that opens " +
          "without an account.",
        status: "Awaiting Review",
        approval: null,
        createdAt: iso(now, -6),
        updatedAt: iso(now, -1),
      },
      {
        id: DEMO_BUILD_MILESTONE_ID,
        title: "Responsive build and handoff",
        description:
          "Implement the approved design across mobile, tablet and desktop, then " +
          "hand over the source files.",
        amountCents: 80_000,
        dueDate: day(now, 21),
        acceptanceCriteria:
          "Responsive layouts verified at 375px, 768px and 1440px, no horizontal " +
          "scrolling, and a handoff note listing source files and remaining known " +
          "issues.",
        status: "Draft",
        approval: null,
        createdAt: iso(now, -6),
        updatedAt: iso(now, -6),
      },
    ],
    evidence: [
      {
        id: DEMO_EVIDENCE_ID,
        milestoneId: DEMO_DESIGN_MILESTONE_ID,
        note:
          "First pass of the design system is published. Tokens are documented; " +
          "the component library covers buttons, forms, cards and navigation.",
        url: "https://example.com/fairhold-demo/design-system",
        file: null,
        submittedAt: iso(now, -1),
        submittedBy: DEMO_IDENTITIES.seller.actor,
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      },
    ],
    events: [
      {
        id: "d4a7f0b5-6c81-4e23-b154-af9d8e7a6b34",
        type: "deal.created",
        message: "Deal created by buyer:Alex Buyer.",
        actor: DEMO_IDENTITIES.buyer.actor,
        createdAt: iso(now, -6),
      },
      {
        id: "e5b8a1c6-7d92-4f34-c265-b0ae9f8b7c45",
        type: "milestone.created",
        message: "Milestone added: Design system and component library.",
        actor: DEMO_IDENTITIES.seller.actor,
        createdAt: iso(now, -6),
        milestoneId: DEMO_DESIGN_MILESTONE_ID,
      },
      {
        id: "f6c9b2d7-8ea3-4045-d376-c1bfa09c8d56",
        type: "milestone.created",
        message: "Milestone added: Responsive build and handoff.",
        actor: DEMO_IDENTITIES.seller.actor,
        createdAt: iso(now, -6),
        milestoneId: DEMO_BUILD_MILESTONE_ID,
      },
      {
        id: "07dac3e8-9fb4-4156-e487-d2cab1ad9e67",
        type: "evidence.submitted",
        message: "Evidence submitted for Design system and component library.",
        actor: DEMO_IDENTITIES.seller.actor,
        createdAt: iso(now, -1),
        milestoneId: DEMO_DESIGN_MILESTONE_ID,
      },
    ],
    createdAt: iso(now, -6),
    updatedAt: iso(now, -1),
  };
}
