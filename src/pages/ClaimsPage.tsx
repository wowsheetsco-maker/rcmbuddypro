import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { Search, Filter, Download, Loader2, AlertTriangle, X as XIcon, Inbox, Rows3, Rows2, IndianRupee, FileSearch, ShieldAlert, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, agingVariant } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnFilter } from "@/components/ui/column-filter";
import { TableRowsSkeleton } from "@/components/skeletons";
import { SortableTh, applyNumericSort, useUrlTableSort, SortStatusBar } from "@/components/ui/numeric-cell";
import AppLayout from "@/components/AppLayout";
import ClaimDrawer from "@/components/ClaimDrawer";
import { type Claim, formatInr, formatDays, getStatusColor } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useClaimsPage } from "@/hooks/useClaimsPage";
import { useInsurerOptions } from "@/hooks/useInsurerOptions";
import { ClaimsPagination } from "@/components/ui/claims-pagination";
import { useHasPermission } from "@/hooks/useHasPermission";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SortKey = "outstanding" | "age" | "claimed" | "approved" | "settled";

type SearchField = "all" | "claim_number" | "patient_name" | "tpa_name";

export default function ClaimsPage() {
  const { claims, loading, isMock, refetch } = useLiveClaims();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [insurerFilter, setInsurerFilter] = useState<string>("all");
  const [breachOnly, setBreachOnly] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [dense, setDense] = useState(false);
  const [page, setPage] = useState(() => Math.max(0, Number(searchParams.get("page") ?? 0)));
  const [pageSize, setPageSize] = useState(() => Number(searchParams.get("size") ?? 25));
  const SORT_KEYS = ["outstanding", "age", "claimed", "approved", "settled"] as const;
  const SORT_LABELS: Record<SortKey, string> = {
    outstanding: "Outstanding",
    age: "Age",
    claimed: "Claimed",
    approved: "Approved",
    settled: "Settled",
  };
  const SORT_COLUMNS: Record<SortKey, string> = {
    outstanding: "outstanding_amount",
    age: "claim_creation_date",
    claimed: "claimed_amount",
    approved: "approved_amount",
    settled: "settled_amount",
  };
  const { sort, toggle: toggleSort, clear: clearSort } = useUrlTableSort<SortKey>(SORT_KEYS);

  // Reset to first page whenever filters/sort/search change.
  useEffect(() => {
    setPage(0);
  }, [search, searchField, statusFilter, insurerFilter, breachOnly, sort.key, sort.dir, pageSize]);

  // Persist page/size in URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (page > 0) next.set("page", String(page)); else next.delete("page");
    if (pageSize !== 25) next.set("size", String(pageSize)); else next.delete("size");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  // Map UI sort to server (column, dir). Age desc = oldest first = date asc.
  const sortColumn = sort.key ? SORT_COLUMNS[sort.key] : "claim_creation_date";
  const effectiveDir: "asc" | "desc" = sort.dir ?? "desc";
  const sortDir: "asc" | "desc" = !sort.key
    ? "desc"
    : sort.key === "age"
      ? (effectiveDir === "desc" ? "asc" : "desc")
      : effectiveDir;

  const {
    claims: pageClaims,
    totalCount,
    totalPages,
    loading: pageLoading,
  } = useClaimsPage({
    search,
    searchField,
    statusFilter,
    insurerFilter,
    breachOnly,
    sort: sortColumn,
    dir: sortDir,
    page,
    pageSize,
  });
  const { options: insurerOptions } = useInsurerOptions();

  // Sync local search when the header search bar updates ?q=
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearch((cur) => (cur === q ? cur : q));
  }, [searchParams]);

  // Open a claim drawer when ?openClaim=<id> is in the URL (deep-link from search palette)
  useEffect(() => {
    const id = searchParams.get("openClaim");
    if (!id || claims.length === 0) return;
    const found = claims.find((c) => c.id === id);
    if (found) setSelectedClaim(found);
  }, [searchParams, claims]);

  const handleClaimUpdated = (patch: Partial<Claim>) => {
    setSelectedClaim((c) => (c ? { ...c, ...patch } : c));
    void refetch();
  };

  const handleDrawerClose = () => {
    setSelectedClaim(null);
    if (searchParams.has("openClaim")) {
      const next = new URLSearchParams(searchParams);
      next.delete("openClaim");
      setSearchParams(next, { replace: true });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = claims.filter((c) => {
      const matchStatus = statusFilter === "all" || c.claim_status.toLowerCase().includes(statusFilter);
      const matchBreach = !breachOnly || c.is_irdai_breach;
      if (!q) return matchStatus && matchBreach;
      const haystacks: Record<Exclude<SearchField, "all">, string> = {
        claim_number: c.claim_number.toLowerCase(),
        patient_name: c.patient_name.toLowerCase(),
        tpa_name: c.tpa_name.toLowerCase(),
      };
      const matchSearch =
        searchField === "all"
          ? Object.values(haystacks).some((h) => h.includes(q))
          : haystacks[searchField].includes(q);
      return matchSearch && matchStatus && matchBreach;
    });
    return applyNumericSort(base, sort, {
      outstanding: (c) => c.outstanding_amount ?? 0,
      age: (c) => c.days_since_claim ?? 0,
      claimed: (c) => c.claimed_amount ?? 0,
      approved: (c) => c.approved_amount ?? 0,
      settled: (c) => c.settled_amount ?? 0,
    });
  }, [claims, search, searchField, statusFilter, breachOnly, sort]);

  const activeFilterCount =
    (search ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (insurerFilter !== "all" ? 1 : 0) + (breachOnly ? 1 : 0);

  const kpis = useMemo(() => {
    const totalOutstanding = filtered.reduce((s, c) => s + (c.outstanding_amount ?? 0), 0);
    const totalClaimed = filtered.reduce((s, c) => s + (c.claimed_amount ?? 0), 0);
    const discrepancy = filtered.filter((c) =>
      ((c.approved_amount ?? 0) > 0 && (c.settled_amount ?? 0) > 0 && (c.settled_amount ?? 0) < (c.approved_amount ?? 0))
      || c.claim_status.toLowerCase().includes("query")
    ).length;
    const breaches = filtered.filter((c) => c.is_irdai_breach).length;
    return { totalOutstanding, totalClaimed, discrepancy, breaches };
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setSearchField("all");
    setStatusFilter("all");
    setInsurerFilter("all");
    setBreachOnly(false);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display text-foreground">All Claims</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              {totalCount} claim{totalCount === 1 ? "" : "s"}{pageLoading ? "…" : ""}
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Toggle
              pressed={dense}
              onPressedChange={setDense}
              aria-label="Compact row density"
              className="h-9 px-2"
            >
              {dense ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
            </Toggle>
            <ExportClaimsButton rows={pageClaims} />
          </div>
        </div>

        {/* KPI strip */}
        <KpiGrid cols={4}>
          <KpiCard
            label="Total Outstanding"
            value={formatInr(kpis.totalOutstanding)}
            loading={loading}
            empty={!loading && kpis.totalOutstanding === 0}
            icon={<IndianRupee className="h-3.5 w-3.5 text-primary" />}
            caption={`${filtered.length} claim(s)`}
          />
          <KpiCard
            label="Total Claimed"
            value={formatInr(kpis.totalClaimed)}
            loading={loading}
            empty={!loading && kpis.totalClaimed === 0}
            icon={<FileText className="h-3.5 w-3.5 text-secondary" />}
            caption="Gross billed"
          />
          <KpiCard
            label="Discrepancy / Query"
            value={kpis.discrepancy}
            loading={loading}
            empty={!loading && kpis.discrepancy === 0}
            icon={<FileSearch className="h-3.5 w-3.5 text-warning" />}
            caption="Need review"
          />
          <KpiCard
            label="SLA Breaches"
            value={kpis.breaches}
            tone="denial"
            loading={loading}
            empty={!loading && kpis.breaches === 0}
            icon={<ShieldAlert className="h-3.5 w-3.5 text-destructive" />}
            caption=">15 days outstanding"
          />
        </KpiGrid>

        {/* Filters */}
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md flex items-stretch">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                placeholder={
                  searchField === "claim_number" ? "Search by Claim No…"
                  : searchField === "patient_name" ? "Search by Patient Name…"
                  : searchField === "tpa_name" ? "Search by TPA / Insurer…"
                  : "Search claim no, patient, TPA…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 text-sm rounded-r-none border-r-0"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-[120px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <Select value={searchField} onValueChange={(v) => setSearchField(v as SearchField)}>
                <SelectTrigger className="h-9 text-xs w-[112px] rounded-l-none border-l shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  <SelectItem value="claim_number">Claim No</SelectItem>
                  <SelectItem value="patient_name">Patient</SelectItem>
                  <SelectItem value="tpa_name">TPA / Insurer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="query">Query</SelectItem>
                <SelectItem value="initiated">Initiated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>

            <Select value={insurerFilter} onValueChange={setInsurerFilter}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Insurer / TPA" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All Insurers / TPAs</SelectItem>
                {insurerOptions.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Toggle
              pressed={breachOnly}
              onPressedChange={setBreachOnly}
              aria-label="Show only SLA breaches"
              className="h-9 text-xs gap-1.5 data-[state=on]:bg-denial/10 data-[state=on]:text-denial data-[state=on]:border-denial/40 border"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> SLA Breach
            </Toggle>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1">
                <XIcon className="h-3.5 w-3.5" /> Clear
                <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <SortStatusBar sort={sort} onClear={clearSort} labels={SORT_LABELS} />

        {/* Table */}
        <Card variant="flat" className="overflow-hidden">
          <Table dense={dense} wrapperClassName="max-h-[calc(100vh-360px)] min-h-[240px]">
            <TableHeader sticky>
              <TableRow>
                <TableHead pinned priority="primary">Claim No</TableHead>
                <TableHead priority="primary">Patient</TableHead>
                <TableHead priority="tertiary">
                  <ColumnFilter
                    label="TPA / Insurer"
                    value={insurerFilter}
                    onChange={setInsurerFilter}
                    options={[
                      { value: "all", label: "All Insurers / TPAs" },
                      ...insurerOptions.map((n) => ({ value: n, label: n })),
                    ]}
                  />
                </TableHead>
                <TableHead priority="secondary">
                  <ColumnFilter
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: "all", label: "All Status" },
                      { value: "settled", label: "Settled" },
                      { value: "denied", label: "Denied" },
                      { value: "query", label: "Query" },
                      { value: "initiated", label: "Initiated" },
                      { value: "approved", label: "Approved" },
                    ]}
                  />
                </TableHead>
                <SortableTh sortKey="claimed" sortState={sort} onSort={toggleSort} priority="supporting">Claimed</SortableTh>
                <SortableTh sortKey="approved" sortState={sort} onSort={toggleSort} priority="supporting">Approved</SortableTh>
                <SortableTh sortKey="settled" sortState={sort} onSort={toggleSort} priority="supporting">Settled</SortableTh>
                <SortableTh sortKey="outstanding" sortState={sort} onSort={toggleSort} priority="primary">Outstanding</SortableTh>
                <SortableTh sortKey="age" sortState={sort} onSort={toggleSort} priority="secondary">Age</SortableTh>
                <TableHead priority="tertiary"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageLoading && pageClaims.length === 0 ? (
                <TableRowsSkeleton rows={Math.min(pageSize, 8)} cols={10} />
              ) : totalCount === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-14">
                    <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                      <Inbox className="h-7 w-7 opacity-60" />
                      <p className="text-sm font-medium text-foreground">
                        {activeFilterCount === 0 ? "No claims yet" : "No claims match your filters"}
                      </p>
                      <p className="text-xs">
                        {activeFilterCount === 0
                          ? "Import a CSV from Claims → Import to get started."
                          : "Try clearing search or filters to see more results."}
                      </p>
                      {activeFilterCount > 0 && (
                        <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageClaims.map((claim) => {
                  const isDenied = /denied|rejected|repudiat/i.test(claim.claim_status);
                  return (
                    <TableRow
                      key={claim.id}
                      data-testid="claim-row"
                      data-claim-id={claim.id}
                      data-claim-number={claim.claim_number}
                      onClick={() => setSelectedClaim(claim)}
                      className="group cursor-pointer"
                    >
                      <TableCell pinned priority="primary" className="font-mono text-xs font-semibold text-primary">
                        {claim.claim_number}
                      </TableCell>
                      <TableCell priority="primary" className="font-medium">{claim.patient_name}</TableCell>
                      <TableCell priority="tertiary" className="text-muted-foreground text-xs max-w-[180px] truncate">{claim.tpa_name}</TableCell>
                      <TableCell priority="secondary">
                        <Badge
                          variant={isDenied ? "denial" : claim.is_irdai_breach ? "denial" : "secondary"}
                          className={isDenied ? "" : `normal-case ${getStatusColor(claim.claim_status)}`}
                        >
                          {claim.claim_status}
                        </Badge>
                      </TableCell>
                      <TableCell priority="supporting" numeric>{formatInr(claim.claimed_amount)}</TableCell>
                      <TableCell priority="supporting" numeric>{formatInr(claim.approved_amount)}</TableCell>
                      <TableCell priority="supporting" numeric>{formatInr(claim.settled_amount)}</TableCell>
                      <TableCell priority="primary" numeric className="font-semibold">{formatInr(claim.outstanding_amount)}</TableCell>
                      <TableCell priority="secondary" numeric>
                        <Badge variant={agingVariant(claim.days_since_claim, claim.is_irdai_breach)} className="tabular-nums">
                          {formatDays(claim.days_since_claim)}
                        </Badge>
                      </TableCell>
                      <TableCell priority="tertiary">
                        <Button
                          variant={isDenied ? "denial-outline" : "ghost"}
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedClaim(claim); }}
                        >
                          {isDenied ? "Appeal" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <ClaimsPagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      </div>

      {selectedClaim && (
        <ClaimDrawer
          claim={selectedClaim}
          onClose={handleDrawerClose}
          onUpdated={handleClaimUpdated}
        />
      )}
    </AppLayout>
  );
}

/**
 * Export button gated by claims.export — greyed out (not hidden) for users
 * who lack permission, with a tooltip explaining why it's disabled.
 */
function ExportClaimsButton({ rows }: { rows: Claim[] }) {
  const canExport = useHasPermission("claims", "export");
  const handleClick = async () => {
    const { exportClaimsCsv } = await import("@/lib/claimsCsv");
    exportClaimsCsv(rows, "claims");
  };
  const btn = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={!canExport || rows.length === 0}
      aria-disabled={!canExport}
      onClick={handleClick}
    >
      <Download className="h-3.5 w-3.5" /> Export
    </Button>
  );
  if (canExport) return btn;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          You don't have permission to do this
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
