# FairHold

> **Status: under active development.** Phase 1 (application scaffold) is
> complete: a runnable Next.js application shell exists. No FairHold feature
> — agreements, payments, AI, database, rules, evidence, disputes — is
> implemented yet.

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
| Web app | Next.js + TypeScript | Scaffolded — app shell only |
| Data | PostgreSQL | Not implemented |
| Payments | PayPal APIs, server-side only | Not implemented |
| Intelligence | AI recommendations feeding a rules engine | Not implemented |

## Getting started

Requires Node.js 24 and npm.

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

`npm run typecheck` runs `next typegen` first, because `PageProps` /
`LayoutProps` are globals generated into `.next/types`.

## Security

- Secrets live only in `.env`, which is git-ignored. `.env.example` lists the
  expected variable names with placeholder values.
- PayPal and AI credentials must remain server-side.

## License

See the repository's license file.
