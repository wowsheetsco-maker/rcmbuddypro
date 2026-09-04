import { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ShieldAlert,
  Copy as CopyIcon,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  parseClaimsFile,
  enrichRowsWithBranchIds,
  type ParseResult,
  type ClaimUpsertRow,
} from "@/lib/claimsImport";
import { bumpHospitalsVersion } from "@/hooks/useHospitals";
import {
  validateStructure,
  scoreMany,
  summarise,
  type DqResult,
} from "@/lib/dataQualityEngine";
import { useDqRules } from "@/hooks/useDqRules";
import DataQualitySummaryCard from "@/components/DataQualitySummaryCard";
import { bumpClaimsVersion } from "@/hooks/useLiveClaims";
import { classifyAll, BUCKET_LABELS, type QualityClassification } from "@/lib/claimQualityRules";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import FieldMappingWizard, { ReadinessBadge } from "@/components/import/FieldMappingWizard";
import { effectiveMapping } from "@/lib/himsFieldMapping";
import { Wand2 } from "lucide-react";

interface ImportSnapshot {
  inserted_claim_numbers: string[];
  updated_previous: Record<string, unknown>[];
}

interface ImportHistoryRow {
  id: string;
  file_name: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  inserted_rows: number;
  updated_rows: number;
  status: string;
  error_summary: string | null;
  created_at: string;
  snapshot: ImportSnapshot | null;
  reverted_at: string | null;
}

const BATCH_SIZE = 500;
const PARALLEL_BATCHES = 4; // upsert this many batches concurrently

