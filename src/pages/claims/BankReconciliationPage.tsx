import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Sparkles, Search, Loader2, X, Save, RefreshCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  parseBankStatement, readBankStatementSheet, scoreMatches,
  type ColumnMapping, type ParsedBankRow, type MatchableClaim,
} from "@/lib/bankReconciliation";
import { buildAppealDraft } from "@/lib/claimAppeal";
import { useDqRules } from "@/hooks/useDqRules";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import type { Claim } from "@/data/mockClaims";

interface EntryRow {
  id: string;
  import_id: string;
  txn_date: string | null;
  amount: number;
  channel: string | null;
  utr_ref: string | null;
  narration: string;
  payer_hint: string | null;
  match_status: string;
  matched_claim_id: string | null;
  match_confidence: number;
  match_method: string | null;
}

interface ImportRow {
  id: string;
  file_name: string;
  bank_name: string | null;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  created_at: string;
}

interface AppealRow {
  id: string;
  claim_id: string;
  subject: string;
  body: string;
  gap_amount: number;
  gap_pct: number;
  band: string | null;
  status: string;
  created_at: string;
}

interface MappingRow {
  id: string;
  name: string;
  bank_name: string | null;
  header_row: number;
  column_map: ColumnMapping;
  is_default: boolean;
}

type MappingField = "txn_date" | "value_date" | "credit" | "debit" | "narration" | "ref" | "balance";
const MAPPING_FIELDS: { key: MappingField; label: string; required?: boolean }[] = [
  { key: "txn_date", label: "Transaction date", required: true },
  { key: "value_date", label: "Value date" },
  { key: "credit", label: "Credit amount", required: true },
  { key: "debit", label: "Debit amount" },
  { key: "narration", label: "Narration / description", required: true },
  { key: "ref", label: "Reference / UTR / Cheque" },
  { key: "balance", label: "Balance" },
];
const NONE = "__none__";

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function confBadge(c: number) {
  if (c >= 85) return { label: "HIGH", cls: "bg-success/15 text-success border-success/40" };
  if (c >= 70) return { label: "MED", cls: "bg-warning/15 text-warning border-warning/40" };
  return { label: "LOW", cls: "bg-muted text-muted-foreground border-border" };
}

function toMatchable(c: Claim): MatchableClaim {
  return {
    id: c.id,
    claim_number: c.claim_number,
    patient_name: c.patient_name,
    tpa_name: c.tpa_name,
    insurance_company_name: c.insurance_company_name,
    approved_amount: c.approved_amount,
    settled_amount: c.settled_amount,
    cheque_neft_utr_no: c.cheque_neft_utr_no,
    cheque_neft_utr_date: c.cheque_neft_utr_date,
    claim_status: c.claim_status,
  };
}

