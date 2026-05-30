import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Metric } from "@/components/ui/metric";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SortableTh, applyNumericSort, useUrlTableSort, SortStatusBar,
} from "@/components/ui/numeric-cell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid, Legend,
} from "recharts";
import {
  AlertTriangle, IndianRupee, Repeat2, Sparkles, ShieldCheck, FileWarning,
  Loader2, BookOpen, Search, ChevronRight, MoreHorizontal, FileSearch, FileX, Download,
} from "lucide-react";
import { exportClaimsCsv } from "@/lib/claimsCsv";
import AppLayout from "@/components/AppLayout";
import PlaybookDrawer from "@/components/PlaybookDrawer";
import ChecklistDialog from "@/components/ChecklistDialog";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import AiDraftLauncher from "@/components/AiDraftLauncher";
import RowActionButtons from "@/components/RowActionButtons";
import BulkFollowUpComposer, { type ComposerTarget, type FollowUpTone } from "@/components/BulkFollowUpComposer";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useInsurerContacts, findContactForProvider } from "@/hooks/useInsurerContacts";
import { toast } from "sonner";
import type { PlaybookEntry } from "@/data/cashlessPlaybook";
import { formatInr, formatInrShort, formatDays } from "@/data/mockClaims";
import type { Claim } from "@/data/mockClaims";
import { CATEGORY_COLORS } from "@/data/denialCodes";
import {
  CASHLESS_PLAYBOOK, PLAYBOOK_CATEGORY_COLORS, type PlaybookCategory,
} from "@/data/cashlessPlaybook";
import { aggregatePlaybook, matchPlaybook } from "@/lib/playbookMatch";
import {
  getDenialKpis, getInsurerStats, getCategoryStats, getCodeStats, getDenialRows,
} from "@/lib/denialAnalytics";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useInsurerOptions } from "@/hooks/useInsurerOptions";
import { isPreauth } from "@/lib/claimMetrics";
import { ColumnFilter } from "@/components/ui/column-filter";