export default function ImportClaimsPage() {
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);
  const [structuralBlock, setStructuralBlock] = useState<{
    missing: string[];
    duplicates: string[];
  } | null>(null);
  const [dqResults, setDqResults] = useState<DqResult[] | null>(null);
  const [duplicateBlock, setDuplicateBlock] = useState<{
    groups: { normalized: string; rows: { row: number; raw: string }[] }[];
  } | null>(null);
  const [qc, setQc] = useState<QualityClassification | null>(null);
  const [skipQc, setSkipQc] = useState(false);
  // Fresh sheet = fresh dataset: wipe the previous claim list so QC, outstanding
  // and denial numbers are computed from this sheet only.
  const [replaceAll, setReplaceAll] = useState(true);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [overrideMap, setOverrideMap] = useState<Record<string, keyof import("@/lib/claimsImport").ClaimUpsertRow> | null>(() => {
    if (typeof window === "undefined") return null;
    try { const raw = localStorage.getItem("rcm.himsMapping"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { rules: dqRules } = useDqRules();

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from("import_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setHistory(data as ImportHistoryRow[]);
  };

  const [reverting, setReverting] = useState<string | null>(null);

  // Index of the most recent revertible import. Only the latest non-reverted
  // import that has a snapshot can be undone — older ones may have been
  // partially overwritten by subsequent imports.
  const latestRevertibleId = useMemo(() => {
    const candidate = history.find(
      (h) => h.snapshot && !h.reverted_at && (h.inserted_rows > 0 || h.updated_rows > 0),
    );
    return candidate?.id ?? null;
  }, [history]);

  const handleRevert = async (imp: ImportHistoryRow) => {
    if (!imp.snapshot) return;
    const { inserted_claim_numbers = [], updated_previous = [] } = imp.snapshot;
    const totalAffected = inserted_claim_numbers.length + updated_previous.length;
    const ok = window.confirm(
      `Undo import "${imp.file_name}"?\n\n` +
        `• ${inserted_claim_numbers.length} newly added claim${inserted_claim_numbers.length === 1 ? "" : "s"} will be deleted\n` +
        `• ${updated_previous.length} updated claim${updated_previous.length === 1 ? "" : "s"} will be restored to previous values\n\n` +
        `Total affected: ${totalAffected}. This cannot be undone.`,
    );
    if (!ok) return;

    setReverting(imp.id);
    try {
      const { getCurrentOrgId } = await import("@/lib/currentOrg");
      const orgId = getCurrentOrgId();

      // 1. Delete newly inserted claims (in chunks)
      for (let i = 0; i < inserted_claim_numbers.length; i += 500) {
        const chunk = inserted_claim_numbers.slice(i, i + 500);
        const { error } = await supabase
          .from("claims")
          .delete()
          .eq("org_id", orgId)
          .in("claim_number", chunk);
        if (error) throw error;
      }

      // 2. Restore previous values for updated claims (upsert prior snapshot)
      if (updated_previous.length > 0) {
        for (let i = 0; i < updated_previous.length; i += 500) {
          const chunk = updated_previous.slice(i, i + 500);
          const { error } = await supabase
            .from("claims")
            .upsert(chunk as unknown as never, { onConflict: "org_id,claim_number" });
          if (error) throw error;
        }
      }

      // 3. Mark history row as reverted
      await supabase
        .from("import_history")
        .update({
          reverted_at: new Date().toISOString(),
          status: "reverted",
        })
        .eq("id", imp.id);

      bumpClaimsVersion();
      bumpHospitalsVersion();
      toast.success(
        `Reverted import — removed ${inserted_claim_numbers.length}, restored ${updated_previous.length}`,
      );
      loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Revert failed";
      toast.error(msg);
    } finally {
      setReverting(null);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);




  const handleFile = async (file: File, opts?: { override?: Record<string, keyof import("@/lib/claimsImport").ClaimUpsertRow> | null }) => {
    setParsing(true);
    setParseResult(null);
    setStructuralBlock(null);
    setDqResults(null);
    setDuplicateBlock(null);
    setQc(null);
    setFileName(file.name);
    setLastFile(file);
    const activeOverride = opts?.override !== undefined ? opts.override : overrideMap;
    try {
      const result = await parseClaimsFile(file, activeOverride ?? undefined);
      setQc(classifyAll(result.rows));

      // 🔵 LAYER 1 — structural gate. When the user has an override mapping,
      // skip this rigid check (the wizard already enforces required fields).
      if (!activeOverride) {
        const struct = validateStructure(result.detectedHeaders);
        if (!struct.ok) {
          setStructuralBlock({
            missing: struct.missing,
            duplicates: struct.duplicateHeaders,
          });
          setParseResult(result);
          toast.error(
            `File rejected — ${struct.missing.length > 0 ? `missing column(s): ${struct.missing.join(", ")}` : `duplicate header(s): ${struct.duplicateHeaders.join(", ")}`}. Try the Field Mapping Wizard.`,
          );
          return;
        }
      }

      // 🟡 LAYER 1.5 — duplicate claim_number detection (informational only)
      // Per user preference: do not block uploads. In-file duplicates are
      // auto-merged in commitImport (latest occurrence wins). Surface a warning
      // card so the user can review which claim numbers were collapsed.
      const dupGroups = findDuplicateClaimNumbers(result.rows);
      if (dupGroups.length > 0) {
        setDuplicateBlock({ groups: dupGroups });
        const total = dupGroups.reduce((s, g) => s + g.rows.length, 0);
        toast.warning(
          `${dupGroups.length} duplicated claim number${dupGroups.length === 1 ? "" : "s"} (${total} rows) will be merged — latest row kept.`,
        );
      }

      // 🟢🟠🔴 Layers 2-4 — score every parsed row
      const scored = scoreMany(result.rows, dqRules);
      setDqResults(scored);
      setParseResult(result);

      if (result.rows.length === 0 && result.errors.length === 0) {
        toast.warning("No data rows found in the file");
      } else if (result.errors.length > 0) {
        toast.warning(
          `Parsed with ${result.errors.length} validation issue${result.errors.length === 1 ? "" : "s"}`,
        );
      } else {
        toast.success(`Parsed ${result.rows.length} rows · DQ scored`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse file";
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = ""; // allow re-selecting same file
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setParseResult(null);
    setFileName("");
    setStructuralBlock(null);
    setDqResults(null);
    setDuplicateBlock(null);
    setQc(null);
  };

  const commitImport = async () => {
    if (!parseResult || parseResult.rows.length === 0) return;
    if (structuralBlock) return;

    setImporting(true);

    try {
      let workingRows = parseResult.rows;
      let workingDq = dqResults ?? [];
      let qcRemoved = 0;

      if (qc && !skipQc && qc.removeIndices.length > 0) {
        const drop = new Set(qc.removeIndices);
        workingRows = parseResult.rows.filter((_, i) => !drop.has(i));
        workingDq = (dqResults ?? []).filter((_, i) => !drop.has(i));
        qcRemoved = qc.removeIndices.length;
      }

      const { getCurrentOrgId } = await import("@/lib/currentOrg");
      const _orgId = getCurrentOrgId();

      // Team-entered workflow notes must survive any re-upload. Snapshot them
      // (keyed by claim number) BEFORE anything is deleted or upserted.
      const NOTE_FIELDS = [
        "tpa_spoc",
        "hospital_spoc",
        "last_communication_at",
        "last_communication_note",
        "remarks",
        "action_plan",
      ] as const;
      const retainedNotes = new Map<string, Record<string, unknown>>();
      {
        let from = 0;
        const PAGE = 1000;
        for (;;) {
          const { data, error } = await supabase
            .from("claims")
            .select("claim_number,tpa_spoc,hospital_spoc,last_communication_at,last_communication_note,remarks,action_plan")
            .eq("org_id", _orgId)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          (data ?? []).forEach((r) => {
            if (r.claim_number) retainedNotes.set(r.claim_number, r as Record<string, unknown>);
          });
          if (!data || data.length < PAGE) break;
          from += PAGE;
        }
      }

      // Fresh-sheet mode: remove the previous claim list entirely so output, QC,
      // outstanding and denial calculations use only this sheet.
      let purged = 0;
      if (replaceAll) {
        const { count: prevCount } = await supabase
          .from("claims")
          .select("claim_number", { count: "exact", head: true })
          .eq("org_id", _orgId);
        const { error: delErr } = await supabase
          .from("claims")
          .delete()
          .eq("org_id", _orgId);
        if (delErr) throw delErr;
        purged = prevCount ?? 0;
      }


      const branchSummary = await enrichRowsWithBranchIds(workingRows);


      const allClaimNumbers = workingRows.map((r) => r.claim_number).filter(Boolean);
      const existingByClaim = new Map<string, Record<string, unknown>>();
      const preChunks: string[][] = [];
      for (let i = 0; i < allClaimNumbers.length; i += 500) {
        preChunks.push(allClaimNumbers.slice(i, i + 500));
      }

      const preResults = await Promise.all(
        preChunks.map((chunk) =>
          supabase
            .from("claims")
            .select("*")
            .eq("org_id", _orgId)
            .in("claim_number", chunk),
        ),
      );

      for (const { data, error } of preResults) {
        if (error) throw error;
        data?.forEach((r) => existingByClaim.set(r.claim_number, r));
      }

      const existing = new Set<string>(existingByClaim.keys());
      const PROTECTED_FIELDS: string[] = [
        "ihx_ref_id", "hospital_name", "patient_name", "patient_contact",
        "in_patient_number", "member_customer_id", "date_of_admission",
        "date_of_discharge", "tpa_name", "insurance_company_name",
        "policy_number", "claim_number", "initial_claim_number",
        "claim_creation_date", "claimed_amount", "approved_amount", "copay",
        "shortfall_amount", "hospital_discount", "patient_paid_amount",
        "settled_amount", "tds_amount", "cheque_neft_utr_no",
        "cheque_neft_utr_date", "receipt_no", "claim_status",
        "doc_submission_date", "payment_update_date", "treatment", "diagnosis",
        "policy_type", "policy_holder_name", "employee_code", "insurer_comments",
        "hospital_group_id", "hospital_branch_id",
      ];

      const isBlank = (v: unknown) =>
        v === null || v === undefined || (typeof v === "string" && v.trim() === "");

      let blanksProtected = 0;
      let notesRetained = 0;
      const mergeWithExisting = <T extends Record<string, unknown>>(incoming: T): T => {
        const prev = existingByClaim.get(incoming.claim_number as string);
        const notes = retainedNotes.get(incoming.claim_number as string);
        if (!prev && !notes) return incoming;
        const merged: Record<string, unknown> = { ...incoming };
        if (prev) {
          for (const f of PROTECTED_FIELDS) {
            if (isBlank(merged[f]) && !isBlank(prev[f])) {
              merged[f] = prev[f];
              blanksProtected += 1;
            }
          }
        }
        // Team comments / SPOC / action plans are never wiped by a re-upload —
        // the sheet only overrides them when it actually carries a new value.
        if (notes) {
          let kept = false;
          for (const f of NOTE_FIELDS) {
            if (isBlank(merged[f]) && !isBlank(notes[f])) {
              merged[f] = notes[f];
              kept = true;
            }
          }
          if (kept) notesRetained += 1;
        }
        return merged as T;
      };


      let success = 0;
      let failed = 0;
      const errorMessages: string[] = [];

      const rowsWithDqRaw = workingRows.map((r, i) => ({
        ...r,
        data_quality: (workingDq[i] ?? { tag: "clean", issues: [] }) as unknown as Record<string, unknown>,
      }));

      const dedupedMap = new Map<string, typeof rowsWithDqRaw[number]>();
      for (const r of rowsWithDqRaw) {
        if (r.claim_number) dedupedMap.set(r.claim_number, r);
      }

      const rowsWithDq = Array.from(dedupedMap.values()).map(mergeWithExisting);
      const dedupedCount = rowsWithDqRaw.length - rowsWithDq.length;

      type Batch = { idx: number; rows: Array<Record<string, unknown>> };
      const batches: Batch[] = [];
      for (let i = 0; i < rowsWithDq.length; i += BATCH_SIZE) {
        batches.push({
          idx: i / BATCH_SIZE + 1,
          rows: rowsWithDq.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, org_id: _orgId })),
        });
      }

      for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        const group = batches.slice(i, i + PARALLEL_BATCHES);
        const results = await Promise.allSettled(
          group.map((b) =>
            supabase
              .from("claims")
              .upsert(b.rows as unknown as never, { onConflict: "org_id,claim_number" }),
          ),
        );

        results.forEach((result, index) => {
          const batch = group[index];
          if (result.status === "rejected") {
            failed += batch.rows.length;
            errorMessages.push(`Batch ${batch.idx}: ${result.reason instanceof Error ? result.reason.message : "Upload failed"}`);
            return;
          }

          if (result.value.error) {
            failed += batch.rows.length;
            errorMessages.push(`Batch ${batch.idx}: ${result.value.error.message}`);
          } else {
            success += batch.rows.length;
          }
        });
      }

      const inserted = rowsWithDq.filter((r) => !existing.has(r.claim_number)).length;
      const updated = rowsWithDq.length - inserted;

      const dedupNote = dedupedCount > 0
        ? ` · merged ${dedupedCount} in-file duplicate${dedupedCount === 1 ? "" : "s"} (kept latest)`
        : "";
      const protectNote = blanksProtected > 0
        ? ` · protected ${blanksProtected} existing field${blanksProtected === 1 ? "" : "s"} from blank overwrite`
        : "";
      const qcNote = qcRemoved > 0
        ? ` · QC removed ${qcRemoved} row${qcRemoved === 1 ? "" : "s"}`
        : skipQc && qc && qc.removeIndices.length > 0
          ? ` · QC skipped (${qc.removeIndices.length} flagged kept)`
          : "";

      const insertedClaimNumbers = rowsWithDq
        .filter((r) => !existing.has(r.claim_number as string))
        .map((r) => r.claim_number as string);
      const updatedPrevious = rowsWithDq
        .filter((r) => existing.has(r.claim_number as string))
        .map((r) => existingByClaim.get(r.claim_number as string) as Record<string, unknown>)
        .filter(Boolean);

      const snapshot: ImportSnapshot = failed === 0
        ? { inserted_claim_numbers: insertedClaimNumbers, updated_previous: updatedPrevious }
        : { inserted_claim_numbers: [], updated_previous: [] };

      await supabase.from("import_history").insert({
        org_id: _orgId,
        file_name: fileName,
        total_rows: parseResult.totalRows,
        success_rows: success,
        failed_rows: failed + parseResult.errors.length,
        inserted_rows: failed === 0 ? inserted : 0,
        updated_rows: failed === 0 ? updated : 0,
        status: failed === 0 ? "completed" : "partial",
        snapshot: snapshot as unknown as never,
        error_summary: [
          dedupedCount > 0 ? `Merged ${dedupedCount} in-file duplicates` : null,
          blanksProtected > 0 ? `Protected ${blanksProtected} fields from blank overwrite` : null,
          errorMessages.length > 0 ? errorMessages.join(" | ") : null,
        ].filter(Boolean).join(" · ") || null,
      });

      const branchNote =
        branchSummary.groupsCreated > 0 || branchSummary.branchesCreated > 0
          ? ` · ${branchSummary.groupsCreated} new group${branchSummary.groupsCreated === 1 ? "" : "s"}, ${branchSummary.branchesCreated} new branch${branchSummary.branchesCreated === 1 ? "" : "es"}`
          : "";

      const purgeNote = purged > 0
        ? ` · cleared ${purged} old claim${purged === 1 ? "" : "s"}`
        : "";
      const notesNote = notesRetained > 0
        ? ` · kept team notes on ${notesRetained} claim${notesRetained === 1 ? "" : "s"}`
        : "";


      if (failed === 0) {
        toast.success(
          `Imported ${success} claims (${inserted} new, ${updated} updated)${purgeNote}${notesNote}${dedupNote}${protectNote}${qcNote}${branchNote} — dashboards refreshing`,
        );
      } else {
        toast.error(
          `Imported ${success} of ${rowsWithDq.length} (${failed} failed)${purgeNote}${notesNote}${dedupNote}${protectNote}${qcNote}${branchNote}`,
        );
      }

      if (success > 0) {
        try { localStorage.removeItem("rcm-buddy-claims-cleared"); } catch { /* ignore */ }
        bumpClaimsVersion();
        bumpHospitalsVersion();
      }

      reset();
      loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Claim import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const previewRows = parseResult?.rows.slice(0, 5) ?? [];
  const hasResult = parseResult !== null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display text-foreground">Import Claims</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Import claims from CSV or Excel files (IHX template format)
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <a href="/settings/data-management">Clear all data…</a>
          </Button>
        </div>

        {/* Upload Area */}
        {!hasResult && (
          <Card className="shadow-sm">
            <CardContent className="py-8">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={onPickFile}
                />
                {parsing ? (
                  <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
                ) : (
                  <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                )}
                <p className="text-sm font-medium mb-1">
                  {parsing ? "Parsing file…" : "Drop your CSV or Excel file here"}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Supports IHX format, CSV, and Excel (.xlsx) files
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={parsing}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Browse Files
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 🔵 Layer 1 — structural block (file rejected) */}
        {structuralBlock && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>File rejected — structural validation failed</AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-1">
              {structuralBlock.missing.length > 0 && (
                <div>
                  <span className="font-semibold">Missing mandatory column(s): </span>
                  <span className="font-mono">{structuralBlock.missing.join(", ")}</span>
                </div>
              )}
              {structuralBlock.duplicates.length > 0 && (
                <div>
                  <span className="font-semibold">Duplicate header(s): </span>
                  <span className="font-mono">{structuralBlock.duplicates.join(", ")}</span>
                </div>
              )}
              <div className="pt-1">Fix the file headers and re-upload, or open the Field Mapping Wizard to map columns manually.</div>
              <div className="pt-2 flex gap-2">
                <Button size="sm" variant="default" onClick={() => setWizardOpen(true)} disabled={!lastFile}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Open mapping wizard
                </Button>
                <Button size="sm" variant="outline" onClick={reset}>
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 🟡 Layer 1.5 — duplicate claim_number block (file rejected) */}
        {duplicateBlock && (
          <DuplicateBlockCard
            groups={duplicateBlock.groups}
            fileName={fileName}
            onClear={reset}
          />
        )}

        {/* Preview & Confirm */}
        {hasResult && parseResult && (
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  {fileName}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Review the preview below, then confirm to import.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {parseResult.detectedHeaders.length > 0 && (
                  <ReadinessBadge mapping={effectiveMapping(parseResult.detectedHeaders, overrideMap ?? undefined)} />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                  disabled={importing || parseResult.detectedHeaders.length === 0}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1" />
                  Field mapping
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  disabled={importing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total rows" value={parseResult.totalRows} />
                <StatCard
                  label="Valid"
                  value={parseResult.rows.length}
                  tone="accent"
                />
                <StatCard
                  label="Errors"
                  value={parseResult.errors.length}
                  tone={parseResult.errors.length > 0 ? "destructive" : "muted"}
                />
                <StatCard
                  label="Unmapped cols"
                  value={parseResult.unmappedHeaders.length}
                  tone="muted"
                />
              </div>

              {parseResult.unmappedHeaders.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    These columns will be ignored:{" "}
                    <span className="font-mono">
                      {parseResult.unmappedHeaders.join(", ")}
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {/* 🧠 Data Quality preview (Layers 2–4) */}
              {dqResults && dqResults.length > 0 && (
                <DataQualitySummaryCard
                  summary={summarise(parseResult.rows, dqResults, dqRules)}
                  results={dqResults}
                  className="border-primary/30"
                />
              )}

              {/* 🩺 RCM Quality Control */}
              {/* 🔄 Fresh sheet mode */}
              <div className="rounded-md border bg-card p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Replace existing data</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {replaceAll
                      ? "The current claim list will be cleared and only this sheet will be processed — QC, outstanding and denial numbers come from this upload alone."
                      : "This sheet will be merged into the existing claim list (old claims stay in all calculations)."}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch id="replace-all" checked={replaceAll} onCheckedChange={setReplaceAll} />
                  <Label htmlFor="replace-all" className="text-xs cursor-pointer">
                    Fresh upload
                  </Label>
                </div>
              </div>

              {qc && (
                <div className="rounded-md border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        RCM Quality Control
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {qc.removeIndices.length > 0
                          ? `${qc.removeIndices.length} row${qc.removeIndices.length === 1 ? "" : "s"} flagged for removal (Cancelled, PAQ > 30d, or stale active ≥ 15d).`
                          : "No rows flagged — all statuses pass quality rules."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch id="skip-qc" checked={skipQc} onCheckedChange={setSkipQc} />
                      <Label htmlFor="skip-qc" className="text-xs cursor-pointer">
                        Skip QC — upload all
                      </Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {(Object.keys(BUCKET_LABELS) as (keyof typeof BUCKET_LABELS)[]).map((b) => (
                      qc.counts[b] > 0 ? (
                        <div key={b} className="rounded border bg-muted/20 px-2 py-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{BUCKET_LABELS[b]}</div>
                          <div className="font-semibold tabular-nums">{qc.counts[b]}</div>
                        </div>
                      ) : null
                    ))}
                  </div>
                  {!skipQc && qc.removeIndices.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {qc.removeIndices.length} row{qc.removeIndices.length === 1 ? "" : "s"} will be excluded from import. Toggle "Skip QC" to upload everything.
                    </p>
                  )}
                </div>
              )}

              {parseResult.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive mb-2">
                    Validation issues ({parseResult.errors.length})
                  </p>
                  <ul className="text-xs text-destructive/90 space-y-1 max-h-32 overflow-auto font-mono">
                    {parseResult.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                    {parseResult.errors.length > 10 && (
                      <li className="text-muted-foreground">
                        …and {parseResult.errors.length - 10} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Preview (first 5 valid rows)
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          {[
                            "Claim #",
                            "Patient",
                            "TPA",
                            "Status",
                            "Claimed",
                            "Settled",
                            "Outstanding",
                          ].map((h) => (
                            <th
                              key={h}
                              className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase tracking-wide"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-2 px-3 font-mono">
                              {r.claim_number}
                            </td>
                            <td className="py-2 px-3">{r.patient_name}</td>
                            <td className="py-2 px-3">{r.tpa_name}</td>
                            <td className="py-2 px-3">{r.claim_status}</td>
                            <td className="py-2 px-3 tabular-nums">
                              {r.claimed_amount.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2 px-3 tabular-nums">
                              {r.settled_amount.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2 px-3 tabular-nums">
                              {r.outstanding_amount.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={reset} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={commitImport}
                  disabled={importing || parseResult.rows.length === 0 || !!structuralBlock}
                  className="gap-1.5"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Import {parseResult.rows.length} claims
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Column Mapping Info */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Expected Columns (IHX Template — 43 cols, 36 mapped)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {[
                "IHX Ref Id",
                "Hospital Name",
                "Patient Name",
                "TPA Name",
                "Insurance Company Name",
                "Claim Number",
                "Claim Creation Date",
                "Claimed Amount",
                "Settled Amount",
                "Claim Status",
              ].map((col) => (
                <Badge key={col} variant="outline" className="text-[10px]">
                  {col}
                </Badge>
              ))}
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                +26 more
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Re-imports update existing rows by Claim Number (no duplicates).
            </p>
          </CardContent>
        </Card>

        {/* Import History */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Import History</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["File", "Date", "Total", "New", "Updated", "Failed", "Status", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No imports yet. Upload a file above to get started.
                    </td>
                  </tr>
                )}
                {history.map((imp) => (
                  <tr key={imp.id} className="border-b last:border-0">
                    <td className="py-2.5 px-3 flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-accent" />
                      {imp.file_name}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {new Date(imp.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">{imp.total_rows}</td>
                    <td className="py-2.5 px-3 tabular-nums text-accent">
                      {imp.inserted_rows}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-primary">
                      {imp.updated_rows}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-destructive">
                      {imp.failed_rows}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge
                        className={`text-[10px] ${imp.reverted_at ? "bg-muted text-muted-foreground" : imp.status === "completed" ? "bg-accent text-accent-foreground" : "bg-amber-500 text-white"}`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {imp.reverted_at ? "reverted" : imp.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {imp.id === latestRevertibleId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={reverting === imp.id}
                          onClick={() => handleRevert(imp)}
                          title="Undo this import — delete added claims and restore updated ones"
                        >
                          {reverting === imp.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          Undo
                        </Button>
                      ) : imp.reverted_at ? (
                        <span className="text-[10px] text-muted-foreground italic">
                          rolled back
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {parseResult && (
        <FieldMappingWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          detectedHeaders={parseResult.detectedHeaders}
          headerStats={parseResult.headerStats}
          totalRows={parseResult.totalRows}
          initialMapping={effectiveMapping(parseResult.detectedHeaders, overrideMap ?? undefined)}
          onSave={(m) => {
            setOverrideMap(m);
            try { localStorage.setItem("rcm.himsMapping", JSON.stringify(m)); } catch { /* ignore */ }
            if (lastFile) {
              handleFile(lastFile, { override: m });
              toast.success("Mapping saved — file re-parsed");
            }
          }}
        />
      )}
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "accent" | "destructive" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={`text-xl font-display tabular-nums mt-1 ${toneClass}`}>
        {value.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate claim_number detection (case + whitespace insensitive)
// ---------------------------------------------------------------------------
function normaliseClaimNo(s: string): string {
  return (s || "").trim().toUpperCase().replace(/\s+/g, "");
}

function findDuplicateClaimNumbers(
  rows: ClaimUpsertRow[],
): { normalized: string; rows: { row: number; raw: string }[] }[] {
  const map = new Map<string, { row: number; raw: string }[]>();
  rows.forEach((r, i) => {
    const raw = r.claim_number ?? "";
    const norm = normaliseClaimNo(raw);
    if (!norm) return;
    const arr = map.get(norm) ?? [];
    arr.push({ row: i + 2, raw }); // header is sheet row 1, data starts at row 2
    map.set(norm, arr);
  });
  const dups: { normalized: string; rows: { row: number; raw: string }[] }[] = [];
  for (const [normalized, occurrences] of map.entries()) {
    if (occurrences.length > 1) dups.push({ normalized, rows: occurrences });
  }
  return dups.sort((a, b) => b.rows.length - a.rows.length);
}

function DuplicateBlockCard({
  groups,
  fileName,
  onClear,
}: {
  groups: { normalized: string; rows: { row: number; raw: string }[] }[];
  fileName: string;
  onClear: () => void;
}) {
  const totalDupRows = groups.reduce((s, g) => s + g.rows.length, 0);
  const extraRows = groups.reduce((s, g) => s + (g.rows.length - 1), 0);

  const csv = useMemo(() => {
    const lines = ["claim_number_normalized,sheet_row,raw_claim_number,occurrence_in_group"];
    for (const g of groups) {
      g.rows.forEach((r, i) => {
        const raw = r.raw.replace(/"/g, '""');
        lines.push(`"${g.normalized}",${r.row},"${raw}",${i + 1}`);
      });
    }
    return lines.join("\n");
  }, [groups]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "")}-duplicates.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success("Duplicate list copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Alert>
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>
        {groups.length} duplicate claim number
        {groups.length === 1 ? "" : "s"} will be merged ({totalDupRows} rows · {extraRows} extra row{extraRows === 1 ? "" : "s"} collapsed)
      </AlertTitle>
      <AlertDescription className="text-xs space-y-3 mt-2">
        <div>
          The same Claim Number appears more than once in your sheet (matched
          case-insensitively, ignoring whitespace). Only the{" "}
          <span className="font-semibold">latest occurrence</span> of each
          Claim Number will be kept on import — {extraRows} earlier row
          {extraRows === 1 ? "" : "s"} will be discarded. Review the list below
          before confirming the import.
        </div>

        <div className="rounded-md border bg-background/50 max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left py-1.5 px-2 font-semibold">Claim Number</th>
                <th className="text-left py-1.5 px-2 font-semibold">Occurrences</th>
                <th className="text-left py-1.5 px-2 font-semibold">Sheet rows</th>
                <th className="text-left py-1.5 px-2 font-semibold">Raw values</th>
              </tr>
            </thead>
            <tbody>
              {groups.slice(0, 50).map((g) => (
                <tr key={g.normalized} className="border-t">
                  <td className="py-1.5 px-2 font-mono">{g.normalized}</td>
                  <td className="py-1.5 px-2 tabular-nums">{g.rows.length}</td>
                  <td className="py-1.5 px-2 font-mono">
                    {g.rows.map((r) => r.row).join(", ")}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-muted-foreground">
                    {Array.from(new Set(g.rows.map((r) => `"${r.raw}"`))).join(" · ")}
                  </td>
                </tr>
              ))}
              {groups.length > 50 && (
                <tr className="border-t">
                  <td colSpan={4} className="py-1.5 px-2 text-muted-foreground italic">
                    …and {groups.length - 50} more group{groups.length - 50 === 1 ? "" : "s"} — download CSV to see all
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5" /> Download duplicate list (CSV)
          </Button>
          <Button size="sm" variant="outline" onClick={copyList}>
            <CopyIcon className="h-3.5 w-3.5" /> Copy to clipboard
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
