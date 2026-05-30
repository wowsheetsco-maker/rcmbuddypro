// CSV / Excel bulk-import dialog for the insurer_contacts table.
// - Accepts .csv / .xlsx with flexible header names (case-insensitive)
// - Validates per row (provider/contact_name/email required, valid email)
// - Auto-handles primary: at most one primary per provider (first wins;
//   demotes existing DB primaries on insert if incoming row is primary)
// - Preview before commit, with row-level error/warning chips

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertCircle,
  Loader2, Star, Info, RefreshCw, PlusCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { InsurerContactRow } from "@/hooks/useInsurerContacts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: InsurerContactRow[];
  onImported?: () => void;
}

interface ParsedRow {
  provider: string;
  contact_name: string;
  designation: string;
  email: string;
  cc_emails: string;
  phone: string;
  whatsapp: string;
  is_primary: boolean;
  notes: string;
  __errors: string[];
  __warnings: string[];
}

// Header aliases — incoming column names normalised to canonical fields
const HEADER_MAP: Record<string, keyof Omit<ParsedRow, "__errors" | "__warnings">> = {
  provider: "provider",
  tpa: "provider",
  insurer: "provider",
  "tpa / insurer": "provider",
  "tpa/insurer": "provider",
  name: "contact_name",
  "contact name": "contact_name",
  contact: "contact_name",
  "contact_name": "contact_name",
  designation: "designation",
  role: "designation",
  title: "designation",
  email: "email",
  "email id": "email",
  "primary email": "email",
  cc: "cc_emails",
  "cc emails": "cc_emails",
  cc_emails: "cc_emails",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  whatsapp: "whatsapp",
  "whatsapp number": "whatsapp",
  primary: "is_primary",
  "is primary": "is_primary",
  is_primary: "is_primary",
  notes: "notes",
  remarks: "notes",
};

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

function normaliseHeader(h: string): keyof Omit<ParsedRow, "__errors" | "__warnings"> | null {
  const k = h.trim().toLowerCase();
  return HEADER_MAP[k] ?? null;
}

function parseBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "primary", "p"].includes(s);
}

// Canonical column order — first row of every export uses these exact headers.
// They line up 1:1 with the keys in HEADER_MAP, so a round-trip Export → Import
// is guaranteed to map cleanly.
const TEMPLATE_HEADERS = [
  "Provider",
  "Contact Name",
  "Designation",
  "Email",
  "CC Emails",
  "Phone",
  "WhatsApp",
  "Is Primary",
  "Notes",
] as const;

const TEMPLATE_SAMPLE = [
  // Primary contact — full detail
  {
    Provider: "Star Health",
    "Contact Name": "Priya Menon",
    Designation: "Claims Manager",
    Email: "priya.m@starhealth.in",
    "CC Emails": "claims-team@starhealth.in, escalations@starhealth.in",
    Phone: "+91 98765 43210",
    WhatsApp: "+919876543210",
    "Is Primary": "Yes",
    Notes: "Escalate after 3 working days. Prefers email over phone.",
  },
  // Secondary / non-primary contact for the same provider
  {
    Provider: "Star Health",
    "Contact Name": "Anil Kumar",
    Designation: "Backup Officer",
    Email: "anil.k@starhealth.in",
    "CC Emails": "",
    Phone: "+91 98123 45678",
    WhatsApp: "",
    "Is Primary": "No",
    Notes: "Use only when Priya is on leave",
  },
  // Different provider — primary contact, minimal fields
  {
    Provider: "Medi Assist",
    "Contact Name": "Rajesh Sharma",
    Designation: "Senior Officer",
    Email: "rajesh@mediassist.in",
    "CC Emails": "",
    Phone: "+91 88776 65544",
    WhatsApp: "+918877665544",
    "Is Primary": "Yes",
    Notes: "",
  },
];

