import assert from "node:assert/strict";
import test from "node:test";
import { buildDealUrl, resolveAppUrl } from "./url.ts";

/**
 * Regression coverage for the public-URL resolver. Commit dd20219 removed the
 * old localhost fallback while the documented contract kept it, which broke
 * demo authorization in every environment without NEXT_PUBLIC_APP_URL (the
 * evidence-lifecycle E2E failure). These tests pin the documented contract:
 * dev fallback, production refusal, VERCEL_URL https normalization, and stable
 * path concatenation for provider return/cancel URLs.
 */

function expectAppUrlError(code: string, run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
    assert.equal(error.name, "AppUrlError");
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

test("development falls back to localhost when nothing is configured", () => {
  assert.equal(resolveAppUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("production refuses to guess a public URL", () => {
  expectAppUrlError("MISSING_URL", () =>
    resolveAppUrl({ NODE_ENV: "production" }),
  );
});

test("an explicit NEXT_PUBLIC_APP_URL wins over VERCEL_URL", () => {
  assert.equal(
    resolveAppUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://fairhold.example",
      VERCEL_URL: "ignored.vercel.app",
    }),
    "https://fairhold.example",
  );
});

test("VERCEL_URL arrives without a scheme and resolves as https", () => {
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", VERCEL_URL: "fairhold-abc123.vercel.app" }),
    "https://fairhold-abc123.vercel.app",
  );
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", VERCEL_URL: "https://already.vercel.app" }),
    "https://already.vercel.app",
  );
});

test("production rejects http and private hosts", () => {
  expectAppUrlError("INSECURE_URL", () =>
    resolveAppUrl({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://fairhold.example" }),
  );
  expectAppUrlError("PRIVATE_HOST", () =>
    resolveAppUrl({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://localhost:3000" }),
  );
});

test("malformed and non-http schemes are rejected with a precise error", () => {
  expectAppUrlError("INVALID_URL", () =>
    resolveAppUrl({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "not a url" }),
  );
  expectAppUrlError("INVALID_URL", () =>
    resolveAppUrl({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "ftp://files.example" }),
  );
});

test("root URLs normalize without a trailing slash so paths never double up", () => {
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://fairhold.example/" }),
    "https://fairhold.example",
  );
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://example.com/app/" }),
    "https://example.com/app",
  );
});

test("buildDealUrl concatenates exactly one slash before the deal path", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://fairhold.example" };
  assert.equal(
    buildDealUrl("deal-1", "/payment-return", env),
    "https://fairhold.example/deals/deal-1/payment-return",
  );
  // The dev fallback concatenates just as stably.
  assert.equal(
    buildDealUrl("deal-1", "/payment-cancel", { NODE_ENV: "development" }),
    "http://localhost:3000/deals/deal-1/payment-cancel",
  );
});

test("buildDealUrl keeps the deal id to safe path characters only", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://fairhold.example" };
  const url = buildDealUrl("../../etc/passwd", "/payment-return", env);
  assert.equal(url, "https://fairhold.example/deals/etcpasswd/payment-return");
});
