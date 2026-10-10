# FairHold

> **Status: under active development.** The Deal & Milestone foundation is in
> place: you can create a deal, add milestones with amounts and acceptance
> criteria, move through workflow states, and see an activity timeline. You can
> also submit **evidence**, get a deterministic **rules recommendation**
> (`CAPTURE` / `HOLD` / `VOID` / `DISPUTE` with reason codes), review the
> evidence, and record a **human approval** decision. Persistence is a
> **PostgreSQL backend** with a JSON dev-store default: run without
> `DATABASE_URL` for zero-config JSON storage, or set `DATABASE_URL` and apply
> `npm run db:migrate` / `npm run db:import` to use PostgreSQL (no silent
> fallback — a configured-but-unreachable database fails loudly). Payments are
> **simulated** by a demo provider by default — no real PayPal call is made —
> with an opt-in PayPal sandbox adapter. AI analysis, authentication, and the
> PayPal webhook endpoint are not implemented yet.

FairHold is an **AI-assisted conditional payment platform** built around PayPal,
where:

> **AI proposes. Rules decide.**

## Concept

Two parties — a buyer and a seller — agree on terms for a payment. The payment
is authorized on PayPal and held pending satisfaction of agreed conditions.
Evidence about whether those conditions were met is submitted, an AI model
produces a *recommendation*, and a deterministic rules engine — not the model —
makes the final decision.

The design principle is deliberate:

- **AI proposes.** The model drafts analysis and recommendations, and explains
  its reasoning.
- **Rules decide.** Release, refund, escalation, or waiting is resolved by
  deterministic, auditable application rules.

The AI layer is never allowed to move money, mutate payment state, or bypass
authorization checks.

### Terminology note

PayPal does not provide escrow in this design. Payments are handled with
PayPal authorization and capture primitives under PayPal's own terms. Any
user-facing wording must describe the mechanism accurately rather than calling
it "escrow".

## Architecture

| Layer | Intent | Status |
| --- | --- | --- |
| Web app | Next.js + TypeScript | Deals, milestones, dashboard, workflow states |
| Data | PostgreSQL | Schema + migrations + data-access layer implemented; JSON dev store (`.data/`, git-ignored) is the default when `DATABASE_URL` is unset |
| Payments | PayPal APIs, server-side only | Interface + simulated demo provider (authorize/capture/void) + PayPal sandbox adapter; no live call from the app |
| Intelligence | AI recommendations feeding a rules engine | Deterministic rules engine implemented; AI model not implemented |

## Getting started

Requires Node.js 24 and npm.

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

### Optional: PostgreSQL persistence

Without `DATABASE_URL`, the app uses the JSON dev store under `.data/`
(git-ignored) — no database needed. To use PostgreSQL instead:

```bash
# 1. Set DATABASE_URL (see .env.example; never commit .env)
# 2. Apply migrations (idempotent, transactional)
npm run db:migrate
# 3. Optional: import existing JSON dev data (idempotent; never deletes the JSON)
npm run db:import
# 4. Integration tests (isolated Postgres required):
#    FAIRHOLD_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/fairhold_test npm test
```

There is no silent fallback: once `DATABASE_URL` is set, a missing or
unreachable database makes the app fail loudly.

`npm run typecheck` runs `next typegen` first, because `PageProps` /
`LayoutProps` are globals generated into `.next/types`.

## Security

- Secrets live only in `.env`, which is git-ignored. `.env.example` lists the
  expected variable names with placeholder values.
- PayPal and AI credentials must remain server-side.

## License

See the repository's license file.