// Two-column reference: canonical field → all accepted aliases (for the README sheet)
function aliasReference(): { Field: string; "Accepted column headers (any of)": string }[] {
  const grouped: Record<string, string[]> = {};
  for (const [alias, field] of Object.entries(HEADER_MAP)) {
    if (!grouped[field]) grouped[field] = [];
    grouped[field].push(alias);
  }
  // Order by canonical export order
  const fieldOrder: Record<string, number> = {
    provider: 1, contact_name: 2, designation: 3, email: 4, cc_emails: 5,
    phone: 6, whatsapp: 7, is_primary: 8, notes: 9,
  };
  return Object.entries(grouped)
    .sort(([a], [b]) => (fieldOrder[a] ?? 99) - (fieldOrder[b] ?? 99))
    .map(([field, aliases]) => ({
      Field: field,
      "Accepted column headers (any of)": aliases
        .map((a) => a.replace(/\b\w/g, (c) => c.toUpperCase()))
        .join("  ·  "),
    }));
}

function downloadTemplate(format: "xlsx" | "csv" = "xlsx") {
  // Build the data sheet with explicit header row
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE, {
    header: TEMPLATE_HEADERS as unknown as string[],
  });
  ws["!cols"] = [
    { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 30 }, { wch: 36 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 32 },
  ];

  if (format === "csv") {
    // CSV is single-sheet only — emit just the data
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "insurer-contacts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // XLSX gets a multi-sheet workbook: Contacts (data) + Column Aliases (reference) + Notes
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");

  const aliasWs = XLSX.utils.json_to_sheet(aliasReference());
  aliasWs["!cols"] = [{ wch: 16 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, aliasWs, "Column Aliases");

  const notesData = [
    { Topic: "Required fields", Detail: "Provider, Contact Name, Email — all three must be filled." },
    { Topic: "Email format", Detail: "Standard format only (someone@domain.tld). CC accepts comma or space separated list." },
    { Topic: "Is Primary", Detail: "Accepts Yes / No / 1 / 0 / true / false / Primary. Only ONE primary per Provider — extras are auto-demoted." },
    { Topic: "Phone & WhatsApp", Detail: "Free text — keep country code (+91) for WhatsApp links to work." },
    { Topic: "Dedup option", Detail: "If 'Update existing by email' is enabled in the import dialog, a row whose Email already exists in the directory will UPDATE instead of insert." },
    { Topic: "Header flexibility", Detail: "Column headers are matched case-insensitively against the alias list (see Column Aliases sheet)." },
  ];
  const notesWs = XLSX.utils.json_to_sheet(notesData);
  notesWs["!cols"] = [{ wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, notesWs, "Notes");

  XLSX.writeFile(wb, "insurer-contacts-template.xlsx");
}

function parseFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows = raw.map((rec) => normaliseRow(rec));
        resolve(rows);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function normaliseRow(rec: Record<string, unknown>): ParsedRow {
  const row: ParsedRow = {
    provider: "",
    contact_name: "",
    designation: "",
    email: "",
    cc_emails: "",
    phone: "",
    whatsapp: "",
    is_primary: false,
    notes: "",
    __errors: [],
    __warnings: [],
  };
  for (const [k, v] of Object.entries(rec)) {
    const field = normaliseHeader(k);
    if (!field) continue;
    if (field === "is_primary") row.is_primary = parseBoolean(v);
    else row[field] = String(v ?? "").trim();
  }
  // Validation
  if (!row.provider) row.__errors.push("Provider missing");
  if (!row.contact_name) row.__errors.push("Contact name missing");
  if (!row.email) row.__errors.push("Email missing");
  else if (!EMAIL_RE.test(row.email)) row.__errors.push("Email invalid");
  if (row.cc_emails) {
    const bad = row.cc_emails
      .split(/[,\\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((e) => !EMAIL_RE.test(e));
    if (bad.length) row.__warnings.push(`Bad CC: ${bad.join(", ")}`);
  }
  return row;
}

export default function ContactsCsvImportDialog({
  open, onOpenChange, existing, onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dedupByEmail, setDedupByEmail] = useState(true);

  // email → existing contact id (case-insensitive) for dedup matching
  const existingByEmail = useMemo(() => {
    const m = new Map<string, InsurerContactRow>();
    existing.forEach((c) => m.set(c.email.toLowerCase().trim(), c));
    return m;
  }, [existing]);

  // Decide what each valid row will do once committed
  const resolveAction = (r: ParsedRow): "insert" | "update" => {
    if (!dedupByEmail) return "insert";
    return existingByEmail.has(r.email.toLowerCase().trim()) ? "update" : "insert";
  };

  const stats = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter((r) => r.__errors.length === 0);
    const invalid = rows.length - valid.length;
    const inserts = valid.filter((r) => resolveAction(r) === "insert").length;
    const updates = valid.length - inserts;
    const primaryClashes = new Map<string, number>();
    valid.forEach((r) => {
      if (r.is_primary) {
        const k = r.provider.toLowerCase();
        primaryClashes.set(k, (primaryClashes.get(k) ?? 0) + 1);
      }
    });
    const dupePrimary = Array.from(primaryClashes.entries()).filter(([, n]) => n > 1).length;
    return { total: rows.length, valid: valid.length, invalid, dupePrimary, inserts, updates };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dedupByEmail, existingByEmail]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        toast.error("No data rows found in file");
        setRows(null);
        return;
      }
      // Auto-handle primary clashes: keep the first primary per provider, demote rest to warnings
      const seenPrimary = new Set<string>();
      parsed.forEach((r) => {
        if (r.__errors.length || !r.is_primary) return;
        const k = r.provider.toLowerCase();
        if (seenPrimary.has(k)) {
          r.is_primary = false;
          r.__warnings.push("Primary already taken in file — kept as non-primary");
        } else {
          seenPrimary.add(k);
        }
      });
      setRows(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRows(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const commit = async () => {
    if (!rows) return;
    const valid = rows.filter((r) => r.__errors.length === 0);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    try {
      // Partition rows by resolved action
      const inserts = valid.filter((r) => resolveAction(r) === "insert");
      const updates = valid.filter((r) => resolveAction(r) === "update");

      // Step 1: For every (provider) where any incoming row (insert or update) is primary,
      // demote existing DB primaries for that provider — except the row(s) we'll write.
      const primariesByProvider = new Set(
        valid.filter((r) => r.is_primary).map((r) => r.provider),
      );
      // Emails of incoming primary updates that should keep their primary flag
      const keepPrimaryEmails = new Set(
        updates.filter((r) => r.is_primary).map((r) => r.email.toLowerCase().trim()),
      );
      for (const provider of primariesByProvider) {
        let q = supabase
          .from("insurer_contacts")
          .update({ is_primary: false })
          .eq("provider", provider);
        // Don't demote a row we're about to mark primary via update
        if (keepPrimaryEmails.size > 0) {
          q = q.not("email", "in", `(${Array.from(keepPrimaryEmails).map((e) => `"${e}"`).join(",")})`);
        }
        await q;
      }

      // Step 2a: UPDATE existing contacts matched by email
      for (const r of updates) {
        const existingRow = existingByEmail.get(r.email.toLowerCase().trim());
        if (!existingRow) continue;
        const { error } = await supabase
          .from("insurer_contacts")
          .update({
            provider: r.provider,
            contact_name: r.contact_name,
            designation: r.designation || null,
            cc_emails: r.cc_emails || null,
            phone: r.phone || null,
            whatsapp: r.whatsapp || null,
            is_primary: r.is_primary,
            notes: r.notes || null,
          })
          .eq("id", existingRow.id);
        if (error) throw error;
      }

      // Step 2b: INSERT new contacts
      if (inserts.length > 0) {
        const { getCurrentOrgId } = await import("@/lib/currentOrg");
        const orgId = getCurrentOrgId();
        const payload = inserts.map((r) => ({
          org_id: orgId,
          provider: r.provider,
          contact_name: r.contact_name,
          designation: r.designation || null,
          email: r.email,
          cc_emails: r.cc_emails || null,
          phone: r.phone || null,
          whatsapp: r.whatsapp || null,
          is_primary: r.is_primary,
          notes: r.notes || null,
        }));
        const { error } = await supabase.from("insurer_contacts").insert(payload);
        if (error) throw error;
      }

      const parts: string[] = [];
      if (inserts.length) parts.push(`${inserts.length} new`);
      if (updates.length) parts.push(`${updates.length} updated`);
      toast.success(`Import complete — ${parts.join(", ") || "no changes"}`);
      onImported?.();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Bulk-import Contacts
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to create multiple insurer contacts at once.
            Required columns: <strong>Provider</strong>, <strong>Contact Name</strong>,{" "}
            <strong>Email</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Upload card */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {busy ? "Parsing…" : "Choose file"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTemplate("xlsx")}
              className="gap-1.5"
              title="Multi-sheet Excel: data + column-alias reference + notes"
            >
              <Download className="h-3.5 w-3.5" /> Template (XLSX)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadTemplate("csv")}
              className="gap-1.5"
              title="Single-sheet CSV with canonical headers"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 ml-auto">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Dedup toggle + existing snapshot */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Switch
              id="dedup-toggle"
              checked={dedupByEmail}
              onCheckedChange={setDedupByEmail}
            />
            <Label
              htmlFor="dedup-toggle"
              className="text-xs cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3 text-secondary" />
              Update existing by email
            </Label>
          </div>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <Info className="h-3 w-3" /> Directory has {existing.length} contact
            {existing.length === 1 ? "" : "s"}.{" "}
            {dedupByEmail
              ? "Email matches will update; others insert."
              : "All valid rows insert (duplicates allowed)."}
          </span>
        </div>

        {/* Preview */}
        {rows && stats && (
          <Card className="border-primary/30 flex-1 min-h-0 flex flex-col">
            <CardContent className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <CheckCircle2 className="h-3 w-3 text-accent" />
                  {stats.valid} valid
                </Badge>
                {stats.invalid > 0 && (
                  <Badge className="text-[10px] gap-1 bg-destructive text-destructive-foreground">
                    <AlertCircle className="h-3 w-3" /> {stats.invalid} invalid
                  </Badge>
                )}
                <Badge className="text-[10px] gap-1 bg-accent text-accent-foreground">
                  <PlusCircle className="h-3 w-3" /> {stats.inserts} new
                </Badge>
                {dedupByEmail && (
                  <Badge className="text-[10px] gap-1 bg-warning text-warning-foreground">
                    <RefreshCw className="h-3 w-3" /> {stats.updates} update
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {stats.total} total
                </Badge>
              </div>

              <ScrollArea className="flex-1 min-h-0 max-h-[340px] border rounded-md">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                    <tr>
                      {["#", "Action", "Provider", "Contact", "Email", "Phone", "Primary", "Issues"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const hasErr = r.__errors.length > 0;
                      const action = hasErr ? "skip" : resolveAction(r);
                      return (
                        <tr
                          key={i}
                          className={
                            hasErr
                              ? "border-b border-destructive/20 bg-destructive/5"
                              : "border-b last:border-0 hover:bg-muted/30"
                          }
                        >
                          <td className="py-1.5 px-2 text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="py-1.5 px-2">
                            {action === "skip" && (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                skip
                              </Badge>
                            )}
                            {action === "insert" && (
                              <Badge className="text-[9px] gap-0.5 bg-accent text-accent-foreground">
                                <PlusCircle className="h-2.5 w-2.5" /> new
                              </Badge>
                            )}
                            {action === "update" && (
                              <Badge className="text-[9px] gap-0.5 bg-warning text-warning-foreground">
                                <RefreshCw className="h-2.5 w-2.5" /> update
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 px-2 font-medium">
                            {r.provider || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-1.5 px-2">
                            {r.contact_name || <span className="text-muted-foreground">—</span>}
                            {r.designation && (
                              <div className="text-[10px] text-muted-foreground">
                                {r.designation}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-[11px]">{r.email || "—"}</td>
                          <td className="py-1.5 px-2 text-[11px]">{r.phone || "—"}</td>
                          <td className="py-1.5 px-2">
                            {r.is_primary && (
                              <Star className="h-3.5 w-3.5 text-warning fill-current" />
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="flex flex-wrap gap-1">
                              {r.__errors.map((e, idx) => (
                                <Badge
                                  key={`e${idx}`}
                                  className="text-[9px] gap-0.5 bg-destructive text-destructive-foreground"
                                >
                                  {e}
                                </Badge>
                              ))}
                              {r.__warnings.map((w, idx) => (
                                <Badge
                                  key={`w${idx}`}
                                  variant="outline"
                                  className="text-[9px] border-warning text-warning-foreground bg-warning/10"
                                >
                                  {w}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>

              {stats.invalid > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  ⚠ {stats.invalid} row(s) will be skipped due to errors. Fix the source file
                  and re-upload to include them.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={!rows || importing || (stats?.valid ?? 0) === 0}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {stats
              ? `Import · +${stats.inserts}${dedupByEmail ? ` / ~${stats.updates}` : ""}`
              : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
