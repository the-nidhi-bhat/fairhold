import assert from "node:assert/strict";
import test from "node:test";
import { deleteEvidenceFile } from "./storage.ts";

test("deleteEvidenceFile rejects a path that escapes the evidence directory", async () => {
  await assert.rejects(() => deleteEvidenceFile("../fairhold.json"));
  await assert.rejects(() => deleteEvidenceFile("evidence/../fairhold.json"));
  await assert.rejects(() => deleteEvidenceFile("/etc/passwd"));
});

test("deleteEvidenceFile tolerates a file that is already gone", async () => {
  await assert.doesNotReject(() =>
    deleteEvidenceFile("evidence/00000000-0000-4000-8000-000000000000-missing.txt"),
  );
});
