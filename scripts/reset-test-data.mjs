#!/usr/bin/env node
/**
 * Reset the test data JSON store to a curated, repeatable demo fixture.
 *
 * Safe by design:
 *   - writes into FAIRHOLD_DATA_DIR when set (each Playwright project owns its
 *     own directory, and the server for that project was started with the same
 *     value), otherwise into .data inside this repository;
 *   - refuses to run when a real DATABASE_URL is configured, because PostgreSQL
 *     would then be the data source and a JSON write would be a lie. The one
 *     exception is the explicit E2E pin
 *     (NODE_ENV !== "production" && FAIRHOLD_DATA_BACKEND === "json"), which
 *     covers running the specs against `next dev`, where a .env.local
 *     DATABASE_URL would otherwise redirect the run at a real database;
 *   - never touches payment provider state, and never points at Neon.
 *
 * Usage: node scripts/reset-test-data.mjs
 *        FAIRHOLD_DATA_DIR=%TEMP%\fairhold-e2e\desktop FAIRHOLD_DATA_BACKEND=json node scripts/reset-test-data.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// The two demo identities the fixture deals belong to.
const BUYER = "Alex Buyer";
const SELLER = "Jamie Seller";

const now = new Date();
const iso = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 86400000).toISOString();

const DEAL_A = "8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10";
const DEAL_B = "1b7d3c94-2a5e-4f60-8c31-9e4f2a6d7b58";
const DEAL_C = "7bd3945a-8ab4-4fc6-e297-f4a580c3db14";

// Respect FAIRHOLD_DATA_DIR if set (each Playwright project owns its own
// directory; an absolute path is used as-is, a relative one resolves against the
// repository), otherwise write the repository's .data directory.
const dataDir = resolve(
  process.cwd(),
  process.env.FAIRHOLD_DATA_DIR || ".data",
);
const DATA_FILE = join(dataDir, "fairhold.json");

// Check for DATABASE_URL using import
const { DATABASE_URL } = process.env;
const e2eJson = process.env.NODE_ENV !== "production" && process.env.FAIRHOLD_DATA_BACKEND === "json";
if (!e2eJson && DATABASE_URL && DATABASE_URL !== "" && !/^your_/i.test(DATABASE_URL) && /^postgres/i.test(DATABASE_URL)) {
  console.error("Refusing to reset: DATABASE_URL is configured, so PostgreSQL is the data source.");
  process.exit(1);
}

// Simple deal data for testing - only what the evidence-lifecycle tests need
const database = {
  version: 1,
  deals: [
    {
      id: DEAL_A,
      title: "Website redesign — milestone agreement",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "Ready for Authorization",
      agreement: "Test agreement",
      authorization: null,
      pendingAuthorization: null,
      milestones: [
        {
          id: "a1d4c7e2-3f58-4b90-8e21-7c6a5b4d3e01",
          title: "Design system and component library",
          description: "Design system and component library",
          amountCents: 120000,
          dueDate: iso(7),
          acceptanceCriteria: "Component library",
          status: "In Progress",
          approval: null,
          createdAt: iso(-6),
          updatedAt: iso(-1),
        },
        {
          id: "b2e5d8f3-4a69-4c01-9f32-8d7b6c5e4f12",
          title: "Responsive build and handoff",
          description: "Responsive build and handoff",
          amountCents: 80000,
          dueDate: iso(21),
          acceptanceCriteria: "Responsive layouts",
          status: "Draft",
          approval: null,
          createdAt: iso(-6),
          updatedAt: iso(-6),
        },
      ],
      evidence: [
        {
          id: "c3f6e9a4-5b70-4d12-a043-9e8c7d6f5a23",
          milestoneId: "a1d4c7e2-3f58-4b90-8e21-7c6a5b4d3e01",
          note: "Design system published",
          url: "https://example.com",
          file: null,
          submittedAt: iso(-1),
          submittedBy: `seller:${SELLER}`,
          decision: "pending",
          reviewedAt: null,
          reviewNote: null,
        },
      ],
      events: [],
      createdAt: iso(-6),
      updatedAt: iso(-1),
    },
    {
      id: DEAL_B,
      title: "Brand launch site — discovery, review and build",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "In Progress",
      agreement: "Test agreement",
      authorization: {
        providerName: "demo-payment-provider",
        providerReference: "demo-auth-fixture-b-7d3c94",
        providerOrderId: "demo-auth-fixture-b-7d3c94-order",
        simulated: true,
        amountCents: 150000,
        expiresAt: iso(24),
        createdAt: iso(-10),
      },
      pendingAuthorization: null,
      milestones: [
        {
          id: "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69",
          title: "Discovery and content inventory",
          description: "Audit the existing pages",
          amountCents: 60000,
          dueDate: iso(-6),
          acceptanceCriteria: "Sitemap and content inventory",
          status: "Completed",
          approval: {
            evidence: { id: "5fb17238-6e92-4da4-c075-d2836ea1bf92", milestoneId: "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69", note: "Discovery summary", url: "https://example.com" },
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-b-discovery",
            reviewedAt: iso(-4),
            explanation: "Evidence was accepted",
          },
          createdAt: iso(-10),
          updatedAt: iso(-4),
        },
        {
          id: "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70",
          title: "Interaction prototype review",
          description: "Interaction prototype review",
          amountCents: 40000,
          dueDate: iso(-1),
          acceptanceCriteria: "Clickable prototype",
          status: "Awaiting Review",
          approval: {
            evidence: { id: "6ac28349-7fa3-4eb5-d186-e3947fb2ca03", milestoneId: "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70", note: "Interaction review", url: "https://example.com" },
            action: "CAPTURE",
            paymentStatus: "PENDING",
            providerReference: "demo-capture-fixture-b-review",
            reviewedAt: iso(-1),
            explanation: "Provider has not settled",
          },
          createdAt: iso(-10),
          updatedAt: iso(-1),
        },
        {
          id: "4ea06127-5d81-4c93-bf64-c1725d90ae81",
          title: "Production build and launch",
          description: "Production build and launch",
          amountCents: 50000,
          dueDate: iso(14),
          acceptanceCriteria: "Live site matches prototype",
          status: "In Progress",
          approval: null,
          createdAt: iso(-10),
          updatedAt: iso(-1),
        },
      ],
      evidence: [
        { id: "5fb17238-6e92-4da4-c075-d2836ea1bf92", milestoneId: "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69", note: "Discovery summary", url: "https://example.com", file: null, submittedAt: iso(-5), submittedBy: `seller:${SELLER}`, decision: "accepted", reviewedAt: iso(-4), reviewNote: null },
        { id: "6ac28349-7fa3-4eb5-d186-e3947fb2ca03", milestoneId: "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70", note: "Interaction review", url: "https://example.com", file: null, submittedAt: iso(-2), submittedBy: `seller:${SELLER}`, decision: "accepted", reviewedAt: iso(-1), reviewNote: null },
      ],
      events: [
        { id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f", type: "deal.created", message: "Deal created by buyer:Alex Buyer.", actor: "buyer:Alex Buyer", createdAt: iso(-10) },
        { id: "d2e3f4a5-b6c7-4d8e-9f01-b2c3d4e5f607", type: "deal.authorization_simulated", message: "Simulated authorization hold of $1,500.00 via demo-payment-provider (no PayPal request was made).", actor: "buyer:Alex Buyer", createdAt: iso(-10) },
        { id: "e3f4a5b6-c7d8-4e9f-a012-c3d4e5f60718", type: "evidence.submitted", message: "Evidence submitted for Discovery and content inventory.", actor: `seller:${SELLER}`, createdAt: iso(-5), milestoneId: "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69" },
        { id: "f4a5b6c7-d8e9-4f01-b123-d4e5f6071829", type: "milestone.approval_recorded", message: "Reviewer decision for 'Discovery and content inventory': approve → CAPTURE (SIMULATED — no PayPal request).", actor: `buyer:Alex Buyer`, createdAt: iso(-4), milestoneId: "2c8e4d05-3b6f-4a71-9d42-af503b7e8c69" },
        { id: "05b6c7d8-e9f0-4102-c234-e5f60718293a", type: "evidence.submitted", message: "Evidence submitted for Interaction prototype review.", actor: `seller:${SELLER}`, createdAt: iso(-2), milestoneId: "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70" },
        { id: "16c7d8e9-f001-4213-d345-f60718293a4b", type: "milestone.approval_recorded", message: "Reviewer decision for 'Interaction prototype review': approve → CAPTURE (SIMULATED — no PayPal request).", actor: `buyer:Alex Buyer`, createdAt: iso(-1), milestoneId: "3d9f5e16-4c70-4b82-ae53-b0614c8f9d70" },
      ],
      createdAt: iso(-10),
      updatedAt: iso(-1),
    },
    {
      id: DEAL_C,
      title: "Podcast launch — research and delivery",
      clientName: BUYER,
      freelancerName: SELLER,
      currency: "USD",
      status: "Completed",
      agreement: "Test agreement",
      authorization: {
        providerName: "demo-payment-provider",
        providerReference: "demo-auth-fixture-c-a56b9bc",
        providerOrderId: "demo-auth-fixture-c-a56b9bc-order",
        simulated: true,
        amountCents: 90000,
        expiresAt: iso(19),
        createdAt: iso(-20),
      },
      pendingAuthorization: null,
      milestones: [
        {
          id: "8ce4a56b-9bc5-40d7-f3a8-05b691d4ec25",
          title: "Audience research and positioning",
          description: "Interview five listeners",
          amountCents: 50000,
          dueDate: iso(-14),
          acceptanceCriteria: "Research report",
          status: "Completed",
          approval: {
            evidence: { id: "ae06c78d-bde7-42f9-15ca-27d8b3f60e47", milestoneId: "8ce4a56b-9bc5-40d7-f3a8-05b691d4ec25", note: "Research report", url: "https://example.com" },
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-c-research",
            reviewedAt: iso(-13),
            explanation: "Evidence was accepted",
          },
          createdAt: iso(-20),
          updatedAt: iso(-13),
        },
        {
          id: "9df5b67c-acd6-41e8-04b9-16c7a2e5fd36",
          title: "Recorded delivery package",
          description: "Deliver the intro, three episodes and the cover artwork",
          amountCents: 40000,
          dueDate: iso(-8),
          acceptanceCriteria: "Intro, three episodes and cover artwork",
          status: "Completed",
          approval: {
            evidence: { id: "bf17d89e-cef8-4301-26db-38e9c4071f58", milestoneId: "9df5b67c-acd6-41e8-04b9-16c7a2e5fd36", note: "Final delivery", url: "https://example.com" },
            action: "CAPTURE",
            paymentStatus: "COMPLETED",
            providerReference: "demo-capture-fixture-c-delivery",
            reviewedAt: iso(-7),
            explanation: "This $400.00 capture settled the remaining hold",
          },
          createdAt: iso(-20),
          updatedAt: iso(-7),
        },
      ],
      evidence: [
        { id: "ae06c78d-bde7-42f9-15ca-27d8b3f60e47", milestoneId: "8ce4a56b-9bc5-40d7-f3a8-05b691d4ec25", note: "Research report", url: "https://example.com", file: null, submittedAt: iso(-14), submittedBy: `seller:${SELLER}`, decision: "accepted", reviewedAt: iso(-13), reviewNote: null },
        { id: "bf17d89e-cef8-4301-26db-38e9c4071f58", milestoneId: "9df5b67c-acd6-41e8-04b9-16c7a2e5fd36", note: "Final delivery", url: "https://example.com", file: null, submittedAt: iso(-8), submittedBy: `seller:${SELLER}`, decision: "accepted", reviewedAt: iso(-7), reviewNote: null },
      ],
      events: [
        { id: "27d8e9f0-0112-4324-e456-0718293a4b5c", type: "deal.created", message: "Deal created by buyer:Alex Buyer.", actor: "buyer:Alex Buyer", createdAt: iso(-20) },
        { id: "38e9f001-1223-4435-f567-18293a4b5c6d", type: "deal.authorization_simulated", message: "Simulated authorization hold of $900.00 via demo-payment-provider (no PayPal request was made).", actor: "buyer:Alex Buyer", createdAt: iso(-20) },
        { id: "49f00112-2334-4546-0678-293a4b5c6d7e", type: "milestone.approval_recorded", message: "Reviewer decision for 'Audience research and positioning': approve → CAPTURE (SIMULATED — no PayPal request).", actor: `buyer:Alex Buyer`, createdAt: iso(-13), milestoneId: "8ce4a56b-9bc5-40d7-f3a8-05b691d4ec25" },
        { id: "5a011223-3445-4657-1789-3a4b5c6d7e8f", type: "milestone.approval_recorded", message: "Reviewer decision for 'Recorded delivery package': approve → CAPTURE (SIMULATED — no PayPal request).", actor: `buyer:Alex Buyer`, createdAt: iso(-7), milestoneId: "9df5b67c-acd6-41e8-04b9-16c7a2e5fd36" },
        { id: "6b122334-4556-4768-2890-4b5c6d7e8f90", type: "deal.status_changed", message: "Deal moved from 'In Progress' to 'Completed'.", actor: `seller:${SELLER}`, createdAt: iso(-7) },
      ],
      createdAt: iso(-20),
      updatedAt: iso(-7),
    },
  ],
};

async function main() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(database, null, 2) + "\n", "utf8");
  console.log("Test data reset.");
  console.log(`  file: ${DATA_FILE}`);
}

main().catch((err) => {
  console.error("Failed to reset test data:", err);
  process.exit(1);
});