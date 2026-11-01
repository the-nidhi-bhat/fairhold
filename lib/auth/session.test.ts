import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeDemoSession,
  encodeDemoSession,
  type DemoSession,
} from "./session-token.ts";

const session: DemoSession = { name: "Alex Buyer", role: "buyer" };

test("demo session round trip preserves role and name", () => {
  assert.deepEqual(decodeDemoSession(encodeDemoSession(session)), session);
});

test("demo session signature is required", () => {
  assert.equal(decodeDemoSession("invalid.invalid"), null);
  assert.equal(decodeDemoSession(`${encodeDemoSession(session)}tampered`), null);
});

test("demo session expires at the signed server-side timestamp", () => {
  const now = 1_700_000_000_000;
  const token = encodeDemoSession(session, now);
  assert.deepEqual(decodeDemoSession(token, now + 1), session);
  assert.equal(decodeDemoSession(token, now + 8 * 60 * 60 * 1000 + 1), null);
});
