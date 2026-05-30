import { useEffect, useMemo, useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, GitMerge, Loader2, Search, MapPin,
  ChevronRight, ChevronDown, AlertTriangle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useHospitals, bumpHospitalsVersion,
  type HospitalGroup, type HospitalBranch,
} from "@/hooks/useHospitals";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { slugifyGroupName } from "@/lib/hospitalNameSplit";
import { bumpClaimsVersion } from "@/hooks/useLiveClaims";

export default function HospitalBranchesPage() {
  const { groups, branches, loading } = useHospitals();
  const { claims } = useLiveClaims();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Compute claim counts per branch and per group
  const counts = useMemo(() => {
    const byBranch = new Map<string, number>();
    const byGroup = new Map<string, number>();
    for (const c of claims) {
      if (c.hospital_branch_id) {
        byBranch.set(c.hospital_branch_id, (byBranch.get(c.hospital_branch_id) ?? 0) + 1);
      }
      if (c.hospital_group_id) {
        byGroup.set(c.hospital_group_id, (byGroup.get(c.hospital_group_id) ?? 0) + 1);
      }
    }
    return { byBranch, byGroup };
  }, [claims]);

  const branchesByGroup = useMemo(() => {
    const map = new Map<string, HospitalBranch[]>();
    for (const b of branches) {
      const arr = map.get(b.group_id) ?? [];
      arr.push(b);
      map.set(b.group_id, arr);
    }
    return map;
  }, [branches]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      const list = branchesByGroup.get(g.id) ?? [];
      return list.some((b) => b.name.toLowerCase().includes(q));
    });
  }, [groups, query, branchesByGroup]);

  // Default-expand all groups when first loaded
  useEffect(() => {
    if (expanded.size === 0 && groups.length > 0) {
      setExpanded(new Set(groups.map((g) => g.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  // Dialog state
  const [groupDialog, setGroupDialog] = useState<{ mode: "add" | "edit"; group?: HospitalGroup } | null>(null);
  const [branchDialog, setBranchDialog] = useState<{ mode: "add" | "edit"; groupId: string; branch?: HospitalBranch } | null>(null);
  const [mergeDialog, setMergeDialog] = useState<{ branch: HospitalBranch } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "group"; group: HospitalGroup; claimCount: number }
    | { kind: "branch"; branch: HospitalBranch; claimCount: number }
    | null
  >(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display text-foreground">Hospital Groups & Branches</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Multi-branch hospitals are split automatically during import (e.g.{" "}
              <span className="font-mono text-[11px]">"Aster Prime - Hyderabad"</span> →
              group <span className="font-mono text-[11px]">Aster Prime</span> + branch{" "}
              <span className="font-mono text-[11px]">Hyderabad</span>). Manage them here.
            </p>
          </div>
          <Button size="sm" onClick={() => setGroupDialog({ mode: "add" })} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add hospital group
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {groups.length} group{groups.length === 1 ? "" : "s"} ·{" "}
              {branches.length} branch{branches.length === 1 ? "" : "es"}
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search group or branch…"
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading && groups.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading hospitals…
              </div>
            )}
            {!loading && groups.length === 0 && (
              <Alert>
                <AlertDescription className="text-xs">
                  No hospital groups yet. Either import claims (groups & branches will be
                  auto-created from <span className="font-mono">Hospital Name</span>) or
                  add one manually above.
                </AlertDescription>
              </Alert>
            )}
            {filteredGroups.map((g) => {
              const branchList = (branchesByGroup.get(g.id) ?? []).slice().sort((a, b) =>
                a.name.localeCompare(b.name),
              );
              const isOpen = expanded.has(g.id);
              const groupClaims = counts.byGroup.get(g.id) ?? 0;
              return (
                <div key={g.id} className="rounded-md border">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                    <button
                      onClick={() => toggle(g.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-sm truncate flex-1">{g.name}</span>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {branchList.length} branch{branchList.length === 1 ? "" : "es"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                      {groupClaims.toLocaleString("en-IN")} claims
                    </Badge>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setBranchDialog({ mode: "add", groupId: g.id })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Branch
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setGroupDialog({ mode: "edit", group: g })}
                      aria-label="Rename group"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete({ kind: "group", group: g, claimCount: groupClaims })}
                      aria-label="Delete group"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="divide-y">
                      {branchList.length === 0 && (
                        <div className="px-9 py-3 text-xs text-muted-foreground italic">
                          No branches yet — add one to start tagging claims.
                        </div>
                      )}
                      {branchList.map((b) => {
                        const bc = counts.byBranch.get(b.id) ?? 0;
                        return (
                          <div key={b.id} className="flex items-center gap-2 px-9 py-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate flex-1">{b.name}</span>
                            {b.city && (
                              <span className="text-[11px] text-muted-foreground truncate">
                                {b.city}
                              </span>
                            )}
                            <Badge variant="secondary" className="text-[10px] tabular-nums">
                              {bc.toLocaleString("en-IN")} claims
                            </Badge>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setMergeDialog({ branch: b })}
                              aria-label="Merge into another branch"
                              title="Merge into another branch"
                            >
                              <GitMerge className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setBranchDialog({ mode: "edit", groupId: g.id, branch: b })}
                              aria-label="Edit branch"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setConfirmDelete({ kind: "branch", branch: b, claimCount: bc })}
                              aria-label="Delete branch"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit group */}
      {groupDialog && (
        <GroupDialog
          mode={groupDialog.mode}
          group={groupDialog.group}
          onClose={() => setGroupDialog(null)}
        />
      )}

      {/* Add / Edit branch */}
      {branchDialog && (
        <BranchDialog
          mode={branchDialog.mode}
          groupId={branchDialog.groupId}
          branch={branchDialog.branch}
          onClose={() => setBranchDialog(null)}
        />
      )}

      {/* Merge branch */}
      {mergeDialog && (
        <MergeBranchDialog
          source={mergeDialog.branch}
          groups={groups}
          branches={branches}
          onClose={() => setMergeDialog(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirmDialog
          payload={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function GroupDialog({
  mode, group, onClose,
}: { mode: "add" | "edit"; group?: HospitalGroup; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [notes, setNotes] = useState(group?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        const { getCurrentOrgId } = await import("@/lib/currentOrg");
        const { error } = await supabase
          .from("hospital_groups")
          .insert({ org_id: getCurrentOrgId(), name: trimmed, slug: slugifyGroupName(trimmed) || trimmed.toLowerCase(), notes: notes || null });
        if (error) throw error;
        toast.success(`Added group "${trimmed}"`);
      } else if (group) {
        const { error } = await supabase
          .from("hospital_groups")
          .update({ name: trimmed, slug: slugifyGroupName(trimmed) || trimmed.toLowerCase(), notes: notes || null })
          .eq("id", group.id);
        if (error) throw error;
        toast.success(`Updated "${trimmed}"`);
      }
      bumpHospitalsVersion();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add hospital group" : "Edit hospital group"}</DialogTitle>
          <DialogDescription>
            A group is the parent brand (e.g. <span className="font-mono">Aster Prime Hospital</span>).
            Branches sit under it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
            <Input value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "add" ? "Add group" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchDialog({
  mode, groupId, branch, onClose,
}: {
  mode: "add" | "edit";
  groupId: string;
  branch?: HospitalBranch;
  onClose: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? "");
  const [city, setCity] = useState(branch?.city ?? "");
  const [notes, setNotes] = useState(branch?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Branch name is required");
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        const { getCurrentOrgId } = await import("@/lib/currentOrg");
        const { error } = await supabase
          .from("hospital_branches")
          .insert({ org_id: getCurrentOrgId(), group_id: groupId, name: trimmed, city: city || null, notes: notes || null });
        if (error) throw error;
        toast.success(`Added branch "${trimmed}"`);
      } else if (branch) {
        const { error } = await supabase
          .from("hospital_branches")
          .update({ name: trimmed, city: city || null, notes: notes || null })
          .eq("id", branch.id);
        if (error) throw error;
        toast.success(`Updated "${trimmed}"`);
      }
      bumpHospitalsVersion();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add branch" : "Edit branch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Branch name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Hyderabad" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">City (optional)</label>
            <Input value={city ?? ""} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
            <Input value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "add" ? "Add branch" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeBranchDialog({
  source, groups, branches, onClose,
}: {
  source: HospitalBranch;
  groups: HospitalGroup[];
  branches: HospitalBranch[];
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const sourceGroup = groups.find((g) => g.id === source.group_id);

  const candidateBranches = branches.filter((b) => b.id !== source.id);

  const merge = async () => {
    if (!targetId) {
      toast.error("Pick a target branch");
      return;
    }
    setMerging(true);
    try {
      const target = branches.find((b) => b.id === targetId);
      if (!target) throw new Error("Target branch not found");
      // Re-tag every claim from source → target (and update group too)
      const { error: updErr } = await supabase
        .from("claims")
        .update({ hospital_branch_id: target.id, hospital_group_id: target.group_id })
        .eq("hospital_branch_id", source.id);
      if (updErr) throw updErr;
      // Delete the now-empty source branch
      const { error: delErr } = await supabase
        .from("hospital_branches")
        .delete()
        .eq("id", source.id);
      if (delErr) throw delErr;
      toast.success(`Merged "${source.name}" into "${target.name}"`);
      bumpHospitalsVersion();
      bumpClaimsVersion();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge branch</DialogTitle>
          <DialogDescription>
            All claims tagged to{" "}
            <span className="font-semibold">{sourceGroup?.name} · {source.name}</span> will be
            re-tagged to the target branch. The source branch is then deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Merge into</label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a branch…" />
              </SelectTrigger>
              <SelectContent>
                {candidateBranches.map((b) => {
                  const g = groups.find((x) => x.id === b.group_id);
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      {g?.name} · {b.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={merging}>Cancel</Button>
          <Button onClick={merge} disabled={merging || !targetId} variant="destructive">
            {merging && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  payload, onClose,
}: {
  payload:
    | { kind: "group"; group: HospitalGroup; claimCount: number }
    | { kind: "branch"; branch: HospitalBranch; claimCount: number };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    try {
      if (payload.kind === "group") {
        const { error } = await supabase
          .from("hospital_groups")
          .delete()
          .eq("id", payload.group.id);
        if (error) throw error;
        toast.success(`Deleted "${payload.group.name}"`);
      } else {
        const { error } = await supabase
          .from("hospital_branches")
          .delete()
          .eq("id", payload.branch.id);
        if (error) throw error;
        toast.success(`Deleted "${payload.branch.name}"`);
      }
      bumpHospitalsVersion();
      bumpClaimsVersion();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const name =
    payload.kind === "group" ? payload.group.name : payload.branch.name;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {payload.kind} "{name}"?
          </DialogTitle>
          <DialogDescription>
            {payload.claimCount > 0 ? (
              <>
                <span className="font-semibold text-destructive">
                  {payload.claimCount.toLocaleString("en-IN")} claim{payload.claimCount === 1 ? "" : "s"}
                </span>{" "}
                are tagged to this {payload.kind}. Their tag will be cleared (the claims
                themselves stay intact). To preserve the tagging, use Merge instead.
              </>
            ) : (
              <>No claims are tagged to this {payload.kind}. Safe to delete.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={doDelete} disabled={busy} variant="destructive">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
