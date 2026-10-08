# FairHold

> **Status: under active development.** This repository contains an early
> skeleton only. Nothing here is functional yet, and no features are
> implemented. Expect breaking changes and empty directories.

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

## Planned architecture (not yet built)

| Layer | Intent |
| --- | --- |
| Web app | Next.js + TypeScript |
| Data | PostgreSQL |
| Payments | PayPal APIs, server-side only |
| Intelligence | AI recommendations feeding a rules engine |

Nothing in the table above is implemented at this stage.

## Getting started

No runnable setup yet. See [`docs/`](docs/) for design notes as they appear.

## Security

- Secrets live only in `.env`, which is git-ignored. `.env.example` lists the
  expected variable names with placeholder values.
- PayPal and AI credentials must remain server-side.

## License

See the repository's license file.
