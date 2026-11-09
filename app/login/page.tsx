import Link from "next/link";
import { loginAction } from "./actions";

export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const invalid = query.error === "invalid";

  return (
    <section className="page-frame grid min-h-[calc(100vh-220px)] items-center gap-10 py-14 lg:grid-cols-[1fr_440px] lg:gap-16">
      <div className="max-w-xl">
        <p className="eyebrow">Demo workspace</p>
        <h1 className="headline mt-5 text-[clamp(2.2rem,4.6vw,3.6rem)]">
          Enter the workspace as a real role.
        </h1>
        <p className="lede mt-5">
          FairHold signs demo sessions locally and checks every deal action on the
          server. Buyers, sellers and reviewers see different controls because
          they have different responsibilities.
        </p>

        <dl className="mt-9 grid gap-4 sm:grid-cols-3">
          {[
            ["Buyer", "Reviews evidence, approves captures."],
            ["Seller", "Submits evidence, tracks milestones."],
            ["Reviewer", "Granted per deal, never by default."],
          ].map(([role, body]) => (
            <div key={role} className="surface-subtle p-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--accent)]">
                {role}
              </dt>
              <dd className="mt-1.5 text-xs leading-5 text-muted">{body}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 max-w-lg text-xs leading-5 text-muted">
          Demo authentication is not production identity verification. Names must
          be allowlisted on the server; reviewers also need an explicit deal grant.
        </p>
      </div>

      <div className="surface w-full p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">Demo sign in</h2>
          <span className="chip">Signed locally</span>
        </div>

        {invalid ? (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3.5 py-3 text-sm leading-6 text-[var(--warning)]"
          >
            That identity is not allowlisted for the selected role. Check the demo
            allowlist configured on the server, or ask the operator which demo
            identities are enabled.
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-[var(--foreground-soft)]">
            Display name
            <input
              name="name"
              required
              maxLength={100}
              autoComplete="name"
              placeholder="Alex Buyer or Jamie Seller"
              className="field mt-2"
            />
            <p className="text-[10px] text-muted mt-1">
              Demo identities: Alex Buyer · Jamie Seller · Morgan Reviewer
            </p>
          </label>
          <label className="block text-sm font-medium text-[var(--foreground-soft)]">
            Demo role
            <select name="role" className="field mt-2">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <button className="primary-button w-full">Continue</button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          No account is created.{" "}
          <Link href="/" className="underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--foreground)]">
            Back to overview
          </Link>
        </p>
      </div>
    </section>
  );
}
