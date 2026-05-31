import { useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

type VisitInsert = Database["public"]["Tables"]["opd_visits"]["Insert"];

// Maps aggregator CSV columns → opd_visits columns
const FIELDS: ReadonlyArray<{ key: FieldKey; label: string; required: boolean; hint?: string }> = [
  { key: "visit_date", label: "Visit date *", required: true, hint: "YYYY-MM-DD or DD/MM/YYYY" },
  { key: "patient_name", label: "Patient name *", required: true },
  { key: "employee_code", label: "Employee code", required: false, hint: "Used to link to employee + corporate" },
  { key: "doctor_name", label: "Doctor", required: false },
  { key: "department", label: "Department", required: false },
  { key: "total_amount", label: "Total ₹", required: false },
  { key: "copay", label: "Copay ₹", required: false },
  { key: "aggregator_claim_id", label: "Aggregator claim id", required: false, hint: "Used to dedupe re-imports" },
  { key: "notes", label: "Notes", required: false },
];

type FieldKey = "visit_date" | "patient_name" | "employee_code" | "doctor_name" | "department" | "total_amount" | "copay" | "aggregator_claim_id" | "notes";
type Row = Record<string, string>;

function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]);
  const rows: Row[] = lines.slice(1).map((line) => {
    const cols = split(line);
    const o: Row = {};
    headers.forEach((h, i) => { o[h] = cols[i] ?? ""; });
    return o;
  });
  return { headers, rows };
}

function parseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

const guessHeader = (headers: string[], candidates: string[]) =>
  headers.find((h) => candidates.some((c) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === c.replace(/[^a-z0-9]/g, "")))
  ?? "";

