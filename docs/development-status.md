# Development status

Last updated: Phase 1 (application scaffold).

## What exists

- Git repository on branch `main`, connected to the project's GitHub remote.
- Next.js 16.4.0 application scaffold: App Router, TypeScript 5, Tailwind CSS 4,
  ESLint 9, npm as the single package manager.
- Root layout and landing page describing the concept and the AI/rules
  boundary. These are static explanatory pages, not working features.
- Verification scripts: `npm run lint`, `npm run typecheck`, `npm run build`.
  All three pass at this revision.
- Root `.gitignore`, `.env.example` with placeholder variable names only.

## What does not exist yet

- PayPal integration of any kind.
- AI/model integration.
- Database schema, migrations, or data access code.
- Authentication or sessions.
- Deal, agreement, condition, evidence, decision, or dispute models.
- Rules engine.
- Tests, CI, or deployment configuration.
- Any user-facing feature beyond reading the landing page.

## Rules of evidence

Claims in this folder must be traceable to code, configuration, or a recorded
verification run. Planned work stays listed here as planned; it is never
rewritten as done.
