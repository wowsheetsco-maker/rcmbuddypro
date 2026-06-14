// PII redaction for outbound AI prompts (TanStack server-function side).
// Mirror of supabase/functions/_shared/redactPii.ts so server functions and
// edge functions share the same redaction rules.
//
// Strips Indian-specific identifiers before any text leaves our infra for an
// LLM. Conservative: redacts identifiers but keeps clinical context, claim
// numbers, amounts, and dates so prompts still produce useful output.

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
  out = out.replace(/\b(?=[A-Z0-9\/-]*[A-Z])(?=[A-Z0-9\/-]*\d)[A-Z0-9\/-]{10,24}\b/g, (m) => {
    if (m.startsWith("[")) return m;
    return "[MEMBER_ID]";
  });

  if (opts.redactNames) {
    out = out.replace(
      /\b(Patient|Name|Insured|Policy\s*Holder|Employee)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi,
      "$1: [NAME]",
    );
  }

  return out;
}

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