export default function DenialsPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const { contacts } = useInsurerContacts();
  const { options: insurerOptions } = useInsurerOptions();
  const [openClaim, setOpenClaim] = useState<Claim | null>(null);
  const [checklistEntry, setChecklistEntry] = useState<PlaybookEntry | null>(null);
  const [rowStatusFilter, setRowStatusFilter] = useState<string>("all");
  const [rowInsurerFilter, setRowInsurerFilter] = useState<string>("all");
  const [denialStage, setDenialStage] = useState<"claim" | "preauth">("claim");
  const [pbDept, setPbDept] = useState<string>("all");
  const [pbCategory, setPbCategory] = useState<string>("all");
  const [pbSearch, setPbSearch] = useState("");

  // Email/WhatsApp composers — same UX as Priority Worklist & Outstanding Reminders
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [waOpen, setWaOpen] = useState(false);
  const [waRole, setWaRole] = useState<string>("billing");
  const [waCtx, setWaCtx] = useState<{
    claimId: string;
    recipient: string | null;
    recipientLabel: string;
    context: {
      patient_name: string | null;
      claim_number: string | null;
      hospital_name: string | null;
      outstanding_amount: number | null;
      days_since_claim: number | null;
      tpa_name: string | null;
      tpa_spoc_name: string | null;
      insurance_company_name: string | null;
      last_communication_note: string | null;
    };
  } | null>(null);

  const openEmail = (claim: Claim, tone: FollowUpTone = "formal") => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    setComposerTone(tone);
    setComposerTarget({
      insurerName: claim.tpa_name || claim.insurance_company_name || "Unknown TPA",
      recipientEmail: contact?.email ?? "",
      ccEmails: contact?.cc_emails ?? "",
      whatsapp: contact?.whatsapp ?? null,
      claims: [claim],
    });
    setComposerOpen(true);
  };

  const openWhatsApp = (claim: Claim, role: string = "billing") => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    setWaRole(role);
    setWaCtx({
      claimId: claim.id,
      recipient: contact?.whatsapp ?? null,
      recipientLabel: `${claim.tpa_name || "TPA"} · WhatsApp`,
      context: {
        patient_name: claim.patient_name ?? null,
        claim_number: claim.claim_number ?? null,
        hospital_name: claim.hospital_name ?? null,
        outstanding_amount: claim.outstanding_amount ?? null,
        days_since_claim: claim.days_since_claim ?? null,
        tpa_name: claim.tpa_name ?? null,
        tpa_spoc_name: contact?.contact_name ?? null,
        insurance_company_name: claim.insurance_company_name ?? null,
        last_communication_note: claim.last_communication_note ?? null,
      },
    });
    setWaOpen(true);
  };

  const openCall = (claim: Claim) => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    const num = contact?.phone || contact?.whatsapp;
    if (!num) {
      toast.error(`No phone number on file for ${claim.tpa_name || "this TPA"}`, {
        description: "Add a phone number in Settings → Contacts.",
      });
      return;
    }
    window.location.href = `tel:${num.replace(/\s+/g, "")}`;
  };

  const kpis = getDenialKpis(claims);
  const insurers = getInsurerStats(claims);
  const categories = getCategoryStats(claims);
  const codes = getCodeStats(claims);
  const rawRows = getDenialRows(claims);

  // Sorting for Denied & Query claims table (URL-persisted, like Priority Worklist)
  const ROW_SORT_KEYS = ["age", "shortPaid"] as const;
  type RowSortKey = (typeof ROW_SORT_KEYS)[number];
  const ROW_SORT_LABELS: Record<RowSortKey, string> = {
    age: "Age",
    shortPaid: "Short Paid",
  };
  const { sort: rowSort, toggle: toggleRowSort, clear: clearRowSort } =
    useUrlTableSort<RowSortKey>(ROW_SORT_KEYS, { paramName: "dsort" });
  const rows = useMemo(() => {
    const filtered = rawRows.filter((r) => {
      // Split by stage: pre-auth denials in one tab, claim-stage denials in the other.
      const preauth = isPreauth(r.claim);
      if (denialStage === "preauth" && !preauth) return false;
      if (denialStage === "claim" && preauth) return false;
      if (rowStatusFilter !== "all"
          && !r.claim.claim_status.toLowerCase().includes(rowStatusFilter.toLowerCase())) {
        return false;
      }
      if (rowInsurerFilter !== "all"
          && (r.claim.tpa_name ?? "") !== rowInsurerFilter
          && (r.claim.insurance_company_name ?? "") !== rowInsurerFilter) {
        return false;
      }
      return true;
    });
    return applyNumericSort(filtered, rowSort, {
      age: (r) => r.claim.days_since_claim ?? 0,
      shortPaid: (r) => r.shortPaid ?? 0,
    });
  }, [rawRows, rowSort, rowStatusFilter, rowInsurerFilter, denialStage]);

  const preauthCount = useMemo(
    () => rawRows.filter((r) => isPreauth(r.claim)).length,
    [rawRows],
  );
  const claimDeniedCount = rawRows.length - preauthCount;

  const kpiCards = [
    { label: "Denial Rate", value: `${(kpis.denialRate * 100).toFixed(1)}%`, sub: `${kpis.totalDenied} of ${kpis.totalClaims} claims`, icon: AlertTriangle, tone: "text-destructive" },
    { label: "Amount at Risk", value: formatInr(kpis.amountAtRisk), sub: "Short paid + denied", icon: IndianRupee, tone: "text-destructive" },
    { label: "Recoverable (Est.)", value: formatInr(kpis.recoverable), sub: `${((kpis.recoverable / Math.max(kpis.amountAtRisk, 1)) * 100).toFixed(0)}% of at risk`, icon: Sparkles, tone: "text-accent" },
    { label: "First-Pass Rate", value: `${(kpis.firstPassRate * 100).toFixed(1)}%`, sub: "Settled without query", icon: ShieldCheck, tone: "text-accent" },
    { label: "Appealable Share", value: `${(kpis.appealableShare * 100).toFixed(0)}%`, sub: "Of denied claims", icon: Repeat2, tone: "text-warning" },
    { label: "Top Reason", value: codes[0]?.code.code ?? "—", sub: codes[0]?.code.description ?? "", icon: FileWarning, tone: "text-primary" },
  ];

  const categoryChart = categories.map(c => ({
    name: c.category,
    count: c.count,
    amount: c.amountAtRisk,
    fill: CATEGORY_COLORS[c.category],
  }));

  const topInsurers = insurers.filter(i => i.deniedClaims > 0).slice(0, 8).map(i => ({
    name: i.name,
    rate: +(i.denialRate * 100).toFixed(1),
    firstPass: +(i.firstPassRate * 100).toFixed(1),
  }));

  return (
    <AppLayout>
      <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Denial Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              Standardized reason codes · denial rate by insurer · first-pass resolution
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              Taxonomy: 6 categories · {codes.length} codes · SLA aligned
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={rows.length === 0}
              onClick={() => exportClaimsCsv(rows.map((r) => r.claim), "denied-claims")}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* KPI strip — unified KpiCard */}
        <KpiGrid cols={6}>
          {kpiCards.map(k => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.value}
              loading={loading}
              icon={<k.icon className={`h-3.5 w-3.5 ${k.tone}`} />}
              caption={<span className="truncate">{k.sub}</span>}
            />
          ))}
        </KpiGrid>

        <Tabs defaultValue="claims" className="w-full">
          <TabsList>
            <TabsTrigger value="claims">Denied Claims</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="codes">Reason Codes</TabsTrigger>
            <TabsTrigger value="playbook" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Cashless Playbook
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Denial categories — amount at risk</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={categoryChart} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                      <Tooltip formatter={(v: number, name) => name === "amount" ? formatInr(v) : v} />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]} name="Amount at risk">
                        {categoryChart.map(c => <Cell key={c.name} fill={c.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Category mix</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={categoryChart} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {categoryChart.map(c => <Cell key={c.name} fill={c.fill} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {categoryChart.map(c => (
                      <div key={c.name} className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                        <span className="text-[10px] text-muted-foreground">{c.name} ({c.count})</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Category recovery outlook</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categories.map(c => (
                    <div key={c.category} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                          <span className="text-xs font-medium">{c.category}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{c.count}</Badge>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">{formatInr(c.amountAtRisk)}</div>
                      <div className="text-[10px] text-muted-foreground mb-1.5">at risk</div>
                      <Progress value={c.avgRecoveryRate * 100} className="h-1.5" />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {(c.avgRecoveryRate * 100).toFixed(0)}% est. recovery on appeal
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Denial rate vs first-pass rate by insurer / TPA</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topInsurers} margin={{ left: 0, right: 8, top: 8, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="rate" fill="hsl(0, 70%, 45%)" radius={[3, 3, 0, 0]} name="Denial rate %" />
                    <Bar dataKey="firstPass" fill="hsl(170, 84%, 32%)" radius={[3, 3, 0, 0]} name="First-pass %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Insurer scorecard</CardTitle>
              </CardHeader>
              <Table dense>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Insurer / TPA</TableHead>
                    <TableHead align="right">Claims</TableHead>
                    <TableHead align="right">Denied</TableHead>
                    <TableHead>Denial %</TableHead>
                    <TableHead align="right" priority="secondary">1st-Pass %</TableHead>
                    <TableHead align="right">At Risk</TableHead>
                    <TableHead align="right" priority="tertiary">Recovery %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insurers.map(i => (
                    <TableRow key={i.name}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell numeric>{i.totalClaims}</TableCell>
                      <TableCell numeric>{i.deniedClaims}</TableCell>
                      <TableCell>
                        <Badge
                          variant={i.denialRate > 0.2 ? "destructive" : i.denialRate > 0.1 ? "default" : "secondary"}
                          className="text-[10px] tabular-nums"
                        >
                          {(i.denialRate * 100).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell numeric priority="secondary">{(i.firstPassRate * 100).toFixed(1)}%</TableCell>
                      <TableCell numeric>{formatInr(i.amountAtRisk)}</TableCell>
                      <TableCell numeric priority="tertiary" className="text-muted-foreground">
                        {i.deniedClaims ? `${(i.avgRecoveryRate * 100).toFixed(0)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Reason Codes */}
          <TabsContent value="codes" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Standardized denial reason codes</CardTitle>
              </CardHeader>
              <Table dense>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead priority="secondary">Category</TableHead>
                    <TableHead align="right">Count</TableHead>
                    <TableHead align="right">At Risk</TableHead>
                    <TableHead priority="tertiary">Appealable</TableHead>
                    <TableHead align="right" priority="tertiary">Est. Recovery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map(({ code, count, amountAtRisk }) => (
                    <TableRow key={code.code}>
                      <TableCell className="font-mono text-[11px]">{code.code}</TableCell>
                      <TableCell>{code.description}</TableCell>
                      <TableCell priority="secondary">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[code.category] }} />
                          <span className="text-xs">{code.category}</span>
                        </div>
                      </TableCell>
                      <TableCell numeric>{count}</TableCell>
                      <TableCell numeric>{amountAtRisk ? formatInr(amountAtRisk) : "—"}</TableCell>
                      <TableCell priority="tertiary">
                        {code.appealable
                          ? <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                          : <Badge variant="outline" className="text-[10px]">No</Badge>}
                      </TableCell>
                      <TableCell numeric priority="tertiary" className="text-muted-foreground">{(code.recoveryRate * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Denied Claims — clickable rows open Cashless Playbook drawer */}
          <TabsContent value="claims" className="space-y-4">
            <Tabs value={denialStage} onValueChange={(v) => setDenialStage(v as "claim" | "preauth")}>
              <TabsList>
                <TabsTrigger value="claim">
                  Claim Denied <Badge variant="secondary" className="ml-2 text-[10px]">{claimDeniedCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="preauth">
                  Preauth Denied <Badge variant="secondary" className="ml-2 text-[10px]">{preauthCount}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Card className="shadow-sm">
              <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
                <Select value={rowStatusFilter} onValueChange={setRowStatusFilter}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="query">Query</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={rowInsurerFilter} onValueChange={setRowInsurerFilter}>
                  <SelectTrigger className="w-48 h-9 text-sm">
                    <SelectValue placeholder="Insurer / TPA" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All Insurers / TPAs</SelectItem>
                    {insurerOptions.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(rowStatusFilter !== "all" || rowInsurerFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs"
                    onClick={() => { setRowStatusFilter("all"); setRowInsurerFilter("all"); }}>
                    Clear
                  </Button>
                )}
              </CardContent>
            </Card>
            <SortStatusBar sort={rowSort} onClear={clearRowSort} labels={ROW_SORT_LABELS} />
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  {denialStage === "preauth" ? "Preauth denied" : "Claim denied"} ({loading ? "…" : rows.length})
                  <Badge variant="outline" className="text-[9px] py-0 font-normal">
                    Click a row → cashless action plan
                  </Badge>
                </CardTitle>
              </CardHeader>
              <Table dense>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Claim No</TableHead>
                    <TableHead priority="secondary">Patient</TableHead>
                    <TableHead priority="tertiary">
                      <ColumnFilter
                        label="TPA"
                        value={rowInsurerFilter}
                        onChange={setRowInsurerFilter}
                        options={[
                          { value: "all", label: "All Insurers / TPAs" },
                          ...insurerOptions.map((n) => ({ value: n, label: n })),
                        ]}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnFilter
                        label="Status"
                        value={rowStatusFilter}
                        onChange={setRowStatusFilter}
                        options={[
                          { value: "all", label: "All Status" },
                          { value: "denied", label: "Denied" },
                          { value: "rejected", label: "Rejected" },
                          { value: "query", label: "Query" },
                          { value: "settled", label: "Settled" },
                          { value: "approved", label: "Approved" },
                        ]}
                      />
                    </TableHead>
                    <TableHead priority="secondary">Playbook Match</TableHead>
                    <SortableTh sortKey="shortPaid" sortState={rowSort} onSort={toggleRowSort}>
                      Short Paid
                    </SortableTh>
                    <SortableTh sortKey="age" sortState={rowSort} onSort={toggleRowSort}>
                      Age
                    </SortableTh>
                    <TableHead align="right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                        <TableCell priority="secondary"><Skeleton className="h-3 w-24" /></TableCell>
                        <TableCell priority="tertiary"><Skeleton className="h-3 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 rounded-full" /></TableCell>
                        <TableCell priority="secondary"><Skeleton className="h-3 w-40" /></TableCell>
                        <TableCell numeric><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                        <TableCell numeric><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                        <TableCell align="right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileX className="h-8 w-8 opacity-50" />
                          <div className="text-sm font-medium text-foreground">No denied or query claims</div>
                          <div className="text-xs">Everything is clear — nothing to action right now.</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(({ claim, shortPaid }) => {
                      const match = matchPlaybook(claim);
                      const cat = match?.entry.category;
                      return (
                        <TableRow
                          key={claim.id}
                          onClick={() => setOpenClaim(claim)}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-mono text-xs">{claim.claim_number}</TableCell>
                          <TableCell priority="secondary">{claim.patient_name}</TableCell>
                          <TableCell priority="tertiary" className="text-xs text-muted-foreground max-w-[180px] truncate">{claim.tpa_name}</TableCell>
                          <TableCell><Badge className="text-[10px]">{claim.claim_status}</Badge></TableCell>
                          <TableCell priority="secondary">
                            {match ? (
                              <div className="flex items-center gap-1.5">
                                {cat && (
                                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PLAYBOOK_CATEGORY_COLORS[cat] }} />
                                )}
                                <span className="text-xs truncate max-w-[220px]" title={match.entry.reason}>
                                  {match.entry.reason}
                                </span>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell numeric className="font-medium">{formatInr(shortPaid)}</TableCell>
                          <TableCell numeric className="text-xs">{formatDays(claim.days_since_claim)}</TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <RowActionButtons
                                onEmail={(tone) => openEmail(claim, tone)}
                                onWhatsApp={(role) => openWhatsApp(claim, role)}
                                onCall={() => openCall(claim)}
                              />
                              <AiDraftLauncher
                                claim={claim}
                                defaultTool="appeal_letter"
                                label="AI Draft"
                                hideChevron
                                size="sm"
                              />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Row actions"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Row actions
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpenClaim(claim); }}>
                                    <FileSearch className="h-3.5 w-3.5 mr-2 text-primary" />
                                    Open cashless playbook
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpenClaim(claim); }}>
                                    <ChevronRight className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                    View claim details
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Cashless Playbook — searchable reference + frequency from your claims */}
          <TabsContent value="playbook" className="space-y-4">
            <PlaybookTab
              claims={claims}
              dept={pbDept} setDept={setPbDept}
              category={pbCategory} setCategory={setPbCategory}
              search={pbSearch} setSearch={setPbSearch}
              onOpenClaim={setOpenClaim}
              onGenerateChecklist={setChecklistEntry}
            />
          </TabsContent>
        </Tabs>
      </div>

      {openClaim && <PlaybookDrawer claim={openClaim} onClose={() => setOpenClaim(null)} />}
      <ChecklistDialog
        entry={checklistEntry}
        open={!!checklistEntry}
        onOpenChange={(v) => !v && setChecklistEntry(null)}
      />

      {/* Single-claim email composer with tone presets */}
      <BulkFollowUpComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        target={composerTarget}
        hospitalName="My Hospital"
        defaultTone={composerTone}
      />

      {/* Single-claim WhatsApp composer with role presets */}
      <WhatsAppComposerDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        claimId={waCtx?.claimId ?? ""}
        recipient={waCtx?.recipient ?? null}
        recipientLabel={waCtx?.recipientLabel}
        defaultRole={waRole}
        context={waCtx?.context ?? {
          patient_name: null, claim_number: null, hospital_name: null,
          outstanding_amount: null, days_since_claim: null, tpa_name: null,
          tpa_spoc_name: null, insurance_company_name: null, last_communication_note: null,
        }}
      />
      </TooltipProvider>
    </AppLayout>
  );
}

// ============================================================
// Cashless Playbook tab — searchable reference grid
// ============================================================
interface PlaybookTabProps {
  claims: readonly Claim[];
  dept: string; setDept: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onOpenClaim: (c: Claim) => void;
  onGenerateChecklist: (e: PlaybookEntry) => void;
}

function PlaybookTab({
  claims, dept, setDept, category, setCategory, search, setSearch, onOpenClaim, onGenerateChecklist,
}: PlaybookTabProps) {
  const aggregate = useMemo(() => aggregatePlaybook(claims as Claim[]), [claims]);
  const aggMap = useMemo(() => new Map(aggregate.map(a => [a.entry.sr, a])), [aggregate]);

  const departments = useMemo(() =>
    Array.from(new Set(CASHLESS_PLAYBOOK.map(p => p.dept))).sort(), []);
  const categories = useMemo(() =>
    Array.from(new Set(CASHLESS_PLAYBOOK.map(p => p.category))).sort(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CASHLESS_PLAYBOOK.filter(p => {
      if (dept !== "all" && p.dept !== dept) return false;
      if (category !== "all" && p.category !== category) return false;
      if (q && !`${p.reason} ${p.clause} ${p.dept}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [dept, category, search]);

  // Top denied claims grouped by playbook entry — for quick "act on these" lookup
  const topMatched = aggregate.slice(0, 3);

  return (
    <>
      {/* Quick-action: most frequent matched denials in your claims */}
      {topMatched.length > 0 && (
        <Card className="shadow-sm border-primary/20 bg-primary/[0.02]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Top playbook matches in your claims
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topMatched.map(({ entry, count, amountAtRisk }) => (
              <div key={entry.sr} className="border rounded-md p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PLAYBOOK_CATEGORY_COLORS[entry.category] }} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{entry.category}</span>
                </div>
                <p className="text-xs font-medium leading-snug line-clamp-2">{entry.reason}</p>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <Badge variant="secondary" className="text-[10px]">{count} claim{count !== 1 ? "s" : ""}</Badge>
                  <span className="font-semibold tabular-nums">{formatInr(amountAtRisk)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filter bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search reason, clause, dept…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-[200px] text-sm">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-[10px]">{filtered.length} of {CASHLESS_PLAYBOOK.length}</Badge>
        </CardContent>
      </Card>

      {/* Playbook entries grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(entry => {
          const agg = aggMap.get(entry.sr);
          const matchedClaims = (claims as Claim[]).filter(c => matchPlaybook(c)?.entry.sr === entry.sr);
          return (
            <Card key={entry.sr} className="shadow-sm hover:border-primary/40 transition-colors">
              <CardContent className="pt-4 pb-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PLAYBOOK_CATEGORY_COLORS[entry.category as PlaybookCategory] }} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{entry.category}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground truncate">{entry.dept}</span>
                    </div>
                    <h4 className="text-sm font-semibold leading-snug">{entry.reason}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{entry.clause}</p>
                  </div>
                  {agg && (
                    <Badge variant="default" className="text-[10px] shrink-0">{agg.count}</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  <Badge variant="outline" className="text-[10px]">{entry.type}</Badge>
                  <Badge variant="outline" className="text-[10px]">TAT {entry.tat}</Badge>
                  <Badge variant="outline" className="text-[10px]">{entry.docs.length} docs</Badge>
                  <Badge variant="outline" className="text-[10px]">{entry.actions.length} actions</Badge>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateChecklist(entry)}
                  className="w-full h-8 gap-1.5 text-xs"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Generate escalation checklist
                </Button>

                {matchedClaims.length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open this playbook on:</p>
                    {matchedClaims.slice(0, 2).map(c => (
                      <button
                        key={c.id}
                        onClick={() => onOpenClaim(c)}
                        className="w-full text-left text-xs py-1 px-2 rounded hover:bg-muted/50 flex items-center justify-between gap-2"
                      >
                        <span className="font-mono truncate">{c.claim_number} · {c.patient_name}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                    {matchedClaims.length > 2 && (
                      <p className="text-[10px] text-muted-foreground px-2">+ {matchedClaims.length - 2} more</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
