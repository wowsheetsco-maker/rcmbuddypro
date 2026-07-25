import { useCallback, useMemo, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { toast } from "@/hooks/use-toast";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInrShort } from "@/data/mockClaims";
import {
  parsePaymentAdvicePdf, parsePaymentAdviceText, matchAdviceLines,
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

  const onFile = useCallback(async (file: File) => {
    setParsing(true);
    try {
      const res = await parsePaymentAdvicePdf(file);
      setAdvice(res);
      setUtrOverride(res.utr ?? "");
      toast({ title: "Payment advice parsed", description: `${res.lines.length} claim rows extracted from ${file.name}` });
    } catch (e) {
      toast({ title: "Could not parse PDF", description: (e as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }, []);

  const runManual = useCallback(() => {
    if (!manualText.trim()) return;
    const res = parsePaymentAdviceText(manualText);
    setAdvice(res);
    setUtrOverride(res.utr ?? "");
    toast({ title: "Text parsed", description: `${res.lines.length} claim rows extracted` });
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
              {parsing && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Extracting…</span>}
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Or paste text manually (if PDF is a scan)</summary>
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
          </>
        )}
      </div>
    </AppLayout>
  );
}