export default function OpdVisitImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [corpId, setCorpId] = useState("");
  const [aggregator, setAggregator] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [corps, setCorps] = useState<Array<{ id: string; name: string; aggregator: string | null }>>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  const loadCorps = async () => {
    const { data } = await supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name");
    setCorps((data ?? []) as Array<{ id: string; name: string; aggregator: string | null }>);
  };
  useMemo(() => { loadCorps(); }, []);

  const onFile = async (file: File) => {
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    setHeaders(h); setRows(r);
    // Heuristic auto-mapping
    const auto: Record<string, string> = {};
    auto.visit_date = guessHeader(h, ["visitdate", "date", "consultationdate"]);
    auto.patient_name = guessHeader(h, ["patientname", "beneficiary", "name", "memberName"]);
    auto.employee_code = guessHeader(h, ["employeecode", "empcode", "memberid", "empid"]);
    auto.doctor_name = guessHeader(h, ["doctor", "doctorname", "physician"]);
    auto.department = guessHeader(h, ["department", "specialty"]);
    auto.total_amount = guessHeader(h, ["total", "totalamount", "billamount", "amount"]);
    auto.copay = guessHeader(h, ["copay", "copayment"]);
    auto.aggregator_claim_id = guessHeader(h, ["claimid", "aggregatorclaimid", "transactionid", "referenceno"]);
    auto.notes = guessHeader(h, ["notes", "remarks", "comments"]);
    setMapping(auto as Record<FieldKey, string>);
    setSummary(null);
  };

  const validation = useMemo(() => {
    const issues: Array<{ rowIndex: number; messages: string[] }> = [];
    if (!rows.length) return issues;
    const need = FIELDS.filter((f) => f.required).map((f) => f.key);
    rows.forEach((r, i) => {
      const msgs: string[] = [];
      for (const k of need) {
        const col = mapping[k as FieldKey];
        if (!col || !r[col]) msgs.push(`Missing ${k}`);
      }
      const dateCol = mapping.visit_date;
      if (dateCol && r[dateCol] && !parseDate(r[dateCol])) msgs.push("Invalid date");
      const totCol = mapping.total_amount;
      if (totCol && r[totCol] && Number.isNaN(Number(r[totCol]))) msgs.push("Invalid total amount");
      if (msgs.length) issues.push({ rowIndex: i, messages: msgs });
    });
    return issues;
  }, [rows, mapping]);

  const doImport = async () => {
    if (!corpId) return toast({ title: "Select a corporate", variant: "destructive" });
    if (!mapping.visit_date || !mapping.patient_name) return toast({ title: "Map visit_date and patient_name", variant: "destructive" });
    setImporting(true);

    // Build employee lookup for the corporate (for empCode → employee_id)
    const { data: emps } = await supabase.from("opd_employees").select("id,employee_code").eq("corporate_id", corpId);
    const empByCode = new Map((emps ?? []).map((e) => [e.employee_code, e.id]));

    const orgId = getCurrentOrgId();
    const records: VisitInsert[] = [];
    const errors: string[] = [];
    let skipped = 0;

    rows.forEach((r, i) => {
      const issue = validation.find((v) => v.rowIndex === i);
      if (issue) { skipped++; errors.push(`Row ${i + 2}: ${issue.messages.join(", ")}`); return; }
      const date = parseDate(r[mapping.visit_date] ?? "");
      if (!date) { skipped++; return; }
      const total = Number(r[mapping.total_amount] ?? "0") || 0;
      const copay = Number(r[mapping.copay] ?? "0") || 0;
      const empCode = mapping.employee_code ? r[mapping.employee_code] : "";
      records.push({
        org_id: orgId, corporate_id: corpId,
        employee_id: empCode ? empByCode.get(empCode) ?? null : null,
        visit_date: date,
        patient_name: (r[mapping.patient_name] ?? "").trim(),
        doctor_name: mapping.doctor_name ? r[mapping.doctor_name] || null : null,
        department: mapping.department ? r[mapping.department] || null : null,
        total_amount: total, copay,
        payable_amount: Math.max(total - copay, 0),
        status: "captured",
        services: [],
        aggregator_claim_id: mapping.aggregator_claim_id ? r[mapping.aggregator_claim_id] || null : null,
        notes: mapping.notes ? r[mapping.notes] || null : null,
      });
    });

    let inserted = 0;
    if (records.length) {
      const chunkSize = 200;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error, count } = await supabase.from("opd_visits").insert(chunk, { count: "exact" });
        if (error) errors.push(`Insert error (${i}-${i + chunk.length}): ${error.message}`);
        else inserted += count ?? chunk.length;
      }
    }
    setImporting(false);
    setSummary({ inserted, skipped, errors });
    toast({
      title: `Imported ${inserted} visits`,
      description: skipped ? `${skipped} rows skipped due to validation errors.` : undefined,
      variant: skipped ? "destructive" : "default",
    });
  };

  const preview = rows.slice(0, 5);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Aggregator visit import</h1>
          <p className="text-sm text-muted-foreground">Upload a MediBuddy / Plum / Loop / custom CSV, map columns, validate and insert as OPD visits.</p>
        </header>

        <Card>
          <CardHeader><CardTitle className="text-base">1. Pick corporate & file</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Corporate *</label>
                <Select value={corpId} onValueChange={(v) => { setCorpId(v); const c = corps.find((x) => x.id === v); setAggregator(c?.aggregator ?? ""); }}>
                  <SelectTrigger><SelectValue placeholder="Select corporate" /></SelectTrigger>
                  <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.aggregator ? ` · ${c.aggregator}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4 mr-1" /> Choose CSV
                </Button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                {aggregator && <Badge variant="secondary" className="ml-3">Aggregator: {aggregator}</Badge>}
              </div>
            </div>
            {!rows.length && (
              <p className="text-xs text-muted-foreground">Headers we recognise: visit_date, patient_name, employee_code, doctor_name, department, total_amount, copay, aggregator_claim_id, notes. Unknown columns are ignored.</p>
            )}
          </CardContent>
        </Card>

        {headers.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">2. Map columns ({rows.length} rows)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground">{f.label}{f.hint ? <span className="ml-1 italic">— {f.hint}</span> : ""}</label>
                    <Select value={mapping[f.key] || "__none__"} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="(not mapped)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(not mapped)</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {preview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                3. Preview & validate
                {validation.length === 0
                  ? <span className="inline-flex items-center text-xs text-emerald-600"><CheckCircle2 className="h-4 w-4 mr-1" /> Clean</span>
                  : <span className="inline-flex items-center text-xs text-destructive"><AlertTriangle className="h-4 w-4 mr-1" /> {validation.length} row(s) with issues</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    {FIELDS.map((f) => <TableHead key={f.key}>{f.key}</TableHead>)}
                    <TableHead>Issues</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {preview.map((r, i) => {
                      const issue = validation.find((v) => v.rowIndex === i);
                      return (
                        <TableRow key={i} className={issue ? "bg-destructive/10" : ""}>
                          {FIELDS.map((f) => <TableCell key={f.key} className="text-xs">{mapping[f.key] ? (r[mapping[f.key]] ?? "") : <span className="text-muted-foreground">—</span>}</TableCell>)}
                          <TableCell className="text-xs text-destructive">{issue ? issue.messages.join(", ") : ""}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button onClick={doImport} disabled={importing || !corpId}>
                  <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing…" : `Import ${rows.length - validation.length} visits`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card>
            <CardHeader><CardTitle className="text-base">Import summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Inserted: <strong>{summary.inserted}</strong> · Skipped: <strong>{summary.skipped}</strong></div>
              {summary.errors.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-destructive">{summary.errors.length} error(s)</summary>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5 mt-1">
                    {summary.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
