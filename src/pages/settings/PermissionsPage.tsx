import { Fragment, useMemo, useState } from "react";
import { Save, RotateCcw, Shield, Info, Search, Check, Minus, Download, Building2, Users, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, type UserRole } from "@/hooks/useAppUsers";
import {
  ACTIONS,
  RESOURCES,
  useRolePermissions,
  type Resource,
  type RolePermission,
} from "@/hooks/useRolePermissions";
import {
  ORG_ROLES,
  HOSPITAL_SCENARIOS,
  ORG_ACTIONS,
  orgPermissionAllowed,
  type OrgRoleKey,
  type ScenarioKey,
} from "@/lib/orgPermissionMatrix";
import RoleAccessPreview from "@/components/access/RoleAccessPreview";
import { logAccessChange } from "@/lib/accessAudit";

type CellKey = `${UserRole}::${Resource}::${string}`; // role::resource::col

export default function PermissionsPage() {
  const { rows, loading, lookup, updateRow } = useRolePermissions();
  const [activeRole, setActiveRole] = useState<UserRole>("Hospital Admin");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Record<CellKey, boolean>>({});
  const [saving, setSaving] = useState(false);

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RESOURCES;
    return RESOURCES.filter((r) => r.label.toLowerCase().includes(q) || r.group.toLowerCase().includes(q));
  }, [query]);

  const [orgRole, setOrgRole] = useState<OrgRoleKey>("org_admin");
  const [scenario, setScenario] = useState<ScenarioKey>("individual");


  const grouped = useMemo(() => {
    const m = new Map<string, typeof RESOURCES>();
    filteredResources.forEach((r) => {
      const arr = m.get(r.group) ?? [];
      arr.push(r);
      m.set(r.group, arr);
    });
    return Array.from(m.entries());
  }, [filteredResources]);

  const cellValue = (role: UserRole, resource: Resource, col: keyof RolePermission): boolean => {
    const k = `${role}::${resource}::${String(col)}` as CellKey;
    if (k in pending) return pending[k];
    const row = lookup.get(`${role}::${resource}`);
    return row ? Boolean(row[col]) : false;
  };

  const setCell = (role: UserRole, resource: Resource, col: keyof RolePermission, value: boolean) => {
    const k = `${role}::${resource}::${String(col)}` as CellKey;
    setPending((p) => ({ ...p, [k]: value }));
  };

  const dirty = Object.keys(pending).length > 0;

  const handleSave = async () => {
    setSaving(true);
    // Group pending changes by row id
    const byRow = new Map<string, Partial<RolePermission>>();
    for (const [key, value] of Object.entries(pending)) {
      const [role, resource, col] = key.split("::") as [UserRole, Resource, keyof RolePermission];
      const row = lookup.get(`${role}::${resource}`);
      if (!row) continue;
      const patch = byRow.get(row.id) ?? {};
      (patch as Record<string, unknown>)[col] = value;
      byRow.set(row.id, patch);
    }
    let okCount = 0;
    for (const [id, patch] of byRow) {
      const ok = await updateRow(id, patch);
      if (ok) {
        okCount += 1;
        const row = rows.find((r) => r.id === id);
        if (row) {
          const changes = Object.entries(patch)
            .map(([col, val]) => `${col.replace("can_", "")}=${val ? "on" : "off"}`)
            .join(", ");
          await logAccessChange({
            entity: "role_permission",
            action: "updated",
            summary: `${row.role} → ${row.resource}: ${changes}`,
            before: Object.fromEntries(Object.keys(patch).map((c) => [c, (row as unknown as Record<string, unknown>)[c]])),
            after: patch,
          });
        }
      }
    }
    setSaving(false);
    if (okCount > 0) setPending({});
  };

  const handleReset = () => setPending({});

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = new Date().toLocaleString();

    ROLES.forEach((role, idx) => {
      if (idx > 0) doc.addPage();
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Permissions Matrix", 40, 40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Role: ${role}`, 40, 60);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated ${generatedAt}`, pageWidth - 40, 40, { align: "right" });
      doc.setTextColor(0);

      const head = [["Group", "Module", ...ACTIONS.map((a) => a.label)]];
      const body: string[][] = RESOURCES.map((res) => {
        const row = lookup.get(`${role}::${res.key}`);
        return [
          res.group,
          res.label,
          ...ACTIONS.map((a) => (row && row[a.col] ? "Yes" : "—")),
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY: 75,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 150 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index >= 2) {
            if (data.cell.raw === "Yes") {
              data.cell.styles.textColor = [22, 101, 52];
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.textColor = [156, 163, 175];
            }
            data.cell.styles.halign = "center";
          }
        },
      });

      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${idx + 1} of ${ROLES.length}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      // Restore for next iteration
      doc.setPage(pageCount);
    });

    doc.save(`permissions-matrix-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Bulk row helpers (for the active role)
  const rowAllOn = (resource: Resource): boolean =>
    ACTIONS.every((a) => cellValue(activeRole, resource, a.col));
  const rowAnyOn = (resource: Resource): boolean =>
    ACTIONS.some((a) => cellValue(activeRole, resource, a.col));
  const toggleRow = (resource: Resource) => {
    const next = !rowAllOn(resource);
    ACTIONS.forEach((a) => setCell(activeRole, resource, a.col, next));
  };

  const colOnCount = (col: keyof RolePermission) =>
    RESOURCES.filter((r) => cellValue(activeRole, r.key, col)).length;
  const toggleCol = (col: keyof RolePermission) => {
    const allOn = colOnCount(col) === RESOURCES.length;
    RESOURCES.forEach((r) => setCell(activeRole, r.key, col, !allOn));
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Permissions Matrix
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure what each role can do across modules. Changes apply instantly to anyone using that role.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                {Object.keys(pending).length} unsaved
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href="/settings/effective-permissions">
                <Shield className="h-3.5 w-3.5" /> View effective
              </a>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadPdf}>
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset} disabled={!dirty || saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <Alert className="bg-primary/5 border-primary/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs text-foreground/80">
            Pick a role tab to edit its permissions. Use the column header checkbox for "select all", or click a row to toggle every action.
            Switch the <strong>Acting as</strong> selector in the top-right to preview the experience for that role.
          </AlertDescription>
        </Alert>

        {/* Interactive Org-role × Scenario explorer */}
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Org Role &amp; Hospital Scenario Explorer
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick an org role and a hospital scenario to instantly see what that user can do.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[200px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Org role</label>
                  <Select value={orgRole} onValueChange={(v) => setOrgRole(v as OrgRoleKey)}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((r) => (
                        <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[200px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Hospital scenario</label>
                  <Select value={scenario} onValueChange={(v) => setScenario(v as ScenarioKey)}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOSPITAL_SCENARIOS.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {(() => {
              const roleMeta = ORG_ROLES.find((r) => r.key === orgRole)!;
              const scenarioMeta = HOSPITAL_SCENARIOS.find((s) => s.key === scenario)!;
              const allowedCount = ORG_ACTIONS.filter((a) => orgPermissionAllowed(orgRole, scenario, a.key)).length;
              return (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <Users className="h-3.5 w-3.5" /> About this role
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{roleMeta.label}</div>
                    <p className="text-xs text-muted-foreground mt-1">{roleMeta.description}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <Building2 className="h-3.5 w-3.5" /> Scenario
                    </div>
                    <div className="mt-1.5 text-sm font-medium flex items-center gap-2">
                      {scenarioMeta.label}
                      <Badge variant="outline" className="text-[10px]">{allowedCount} / {ORG_ACTIONS.length} allowed</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{scenarioMeta.description}</p>
                  </div>
                </div>
              );
            })()}

            <TooltipProvider delayDuration={150}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {ORG_ACTIONS.map((action) => {
                  const allowed = orgPermissionAllowed(orgRole, scenario, action.key);
                  return (
                    <Tooltip key={action.key}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-start gap-2 rounded-lg border p-2.5 transition-colors ${
                            allowed
                              ? "border-emerald-500/40 bg-emerald-500/5"
                              : "border-border bg-muted/30 opacity-70"
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-5 w-5 grid place-items-center rounded-full shrink-0 ${
                              allowed
                                ? "bg-emerald-500 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {allowed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0">
                            <div className={`text-xs font-medium ${allowed ? "text-foreground" : "text-muted-foreground line-through"}`}>
                              {action.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{action.description}</div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        <div className="font-medium mb-0.5">{action.label}</div>
                        <div className="text-muted-foreground">{action.description}</div>
                        <div className={`mt-1 font-medium ${allowed ? "text-emerald-600" : "text-rose-600"}`}>
                          {allowed ? "Allowed for this role × scenario" : "Not allowed"}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            {/* Compact full-matrix preview for the chosen scenario */}
            <details className="rounded-lg border bg-muted/10">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Compare all roles for "{HOSPITAL_SCENARIOS.find((s) => s.key === scenario)!.label}"
              </summary>
              <div className="overflow-x-auto p-3 pt-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2 font-semibold text-muted-foreground">Role</th>
                      {ORG_ACTIONS.map((a) => (
                        <th key={a.key} className="px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ORG_ROLES.map((r) => (
                      <tr
                        key={r.key}
                        className={`border-b last:border-0 ${r.key === orgRole ? "bg-primary/5" : ""}`}
                      >
                        <td className="py-1.5 pr-2 font-medium">{r.label}</td>
                        {ORG_ACTIONS.map((a) => {
                          const ok = orgPermissionAllowed(r.key, scenario, a.key);
                          return (
                            <td key={a.key} className="px-2 py-1.5 text-center">
                              {ok ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600 mx-auto" />
                              ) : (
                                <Minus className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardContent>
        </Card>



        {/* Role tabs */}
        <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as UserRole)}>
          <TabsList className="flex flex-wrap h-auto p-1 gap-1 bg-muted/60">
            {ROLES.map((r) => {
              const dirtyForRole = Object.keys(pending).filter((k) => k.startsWith(`${r}::`)).length;
              return (
                <TabsTrigger
                  key={r}
                  value={r}
                  className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5"
                >
                  {r}
                  {dirtyForRole > 0 && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter modules…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* Matrix */}
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading permissions…</div>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                      <tr className="border-b">
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[260px]">
                          Module
                        </th>
                        {ACTIONS.map((a) => {
                          const onCount = colOnCount(a.col);
                          const allOn = onCount === RESOURCES.length;
                          const someOn = onCount > 0 && !allOn;
                          return (
                            <th key={a.key} className="px-2 py-2 text-center min-w-[78px]">
                              <button
                                onClick={() => toggleCol(a.col)}
                                className="flex flex-col items-center gap-1 mx-auto group"
                                title={`Toggle "${a.label}" for all modules`}
                              >
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                                  {a.label}
                                </span>
                                <span className={`h-4 w-4 grid place-items-center rounded border transition-colors ${
                                  allOn ? "bg-primary border-primary text-primary-foreground"
                                    : someOn ? "bg-primary/30 border-primary/50 text-primary"
                                    : "border-border bg-background"
                                }`}>
                                  {allOn ? <Check className="h-3 w-3" /> : someOn ? <Minus className="h-2.5 w-2.5" /> : null}
                                </span>
                              </button>
                            </th>
                          );
                        })}
                        <th className="px-2 py-2 text-center w-[70px]">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">All</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(([groupName, items]) => (
                        <Fragment key={`group-${groupName}`}>
                          <tr key={`group-${groupName}`} className="bg-muted/20">
                            <td colSpan={ACTIONS.length + 2} className="py-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {groupName}
                            </td>
                          </tr>
                          {items.map((res) => {
                            const allOnRow = rowAllOn(res.key);
                            const someOnRow = rowAnyOn(res.key) && !allOnRow;
                            return (
                              <tr key={res.key} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 px-3 font-medium text-foreground">
                                  {res.label}
                                </td>
                                {ACTIONS.map((a) => {
                                  const value = cellValue(activeRole, res.key, a.col);
                                  const k = `${activeRole}::${res.key}::${String(a.col)}` as CellKey;
                                  const isDirty = k in pending;
                                  return (
                                    <td key={a.key} className="py-2 px-2 text-center">
                                      <div className="flex justify-center relative">
                                        <Checkbox
                                          checked={value}
                                          onCheckedChange={(v) => setCell(activeRole, res.key, a.col, Boolean(v))}
                                          aria-label={`${a.label} ${res.label}`}
                                        />
                                        {isDirty && (
                                          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="py-2 px-2 text-center">
                                  <button
                                    onClick={() => toggleRow(res.key)}
                                    className={`h-4 w-4 grid place-items-center rounded border mx-auto transition-colors ${
                                      allOnRow ? "bg-primary border-primary text-primary-foreground"
                                        : someOnRow ? "bg-primary/30 border-primary/50 text-primary"
                                        : "border-border bg-background hover:border-primary/40"
                                    }`}
                                    title={allOnRow ? "Disable all actions" : "Enable all actions"}
                                  >
                                    {allOnRow ? <Check className="h-3 w-3" /> : someOnRow ? <Minus className="h-2.5 w-2.5" /> : null}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                      {grouped.length === 0 && (
                        <tr>
                          <td colSpan={ACTIONS.length + 2} className="py-8 text-center text-sm text-muted-foreground">
                            No modules match "{query}".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Permissions are stored per role. {rows.length} configured rows across {ROLES.length} roles × {RESOURCES.length} modules.
        </p>
      </div>
    </AppLayout>
  );
}
