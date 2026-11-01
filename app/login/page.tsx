import { loginAction } from "./actions";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h1 className="text-2xl font-semibold tracking-tight">Demo sign in</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Enter an identity explicitly allowlisted on the server. Demo sessions
          are signed locally and are not production authentication; reviewers
          require a separate server allowlist.
        </p>
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Display name
            <input
              name="name"
              required
              maxLength={100}
              placeholder="Alex Buyer or Jamie Seller"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="block text-sm font-medium">
            Demo role
            <select name="role" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <button className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500">
            Continue
          </button>
        </form>
      </div>
    </section>
  );
}
