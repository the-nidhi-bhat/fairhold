import { loginAction } from "./actions";

export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const invalid = query.error === "invalid";

  return (
    <section className="page-frame grid min-h-[620px] place-items-center py-16">
      <div className="surface w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Demo sign in</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Enter an identity explicitly allowlisted on the server. Demo sessions
          are signed locally and are not production authentication; reviewers
          require a separate server allowlist.
        </p>
        {invalid ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            That identity is not allowlisted for the selected role. Check the
            demo allowlist configured on the server, or ask the operator which
            demo identities are enabled.
          </p>
        ) : null}
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Display name
            <input
              name="name"
              required
              maxLength={100}
              placeholder="Alex Buyer or Jamie Seller"
              className="field mt-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Demo role
            <select name="role" className="field mt-2">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <button className="primary-button w-full">
            Continue
          </button>
        </form>
      </div>
    </section>
  );
}
