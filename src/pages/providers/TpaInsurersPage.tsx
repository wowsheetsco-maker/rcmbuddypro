import { useMemo, useState } from "react";
import { Building2, Plus, Phone, Search, AlertTriangle, ShieldAlert, ArrowUpRight, Upload, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppLayout from "@/components/AppLayout";
import { formatInrShort } from "@/data/mockClaims";
import { insurerProfiles as seedProfiles, type InsurerProfile, type Relation } from "@/data/insurerProfiles";
import InsurerProfileDrawer from "@/components/InsurerProfileDrawer";
import InsurerImportExportDialog from "@/components/InsurerImportExportDialog";
import { applyMerge, type MergeKey } from "@/lib/insurerIO";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import {
  useInsurerContacts,
  findContactForProvider,
  daysUntilContractExpiry,
  CONTRACT_EXPIRY_WARN_DAYS,
} from "@/hooks/useInsurerContacts";

const statusBadge: Record<string, string> = {
  active: "bg-accent text-accent-foreground",
  pending_renewal: "bg-warning text-warning-foreground",
  lapsed: "bg-primary text-primary-foreground",
  terminated: "bg-destructive text-destructive-foreground",
};

const relationDot: Record<Relation, string> = {
  Excellent: "bg-accent",
  Good: "bg-secondary",
  Average: "bg-warning",
  Strained: "bg-destructive",
};

function daysUntil(date: string) {
  return Math.round((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function TpaInsurersPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "tpa" | "insurer" | "renewal" | "escalation">("all");
  const [selected, setSelected] = useState<InsurerProfile | null>(null);
  const [ioOpen, setIoOpen] = useState(false);
  const [profiles, setProfiles] = useState<InsurerProfile[]>(seedProfiles);
  const { contacts: insurerContacts } = useInsurerContacts();

  const handleImport = (incoming: InsurerProfile[], mergeKey: MergeKey) => {
    setProfiles((prev) => applyMerge(prev, incoming, mergeKey));
  };

  // Aggregate live claim counts and outstanding by tpa_name / insurance_company_name
  const liveAgg = useMemo(() => {
    const map = new Map<string, { open: number; outstanding: number }>();
    for (const c of claims) {
      const isOpen = !["settled", "paid", "closed", "rejected", "denied"].includes(c.claim_status.toLowerCase());
      for (const key of [c.tpa_name, c.insurance_company_name].filter(Boolean) as string[]) {
        const k = key.toLowerCase().trim();
        const e = map.get(k) ?? { open: 0, outstanding: 0 };
        if (isOpen) e.open += 1;
        e.outstanding += c.outstanding_amount || 0;
        map.set(k, e);
      }
    }
    return map;
  }, [claims]);

  // Merge live aggregates onto seed profiles (override openClaims and outstanding when matched)
  const enrichedProfiles = useMemo(() => {
    if (isMock) return profiles;
    return profiles.map(p => {
      const hit = liveAgg.get(p.name.toLowerCase().trim());
      return hit ? { ...p, openClaims: hit.open, outstanding: hit.outstanding } : p;
    });
  }, [profiles, liveAgg, isMock]);

  const filtered = useMemo(() => {
    return enrichedProfiles.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "tpa") return p.type === "tpa";
      if (filter === "insurer") return p.type === "insurer";
      if (filter === "renewal") return daysUntil(p.mouEnd) < 90 || p.status === "pending_renewal";
      if (filter === "escalation") return p.escalations.some((e) => e.status !== "Resolved");
      return true;
    });
  }, [search, filter, enrichedProfiles]);

  const totals = useMemo(() => {
    const totalOutstanding = enrichedProfiles.reduce((s, p) => s + p.outstanding, 0);
    const totalOpen = enrichedProfiles.reduce((s, p) => s + p.openClaims, 0);
    const renewalCount = enrichedProfiles.filter((p) => daysUntil(p.mouEnd) < 90).length;
    const escalationCount = enrichedProfiles.reduce(
      (s, p) => s + p.escalations.filter((e) => e.status !== "Resolved").length,
      0,
    );
    return { totalOutstanding, totalOpen, renewalCount, escalationCount };
  }, [enrichedProfiles]);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display text-foreground">TPA / Insurers</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              Click any provider to view full profile, escalation matrix and SPOC
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIoOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
              <span className="text-muted-foreground hidden sm:inline">/</span>
              <Download className="h-3.5 w-3.5 hidden sm:inline" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Provider
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Providers" value={profiles.length.toString()} />
          <KpiCard label="Open Claims" value={totals.totalOpen.toString()} />
          <KpiCard label="Outstanding" value={formatInrShort(totals.totalOutstanding)} tone="text-destructive" />
          <KpiCard
            label="Renewals < 90d"
            value={`${totals.renewalCount} · ${totals.escalationCount} escal.`}
            tone={totals.escalationCount > 0 ? "text-warning" : ""}
          />
        </div>

        {/* Filter / Search */}
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search provider..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: "all", label: "All" },
                { id: "tpa", label: "TPA" },
                { id: "insurer", label: "Insurer" },
                { id: "renewal", label: "Renewal Due" },
                { id: "escalation", label: "Escalations" },
              ].map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? "default" : "ghost"}
                  onClick={() => setFilter(f.id as typeof filter)}
                  className="h-7 text-xs"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const mouDaysLeft = daysUntil(p.mouEnd);
            const openEsc = p.escalations.filter((e) => e.status !== "Resolved").length;
            const tatBreach = p.avgTat > p.paymentTat;
            // Contract renewal warning is driven by insurer_contacts.contract_expiry_date
            // (not the local mock profile) so it stays in sync with the drawer + dispatcher.
            const contractExpiry = findContactForProvider(insurerContacts, p.name)?.contract_expiry_date ?? null;
            const contractDaysLeft = daysUntilContractExpiry(contractExpiry);
            const renewSoon =
              contractDaysLeft !== null &&
              contractDaysLeft >= 0 &&
              contractDaysLeft <= CONTRACT_EXPIRY_WARN_DAYS;
            return (
              <Card
                key={p.id}
                onClick={() => setSelected(p)}
                className="shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer group"
              >
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase">{p.type}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className={`text-[10px] ${statusBadge[p.status]}`}>
                        {p.status.replace("_", " ")}
                      </Badge>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold mb-2 line-clamp-2 min-h-[2.5rem]">{p.name}</h3>

                  {/* Relationship + alerts */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${relationDot[p.relation]}`} /> {p.relation}
                    </Badge>
                    {tatBreach && (
                      <Badge className="text-[10px] bg-destructive text-destructive-foreground gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> TAT +{p.avgTat - p.paymentTat}d
                      </Badge>
                    )}
                    {openEsc > 0 && (
                      <Badge className="text-[10px] bg-warning text-warning-foreground gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" /> {openEsc} escal
                      </Badge>
                    )}
                    {mouDaysLeft < 90 && (
                      <Badge className="text-[10px] bg-warning text-warning-foreground">
                        MOU {mouDaysLeft < 0 ? "expired" : `${mouDaysLeft}d`}
                      </Badge>
                    )}
                    {renewSoon && (
                      <Badge
                        className="text-[10px] bg-warning text-warning-foreground gap-1"
                        title={`Contract expires on ${contractExpiry}`}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Renew Soon · {contractDaysLeft}d
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Open:</span>{" "}
                      <span className="font-semibold tabular-nums">{p.openClaims}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outstanding:</span>{" "}
                      <span className="font-semibold tabular-nums">{formatInrShort(p.outstanding)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg TAT:</span>{" "}
                      <span className={`font-semibold tabular-nums ${tatBreach ? "text-destructive" : ""}`}>
                        {p.avgTat}d / {p.paymentTat}d
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">MOU exp:</span>{" "}
                      <span className="font-semibold tabular-nums">{p.mouEnd}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="h-3 w-3" /> {p.escalationMatrix[0]?.name}
                    </div>
                    {p.lastVisit && (
                      <span className="text-[10px] tabular-nums shrink-0">Visit {p.lastVisit.date}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No providers match the current filter.
            </CardContent>
          </Card>
        )}
      </div>

      <InsurerProfileDrawer
        profile={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      <InsurerImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        existing={profiles}
        onImport={handleImport}
      />
    </AppLayout>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-lg font-display tabular-nums mt-0.5 ${tone || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
