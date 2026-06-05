import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardCopy, Clock, Download,
  FileDown, Gavel, IndianRupee, Loader2, Send, Sparkles, X, XCircle,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatInrShort } from "@/data/mockClaims";
import type { Claim } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { buildPayerStats } from "@/lib/payerScorecard";
import { buildWorklist, ageBucketOf, type PriorityScore } from "@/lib/arPrioritization";
import { WRITEOFF_REASONS, requiredApprover, ROLE_LABEL, type WriteoffReason } from "@/lib/arPolicy";
import { buildHandoffPacket, packetToText, downloadPacket } from "@/lib/collectionsPacket";

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const AGE_BUCKETS = ["0-30", "31-60", "61-90", "91-180", "180+"] as const;
type AgeBucket = typeof AGE_BUCKETS[number];

const BUCKET_TONE: Record<AgeBucket, string> = {
  "0-30":   "text-success",
  "31-60":  "text-primary",
  "61-90":  "text-warning",
  "91-180": "text-orange-500",
  "180+":   "text-destructive",
};

interface WriteoffRow {
  id: string;
  claim_id: string;
  reason: WriteoffReason;
  amount: number;
  justification: string | null;
  status: "pending" | "approved" | "rejected" | "posted";
  required_approver_role: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

interface PlacementRow {
  id: string;
  claim_id: string;
  agency_name: string;
  agency_contact: string | null;
  placed_at: string;
  status: string;
  recovered_amount: number;
  notes: string | null;
  handoff_packet: Record<string, unknown>;
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function ArManagementPage() {
  const { claims, loading } = useLiveClaims();
  const [tab, setTab] = useState("aging");

  // DB-backed lists
  const [writeoffs, setWriteoffs] = useState<WriteoffRow[]>([]);
  const [placements, setPlacements] = useState<PlacementRow[]>([]);

  const loadWriteoffs = useCallback(async () => {
    const { data } = await supabase.from("ar_writeoff_requests")
      .select("id,claim_id,reason,amount,justification,status,required_approver_role,approved_by,approved_at,rejected_reason,created_at")
      .order("created_at", { ascending: false }).limit(200);
    setWriteoffs((data ?? []) as WriteoffRow[]);
  }, []);
  const loadPlacements = useCallback(async () => {
    const { data } = await supabase.from("ar_collections_placements")
      .select("id,claim_id,agency_name,agency_contact,placed_at,status,recovered_amount,notes,handoff_packet")
      .order("placed_at", { ascending: false }).limit(200);
    setPlacements((data ?? []) as PlacementRow[]);
  }, []);

  useEffect(() => { void loadWriteoffs(); void loadPlacements(); }, [loadWriteoffs, loadPlacements]);

  // Open claims & payer stats
  const openClaims = useMemo(
    () => claims.filter((c) => !SETTLED.has((c.claim_status ?? "").toLowerCase()) && Number(c.outstanding_amount ?? 0) > 0),
    [claims],
  );
  const tpaStats = useMemo(() => buildPayerStats(claims, "tpa"), [claims]);
  const worklist = useMemo(() => buildWorklist(claims, tpaStats), [claims, tpaStats]);
  const claimById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);

  // ------ Aging pivot: payer × bucket ------
  interface PayerRow { name: string; total: number; counts: Record<AgeBucket, number>; amounts: Record<AgeBucket, number>; }
  const { matrix, grandTotal, bucketTotals } = useMemo(() => {
    const m = new Map<string, PayerRow>();
    const totals: Record<AgeBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
    let grand = 0;
    for (const c of openClaims) {
      const name = c.tpa_name ?? c.insurance_company_name ?? "Unknown";
      const bucket = ageBucketOf(c.days_since_claim ?? 0);
      const amt = Number(c.outstanding_amount ?? 0);
      let r = m.get(name);
      if (!r) {
        r = { name, total: 0, counts: { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 }, amounts: { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 } };
        m.set(name, r);
      }
      r.total += amt; r.amounts[bucket] += amt; r.counts[bucket] += 1;
      totals[bucket] += amt; grand += amt;
    }
    return { matrix: [...m.values()].sort((a, b) => b.total - a.total), grandTotal: grand, bucketTotals: totals };
  }, [openClaims]);

