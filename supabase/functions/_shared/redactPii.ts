// PII redaction for outbound AI prompts.
// Strips Indian-specific identifiers before any text leaves our infra for an
// LLM. Conservative: redacts identifiers but keeps clinical context, claim
// numbers, amounts, dates, and free-text remarks so prompts still produce
// useful output.
//
// Replacements use stable tokens so the same email/phone in the same prompt
// becomes the same placeholder (the model can still reason about coreference).
//
// What is redacted:
//  - Email addresses           -> [EMAIL_n]
//  - Indian phone numbers      -> [PHONE_n]    (10-digit, optional +91)
//  - Aadhaar (12 digits)       -> [AADHAAR]
//  - PAN (AAAAA9999A)          -> [PAN]
//  - UTR / NEFT / IFSC patterns-> [UTR] / [IFSC]
//  - Long member/policy IDs    -> [MEMBER_ID]  (>=10 alnum, mixed)
//
// What is NOT redacted (intentionally):
//  - Patient names (clinical context needed in appeal letters / discharge)
//  - Claim numbers (needed for context)
//  - Diagnoses, ICD codes, amounts, dates

export interface RedactOptions {
  /** When true, also redact 4+ char tokens that look like patient names. Off by default. */
  redactNames?: boolean;
}

export function redactPii(input: string, opts: RedactOptions = {}): string {
  if (!input) return input;
  let out = input;

  // Email
  let emailIdx = 0;
  const emails = new Map<string, string>();
  out = out.replace(
    /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi,
    (m) => {
      const key = m.toLowerCase();
      if (!emails.has(key)) emails.set(key, `[EMAIL_${++emailIdx}]`);
      return emails.get(key)!;
    },
  );

  // Indian phone: +91, 91, 0 prefix optional, 10-digit starting 6-9
  let phoneIdx = 0;
  const phones = new Map<string, string>();
  out = out.replace(
    /(?:\+?91[\s\-]?|0)?[6-9]\d{9}\b/g,
    (m) => {
      const key = m.replace(/\D/g, "").slice(-10);
      if (!phones.has(key)) phones.set(key, `[PHONE_${++phoneIdx}]`);
      return phones.get(key)!;
    },
  );

  // Aadhaar — 12 digits, optionally space/dash separated (4-4-4)
  out = out.replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, "[AADHAAR]");

  // PAN — 5 letters + 4 digits + 1 letter
  out = out.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[PAN]");

  // IFSC — 4 letters + 0 + 6 alnum
  out = out.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "[IFSC]");

  // UTR / NEFT reference — labelled
  out = out.replace(
    /\b(UTR|NEFT|RTGS|IMPS|REF)[\s:#\-]*([A-Z0-9]{10,22})\b/gi,
    "$1: [UTR]",
  );

  // Long alphanumeric IDs that look like policy / member numbers
  // (10-20 chars, must contain both letters and digits, avoid pure-digit
  // claim numbers which we want to keep).
  out = out.replace(/\b(?=[A-Z0-9\/-]*[A-Z])(?=[A-Z0-9\/-]*\d)[A-Z0-9\/-]{10,24}\b/g, (m) => {
    // Skip our own placeholders
    if (m.startsWith("[")) return m;
    return "[MEMBER_ID]";
  });

  if (opts.redactNames) {
    // Very conservative name redactor: "Name: Foo Bar" or "Patient: Foo Bar"
    out = out.replace(
      /\b(Patient|Name|Insured|Policy\s*Holder|Employee)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi,
      "$1: [NAME]",
    );
  }

  return out;
}

/** Recursively redact every string field in a plain JSON-shaped object. */
export function redactPiiDeep<T>(value: T, opts: RedactOptions = {}): T {
  if (typeof value === "string") return redactPii(value, opts) as T;
  if (Array.isArray(value)) return value.map((v) => redactPiiDeep(v, opts)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactPiiDeep(v, opts);
    }
    return out as T;
  }
  return value;
}
