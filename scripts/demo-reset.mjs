#!/usr/bin/env node
/**
 * Reset the development JSON store to a curated, repeatable demo fixture.
 *
 * Safe by design:
 *   - refuses to run when a real DATABASE_URL is configured (the JSON store is
 *     not the source of truth in that case);
 *   - only writes `.data/fairhold.json` inside this repository;
 *   - never touches payment provider state (the fixture contains no provider
 *     references, so every payment step in the demo is simulated locally).
 *
 * Usage: npm run demo:reset
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

const DEAL_ID = "8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10";
const DESIGN_MILESTONE = "a1d4c7e2-3f58-4b90-8e21-7c6a5b4d3e01";
const BUILD_MILESTONE = "b2e5d8f3-4a69-4c01-9f32-8d7b6c5e4f12";
const EVIDENCE_ID = "c3f6e9a4-5b70-4d12-a043-9e8c7d6f5a23";

const database = {
  version: 1,
  deals: [
    {
      id: DEAL_ID,
      title: "Website redesign — milestone agreement",
      clientName: "Alex Buyer",
      freelancerName: "Jamie Seller",
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
          submittedBy: "seller:Jamie Seller",
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
          actor: "buyer:Alex Buyer",
          createdAt: iso(-6),
        },
        {
          id: "e5b8a1c6-7d92-4f34-c265-b0ae9f8b7c45",
          type: "milestone.created",
          message: "Milestone added: Design system and component library.",
          actor: "seller:Jamie Seller",
          createdAt: iso(-6),
          milestoneId: DESIGN_MILESTONE,
        },
        {
          id: "f6c9b2d7-8ea3-4045-d376-c1bfa09c8d56",
          type: "milestone.created",
          message: "Milestone added: Responsive build and handoff.",
          actor: "seller:Jamie Seller",
          createdAt: iso(-6),
          milestoneId: BUILD_MILESTONE,
        },
        {
          id: "07dac3e8-9fb4-4156-e487-d2cab1ad9e67",
          type: "evidence.submitted",
          message:
            "Evidence submitted for Design system and component library.",
          actor: "seller:Jamie Seller",
          createdAt: iso(-1),
          milestoneId: DESIGN_MILESTONE,
        },
      ],
      createdAt: iso(-6),
      updatedAt: iso(-1),
    },
  ],
  paymentOperations: [],
};

await mkdir(DATA_DIR, { recursive: true });
await writeFile(DATA_FILE, `${JSON.stringify(database, null, 2)}\n`, "utf8");

console.log("Demo store reset.");
console.log(`  file: ${DATA_FILE}`);
console.log(`  deal: ${DEAL_ID} — Website redesign (Ready for Authorization)`);
console.log("");
console.log("Demo identities (must be allowlisted on the server):");
console.log("  buyer:  Alex Buyer");
console.log("  seller: Jamie Seller");
console.log("");
console.log("Suggested run-through:");
console.log("  1. Sign in as Alex Buyer, open the deal, simulate the authorization hold.");
console.log("  2. Sign in as Jamie Seller, submit evidence for the second milestone.");
console.log("  3. Sign back in as Alex Buyer, accept the evidence and approve the recommendation.");
console.log("  4. Check the payment history and the dashboard counters.");