  // Drill-through for a payer×bucket cell
  const [drill, setDrill] = useState<{ payer: string; bucket: AgeBucket; claims: Claim[] } | null>(null);
  const openCell = (row: PayerRow, bucket: AgeBucket) => {
    const list = openClaims
      .filter((c) => (c.tpa_name ?? c.insurance_company_name ?? "Unknown") === row.name && ageBucketOf(c.days_since_claim ?? 0) === bucket)
      .sort((a, b) => Number(b.outstanding_amount ?? 0) - Number(a.outstanding_amount ?? 0));
    setDrill({ payer: row.name, bucket, claims: list });
  };

  // ------ Write-off dialog ------
  const [woClaim, setWoClaim] = useState<Claim | null>(null);
  const [woReason, setWoReason] = useState<WriteoffReason>("small_balance");
  const [woAmount, setWoAmount] = useState<string>("");
  const [woJust, setWoJust] = useState("");
  const openWriteoff = (c: Claim) => {
    setWoClaim(c); setWoReason("small_balance");
    setWoAmount(String(Math.round(Number(c.outstanding_amount ?? 0)))); setWoJust("");
  };
  const submitWriteoff = async () => {
    if (!woClaim) return;
    const amt = Number(woAmount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const role = requiredApprover(woReason, amt);
    const { error } = await supabase.from("ar_writeoff_requests").insert({
      org_id: getCurrentOrgId(),
      claim_id: woClaim.id, reason: woReason, amount: amt,
      justification: woJust || null,
      required_approver_role: role,
    });
    if (error) { toast.error("Failed to submit", { description: error.message }); return; }
    toast.success(`Write-off request submitted · needs ${ROLE_LABEL[role]} approval`);
    setWoClaim(null);
    void loadWriteoffs();
  };

  const decideWriteoff = async (id: string, decision: "approved" | "rejected") => {
    const patch: Partial<WriteoffRow> = {
      status: decision,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
      rejected_reason: decision === "rejected" ? "Rejected by approver" : null,
    };
    const { error } = await supabase.from("ar_writeoff_requests").update(patch).eq("id", id);
    if (error) { toast.error("Failed", { description: error.message }); return; }
    toast.success(decision === "approved" ? "Write-off approved" : "Write-off rejected");
    void loadWriteoffs();
  };
  const postWriteoff = async (id: string) => {
    const { error } = await supabase.from("ar_writeoff_requests")
      .update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Failed", { description: error.message }); return; }
    toast.success("Posted to ledger");
    void loadWriteoffs();
  };

  // ------ Collections placement dialog ------
  const [plClaim, setPlClaim] = useState<Claim | null>(null);
  const [plAgency, setPlAgency] = useState("");
  const [plContact, setPlContact] = useState("");
  const [plNotes, setPlNotes] = useState("");
  const openPlacement = (c: Claim) => { setPlClaim(c); setPlAgency(""); setPlContact(""); setPlNotes(""); };
  const submitPlacement = async () => {
    if (!plClaim) return;
    if (!plAgency.trim()) { toast.error("Agency name required"); return; }
    const packet = buildHandoffPacket(plClaim, plNotes);
    const { error } = await supabase.from("ar_collections_placements").insert({
      org_id: getCurrentOrgId(),
      claim_id: plClaim.id,
      agency_name: plAgency.trim(),
      agency_contact: plContact || null,
      handoff_packet: packet as never,
      notes: plNotes || null,
      status: "placed",
    });
    if (error) { toast.error("Failed", { description: error.message }); return; }
    toast.success(`Placed with ${plAgency.trim()}`);
    setPlClaim(null);
    void loadPlacements();
  };

  // Packet preview dialog
  const [previewPacket, setPreviewPacket] = useState<{ packet: Record<string, unknown>; claimNumber: string } | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Accounts Receivable Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aging pivot · prioritized worklist · write-off approvals · collections placement
            {loading && <Loader2 className="h-3 w-3 inline ml-2 animate-spin" />}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/analytics/payer-scorecard"><Building2 className="h-3 w-3 mr-1" /> Payer scorecard</Link>
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Open claims" value={openClaims.length.toLocaleString("en-IN")} />
        <KpiCard label="Total AR" value={formatInrShort(grandTotal)} tone="warning" />
        <KpiCard label="90+ days" value={formatInrShort(bucketTotals["91-180"] + bucketTotals["180+"])} tone="destructive" />
        <KpiCard label="Pending write-offs" value={writeoffs.filter((w) => w.status === "pending").length} />
        <KpiCard label="In collections" value={placements.filter((p) => p.status === "placed").length} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="aging"><Clock className="h-3 w-3 mr-1" /> Aging matrix</TabsTrigger>
          <TabsTrigger value="worklist"><Sparkles className="h-3 w-3 mr-1" /> Worklist ({worklist.length})</TabsTrigger>
          <TabsTrigger value="writeoffs"><Gavel className="h-3 w-3 mr-1" /> Write-offs ({writeoffs.length})</TabsTrigger>
          <TabsTrigger value="collections"><Send className="h-3 w-3 mr-1" /> Collections ({placements.length})</TabsTrigger>
        </TabsList>

        {/* AGING MATRIX */}
        <TabsContent value="aging" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> Payer × Age × Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Payer</th>
                      {AGE_BUCKETS.map((b) => (
                        <th key={b} className={`text-right px-3 py-2 font-medium ${BUCKET_TONE[b]}`}>{b} d</th>
                      ))}
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                    <tr className="bg-muted/20 border-b text-xs text-muted-foreground">
                      <td className="px-3 py-1.5 italic">Portfolio total</td>
                      {AGE_BUCKETS.map((b) => (
                        <td key={b} className="px-3 py-1.5 text-right tabular-nums">{formatInrShort(bucketTotals[b])}</td>
                      ))}
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatInrShort(grandTotal)}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No open AR.</td></tr>
                    ) : matrix.map((row) => (
                      <tr key={row.name} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          <Link to={`/analytics/tpa-report?payer=${encodeURIComponent(row.name)}&type=tpa`} className="hover:underline">
                            {row.name}
                          </Link>
                        </td>
                        {AGE_BUCKETS.map((b) => {
                          const amt = row.amounts[b]; const cnt = row.counts[b];
                          if (cnt === 0) return <td key={b} className="px-3 py-2 text-right text-muted-foreground">—</td>;
                          return (
                            <td key={b} className="px-3 py-2 text-right">
                              <button
                                onClick={() => openCell(row, b)}
                                className={`inline-flex flex-col items-end gap-0.5 hover:bg-accent rounded px-2 py-1 -my-1 ${BUCKET_TONE[b]}`}
                              >
                                <span className="font-medium tabular-nums">{formatInrShort(amt)}</span>
                                <span className="text-[10px] text-muted-foreground">{cnt} claim{cnt === 1 ? "" : "s"}</span>
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatInrShort(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WORKLIST */}
        <TabsContent value="worklist" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Prioritized worklist
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ranked by <strong>value × age × recovery probability × payer behavior</strong>. Top of the list is the highest expected return per hour of follow-up.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-12">#</th>
                      <th className="text-left px-3 py-2 font-medium">Claim · Patient</th>
                      <th className="text-left px-3 py-2 font-medium">Payer</th>
                      <th className="text-right px-3 py-2 font-medium">Outstanding</th>
                      <th className="text-right px-3 py-2 font-medium">Age</th>
                      <th className="text-right px-3 py-2 font-medium">Recovery prob</th>
                      <th className="text-right px-3 py-2 font-medium">Score</th>
                      <th className="text-left px-3 py-2 font-medium">Why</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No open claims.</td></tr>
                    ) : worklist.slice(0, 100).map((w, i) => <WorklistRow key={w.claim.id} index={i + 1} item={w} onWriteoff={() => openWriteoff(w.claim)} onPlace={() => openPlacement(w.claim)} />)}
                    {worklist.length > 100 && (
                      <tr><td colSpan={9} className="text-center py-3 text-xs text-muted-foreground">Showing top 100 of {worklist.length}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WRITE-OFFS */}
        <TabsContent value="writeoffs" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Write-off requests</CardTitle>
              <p className="text-xs text-muted-foreground">
                Approval ladder: small balances → Team Lead · mid amounts → Manager · large or bad-debt → Admin / Owner.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Claim · Patient</th>
                      <th className="text-left px-3 py-2 font-medium">Reason</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      <th className="text-left px-3 py-2 font-medium">Required approver</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Justification</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeoffs.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No write-off requests yet. Submit one from the worklist.</td></tr>
                    ) : writeoffs.map((w) => {
                      const c = claimById.get(w.claim_id);
                      const tone = w.status === "approved" ? "bg-success/10 text-success border-success/30"
                        : w.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/30"
                        : w.status === "posted" ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-warning/10 text-warning border-warning/30";
                      const reasonLabel = WRITEOFF_REASONS.find((r) => r.value === w.reason)?.label ?? w.reason;
                      return (
                        <tr key={w.id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="font-medium font-mono text-xs">{c?.claim_number ?? "—"}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{c?.patient_name ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2">{reasonLabel}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{inr(w.amount)}</td>
                          <td className="px-3 py-2 text-xs">{ROLE_LABEL[w.required_approver_role as keyof typeof ROLE_LABEL] ?? w.required_approver_role}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className={tone}>{w.status}</Badge></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={w.justification ?? ""}>{w.justification ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            {w.status === "pending" && (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="default" onClick={() => decideWriteoff(w.id, "approved")}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => decideWriteoff(w.id, "rejected")}>
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                              </div>
                            )}
                            {w.status === "approved" && (
                              <Button size="sm" variant="outline" onClick={() => postWriteoff(w.id)}>Post to ledger</Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COLLECTIONS */}
        <TabsContent value="collections" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Collections placements</CardTitle>
              <p className="text-xs text-muted-foreground">Bad-debt placements with handoff packets ready for the agency.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Claim · Patient</th>
                      <th className="text-left px-3 py-2 font-medium">Agency</th>
                      <th className="text-left px-3 py-2 font-medium">Placed</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Recovered</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {placements.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No placements yet. Place a claim from the worklist.</td></tr>
                    ) : placements.map((p) => {
                      const c = claimById.get(p.claim_id);
                      return (
                        <tr key={p.id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="font-medium font-mono text-xs">{c?.claim_number ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{c?.patient_name ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div>{p.agency_name}</div>
                            <div className="text-xs text-muted-foreground">{p.agency_contact ?? ""}</div>
                          </td>
                          <td className="px-3 py-2 text-xs">{new Date(p.placed_at).toLocaleDateString("en-IN")}</td>
                          <td className="px-3 py-2"><Badge variant="outline">{p.status}</Badge></td>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(Number(p.recovered_amount || 0))}</td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => setPreviewPacket({ packet: p.handoff_packet, claimNumber: c?.claim_number ?? "claim" })}>
                              <FileDown className="h-3 w-3 mr-1" /> Packet
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drill cell dialog */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{drill?.payer} · aged {drill?.bucket} days</DialogTitle>
            <DialogDescription>{drill?.claims.length} claim{drill?.claims.length === 1 ? "" : "s"} · {formatInrShort(drill?.claims.reduce((a, c) => a + Number(c.outstanding_amount ?? 0), 0) ?? 0)} outstanding</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Claim</th>
                  <th className="text-left px-3 py-2">Patient</th>
                  <th className="text-right px-3 py-2">Days</th>
                  <th className="text-right px-3 py-2">Outstanding</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {drill?.claims.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-3 py-2 font-mono text-xs">{c.claim_number}</td>
                    <td className="px-3 py-2 text-xs">{c.patient_name}</td>
                    <td className="px-3 py-2 text-right text-xs">{c.days_since_claim}d</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{inr(Number(c.outstanding_amount ?? 0))}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setDrill(null); openWriteoff(c); }}>Write off</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setDrill(null); openPlacement(c); }}>Collections</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Write-off dialog */}
      <Dialog open={!!woClaim} onOpenChange={(o) => !o && setWoClaim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request write-off</DialogTitle>
            <DialogDescription>
              {woClaim?.claim_number} · {woClaim?.patient_name} · outstanding {inr(Number(woClaim?.outstanding_amount ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={woReason} onValueChange={(v) => setWoReason(v as WriteoffReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WRITEOFF_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label} — <span className="text-muted-foreground text-xs">{r.hint}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input type="number" value={woAmount} onChange={(e) => setWoAmount(e.target.value)} />
            </div>
            <div>
              <Label>Justification</Label>
              <Textarea rows={3} value={woJust} onChange={(e) => setWoJust(e.target.value)} placeholder="Brief explanation for the approver." />
            </div>
            <div className="text-xs bg-muted/40 rounded p-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Requires approval from <strong>{ROLE_LABEL[requiredApprover(woReason, Number(woAmount) || 0)]}</strong>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWoClaim(null)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
            <Button onClick={submitWriteoff}><ArrowRight className="h-4 w-4 mr-1" /> Submit request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Placement dialog */}
      <Dialog open={!!plClaim} onOpenChange={(o) => !o && setPlClaim(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Place to collections</DialogTitle>
            <DialogDescription>
              {plClaim?.claim_number} · {plClaim?.patient_name} · outstanding {inr(Number(plClaim?.outstanding_amount ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agency name *</Label>
                <Input value={plAgency} onChange={(e) => setPlAgency(e.target.value)} placeholder="e.g. Acme Recovery LLP" />
              </div>
              <div>
                <Label>Agency contact</Label>
                <Input value={plContact} onChange={(e) => setPlContact(e.target.value)} placeholder="Email / phone" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={plNotes} onChange={(e) => setPlNotes(e.target.value)} placeholder="Any context for the agency (last contact, prior promises, etc.)" />
            </div>
            {plClaim && (
              <div className="border rounded p-3 bg-muted/30">
                <div className="text-xs font-medium mb-2 flex items-center gap-2">
                  <FileDown className="h-3 w-3" /> Handoff packet preview
                </div>
                <pre className="text-[10.5px] whitespace-pre-wrap leading-snug max-h-40 overflow-y-auto font-mono">
                  {packetToText(buildHandoffPacket(plClaim, plNotes))}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlClaim(null)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
            {plClaim && (
              <Button variant="outline" onClick={() => downloadPacket(buildHandoffPacket(plClaim, plNotes), plClaim.claim_number)}>
                <Download className="h-4 w-4 mr-1" /> Download packet
              </Button>
            )}
            <Button onClick={submitPlacement}><Send className="h-4 w-4 mr-1" /> Place & log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packet preview */}
      <Dialog open={!!previewPacket} onOpenChange={(o) => !o && setPreviewPacket(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Handoff packet · {previewPacket?.claimNumber}</DialogTitle>
          </DialogHeader>
          {previewPacket && (
            <pre className="text-xs whitespace-pre-wrap leading-snug max-h-[60vh] overflow-y-auto font-mono border rounded p-3 bg-muted/30">
              {packetToText(previewPacket.packet as unknown as ReturnType<typeof buildHandoffPacket>)}
            </pre>
          )}
          <DialogFooter>
            {previewPacket && (
              <>
                <Button variant="outline" onClick={() => {
                  void navigator.clipboard.writeText(packetToText(previewPacket.packet as unknown as ReturnType<typeof buildHandoffPacket>));
                  toast.success("Copied to clipboard");
                }}>
                  <ClipboardCopy className="h-4 w-4 mr-1" /> Copy
                </Button>
                <Button onClick={() => downloadPacket(previewPacket.packet as unknown as ReturnType<typeof buildHandoffPacket>, previewPacket.claimNumber)}>
                  <Download className="h-4 w-4 mr-1" /> Download
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

function WorklistRow({ index, item, onWriteoff, onPlace }: {
  index: number; item: PriorityScore; onWriteoff: () => void; onPlace: () => void;
}) {
  const c = item.claim;
  const out = Number(c.outstanding_amount ?? 0);
  const days = c.days_since_claim ?? 0;
  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2 text-xs text-muted-foreground">{index}</td>
      <td className="px-3 py-2">
        <div className="font-mono text-xs font-medium">{c.claim_number}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{c.patient_name}</div>
      </td>
      <td className="px-3 py-2 text-xs">{c.tpa_name ?? c.insurance_company_name ?? "—"}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{inr(out)}</td>
      <td className={`px-3 py-2 text-right text-xs ${days > 120 ? "text-destructive font-medium" : days > 60 ? "text-warning" : ""}`}>{days}d</td>
      <td className="px-3 py-2 text-right text-xs">{Math.round(item.recoveryProb * 100)}%</td>
      <td className="px-3 py-2 text-right">
        <Badge variant="outline" className={item.score >= 5 ? "border-destructive/40 text-destructive" : item.score >= 3 ? "border-warning/40 text-warning" : ""}>
          {item.score.toFixed(2)}
        </Badge>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={item.reasons.join(" · ")}>
        {item.reasons.join(" · ") || "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={onWriteoff}>Write off</Button>
          <Button size="sm" variant="ghost" onClick={onPlace}>Collections</Button>
        </div>
      </td>
    </tr>
  );
}
