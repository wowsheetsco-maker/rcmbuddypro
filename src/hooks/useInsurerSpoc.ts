import { useMemo } from "react";
import { insurerProfiles, type InsurerProfile, type EscalationContact } from "@/data/insurerProfiles";

export interface ResolvedSpoc {
  /** Display string (Name · Phone · Email) safe to write into a free-text field. */
  display: string;
  name: string;
  email: string;
  phone: string;
  designation?: string;
}

export interface SpocResolution {
  /** Matched provider profile, if any. */
  profile: InsurerProfile | null;
  /** L1 escalation contact = TPA SPOC. */
  tpaSpoc: ResolvedSpoc | null;
  /** L2 escalation (used as CC when sending mail). */
  tpaSpocL2: ResolvedSpoc | null;
  /** Hospital-side SPOC stored on the profile. */
  hospitalSpoc: ResolvedSpoc | null;
}

function fmt(name: string, phone: string, email: string): string {
  return [name, phone, email].filter(Boolean).join(" · ");
}

function fromEscalation(e: EscalationContact | undefined): ResolvedSpoc | null {
  if (!e) return null;
  return {
    name: e.name,
    email: e.email,
    phone: e.phone,
    designation: e.designation,
    display: fmt(e.name, e.phone, e.email),
  };
}

/** Lookup an insurer/TPA profile by either tpa_name or insurance_company_name. */
function findProfile(
  tpaName: string | null | undefined,
  insurerName: string | null | undefined,
): InsurerProfile | null {
  const candidates = [tpaName, insurerName]
    .map((v) => (v ?? "").toLowerCase().trim())
    .filter(Boolean);
  if (candidates.length === 0) return null;

  for (const needle of candidates) {
    const exact = insurerProfiles.find((p) => p.name.toLowerCase().trim() === needle);
    if (exact) return exact;
  }
  // Partial match — handle "Star Health" vs "Star Health and Allied Insurance Co Ltd"
  for (const needle of candidates) {
    const firstWord = needle.split(/\s+/)[0];
    const partial = insurerProfiles.find((p) => {
      const n = p.name.toLowerCase();
      return n.includes(needle) || needle.includes(n) || n.includes(firstWord);
    });
    if (partial) return partial;
  }
  return null;
}

/**
 * Resolve TPA SPOC + Hospital SPOC for a given claim's TPA / insurer names
 * by looking up the master InsurerProfile data (escalation matrix + hospitalSpoc).
 */
export function useInsurerSpoc(
  tpaName: string | null | undefined,
  insurerName: string | null | undefined,
): SpocResolution {
  return useMemo(() => {
    const profile = findProfile(tpaName, insurerName);
    if (!profile) {
      return { profile: null, tpaSpoc: null, tpaSpocL2: null, hospitalSpoc: null };
    }
    const l1 = profile.escalationMatrix.find((e) => e.level === "L1");
    const l2 = profile.escalationMatrix.find((e) => e.level === "L2");
    const hSpoc = profile.hospitalSpoc
      ? {
          name: profile.hospitalSpoc.name,
          email: profile.hospitalSpoc.email,
          phone: profile.hospitalSpoc.phone,
          designation: profile.hospitalSpoc.role,
          display: fmt(profile.hospitalSpoc.name, profile.hospitalSpoc.phone, profile.hospitalSpoc.email),
        }
      : null;
    return {
      profile,
      tpaSpoc: fromEscalation(l1),
      tpaSpocL2: fromEscalation(l2),
      hospitalSpoc: hSpoc,
    };
  }, [tpaName, insurerName]);
}