export default function BankReconciliationPage() {
  const { rules } = useDqRules();
  const { claims, loading: claimsLoading } = useLiveClaims();

  const [imports, setImports] = useState<ImportRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [activeImport, setActiveImport] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [secondPassRunning, setSecondPassRunning] = useState(false);

  // Staged upload (file picked, awaiting mapping confirmation)
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedHeaders, setStagedHeaders] = useState<string[]>([]);
  const [stagedPreview, setStagedPreview] = useState<Record<string, unknown>[]>([]);
  const [stagedMapping, setStagedMapping] = useState<ColumnMapping>({ header_row: 1 });
  const [selectedMappingId, setSelectedMappingId] = useState<string>("");
  const [saveMappingName, setSaveMappingName] = useState("");

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignSearch, setBulkAssignSearch] = useState("");

  const [assigningEntry, setAssigningEntry] = useState<EntryRow | null>(null);
  const [assignSearch, setAssignSearch] = useState("");

  const [appealOpen, setAppealOpen] = useState<AppealRow | null>(null);
  const [appealSaving, setAppealSaving] = useState(false);

  const loadImports = useCallback(async () => {
    const { data } = await supabase
      .from("bank_statement_imports")
      .select("id,file_name,bank_name,total_rows,matched_rows,unmatched_rows,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (rows.length > 0 && !activeImport) setActiveImport(rows[0].id);
  }, [activeImport]);

  const loadEntries = useCallback(async () => {
    if (!activeImport) { setEntries([]); return; }
    const { data } = await supabase
      .from("bank_statement_entries")
      .select("id,import_id,txn_date,amount,channel,utr_ref,narration,payer_hint,match_status,matched_claim_id,match_confidence,match_method")
      .eq("import_id", activeImport)
      .order("txn_date", { ascending: false });
    setEntries((data ?? []) as EntryRow[]);
    setSelectedIds(new Set());
  }, [activeImport]);

  const loadAppeals = useCallback(async () => {
    const { data } = await supabase
      .from("claim_appeals")
      .select("id,claim_id,subject,body,gap_amount,gap_pct,band,status,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setAppeals((data ?? []) as AppealRow[]);
  }, []);

  const loadMappings = useCallback(async () => {
    const { data } = await supabase
      .from("bank_statement_mappings")
      .select("id,name,bank_name,header_row,column_map,is_default")
      .order("created_at", { ascending: false });
    setMappings((data ?? []).map((m) => ({ ...m, column_map: (m.column_map ?? {}) as ColumnMapping })) as MappingRow[]);
  }, []);

  useEffect(() => { void loadImports(); }, [loadImports]);
  useEffect(() => { void loadEntries(); }, [loadEntries]);
  useEffect(() => { void loadAppeals(); }, [loadAppeals]);
  useEffect(() => { void loadMappings(); }, [loadMappings]);

  const matchableClaims = useMemo(() => claims.map(toMatchable), [claims]);
  const claimById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);

  // -------- Staging --------
  const onPickFile = useCallback(async (file: File) => {
    setStagedFile(file);
    // If a mapping is preselected, use its header row; else default to 1
    const preset = selectedMappingId ? mappings.find((m) => m.id === selectedMappingId) : null;
    const headerRow = preset?.header_row ?? 1;
    try {
      const { headers, preview } = await readBankStatementSheet(file, headerRow);
      setStagedHeaders(headers);
      setStagedPreview(preview);
      if (preset) {
        setStagedMapping({ ...preset.column_map, header_row: preset.header_row });
      } else {
        // Auto-detect by guessing first row
        setStagedMapping({ header_row: 1 });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read file";
      toast({ title: "Could not read file", description: msg, variant: "destructive" });
    }
  }, [mappings, selectedMappingId]);

  const refreshHeaders = useCallback(async (hr: number) => {
    if (!stagedFile) return;
    const { headers, preview } = await readBankStatementSheet(stagedFile, hr);
    setStagedHeaders(headers);
    setStagedPreview(preview);
  }, [stagedFile]);

  const onSaveMapping = useCallback(async () => {
    const name = saveMappingName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give this mapping a short name.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("bank_statement_mappings").insert({
      org_id: getCurrentOrgId(),
      name, bank_name: bankName || null,
      header_row: stagedMapping.header_row ?? 1,
      column_map: stagedMapping as never,
    });
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapping saved", description: `"${name}" can be reused next time.` });
    setSaveMappingName("");
    await loadMappings();
  }, [bankName, loadMappings, saveMappingName, stagedMapping]);

  const onDeleteMapping = useCallback(async (id: string) => {
    await supabase.from("bank_statement_mappings").delete().eq("id", id);
    if (selectedMappingId === id) setSelectedMappingId("");
    await loadMappings();
  }, [loadMappings, selectedMappingId]);

  const cancelStaged = () => {
    setStagedFile(null); setStagedHeaders([]); setStagedPreview([]);
    setStagedMapping({ header_row: 1 }); setSaveMappingName("");
  };

  // -------- Upload + match --------
  const onUpload = useCallback(async () => {
    if (!stagedFile) return;
    // Validate required mappings
    const missing = MAPPING_FIELDS.filter((f) => f.required && !stagedMapping[f.key]).map((f) => f.label);
    // Allow auto-detect fallback — just warn, don't block
    if (missing.length > 0) {
      // Try parsing anyway (parser auto-detects when not mapped)
    }
    setUploading(true);
    try {
      const parsed = await parseBankStatement(stagedFile, stagedMapping);
      if (parsed.length === 0) {
        toast({ title: "No rows parsed", description: "Check the header row and column mapping.", variant: "destructive" });
        return;
      }

      const orgId = getCurrentOrgId();
      const { data: importRow, error: importErr } = await supabase
        .from("bank_statement_imports")
        .insert({ org_id: orgId, file_name: stagedFile.name, bank_name: bankName || null, total_rows: parsed.length })
        .select("id").single();
      if (importErr || !importRow) throw importErr ?? new Error("Failed to create import");
      const importId = importRow.id as string;

      let matched = 0;
      const rows = parsed
        .filter((r) => r.txn_type !== "debit")
        .map((p: ParsedBankRow) => {
          const suggestions = scoreMatches(p, matchableClaims);
          const top = suggestions[0];
          const isMatch = top && top.confidence >= 85;
          if (isMatch) matched++;
          return {
            org_id: orgId, import_id: importId,
            txn_date: p.txn_date, value_date: p.value_date, amount: p.amount,
            txn_type: p.txn_type, channel: p.channel, utr_ref: p.utr_ref,
            narration: p.narration, payer_hint: p.payer_hint, balance: p.balance,
            raw: p.raw as never,
            match_status: isMatch ? "matched" : top ? "suggested" : "unmatched",
            matched_claim_id: top?.claim.id ?? null,
            match_confidence: top?.confidence ?? 0,
            match_method: top?.method ?? null,
          };
        });

      const { error: entErr } = await supabase.from("bank_statement_entries").insert(rows);
      if (entErr) throw entErr;

      await supabase.from("bank_statement_imports").update({
        total_rows: rows.length, matched_rows: matched, unmatched_rows: rows.length - matched,
      }).eq("id", importId);

      toast({ title: "Statement uploaded", description: `${rows.length} rows parsed · ${matched} auto-matched` });
      setActiveImport(importId);
      cancelStaged();
      setBankName("");
      await loadImports();
      await loadEntries();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [bankName, matchableClaims, loadImports, loadEntries, stagedFile, stagedMapping]);

  // -------- Second-pass matching --------
  const runSecondPass = useCallback(async () => {
    if (!activeImport) return;
    setSecondPassRunning(true);
    try {
      const unmatchedEntries = entries.filter((e) => e.match_status === "unmatched");
      let improved = 0;
      for (const e of unmatchedEntries) {
        const parsedish: ParsedBankRow = {
          txn_date: e.txn_date, value_date: null, amount: Number(e.amount), txn_type: "credit",
          channel: e.channel, utr_ref: e.utr_ref, narration: e.narration,
          payer_hint: e.payer_hint, balance: null, raw: {},
        };
        const suggestions = scoreMatches(parsedish, matchableClaims, { secondPass: true });
        const top = suggestions[0];
        if (!top) continue;
        const status = top.confidence >= 85 ? "matched" : "suggested";
        await supabase.from("bank_statement_entries").update({
          match_status: status,
          matched_claim_id: top.claim.id,
          match_confidence: top.confidence,
          match_method: top.method,
        }).eq("id", e.id);
        improved++;
      }
      toast({ title: "Second-pass complete", description: `Found suggestions for ${improved} of ${unmatchedEntries.length} unmatched rows.` });
      await loadEntries();
    } finally {
      setSecondPassRunning(false);
    }
  }, [activeImport, entries, matchableClaims, loadEntries]);

  // -------- Single match actions --------
  const onConfirmMatch = useCallback(async (entry: EntryRow, claimId: string, method: string, confidence: number) => {
    try {
      await supabase.from("bank_statement_entries")
        .update({ match_status: "matched", matched_claim_id: claimId, match_confidence: confidence, match_method: method })
        .eq("id", entry.id);
      await supabase.from("bank_reconciliation_matches").insert({
        org_id: getCurrentOrgId(), entry_id: entry.id, claim_id: claimId,
        method, confidence, decision: "confirmed",
      });
      toast({ title: "Match confirmed" });
      setAssigningEntry(null);
      void loadEntries();
    } catch (e) {
      toast({ title: "Could not confirm", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }, [loadEntries]);

  const onRejectMatch = useCallback(async (entry: EntryRow) => {
    try {
      await supabase.from("bank_statement_entries")
        .update({ match_status: "unmatched", matched_claim_id: null, match_confidence: 0, match_method: null })
        .eq("id", entry.id);
      await supabase.from("bank_reconciliation_matches").insert({
        org_id: getCurrentOrgId(), entry_id: entry.id, claim_id: entry.matched_claim_id,
        method: entry.match_method ?? "manual", confidence: entry.match_confidence, decision: "rejected",
      });
      toast({ title: "Match rejected" });
      void loadEntries();
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }, [loadEntries]);

  // -------- Bulk actions --------
  const bulkApprove = useCallback(async () => {
    const orgId = getCurrentOrgId();
    const targets = entries.filter((e) => selectedIds.has(e.id) && e.matched_claim_id);
    if (targets.length === 0) {
      toast({ title: "Nothing to approve", description: "Selected rows have no suggested claim.", variant: "destructive" });
      return;
    }
    const ids = targets.map((e) => e.id);
    await supabase.from("bank_statement_entries").update({ match_status: "matched" }).in("id", ids);
    await supabase.from("bank_reconciliation_matches").insert(
      targets.map((e) => ({
        org_id: orgId, entry_id: e.id, claim_id: e.matched_claim_id,
        method: e.match_method ?? "bulk", confidence: e.match_confidence, decision: "confirmed",
      })),
    );
    toast({ title: `${targets.length} matches confirmed` });
    void loadEntries();
  }, [entries, selectedIds, loadEntries]);

  const bulkReject = useCallback(async () => {
    const orgId = getCurrentOrgId();
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) return;
    const ids = targets.map((e) => e.id);
    await supabase.from("bank_statement_entries").update({
      match_status: "unmatched", matched_claim_id: null, match_confidence: 0, match_method: null,
    }).in("id", ids);
    await supabase.from("bank_reconciliation_matches").insert(
      targets.filter((e) => e.matched_claim_id).map((e) => ({
        org_id: orgId, entry_id: e.id, claim_id: e.matched_claim_id,
        method: e.match_method ?? "bulk", confidence: e.match_confidence, decision: "rejected",
      })),
    );
    toast({ title: `${targets.length} rows rejected` });
    void loadEntries();
  }, [entries, selectedIds, loadEntries]);

  const bulkAssignToClaim = useCallback(async (claimId: string) => {
    const orgId = getCurrentOrgId();
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) return;
    const ids = targets.map((e) => e.id);
    await supabase.from("bank_statement_entries").update({
      match_status: "matched", matched_claim_id: claimId, match_confidence: 100, match_method: "manual_bulk",
    }).in("id", ids);
    await supabase.from("bank_reconciliation_matches").insert(
      targets.map((e) => ({
        org_id: orgId, entry_id: e.id, claim_id: claimId,
        method: "manual_bulk", confidence: 100, decision: "confirmed",
      })),
    );
    toast({ title: `Assigned ${targets.length} entries to claim` });
    setBulkAssignOpen(false);
    void loadEntries();
  }, [entries, selectedIds, loadEntries]);

  // -------- Appeals --------
  const onGenerateAppeals = useCallback(async () => {
    if (!rules) return;
    const orgId = getCurrentOrgId();
    let created = 0;
    for (const c of claims) {
      const draft = buildAppealDraft({
        ...c, claim_number: c.claim_number, patient_name: c.patient_name, ihx_ref_id: c.ihx_ref_id,
        tpa_name: c.tpa_name, insurance_company_name: c.insurance_company_name, policy_number: c.policy_number,
        date_of_admission: c.date_of_admission, date_of_discharge: c.date_of_discharge,
        cheque_neft_utr_no: c.cheque_neft_utr_no, cheque_neft_utr_date: c.cheque_neft_utr_date,
        hospital_name: c.hospital_name,
      }, rules);
      if (!draft) continue;
      const { data: existing } = await supabase.from("claim_appeals").select("id").eq("claim_id", c.id).in("status", ["draft","approved"]).limit(1);
      if (existing && existing.length > 0) continue;
      await supabase.from("claim_appeals").insert({
        org_id: orgId, claim_id: c.id, gap_amount: draft.gap_amount, gap_pct: draft.gap_pct,
        band: draft.band, subject: draft.subject, body: draft.body, status: "draft", generated_by: "template",
      });
      created++;
    }
    toast({ title: `Generated ${created} appeal draft${created === 1 ? "" : "s"}` });
    void loadAppeals();
  }, [claims, rules, loadAppeals]);

  const saveAppeal = useCallback(async (appeal: AppealRow, status: "draft" | "approved") => {
    setAppealSaving(true);
    try {
      await supabase.from("claim_appeals").update({
        subject: appeal.subject, body: appeal.body, status,
      }).eq("id", appeal.id);
      toast({ title: status === "approved" ? "Approved" : "Saved" });
      setAppealOpen(null);
      void loadAppeals();
    } finally { setAppealSaving(false); }
  }, [loadAppeals]);

  // KPIs
  const kpis = useMemo(() => {
    const tot = entries.length;
    const m = entries.filter((e) => e.match_status === "matched").length;
    const s = entries.filter((e) => e.match_status === "suggested").length;
    const u = entries.filter((e) => e.match_status === "unmatched").length;
    const totalAmt = entries.reduce((a, e) => a + Number(e.amount || 0), 0);
    return { tot, m, s, u, totalAmt };
  }, [entries]);

  const reviewQueue = entries.filter((e) => e.match_status === "suggested");
  const unmatched = entries.filter((e) => e.match_status === "unmatched");
  const matchedList = entries.filter((e) => e.match_status === "matched");

  const filteredClaimsForAssign = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return claims.slice(0, 25);
    return claims.filter((c) =>
      c.claim_number?.toLowerCase().includes(q) ||
      c.patient_name?.toLowerCase().includes(q) ||
      c.tpa_name?.toLowerCase().includes(q) ||
      c.cheque_neft_utr_no?.toLowerCase().includes(q),
    ).slice(0, 25);
  }, [claims, assignSearch]);

  const filteredClaimsForBulk = useMemo(() => {
    const q = bulkAssignSearch.trim().toLowerCase();
    if (!q) return claims.slice(0, 25);
    return claims.filter((c) =>
      c.claim_number?.toLowerCase().includes(q) ||
      c.patient_name?.toLowerCase().includes(q) ||
      c.tpa_name?.toLowerCase().includes(q),
    ).slice(0, 25);
  }, [claims, bulkAssignSearch]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = (rows: EntryRow[]) => {
    const allSelected = rows.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bank Reconciliation & Appeals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload NEFT / RTGS / UPI statements, save reusable column mappings, auto-match to claims, and generate appeal drafts for short payments.
          </p>
        </div>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload bank statement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!stagedFile ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="bank">Bank (optional)</Label>
                  <Input id="bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" className="w-48" />
                </div>
                {mappings.length > 0 && (
                  <div className="space-y-1">
                    <Label>Use saved mapping</Label>
                    <Select value={selectedMappingId || NONE} onValueChange={(v) => setSelectedMappingId(v === NONE ? "" : v)}>
                      <SelectTrigger className="w-64"><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Auto-detect columns</SelectItem>
                        {mappings.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}{m.bank_name ? ` · ${m.bank_name}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="file">Statement file (.xlsx / .csv)</Label>
                  <Input id="file" type="file" accept=".xlsx,.xls,.csv" disabled={uploading || claimsLoading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickFile(f); e.currentTarget.value = ""; }} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                After picking a file you can confirm or adjust the column mapping, then save it for next time.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{stagedFile.name}</span>
                  <span className="text-muted-foreground ml-2">· {stagedHeaders.length} columns detected</span>
                </div>
                <Button size="sm" variant="ghost" onClick={cancelStaged}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>Header row</Label>
                  <Input type="number" min={1} max={20} value={stagedMapping.header_row ?? 1}
                    onChange={(e) => {
                      const hr = Math.max(1, Number(e.target.value || 1));
                      setStagedMapping((m) => ({ ...m, header_row: hr }));
                      void refreshHeaders(hr);
                    }} />
                </div>
                {MAPPING_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>
                      {f.label}
                      {f.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Select
                      value={stagedMapping[f.key] || NONE}
                      onValueChange={(v) => setStagedMapping((m) => ({ ...m, [f.key]: v === NONE ? undefined : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="— auto —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— auto —</SelectItem>
                        {stagedHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {stagedPreview.length > 0 && (
                <div className="border rounded overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>{stagedHeaders.map((h) => <th key={h} className="text-left px-2 py-1 font-medium whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {stagedPreview.map((r, i) => (
                        <tr key={i} className="border-t">
                          {stagedHeaders.map((h) => (
                            <td key={h} className="px-2 py-1 whitespace-nowrap text-muted-foreground">{String(r[h] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label>Save mapping as (optional)</Label>
                  <Input value={saveMappingName} onChange={(e) => setSaveMappingName(e.target.value)} placeholder="e.g. HDFC current account" />
                </div>
                <Button variant="outline" onClick={onSaveMapping} disabled={!saveMappingName.trim()}>
                  <Save className="h-4 w-4 mr-1" /> Save mapping
                </Button>
                <Button onClick={onUpload} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Upload & match
                </Button>
              </div>
            </div>
          )}

          {/* Saved mappings list */}
          {mappings.length > 0 && !stagedFile && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">Saved mappings</div>
              <div className="flex flex-wrap gap-2">
                {mappings.map((m) => (
                  <Badge key={m.id} variant="outline" className="gap-2 py-1 pl-2 pr-1">
                    {m.name}{m.bank_name ? ` · ${m.bank_name}` : ""}
                    <button onClick={() => void onDeleteMapping(m.id)} className="hover:bg-destructive/10 rounded p-0.5" aria-label="Delete mapping">
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import picker */}
      {imports.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Statement:</span>
          {imports.map((imp) => (
            <Button key={imp.id} size="sm" variant={activeImport === imp.id ? "default" : "outline"} onClick={() => setActiveImport(imp.id)}>
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              {imp.bank_name ? `${imp.bank_name} · ` : ""}{imp.file_name}
              <Badge variant="secondary" className="ml-2">{imp.matched_rows}/{imp.total_rows}</Badge>
            </Button>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total rows" value={kpis.tot} />
        <KpiCard label="Auto-matched" value={kpis.m} tone="success" />
        <KpiCard label="Needs review" value={kpis.s} tone="warning" />
        <KpiCard label="Unmatched" value={kpis.u} tone="destructive" />
        <KpiCard label="Total credits" value={inr(kpis.totalAmt)} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{selectedIds.size} row{selectedIds.size === 1 ? "" : "s"} selected</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={bulkApprove}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve suggested</Button>
              <Button size="sm" variant="outline" onClick={() => { setBulkAssignOpen(true); setBulkAssignSearch(""); }}>
                <Search className="h-4 w-4 mr-1" /> Assign all to claim…
              </Button>
              <Button size="sm" variant="ghost" onClick={bulkReject}>Reject / unmatch</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Review ({reviewQueue.length})</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched ({unmatched.length})</TabsTrigger>
          <TabsTrigger value="matched">Matched ({matchedList.length})</TabsTrigger>
          <TabsTrigger value="appeals">
            <Sparkles className="h-3 w-3 mr-1" /> Appeals ({appeals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4">
          <EntryTable
            rows={reviewQueue}
            claimById={claimById}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={() => toggleSelectAll(reviewQueue)}
            emptyMsg="No suggested matches to review."
            renderActions={(e) => (
              <div className="flex gap-1 justify-end">
                {e.matched_claim_id && (
                  <Button size="sm" variant="default" onClick={() => onConfirmMatch(e, e.matched_claim_id!, e.match_method ?? "manual", e.match_confidence)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setAssigningEntry(e); setAssignSearch(""); }}>
                  <Search className="h-3 w-3 mr-1" /> Reassign
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRejectMatch(e)}>Reject</Button>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="unmatched" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Run a second-pass with looser amount tolerance and payer-name normalization to surface more candidates.</p>
            <Button size="sm" variant="outline" onClick={runSecondPass} disabled={secondPassRunning || unmatched.length === 0}>
              {secondPassRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
              Run second-pass matcher
            </Button>
          </div>
          <EntryTable
            rows={unmatched}
            claimById={claimById}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={() => toggleSelectAll(unmatched)}
            emptyMsg="Nothing unmatched — all entries are matched or reviewed."
            renderActions={(e) => (
              <Button size="sm" variant="outline" onClick={() => { setAssigningEntry(e); setAssignSearch(""); }}>
                <Search className="h-3 w-3 mr-1" /> Assign claim
              </Button>
            )}
          />
        </TabsContent>

        <TabsContent value="matched" className="mt-4">
          <EntryTable
            rows={matchedList}
            claimById={claimById}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={() => toggleSelectAll(matchedList)}
            emptyMsg="No matches yet — upload a statement to begin."
            renderActions={(e) => (
              <Button size="sm" variant="ghost" onClick={() => onRejectMatch(e)}>Unmatch</Button>
            )}
          />
        </TabsContent>

        <TabsContent value="appeals" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Drafts auto-generated from claims with Approved &gt; (Settled + TDS) gap.</p>
            <Button onClick={onGenerateAppeals} disabled={claimsLoading || !rules}>
              <Sparkles className="h-4 w-4 mr-1" /> Generate drafts for short payments
            </Button>
          </div>
          {appeals.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No appeals yet. Click "Generate drafts" to scan settled claims.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {appeals.map((a) => {
                const claim = claimById.get(a.claim_id);
                return (
                  <Card key={a.id} className="hover:bg-muted/30 transition">
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{a.subject}</span>
                          <Badge variant="outline" className={a.band === "high" ? "border-destructive/40 text-destructive" : a.band === "medium" ? "border-warning/40 text-warning" : ""}>
                            {a.band?.toUpperCase() ?? "—"}
                          </Badge>
                          <Badge variant={a.status === "approved" ? "default" : "secondary"}>{a.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {claim?.patient_name ?? "—"} · {claim?.tpa_name ?? "—"} · Gap {inr(a.gap_amount)} ({a.gap_pct.toFixed(1)}%)
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setAppealOpen(a)}>Edit</Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Single reassign dialog */}
      <Dialog open={!!assigningEntry} onOpenChange={(o) => !o && setAssigningEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign entry to claim</DialogTitle></DialogHeader>
          {assigningEntry && (
            <div className="space-y-3">
              <div className="text-xs bg-muted/50 rounded p-2 space-y-0.5">
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium">{inr(assigningEntry.amount)}</span></div>
                <div><span className="text-muted-foreground">UTR:</span> {assigningEntry.utr_ref ?? "—"}</div>
                <div><span className="text-muted-foreground">Narration:</span> {assigningEntry.narration}</div>
              </div>
              <Input placeholder="Search by claim #, patient, TPA, UTR…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
              <div className="max-h-80 overflow-y-auto border rounded divide-y">
                {filteredClaimsForAssign.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">No matches.</p>
                ) : filteredClaimsForAssign.map((c) => (
                  <button key={c.id} className="w-full text-left p-3 hover:bg-muted/50 transition text-sm"
                    onClick={() => onConfirmMatch(assigningEntry, c.id, "manual", 100)}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{c.claim_number}</span>
                      <span className="text-muted-foreground">{inr(Number(c.settled_amount || c.approved_amount || 0))}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.patient_name} · {c.tpa_name ?? "—"}{c.cheque_neft_utr_no ? ` · UTR ${c.cheque_neft_utr_no}` : ""}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk assign dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign {selectedIds.size} entries to one claim</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">All selected entries will be matched to the claim you pick below. Useful for split payments across one settlement.</p>
            <Input placeholder="Search by claim #, patient, TPA…" value={bulkAssignSearch} onChange={(e) => setBulkAssignSearch(e.target.value)} />
            <div className="max-h-80 overflow-y-auto border rounded divide-y">
              {filteredClaimsForBulk.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No matches.</p>
              ) : filteredClaimsForBulk.map((c) => (
                <button key={c.id} className="w-full text-left p-3 hover:bg-muted/50 transition text-sm"
                  onClick={() => bulkAssignToClaim(c.id)}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{c.claim_number}</span>
                    <span className="text-muted-foreground">{inr(Number(c.settled_amount || c.approved_amount || 0))}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.patient_name} · {c.tpa_name ?? "—"}</div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appeal editor */}
      <Dialog open={!!appealOpen} onOpenChange={(o) => !o && setAppealOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Edit appeal draft</DialogTitle></DialogHeader>
          {appealOpen && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input value={appealOpen.subject} onChange={(e) => setAppealOpen({ ...appealOpen, subject: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Body</Label>
                <Textarea rows={18} value={appealOpen.body} onChange={(e) => setAppealOpen({ ...appealOpen, body: e.target.value })} className="font-mono text-xs" />
              </div>
              <div className="text-xs text-muted-foreground">
                Gap: <strong>{inr(appealOpen.gap_amount)}</strong> ({appealOpen.gap_pct.toFixed(1)}%) · Status: {appealOpen.status}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAppealOpen(null)} disabled={appealSaving}><X className="h-4 w-4 mr-1" /> Close</Button>
            {appealOpen && (
              <>
                <Button variant="outline" onClick={() => saveAppeal(appealOpen, "draft")} disabled={appealSaving}>Save draft</Button>
                <Button onClick={() => saveAppeal(appealOpen, "approved")} disabled={appealSaving}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" | "destructive" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-xl font-bold mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EntryTable({
  rows, claimById, emptyMsg, renderActions, selectedIds, onToggle, onToggleAll,
}: {
  rows: EntryRow[];
  claimById: Map<string, Claim>;
  emptyMsg: string;
  renderActions: (e: EntryRow) => React.ReactNode;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  if (rows.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{emptyMsg}</CardContent></Card>;
  }
  const allSelected = rows.every((r) => selectedIds.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selectedIds.has(r.id));
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-3 py-2 w-8">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={() => onToggleAll()}
                    aria-label="Select all rows"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Channel</th>
                <th className="text-left px-3 py-2 font-medium">UTR / Ref</th>
                <th className="text-left px-3 py-2 font-medium">Narration</th>
                <th className="text-left px-3 py-2 font-medium">Suggested claim</th>
                <th className="text-right px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const claim = e.matched_claim_id ? claimById.get(e.matched_claim_id) : null;
                const c = confBadge(e.match_confidence);
                const checked = selectedIds.has(e.id);
                return (
                  <tr key={e.id} className={`border-b hover:bg-muted/30 ${checked ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2">
                      <Checkbox checked={checked} onCheckedChange={() => onToggle(e.id)} aria-label="Select row" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.txn_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{inr(Number(e.amount || 0))}</td>
                    <td className="px-3 py-2">{e.channel ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.utr_ref ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate text-xs text-muted-foreground" title={e.narration}>{e.narration}</td>
                    <td className="px-3 py-2">
                      {claim ? (
                        <div className="text-xs">
                          <div className="font-medium">{claim.claim_number}</div>
                          <div className="text-muted-foreground truncate max-w-[200px]">{claim.patient_name} · {claim.tpa_name ?? "—"}</div>
                        </div>
                      ) : <span className="text-muted-foreground text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No match</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {e.match_confidence > 0 ? <Badge variant="outline" className={c.cls}>{c.label} {e.match_confidence}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{renderActions(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
