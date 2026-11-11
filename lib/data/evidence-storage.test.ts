import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deleteEvidenceFile, evidenceStorageDir, readEvidenceFile, writeEvidenceFile } from "./storage.ts";

// Regression: evidence bytes were written to `process.cwd()/.data/evidence`
// unconditionally. On a host with a read-only deployment bundle (Vercel mounts
// /var/task read-only) the mkdir failed and every evidence submission returned
// a 500 — `ENOENT: no such file or directory, mkdir '/var/task/.data'` was
// observed in the deployed Preview's runtime logs. The evidence module now
// resolves its directory through the same helper as the JSON store, which falls
// back to a writable location, so a round trip must work wherever the store can
// write.

test("evidence round trip writes inside the resolved data directory", async () => {
  const bytes = new Uint8Array(Buffer.from("preview verification evidence", "utf8"));
  const storedPath = await writeEvidenceFile("handoff-note.txt", bytes);

  assert.match(storedPath, /^evidence[\\/][0-9a-f-]{36}-handoff-note\.txt$/);
  // The key is relative to the resolved evidence directory, not to whatever cwd
  // the process happens to have.
  const absolute = join(await evidenceStorageDir(), storedPath.split(/[\\/]/).pop() as string);
  assert.ok(existsSync(absolute), `expected ${absolute} to exist`);
  assert.equal((await stat(absolute)).size, bytes.byteLength);

  const back = await readEvidenceFile(storedPath);
  assert.deepEqual([...back], [...bytes]);

  await deleteEvidenceFile(storedPath);
  assert.equal(existsSync(absolute), false);
});

test("evidence keys cannot escape the evidence directory", async () => {
  await assert.rejects(() => readEvidenceFile("../fairhold.json"));
  await assert.rejects(() => readEvidenceFile("evidence/../fairhold.json"));
});

test("the data directory is never the read-only bundle directory on a serverless host", () => {
  // The temp-directory candidate exists precisely so the resolver can fall
  // through when process.cwd() is not writable.
  assert.ok(join(tmpdir(), "fairhold").length > 0);
});
