# PayPal Sandbox kill test — evidence

Phase 0 of FairHold. This file records only what was actually observed. No
operation below is marked VERIFIED unless it was executed against the PayPal
sandbox and its result inspected.

- Test date: 2026-10-09
- Environment: PayPal **sandbox** only (`https://api-m.sandbox.paypal.com`)
- Harness: `scripts/paypal-kill-test.mjs` (server-side only, native Node, no deps)
- Executor: automated harness + manual sandbox-buyer approval

## Status summary

| Operation | Result |
| --- | --- |
| Harness authoring + static check (`node --check`) | VERIFIED (local) |
| Config guard (`doctor`, sandbox enforcement, no network) | VERIFIED (local) |
| OAuth token request | BLOCKED — credentials not configured |
| Create `intent=AUTHORIZE` order | BLOCKED |
| Buyer approval | BLOCKED |
| Authorize order | BLOCKED |
| Partial capture #1 (`final_capture=false`) | BLOCKED |
| Partial capture #2 (same authorization) | BLOCKED |
| Capture #3 probe (max-capture-count) | BLOCKED |
| Final capture (`final_capture=true`) | BLOCKED |
| Void after partial capture | BLOCKED |
| Order / authorization / capture state checks | BLOCKED |
| Webhook delivery + signature verification | NOT TESTED (prerequisite not met) |

**No PayPal API calls were executed.** The sandbox call flow never started
because no sandbox credentials were present in the environment or in a local
untracked `.env` file.

## What was actually run

```
node --check scripts/paypal-kill-test.mjs      -> exit 0 (syntax valid)
node scripts/paypal-kill-test.mjs doctor       -> exit 2 (BLOCKED: credentials unset)
```

`doctor` output (non-sensitive): sandbox host confirmed, currency `USD`,
order amount `90.00`, capture amount `10.00`, `PAYPAL_ENV=sandbox`,
`client id: <unset>`, `client secret: <unset>`.

## Exact blocker

The harness reads credentials from the environment or a local, gitignored
`.env` file using the names already defined in `.env.example`:

- `PAYPAL_ENV` (must be `sandbox`)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

Required to proceed:

1. A PayPal **sandbox** REST app (Developer Dashboard → Apps & Credentials →
   Sandbox) providing a sandbox client ID and secret.
2. A **sandbox personal (buyer) account** to approve the order in a browser.
3. A local `.env` at the repo root containing the two credentials. `.env` is
   already covered by `.gitignore` (`.env` and `.env.*`, with `.env*.example`
   un-ignored), so it will not be committed.

Do not commit credentials. Do not paste secrets into source or evidence.

## Planned test sequence (to run once credentials exist)

The harness is resumable: order and authorization IDs are persisted between
invocations to a **gitignored** local state file
(`scripts/.paypal-kill-test-state.json`, added to `.gitignore`). No access
tokens are persisted.

```
node scripts/paypal-kill-test.mjs create          # -> approval URL + order id
  # approve as sandbox buyer in browser
node scripts/paypal-kill-test.mjs authorize        # -> authorization id
node scripts/paypal-kill-test.mjs capture          # partial capture #1
node scripts/paypal-kill-test.mjs capture          # partial capture #2
node scripts/paypal-kill-test.mjs capture          # probe capture #3
node scripts/paypal-kill-test.mjs get-auth         # inspect authorization state
node scripts/paypal-kill-test.mjs capture --final  # final capture (if funds remain)

# separate flow for void-after-partial:
node scripts/paypal-kill-test.mjs create --new
node scripts/paypal-kill-test.mjs authorize
node scripts/paypal-kill-test.mjs capture
node scripts/paypal-kill-test.mjs void
node scripts/paypal-kill-test.mjs get-auth         # expect VOIDED / PARTIALLY_CAPTURED
```

Recorded per operation: HTTP status, non-sensitive resource ids, resource
status, and amounts. The maximum number of successful partial captures will be
reported **only from observed results**, never assumed.

## Webhooks

Not tested. Webhook delivery requires either a publicly reachable endpoint or a
PayPal dashboard webhook configuration with a webhook ID. Neither is in place.
This remains a documented prerequisite; the harness makes no webhook claims.

## Safety boundaries honored

- Sandbox host hard-coded; the harness refuses to run unless `PAYPAL_ENV`
  resolves to `sandbox`.
- Captures/voids are only ever issued against the authorization id created by
  the same local state file.
- Access tokens, client secret, and `Authorization` headers are never printed.
- No live credentials, no production endpoint, no real funds.
- The harness is separate from the Next.js app; no production payment routes
  were implemented.

## Conclusion

Phase 0 is **BLOCKED**, not failed. The core product assumption — one PayPal
authorization supporting multiple partial captures, with the remainder
voidable — **remains UNVERIFIED**. It must not be described as working until
the sequence above is executed and the resulting resource states are inspected.
