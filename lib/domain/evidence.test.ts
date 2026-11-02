import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EVIDENCE_FILE_BYTES,
  sanitizeFileName,
  sniffFileType,
  validateEvidenceInput,
  validateEvidenceUrl,
} from "./evidence.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const TEXT = Uint8Array.from(
  Array.from("hello world", (c) => c.charCodeAt(0)),
);

test("sniffFileType detects images, pdf and text", () => {
  assert.equal(sniffFileType(PNG), "image/png");
  assert.equal(sniffFileType(JPEG), "image/jpeg");
  assert.equal(sniffFileType(PDF), "application/pdf");
  assert.equal(sniffFileType(TEXT), "text/plain");
});

test("sniffFileType rejects binary and empty content", () => {
  assert.equal(sniffFileType(bytes(0x00, 0x01, 0x02, 0x03)), null);
  assert.equal(sniffFileType(bytes()), null);
});

test("sanitizeFileName strips paths and unsafe characters", () => {
  const traversal = sanitizeFileName("../../etc/passwd");
  assert.equal(traversal.includes("/"), false);
  assert.equal(traversal.startsWith("."), false);

  const unsafe = sanitizeFileName("my report!.pdf");
  assert.equal(unsafe.includes("!"), false);
  assert.equal(unsafe.includes("/"), false);
  assert.ok(unsafe.endsWith(".pdf"));
});

test("validateEvidenceUrl allows only http/https", () => {
  assert.deepEqual(validateEvidenceUrl(""), { ok: true, value: null });
  assert.equal(validateEvidenceUrl("https://example.com/proof").ok, true);
  assert.equal(validateEvidenceUrl("http://example.com/proof").ok, true);
  assert.equal(validateEvidenceUrl("javascript:alert(1)").ok, false);
  assert.equal(validateEvidenceUrl("ftp://example.com").ok, false);
});

test("validateEvidenceInput requires at least one artifact", () => {
  const result = validateEvidenceInput({ note: "", url: "", file: null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors._form);
});

test("validateEvidenceInput accepts a note", () => {
  const result = validateEvidenceInput({
    note: "Deployed to staging.",
    url: "",
    file: null,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.note, "Deployed to staging.");
    assert.equal(result.value.url, null);
    assert.equal(result.value.file, null);
  }
});

test("validateEvidenceInput accepts an allowed file and reports sniffed type", () => {
  const result = validateEvidenceInput({
    note: "",
    url: "",
    file: { name: "proof.png", size: PNG.length, bytes: PNG },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.file?.type, "image/png");
});

test("validateEvidenceInput rejects disallowed extension and oversize files", () => {
  const badExt = validateEvidenceInput({
    note: "",
    url: "",
    file: { name: "run.exe", size: PNG.length, bytes: PNG },
  });
  assert.equal(badExt.ok, false);
  if (!badExt.ok) assert.ok(badExt.errors.file);

  const big = new Uint8Array(MAX_EVIDENCE_FILE_BYTES + 1);
  big.set(PNG);
  const oversize = validateEvidenceInput({
    note: "",
    url: "",
    file: { name: "big.png", size: big.length, bytes: big },
  });
  assert.equal(oversize.ok, false);
  if (!oversize.ok) assert.ok(oversize.errors.file);
});
