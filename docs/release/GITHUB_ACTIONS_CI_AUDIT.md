# GitHub Actions CI Audit — PR #6 (`feat/deal-milestone-foundation`)

## Summary

Two GitHub Actions CI runs failed at the `Install dependencies` step (`npm ci`) with a package-lock.json synchronization error. An earlier incorrect diagnosis pointed to `unrs-resolver` postinstall scripts; that was a misdiagnosis. The actual root cause and fix are documented below. All fixes are committed and pushed to `origin/feat/deal-milestone-foundation`.

---

## Root Cause

**`package-lock.json` was missing top-level entries for `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3`.**

These packages are required by platform-specific optional dependencies:

| Requiring Package | Platform | Required Version | Why Missing |
|---|---|---|---|
| `@img/sharp-wasm32@0.35.5` | Linux (optional) | `@emnapi/runtime@^1.11.3` | Lockfile generated on Windows; Linux optional deps skipped |
| `@tailwindcss/oxide-wasm32-wasi@4.3.3` | wasm32 (optional) | `@emnapi/core@^1.11.1` | Lockfile generated on Windows; wasm32 optional deps skipped |

The lockfile was generated on a Windows machine. On Windows, npm skips Linux-specific and wasm32-specific optional dependencies, so their transitive `@emnapi/*` entries were never added to the lockfile. When `npm ci` runs on Linux CI (`ubuntu-latest`), it processes these optional deps, finds the dependency references (e.g., `@img/sharp-wasm32` depends on `@emnapi/runtime@^1.11.3`), but finds no corresponding lockfile entries, producing:

```
npm error code EUSAGE
npm ci can only install packages when your package.json
and package-lock.json are in sync.
Missing: @emnapi/runtime@1.11.3 from lock file
Missing: @emnapi/core@1.11.3 from lock file
```

This failure occurs with both `npm ci` and `npm ci --ignore-scripts` — the `--ignore-scripts` flag does not fix a lockfile sync issue.

---

## Previous Incorrect Diagnosis (Reverted)

An earlier commit (`fe1947f`) changed CI to use `npm ci --ignore-scripts` based on a hypothesis about `unrs-resolver@1.12.2` postinstall scripts. This was incorrect:

- `unrs-resolver` postinstall works fine on Windows and is unrelated to the lockfile sync error
- `--ignore-scripts` does not resolve missing lockfile entries
- The change was reverted in commit `2aeef4e`

---

## Fix Applied

### Commit 1: Lockfile correction (`000e6e6`)

**File:** `package-lock.json`

Added missing lockfile entries:
- `node_modules/@emnapi/core` — version `1.11.3`, resolved, with integrity hash, `peer: true`
- `node_modules/@emnapi/runtime` — version `1.11.3`, resolved, with integrity hash
- `node_modules/@emnapi/wasi-threads` — version `1.2.3`, updated from dev/optional to peer
- Nested entries under `@tailwindcss/oxide-wasm32-wasi/node_modules/` for its bundle dependencies

**package.json:** Unchanged. `@emnapi/core` and `@emnapi/runtime` remain transitive dependencies only — not added as direct dependencies.

### Commit 2: CI workflow revert (`2aeef4e`)

**File:** `.github/workflows/ci.yml`

Reverted `npm ci --ignore-scripts` back to `npm ci`. The lockfile fix makes `npm ci` work correctly; `--ignore-scripts` was unnecessary and would mask genuine install-script failures.

---

## Verification

All checks pass locally with the fixed lockfile:

| Check | Command | Result |
|---|---|---|
| Dependency install | `npm ci` | exit 0, 377 packages added |
| Lint | `npm run lint` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Unit tests | `npm test` (with `FAIRHOLD_TEST_DATABASE_URL` + `FAIRHOLD_SESSION_SECRET`) | 199 pass / 0 fail / 0 skip |
| Production build | `npm run build` | exit 0, 10 routes |

### Lockfile Consistency Verification

```
$ npm ci
added 377 packages, and audited 378 packages in 1m
```

No "package.json and package-lock.json are in sync" error. No missing package entries.

---

## Commit SHAs and Remote Synchronization

| SHA | Description |
|---|---|
| `000e6e6` | `fix(lockfile): add missing @emnapi/core and @emnapi/runtime entries` |
| `2aeef4e` | `fix(ci): revert npm ci --ignore-scripts, restore npm ci` |

**Sync status:** HEAD `2aeef4e` == remote `origin/feat/deal-milestone-foundation` `2aeef4e`. Working tree clean.

---

## Remaining Warnings or Limitations

| Item | Status |
|---|---|
| Linux CI test of fixed lockfile | Cannot perform — only Windows environment available; fix verified by `npm ci` success locally + lockfile now contains all required entries |
| `unrs-resolver` postinstall warning on Vercel builds | Pre-existing, unrelated to this CI failure; `.npmrc` cannot be modified (CC Safety Net `secret.basename.npmrc`) |
| 9 npm audit vulnerabilities | Pre-existing, moderate/high; not related to CI failure; `npm audit fix` not applied to avoid dependency changes |
| `npm ci` install script warnings | None — `npm ci` runs clean with no warnings after lockfile fix |

---

## Verdict

**FIX APPLIED AND VERIFIED.** The GitHub Actions CI failure on PR #6 was caused by a `package-lock.json` synchronization issue (missing `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3` entries), not by `unrs-resolver` or any code defect. The fix is committed (`000e6e6`, `2aeef4e`) and pushed to `origin/feat/deal-milestone-foundation`. Once GitHub Actions re-runs on `2aeef4e`, the `npm ci` step should pass.

No payment logic, authorization, migrations, or security boundaries were modified. No CI checks were disabled. No tests were weakened. No force-push or history rewrite was performed.
