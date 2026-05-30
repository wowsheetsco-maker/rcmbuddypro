import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Copy, Download, FileSpreadsheet, FileText, Loader2, Mail, Printer, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInrShort } from "@/data/mockClaims";
import {
  buildPayerStats, buildTalkingPoints, GRADE_TONE, type PayerStats,
} from "@/lib/payerScorecard";
import { buildBenchmarks } from "@/lib/payerBenchmarks";
import { buildPayerTrend } from "@/lib/payerTrends";
import { exportTpaReportXlsx, exportTpaReportPdf } from "@/lib/tpaReportExport";
import { Sparkline } from "@/components/Sparkline";
import { findContactForProvider, useInsurerContacts } from "@/hooks/useInsurerContacts";

const SEVERITY_TONE: Record<"high" | "medium" | "low", string> = {
  high: "border-l-destructive bg-destructive/5",
  medium: "border-l-warning bg-warning/5",
  low: "border-l-accent bg-accent/5",
};
const SEVERITY_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-accent/15 text-accent-foreground border-accent/40",
};

export default function TpaReportPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const { contacts } = useInsurerContacts();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"tpa" | "insurer">(
    (params.get("type") as "tpa" | "insurer") || "tpa",
  );
  const [selected, setSelected] = useState<string>(params.get("payer") || "");

  const payers = useMemo(() => buildPayerStats(claims, view), [claims, view]);
  const benchmarks = useMemo(() => buildBenchmarks(payers), [payers]);

  useEffect(() => {
    if (!selected && payers.length > 0) setSelected(payers[0].name);
  }, [selected, payers]);

  useEffect(() => {
    if (!selected) return;
    const next = new URLSearchParams(params);
    next.set("payer", selected);
    next.set("type", view);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, view]);

  const payer: PayerStats | undefined = useMemo(
    () => payers.find((p) => p.name === selected),
    [payers, selected],
  );

  const trend = useMemo(
    () => (payer ? buildPayerTrend(claims, payer.name, view, 6) : []),
    [claims, payer, view],
  );

  const points = useMemo(() => (payer ? buildTalkingPoints(payer) : []), [payer]);
  const contact = useMemo(
    () => (payer ? findContactForProvider(contacts, payer.name) : undefined),
    [contacts, payer],
  );

  const buildEmailBody = () => {
    if (!payer) return "";
    const intro = `Dear ${contact?.contact_name || "Team"},

Sharing our internal performance summary for ${payer.name} ahead of our review:`;
    const kpis = [
      `• Total claims: ${payer.claims.toLocaleString("en-IN")} (${payer.uniquePatients} unique patients)`,
      `• Approved: ${formatInrShort(payer.approved)} · Settled: ${formatInrShort(payer.settled)}`,
      `• Net realisation: ${payer.netRealPct}% (portfolio median ${benchmarks.median.netRealPct}%)`,
      `• Avg settlement TAT: ${payer.avgTat || "—"}d (SLA 30d benchmark)`,
      `• Outstanding: ${formatInrShort(payer.outstanding)}`,
      `• Internal grade: ${payer.grade} (${payer.score}/100)`,
    ].join("\n");
    const tp = points.length
      ? "\n\nKey discussion points:\n" +
        points.map((p, i) => `${i + 1}. ${p.title}\n   ${p.detail}`).join("\n")
      : "";
    return `${intro}\n\n${kpis}${tp}\n\nLooking forward to your reply with a proposed resolution timeline.\n\nThank you,\nRevenue Cycle Team`;
  };

  const handleCopy = () => {
    if (!payer) return;
    const lines = [
      `TPA Negotiation Report — ${payer.name}`,
      `Grade ${payer.grade} (Score ${payer.score}/100)`,
      `Claims: ${payer.claims} · Unique Patients: ${payer.uniquePatients} · Outstanding: ${formatInrShort(payer.outstanding)}`,
      `Net Realisation ${payer.netRealPct}% (median ${benchmarks.median.netRealPct}%) · Approval ${payer.approvalPct}% (median ${benchmarks.median.approvalPct}%) · Avg TAT ${payer.avgTat}d · Disc ${payer.discPct}%`,
      "",
      "Talking points:",
      ...points.map((p, i) => `${i + 1}. [${p.severity.toUpperCase()}] ${p.title}\n   ${p.detail}`),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Talking points copied", { description: "Paste into your prep doc or email." });
  };

  const handleEmail = () => {
    if (!payer) return;
    if (!contact) {
      toast.error("No primary contact saved", {
        description: `Add a primary contact for "${payer.name}" in Contacts first.`,
        action: { label: "Open Contacts", onClick: () => window.open("/providers/contacts", "_blank") },
      });
      return;
    }
    const subject = `Performance review — ${payer.name} (Grade ${payer.grade})`;
    const cc = contact.cc_emails ? `&cc=${encodeURIComponent(contact.cc_emails)}` : "";
    const url = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}${cc}&body=${encodeURIComponent(buildEmailBody())}`;
    window.location.href = url;
  };

  return (
    <AppLayout>
      <div className="space-y-5 print:space-y-3">
        {/* Print-only header */}
        <div className="hidden print:block border-b pb-2 mb-2">
          <h1 className="text-lg font-display text-foreground">
            TPA Negotiation Report — {payer?.name ?? ""}
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Generated {new Date().toLocaleString("en-IN")} · City Hospital, Mumbai
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link to="/analytics/payer-scorecard" className="inline-flex items-center gap-1 hover:text-foreground">
                <ArrowLeft className="h-3 w-3" /> Payer Scorecard
              </Link>
            </div>
            <h1 className="text-2xl font-display text-foreground mt-0.5">TPA Negotiation Report</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              Per-payer dossier with talking points for rate revision meetings
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && (
                <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
              {(["tpa", "insurer"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { setView(v); setSelected(""); }}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "tpa" ? "By TPA" : "By Insurer"}
                </button>
              ))}
            </div>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-9 w-[18rem] text-xs">
                <SelectValue placeholder="Select payer..." />
              </SelectTrigger>
              <SelectContent className="max-h-[20rem]">
                {payers.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span className="truncate max-w-[14rem]">{p.name}</span>
                      <span className={`text-[10px] px-1.5 rounded border ${GRADE_TONE[p.grade]}`}>
                        {p.grade}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!payer}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={handleEmail} disabled={!payer}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!payer}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => {
                    if (!payer) return;
                    exportTpaReportXlsx({ payer, benchmarks, trend, points, contact, view });
                    toast.success("XLSX downloaded", { description: `Report for ${payer.name}` });
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> XLSX workbook
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportTpaReportPdf()}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> PDF (via print)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-2" /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!payer ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Select a payer to generate the report.
          </Card>
        ) : (
          <>
            {/* KPIs with benchmark deltas */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiTile label="Total Claims" value={payer.claims.toLocaleString("en-IN")} bench={`med ${benchmarks.median.claims}`} accent="primary" />
              <KpiTile label="Unique Patients" value={payer.uniquePatients.toString()} bench={`med ${benchmarks.median.uniquePatients}`} accent="secondary" />
              <KpiTile label="Total Claimed" value={formatInrShort(payer.claimed)} accent="primary" />
              <KpiTile
                label="Net Realisation"
                value={`${payer.netRealPct}%`}
                bench={`med ${benchmarks.median.netRealPct}%`}
                deltaPct={payer.netRealPct - benchmarks.median.netRealPct}
                accent={payer.netRealPct >= 80 ? "success" : "warning"}
              />
              <KpiTile
                label="SLA Breach"
                value={payer.irdaiBreach.toString()}
                accent={payer.irdaiBreach > 0 ? "destructive" : "success"}
              />
              <KpiTile
                label="Avg Settlement"
                value={payer.avgTat > 0 ? `${payer.avgTat}d` : "—"}
                bench={benchmarks.median.avgTat ? `med ${benchmarks.median.avgTat}d` : undefined}
                deltaPct={payer.avgTat && benchmarks.median.avgTat ? -(payer.avgTat - benchmarks.median.avgTat) : 0}
                accent={payer.avgTat > 30 ? "warning" : "success"}
              />
            </div>

            {/* Trend strip */}
            <Card className="p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Last 6 months
                </h3>
                {contact && (
                  <span className="text-[10.5px] text-muted-foreground">
                    Primary contact: <span className="text-foreground font-medium">{contact.contact_name}</span> · {contact.email}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <TrendBlock
                  label="Claims volume"
                  values={trend.map((t) => t.claims)}
                  current={trend[trend.length - 1]?.claims ?? 0}
                  prev={trend[trend.length - 2]?.claims ?? 0}
                  format={(n) => n.toString()}
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                />
                <TrendBlock
                  label="Settled (₹)"
                  values={trend.map((t) => t.settled)}
                  current={trend[trend.length - 1]?.settled ?? 0}
                  prev={trend[trend.length - 2]?.settled ?? 0}
                  format={formatInrShort}
                  stroke="hsl(var(--success))"
                  fill="hsl(var(--success))"
                />
                <TrendBlock
                  label="Net Real %"
                  values={trend.map((t) => t.netRealPct)}
                  current={trend[trend.length - 1]?.netRealPct ?? 0}
                  prev={trend[trend.length - 2]?.netRealPct ?? 0}
                  format={(n) => `${n}%`}
                  stroke="hsl(var(--warning))"
                  fill="hsl(var(--warning))"
                />
              </div>
              <div className="mt-2 flex justify-between text-[9.5px] text-muted-foreground tabular-nums">
                {trend.map((t) => (
                  <span key={t.month}>{t.label}</span>
                ))}
              </div>
            </Card>

            {/* Header bar with payer name + grade */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-1 bg-primary rounded-full" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {points.length} Negotiation Talking Point{points.length === 1 ? "" : "s"} —{" "}
                  <span className="text-foreground">{payer.name}</span>
                </h2>
              </div>
              <span
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded border text-xs font-semibold ${GRADE_TONE[payer.grade]}`}
              >
                Grade {payer.grade}
                <span className="text-muted-foreground font-normal">· {payer.score}/100 · median {benchmarks.median.score}</span>
              </span>
            </div>

            {/* Talking points */}
            <Card className="shadow-sm">
              <ol className="divide-y">
                {points.length === 0 && (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    No issues to flag — this payer is performing within expected thresholds. 🎉
                  </li>
                )}
                {points.map((p, i) => (
                  <li key={p.id} className={`p-4 border-l-4 print-avoid-break ${SEVERITY_TONE[p.severity]}`}>
                    <div className="flex items-start gap-3">
                      <div className="text-sm font-semibold text-muted-foreground tabular-nums w-6 shrink-0 pt-0.5">
                        {i + 1}.
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide ${SEVERITY_BADGE[p.severity]}`}
                          >
                            {p.severity}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {/* Footer line */}
            <div className="text-[11px] text-muted-foreground px-1 print:mt-4">
              Generated from live claims data · Disc% = (Approved − Settled − TDS) / Approved · Grade weighting: Volume 35% · Net Real 25% · Approval 20% · TAT 12% · Disc 8% (low-volume payers capped at B/C). Benchmarks compare against the {view === "tpa" ? "TPA" : "Insurer"} portfolio median.
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function KpiTile({
  label, value, bench, deltaPct, accent,
}: {
  label: string;
  value: string;
  bench?: string;
  deltaPct?: number;
  accent: "primary" | "secondary" | "success" | "warning" | "destructive";
}) {
  const cls: Record<typeof accent, string> = {
    primary: "border-t-primary",
    secondary: "border-t-secondary",
    success: "border-t-success",
    warning: "border-t-warning",
    destructive: "border-t-destructive",
  };
  const valueCls: Record<typeof accent, string> = {
    primary: "text-foreground",
    secondary: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <Card className={`p-3.5 shadow-sm border-t-2 ${cls[accent]}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${valueCls[accent]}`}>{value}</div>
      {(bench || deltaPct !== undefined) && (
        <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
          {bench && <span>{bench}</span>}
          {deltaPct !== undefined && deltaPct !== 0 && Math.abs(deltaPct) >= 0.5 && (
            <span className={deltaPct > 0 ? "text-success font-medium" : "text-destructive font-medium"}>
              {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function TrendBlock({
  label, values, current, prev, format, stroke, fill,
}: {
  label: string;
  values: number[];
  current: number;
  prev: number;
  format: (n: number) => string;
  stroke: string;
  fill: string;
}) {
  const delta = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  const showDelta = prev > 0 && Math.abs(delta) >= 0.5;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
        {showDelta && (
          <span className={`text-[10px] tabular-nums font-medium ${delta > 0 ? "text-success" : "text-destructive"}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{format(current)}</div>
      <Sparkline values={values} stroke={stroke} fill={fill} width={160} height={36} className="mt-1" />
    </div>
  );
}
