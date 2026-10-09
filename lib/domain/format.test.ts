import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents } from "./format.ts";

test("formatCents: renders USD amounts", () => {
  assert.equal(formatCents(9000), "$90.00");
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(1234567), "$12,345.67");
});

test("formatCents: tolerates non-finite input", () => {
  assert.equal(formatCents(Number.NaN), "$0.00");
});
