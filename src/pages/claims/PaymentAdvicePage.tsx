import { useCallback, useMemo, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Search, ScanLine, Settings2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { toast } from "@/hooks/use-toast";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInrShort } from "@/data/mockClaims";
import {
  parsePaymentAdvicePdf, parsePaymentAdviceText, matchAdviceLines, LAYOUT_LABELS,
  type ParsedPaymentAdvice, type AdviceLineMatch,
} from "@/lib/paymentAdviceParser";

function confidenceBadge(m: AdviceLineMatch) {
  if (!m.claim) return <Badge variant="outline" className="text-destructive border-destructive/40">Unmatched</Badge>;
  if (m.confidence >= 90) return <Badge className="bg-success text-success-foreground">Auto {m.confidence}%</Badge>;
  if (m.confidence >= 70) return <Badge className="bg-primary text-primary-foreground">Likely {m.confidence}%</Badge>;
  return <Badge variant="secondary">Review {m.confidence}%</Badge>;
}

export default function PaymentAdvicePage() {
  const { claims } = useLiveClaims();
  const [advice, setAdvice] = useState<ParsedPaymentAdvice | null>(null);
  const [parsing, setParsing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [utrOverride, setUtrOverride] = useState("");
  const [enableOcr, setEnableOcr] = useState(true);
  const [forceOcr, setForceOcr] = useState(false);
  const [ocrLang, setOcrLang] = useState("eng");
  const [ocrScale, setOcrScale] = useState(2);
  const [ocrRotate, setOcrRotate] = useState<0 | 90 | 180 | 270>(0);
  const [ocrTableMode, setOcrTableMode] = useState(true);
  const [showOcrSettings, setShowOcrSettings] = useState(false);
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);

  const onFile = useCallback(async (file: File) => {
    setParsing(true);
    setProgress({ msg: "Loading PDF…", pct: 5 });
    try {
      const res = await parsePaymentAdvicePdf(file, {
        enableOcr,
        forceOcr,
        ocr: { language: ocrLang, scale: ocrScale, rotate: ocrRotate, tableMode: ocrTableMode },
        onProgress: (msg, pct) => setProgress({ msg, pct }),
      });
      setAdvice(res);
      setUtrOverride(res.utr ?? "");
      toast({
        title: res.used_ocr ? "Parsed via OCR" : "Payment advice parsed",
        description: `${res.lines.length} rows · Layout: ${LAYOUT_LABELS[res.layout]}${res.used_ocr ? " · OCR used" : ""}`,
      });
    } catch (e) {
      toast({ title: "Could not parse PDF", description: (e as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
      setProgress(null);
    }
  }, [enableOcr, forceOcr, ocrLang, ocrScale, ocrRotate, ocrTableMode]);

  const runManual = useCallback(() => {
    if (!manualText.trim()) return;
    const res = parsePaymentAdviceText(manualText);
    setAdvice(res);
    setUtrOverride(res.utr ?? "");
    toast({ title: "Text parsed", description: `${res.lines.length} rows · Layout: ${LAYOUT_LABELS[res.layout]}` });
  }, [manualText]);

  const matchable = useMemo(() => claims.map((c) => ({
    id: c.id,
    claim_number: c.claim_number,
    patient_name: c.patient_name,
    approved_amount: c.approved_amount,
    settled_amount: c.settled_amount,
    tpa_name: c.tpa_name,
    insurance_company_name: c.insurance_company_name,
  })), [claims]);

  const result = useMemo(() => advice ? matchAdviceLines(advice, matchable) : null, [advice, matchable]);

  const exportCsv = () => {
    if (!result || !advice) return;
    const rows = [
      ["UTR", utrOverride || advice.utr || ""],
      ["Payment Date", advice.payment_date || ""],
      ["Payer", advice.payer_name || ""],
      [],
      ["Claim No (Advice)", "Patient (Advice)", "Net Paid", "Matched Claim ID", "Matched Claim No", "Matched Patient", "Approved", "Method", "Confidence"],
      ...result.matches.map((m) => [
        m.line.claim_number ?? "",
        m.line.patient_name ?? "",
        m.line.net_paid,
        m.claim?.id ?? "",
        m.claim?.claim_number ?? "",
        m.claim?.patient_name ?? "",
        m.claim?.approved_amount ?? "",
        m.method,
        m.confidence,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-advice-${(utrOverride || advice.utr || "unknown").replace(/[^A-Z0-9]/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-foreground">Payment Advice Parser</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a TPA / insurer remittance PDF. We extract every claim row and match one UTR to many claims.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" />1. Upload payment advice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Input
                type="file"
                accept="application/pdf"
                disabled={parsing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                className="max-w-md"
              />
              {parsing && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Working…</span>}
            </div>
            <div className="flex flex-wrap gap-6 text-xs items-center">
              <label className="flex items-center gap-2">
                <Switch checked={enableOcr} onCheckedChange={setEnableOcr} disabled={parsing} />
                <span className="flex items-center gap-1"><ScanLine className="h-3 w-3" />OCR fallback for scanned PDFs</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={forceOcr} onCheckedChange={setForceOcr} disabled={parsing || !enableOcr} />
                <span>Force OCR (ignore embedded text)</span>
              </label>
              <Button
                size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setShowOcrSettings((v) => !v)}
                disabled={!enableOcr}
              >
                <Settings2 className="h-3 w-3 mr-1" />OCR settings
              </Button>
            </div>
            {showOcrSettings && enableOcr && (
              <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-[11px]">Language</Label>
                  <Select value={ocrLang} onValueChange={setOcrLang} disabled={parsing}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eng">English</SelectItem>
                      <SelectItem value="eng+hin">English + Hindi</SelectItem>
                      <SelectItem value="eng+tam">English + Tamil</SelectItem>
                      <SelectItem value="eng+tel">English + Telugu</SelectItem>
                      <SelectItem value="eng+mar">English + Marathi</SelectItem>
                      <SelectItem value="eng+ben">English + Bengali</SelectItem>
                      <SelectItem value="eng+guj">English + Gujarati</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">DPI / Scale</Label>
                  <Select value={String(ocrScale)} onValueChange={(v) => setOcrScale(Number(v))} disabled={parsing}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">72 DPI (fast)</SelectItem>
                      <SelectItem value="1.5">108 DPI</SelectItem>
                      <SelectItem value="2">144 DPI (default)</SelectItem>
                      <SelectItem value="3">216 DPI (accurate)</SelectItem>
                      <SelectItem value="4">288 DPI (slow)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Rotate / Deskew</Label>
                  <Select value={String(ocrRotate)} onValueChange={(v) => setOcrRotate(Number(v) as 0 | 90 | 180 | 270)} disabled={parsing}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0° (upright)</SelectItem>
                      <SelectItem value="90">90° clockwise</SelectItem>
                      <SelectItem value="180">180° (upside-down)</SelectItem>
                      <SelectItem value="270">270° clockwise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-1">
                  <Switch checked={ocrTableMode} onCheckedChange={setOcrTableMode} disabled={parsing} />
                  <span className="text-xs">Table mode<span className="block text-[10px] text-muted-foreground">Preserve column spacing</span></span>
                </label>
              </div>
            )}
            {progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{progress.msg}</span><span>{Math.round(progress.pct)}%</span>
                </div>
                <Progress value={progress.pct} className="h-1.5" />
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Or paste text manually</summary>
              <div className="mt-2 space-y-2">
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="w-full min-h-32 rounded border bg-background p-2 font-mono text-xs"
                  placeholder="Paste the payment advice content…"
                />
                <Button size="sm" variant="secondary" onClick={runManual}>Parse text</Button>
              </div>
            </details>
          </CardContent>
        </Card>

        {advice && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Layout: {LAYOUT_LABELS[advice.layout]}</Badge>
            {advice.used_ocr && <Badge className="bg-primary/10 text-primary border-primary/30"><ScanLine className="h-3 w-3 mr-1" />OCR</Badge>}
            {advice.payer_name && <Badge variant="secondary">Payer: {advice.payer_name}</Badge>}
          </div>
        )}

        {advice && result && (
          <>
            <KpiGrid cols={4}>
              <KpiCard label="Lines Extracted" value={String(result.summary.totalLines)} icon={<FileText className="h-3.5 w-3.5 text-primary" />} />
              <KpiCard label="Auto-Matched" value={`${result.summary.matchedLines} / ${result.summary.totalLines}`} icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} caption={`${result.summary.totalLines ? Math.round(100 * result.summary.matchedLines / result.summary.totalLines) : 0}% coverage`} />
              <KpiCard label="Matched Amount" value={formatInrShort(result.summary.matchedAmount)} icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} />
              <KpiCard label="Unmatched Amount" value={formatInrShort(result.summary.unmatchedAmount)} icon={<AlertCircle className="h-3.5 w-3.5 text-warning" />} caption="Needs manual review" />
            </KpiGrid>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4" />2. UTR & payment header</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">UTR / Ref</Label>
                  <Input value={utrOverride} onChange={(e) => setUtrOverride(e.target.value)} className="h-8" />
                </div>
                <div>
                  <Label className="text-xs">Payment Date</Label>
                  <Input value={advice.payment_date ?? ""} readOnly className="h-8 bg-muted/50" />
                </div>
                <div>
                  <Label className="text-xs">Payer</Label>
                  <Input value={advice.payer_name ?? ""} readOnly className="h-8 bg-muted/50" />
                </div>
                <div>
                  <Label className="text-xs">Advice Total</Label>
                  <Input value={formatInrShort(advice.total_amount)} readOnly className="h-8 bg-muted/50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-sm">3. Claim-wise breakup ({result.matches.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-xs">Claim No</TableHead>
                        <TableHead className="text-xs">Patient</TableHead>
                        <TableHead className="text-xs text-right">Billed</TableHead>
                        <TableHead className="text-xs text-right">Approved</TableHead>
                        <TableHead className="text-xs text-right">TDS</TableHead>
                        <TableHead className="text-xs text-right">Net Paid</TableHead>
                        <TableHead className="text-xs">Matched → Claim</TableHead>
                        <TableHead className="text-xs">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.matches.map((m, i) => (
                        <TableRow key={i} className={!m.claim ? "bg-destructive/5" : ""}>
                          <TableCell className="font-mono text-xs">{m.line.claim_number}</TableCell>
                          <TableCell className="text-xs">{m.line.patient_name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-right">{m.line.billed_amount ? formatInrShort(m.line.billed_amount) : "—"}</TableCell>
                          <TableCell className="text-xs text-right">{m.line.approved_amount ? formatInrShort(m.line.approved_amount) : "—"}</TableCell>
                          <TableCell className="text-xs text-right">{m.line.tds ? formatInrShort(m.line.tds) : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{formatInrShort(m.line.net_paid)}</TableCell>
                          <TableCell className="text-xs">
                            {m.claim ? (
                              <div className="flex flex-col">
                                <span className="font-mono">{m.claim.claim_number}</span>
                                <span className="text-[10px] text-muted-foreground">{m.claim.patient_name}</span>
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{confidenceBadge(m)}</TableCell>
                        </TableRow>
                      ))}
                      {result.matches.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">No claim rows detected. Try pasting the text manually.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <ReconciliationSummary
              advice={advice}
              utr={utrOverride || advice.utr || "—"}
              matches={result.matches}
              summary={result.summary}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}

interface ReconSummaryProps {
  advice: ParsedPaymentAdvice;
  utr: string;
  matches: AdviceLineMatch[];
  summary: { totalLines: number; matchedLines: number; totalAmount: number; matchedAmount: number; unmatchedAmount: number };
}

function ReconciliationSummary({ advice, utr, matches, summary }: ReconSummaryProps) {
  const matched = matches.filter((m) => m.claim);
  const unmatched = matches.filter((m) => !m.claim);
  const review = matched.filter((m) => m.confidence < 90);
  const autoMatched = matched.filter((m) => m.confidence >= 90);

  const byMethod = matched.reduce<Record<string, { count: number; amount: number }>>((acc, m) => {
    const k = m.method;
    if (!acc[k]) acc[k] = { count: 0, amount: 0 };
    acc[k].count += 1;
    acc[k].amount += m.line.net_paid || 0;
    return acc;
  }, {});

  const methodLabel: Record<string, string> = {
    claim_number: "Exact claim number",
    initial_claim_number: "Partial claim number",
    "patient+amount": "Patient name + amount",
    amount_only: "Unique amount only",
    none: "No match",
  };

  const shortPay = matched.filter((m) => m.claim?.approved_amount && Math.abs((m.claim.approved_amount as number) - m.line.net_paid) > Math.max(5, (m.claim.approved_amount as number) * 0.02));
  const shortPayAmount = shortPay.reduce((s, m) => s + Math.max(0, (m.claim!.approved_amount as number) - m.line.net_paid), 0);

  const exportSummary = () => {
    const lines: (string | number)[][] = [
      ["Reconciliation Summary Report"],
      ["Generated", new Date().toLocaleString()],
      ["UTR / Ref", utr],
      ["Payment Date", advice.payment_date || "—"],
      ["Payer", advice.payer_name || "—"],
      ["Layout", advice.layout],
      ["Used OCR", advice.used_ocr ? "Yes" : "No"],
      [],
      ["Totals"],
      ["Advice Total", advice.total_amount],
      ["Matched Amount", summary.matchedAmount],
      ["Unmatched Amount", summary.unmatchedAmount],
      ["Short-pay Gap (matched)", shortPayAmount],
      [],
      ["Counts"],
      ["Lines extracted", summary.totalLines],
      ["Auto-matched (≥90%)", autoMatched.length],
      ["Needs review (<90%)", review.length],
      ["Unmatched", unmatched.length],
      [],
      ["Match method breakdown"],
      ["Method", "Count", "Amount"],
      ...Object.entries(byMethod).map(([k, v]) => [methodLabel[k] ?? k, v.count, v.amount]),
      [],
      ["Unmatched / low-confidence lines"],
      ["Claim No", "Patient", "Net Paid", "Confidence", "Reason"],
      ...[...unmatched, ...review].map((m) => [
        m.line.claim_number ?? "",
        m.line.patient_name ?? "",
        m.line.net_paid,
        m.claim ? `${m.confidence}%` : "Unmatched",
        m.reasons.join("; "),
      ]),
    ];
    const csv = lines.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recon-summary-${utr.replace(/[^A-Z0-9]/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />4. Reconciliation summary report</CardTitle>
        <Button size="sm" variant="outline" onClick={exportSummary}><Download className="h-3 w-3 mr-1" />Export report</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Auto-matched</div>
            <div className="text-lg font-semibold text-success">{autoMatched.length}</div>
            <div className="text-[11px] text-muted-foreground">{formatInrShort(autoMatched.reduce((s, m) => s + m.line.net_paid, 0))}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Needs review</div>
            <div className="text-lg font-semibold text-warning">{review.length}</div>
            <div className="text-[11px] text-muted-foreground">Confidence &lt; 90%</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Unmatched</div>
            <div className="text-lg font-semibold text-destructive">{unmatched.length}</div>
            <div className="text-[11px] text-muted-foreground">{formatInrShort(unmatched.reduce((s, m) => s + m.line.net_paid, 0))}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Short-pay gap</div>
            <div className="text-lg font-semibold text-destructive">{formatInrShort(shortPayAmount)}</div>
            <div className="text-[11px] text-muted-foreground">{shortPay.length} claims &gt; 2% short</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2">Match method breakdown</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs text-right">Count</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Confidence tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byMethod).map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="text-xs">{methodLabel[k] ?? k}</TableCell>
                  <TableCell className="text-xs text-right">{v.count}</TableCell>
                  <TableCell className="text-xs text-right">{formatInrShort(v.amount)}</TableCell>
                  <TableCell className="text-xs">
                    {k === "claim_number" && <Badge className="bg-success text-success-foreground">High (92-100%)</Badge>}
                    {k === "initial_claim_number" && <Badge className="bg-primary text-primary-foreground">Medium (~80%)</Badge>}
                    {k === "patient+amount" && <Badge className="bg-primary text-primary-foreground">Medium (~78%)</Badge>}
                    {k === "amount_only" && <Badge variant="secondary">Low (~55%)</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {Object.keys(byMethod).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">No matches yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {(unmatched.length > 0 || review.length > 0) && (
          <div>
            <div className="text-xs font-medium mb-2">Mismatch reasons ({unmatched.length + review.length})</div>
            <div className="max-h-64 overflow-auto rounded border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs">Claim No (advice)</TableHead>
                    <TableHead className="text-xs">Patient</TableHead>
                    <TableHead className="text-xs text-right">Net Paid</TableHead>
                    <TableHead className="text-xs">Confidence</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...unmatched, ...review].map((m, i) => (
                    <TableRow key={i} className={!m.claim ? "bg-destructive/5" : "bg-warning/5"}>
                      <TableCell className="font-mono text-xs">{m.line.claim_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">{m.line.patient_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{formatInrShort(m.line.net_paid)}</TableCell>
                      <TableCell className="text-xs">{m.claim ? `${m.confidence}%` : "Unmatched"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.reasons.join("; ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
