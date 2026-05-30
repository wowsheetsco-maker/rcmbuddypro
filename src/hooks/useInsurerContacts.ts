import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InsurerContactRow {
  id: string;
  provider: string;
  contact_name: string;
  designation: string | null;
  email: string;
  cc_emails: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  notes: string | null;
  /** ISO YYYY-MM-DD; null when no contract end date is on file. */
  contract_expiry_date: string | null;
}

/**
 * Returns the number of whole days from today until `iso`. Negative when the
 * date is in the past. Returns `null` when `iso` is missing/invalid.
 *
 * Shared by the drawer, the TPA list badge, and any scheduler-facing logic so
 * the "renew soon" threshold stays consistent (60 days, see Notifications spec).
 */
export function daysUntilContractExpiry(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t - todayUtc) / 86_400_000);
}

export const CONTRACT_EXPIRY_WARN_DAYS = 60;

/** Hook over the editable insurer_contacts table. */
export function useInsurerContacts() {
  const [contacts, setContacts] = useState<InsurerContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("insurer_contacts")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("provider", { ascending: true });
    if (!error) setContacts((data ?? []) as InsurerContactRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { contacts, loading, reload: load };
}

/** Find the primary contact for a TPA / Insurer name (case-insensitive). */
export function findContactForProvider(
  contacts: InsurerContactRow[],
  provider: string,
): InsurerContactRow | undefined {
  if (!provider) return undefined;
  const needle = provider.toLowerCase().trim();
  // Exact match first
  const exact = contacts.find(
    (c) => c.provider.toLowerCase().trim() === needle,
  );
  if (exact) return exact;
  // Then partial both ways (matches "Star Health" against "Star Health and Allied Insurance Co. Ltd.")
  const firstWord = needle.split(/\s+/)[0];
  return contacts.find((c) => {
    const p = c.provider.toLowerCase();
    return (
      p.includes(needle) ||
      needle.includes(p) ||
      p.includes(firstWord)
    );
  });
}

/**
 * Server-driven contact lookup for a set of TPA / Insurer keys.
 * Returns a Map keyed by the ORIGINAL provider key (preserving caller casing)
 * → best matching contact (primary preferred).
 *
 * Match strategy mirrors `findContactForProvider`:
 *   1. case-insensitive exact match on `provider`
 *   2. partial overlap either direction
 *   3. shared first-word fallback
 *
 * Use this from bulk flows where some selected TPAs may not be on the
 * currently visible page (and therefore not in any in-memory list).
 */
export async function fetchContactsForProviders(
  providerKeys: string[],
): Promise<Map<string, InsurerContactRow>> {
  const out = new Map<string, InsurerContactRow>();
  const keys = Array.from(new Set(providerKeys.map((k) => k.trim()).filter(Boolean)));
  if (keys.length === 0) return out;

  // Build an `.or(...)` of ilike patterns + first-word ilikes; one round-trip.
  const escapeLike = (s: string) => s.replace(/[\\%_,()]/g, (m) => `\\${m}`);
  const patterns = new Set<string>();
  for (const k of keys) {
    const esc = escapeLike(k);
    patterns.add(`provider.ilike.%${esc}%`);
    const first = k.split(/\s+/)[0];
    if (first && first !== k) patterns.add(`provider.ilike.%${escapeLike(first)}%`);
  }
  const { data, error } = await supabase
    .from("insurer_contacts")
    .select("*")
    .or(Array.from(patterns).join(","))
    .order("is_primary", { ascending: false });
  if (error || !data) return out;
  const rows = data as InsurerContactRow[];
  for (const key of keys) {
    const match = findContactForProvider(rows, key);
    if (match) out.set(key, match);
  }
  return out;
}
