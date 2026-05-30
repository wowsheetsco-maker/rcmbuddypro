import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Search, ExternalLink } from "lucide-react";
import { formatInr, formatDays, type Claim } from "@/data/mockClaims";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  claims: Claim[];
  /** Which numeric column to surface as the "amount" right-side number. */
  amountField?: keyof Pick<
    Claim,
    "claimed_amount" | "approved_amount" | "settled_amount" | "outstanding_amount"
  >;
  amountLabel?: string;
  /** Optional "why this number" insight surfaced under the heading. */
  insight?: string;
}

const STATUS_TONE: Array<[RegExp, string]> = [
  [/settled|paid|closed/i, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"],
  [/denied|rejected/i, "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"],
  [/query/i, "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"],
  [/pending|process|approved/i, "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"],
];

function statusClass(s: string) {
  for (const [re, cls] of STATUS_TONE) if (re.test(s)) return cls;
  return "bg-muted text-foreground border-border";
}

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ExecutiveDrillDownDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  claims,
  amountField = "outstanding_amount",
  amountLabel = "Outstanding",
  insight,
}: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return claims;
    const t = q.trim().toLowerCase();
    return claims.filter((c) =>
      [
        c.claim_number,
        c.ihx_ref_id,
        c.patient_name,
        c.tpa_name,
        c.insurance_company_name,
        c.hospital_name,
        c.claim_status,
        c.policy_holder_name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [claims, q]);

  const totals = useMemo(() => {
    const claimed = filtered.reduce((s, c) => s + (c.claimed_amount || 0), 0);
    const approved = filtered.reduce((s, c) => s + (c.approved_amount || 0), 0);
    const settled = filtered.reduce((s, c) => s + (c.settled_amount || 0), 0);
    const outstanding = filtered.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    return { claimed, approved, settled, outstanding };
  }, [filtered]);

  const exportCsv = () => {
    const headers = [
      "Claim #",
      "IHX Ref",
      "Patient",
      "TPA",
      "Insurer",
      "Status",
      "Claimed",
      "Approved",
      "Settled",
      "Outstanding",
      "Created",
      "Discharge",
    ];
    const rows = filtered.map((c) =>
      [
        c.claim_number,
        c.ihx_ref_id,
        c.patient_name,
        c.tpa_name,
        c.insurance_company_name,
        c.claim_status,
        c.claimed_amount,
        c.approved_amount,
        c.settled_amount,
        c.outstanding_amount,
        c.claim_creation_date,
        c.date_of_discharge,
      ]
        .map(csvEscape)
        .join(","),
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base">{title}</SheetTitle>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} className="shrink-0">
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>

          {/* totals strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {[
              { l: "Claims", v: filtered.length.toLocaleString("en-IN") },
              { l: "Claimed", v: formatInr(totals.claimed) },
              { l: "Settled", v: formatInr(totals.settled) },
              { l: "Outstanding", v: formatInr(totals.outstanding) },
            ].map((t) => (
              <div key={t.l} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t.l}
                </div>
                <div className="text-sm font-semibold tabular-nums leading-tight">
                  {t.v}
                </div>
              </div>
            ))}
          </div>

          {insight && (
            <div className="mt-3 rounded-md border-l-2 border-primary/60 bg-muted/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Why this number
              </div>
              <div className="text-[11.5px] leading-snug text-foreground/85 mt-0.5">
                {insight}
              </div>
            </div>
          )}

          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search claim #, patient, TPA, insurer…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-3 py-3">
            {filtered.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-12">
                No claims match this slice.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((c) => {
                  const amt = (c[amountField] as number) || 0;
                  return (
                    <div
                      key={c.id}
                      className="rounded-md border bg-card hover:bg-muted/40 transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold truncate">
                              {c.patient_name}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 ${statusClass(c.claim_status)}`}
                            >
                              {c.claim_status}
                            </Badge>
                            {c.is_irdai_breach && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                              >
                                SLA 90+
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate">
                            #{c.claim_number} · {c.tpa_name}
                            {c.insurance_company_name ? ` · ${c.insurance_company_name}` : ""}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Created {c.claim_creation_date || "—"} · <span className="tabular-nums">{formatDays(c.days_since_claim)}</span> old
                            {c.date_of_discharge ? ` · DC ${c.date_of_discharge}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                            {amountLabel}
                          </div>
                          <div className="text-sm font-semibold tabular-nums">
                            {formatInr(amt)}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            Claimed {formatInr(c.claimed_amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t bg-muted/30 shrink-0 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            Showing {filtered.length.toLocaleString("en-IN")} of {claims.length.toLocaleString("en-IN")} claims
          </div>
          <a
            href="/claims"
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          >
            Open in Claims <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
