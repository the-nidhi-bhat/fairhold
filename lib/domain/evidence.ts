/**
 * Evidence validation — pure and dependency-free so it can be unit-tested and
 * reused on the server. All client-supplied values are treated as untrusted:
 * URLs are restricted to http/https, file names are sanitized, and file types
 * are decided from the bytes (magic numbers), never from the client-provided
 * name or MIME type.
 */
import type { ValidationResult } from "./validation";

export const EVIDENCE_NOTE_MAX = 1000;
export const EVIDENCE_URL_MAX = 500;
export const MAX_EVIDENCE_FILE_BYTES = 3_000_000;
export const ALLOWED_URL_SCHEMES = ["http:", "https:"] as const;
export const ALLOWED_FILE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "txt",
  "md",
  "csv",
] as const;

export interface EvidenceFileInput {
  name: string;
  size: number;
  /** Raw bytes, used only to sniff the real content type. */
  bytes: Uint8Array;
}

export interface EvidenceFormValues {
  note: string;
  url: string | null;
  file: (EvidenceFileInput & { type: string }) | null;
}

/** Map of byte offset to expected byte, describing each supported format. */
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

/**
 * Detect an allowed content type from the leading bytes. Returns null for
 * anything that is not an allowed image, PDF, or plain-text file.
 */
export function sniffFileType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (looksLikeText(bytes)) return "text/plain";
  return null;
}

/**
 * Heuristic "is this text?": no NUL bytes and no unexpected control bytes in
 * the first kilobyte. Deliberately conservative.
 */
function looksLikeText(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024);
  if (limit === 0) return false;
  for (let i = 0; i < limit; i += 1) {
    const b = bytes[i];
    const allowedControl = b === 0x09 || b === 0x0a || b === 0x0d;
    if (b < 0x20 && !allowedControl) return false;
  }
  return true;
}

/** Strip any path components and unsafe characters from a display name. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "evidence";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return (cleaned || "evidence").slice(0, 100);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Validate and normalize a single URL field. Empty string means "no URL". */
export function validateEvidenceUrl(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const text = String(raw).trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > EVIDENCE_URL_MAX) {
    return { ok: false, error: `URL must be ${EVIDENCE_URL_MAX} characters or fewer.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: "Enter a valid URL (including http:// or https://)." };
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol as (typeof ALLOWED_URL_SCHEMES)[number])) {
    return { ok: false, error: "Only http and https URLs are allowed." };
  }
  return { ok: true, value: parsed.toString() };
}

/**
 * Validate the whole evidence submission. The caller passes raw values from a
 * FormData (or an explicit `null` file). At least one of note, url, or file is
 * required.
 */
export function validateEvidenceInput(raw: {
  note: unknown;
  url: unknown;
  file: EvidenceFileInput | null | undefined;
}): ValidationResult<EvidenceFormValues> {
  const errors: Record<string, string> = {};

  const note = raw.note === undefined || raw.note === null ? "" : String(raw.note).trim();
  if (note.length > EVIDENCE_NOTE_MAX) {
    errors.note = `Note must be ${EVIDENCE_NOTE_MAX} characters or fewer.`;
  }

  const urlResult = validateEvidenceUrl(raw.url);
  const url = urlResult.ok ? urlResult.value : null;
  if (!urlResult.ok) errors.url = urlResult.error;

  let file: (EvidenceFileInput & { type: string }) | null = null;
  if (raw.file) {
    const { name, size, bytes } = raw.file;
    const ext = extensionOf(name);
    const sniffed = sniffFileType(bytes);
    if (size <= 0 || bytes.length === 0) {
      errors.file = "The file appears to be empty.";
    } else if (size > MAX_EVIDENCE_FILE_BYTES) {
      errors.file = `Files must be ${MAX_EVIDENCE_FILE_BYTES / 1_000_000} MB or smaller.`;
    } else if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
      errors.file = `File type .${ext || "?"} is not allowed. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(", ")}.`;
    } else if (sniffed === null) {
      errors.file = "File contents do not match an allowed image, PDF, or text file.";
    } else {
      file = { name: sanitizeFileName(name), size, bytes, type: sniffed };
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (note === "" && !url && !file) {
    return { ok: false, errors: { _form: "Provide a note, a URL, or a file." } };
  }
  return { ok: true, value: { note, url, file } };
}
