import { useMemo, useState } from "react";
import {
  Hospital, UserPlus, ShieldCheck, Filter, CheckCircle2, Circle, Loader2, ArrowRight, Rocket,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Link } from "@/lib/router-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { useHospitals, bumpHospitalsVersion } from "@/hooks/useHospitals";
import { useAppUsers, ROLES, type UserRole } from "@/hooks/useAppUsers";
import { useUserAllocations } from "@/hooks/useUserAllocations";
import { logAccessChange } from "@/lib/accessAudit";
import DataScopePreview from "@/components/access/DataScopePreview";

const STEPS = [
  { key: "branches", label: "Add branches", icon: Hospital, desc: "Every claim belongs to a branch." },
  { key: "invite", label: "Invite staff", icon: UserPlus, desc: "Send sign-in invites by email." },
  { key: "roles", label: "Assign roles", icon: ShieldCheck, desc: "Decide what each person can do." },
  { key: "scope", label: "Set branch & TPA scope", icon: Filter, desc: "Decide which rows they see." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export default function OnboardingWizardPage() {
  const [step, setStep] = useState<StepKey>("branches");
  const { groups, branches, refetch } = useHospitals();
  const { users, createUser, updateUser } = useAppUsers();

  // Step 1 — branch
  const [branchName, setBranchName] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [savingBranch, setSavingBranch] = useState(false);

  // Step 2 — invite
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("Billing Executive");
  const [inviting, setInviting] = useState(false);

  // Step 3/4 — selected user
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;
  const [scopeMode, setScopeMode] = useState<"all" | "restricted">("all");
  const [scopeBranchIds, setScopeBranchIds] = useState<string[]>([]);
  const [providerInput, setProviderInput] = useState("");
  const { allocations, allocate, deallocate } = useUserAllocations(selectedUserId || null);

  const effectiveGroupId = groupId || groups[0]?.id || "";

  const done: Record<StepKey, boolean> = useMemo(
    () => ({
      branches: branches.length > 0,
      invite: users.length > 1,
      roles: users.some((u) => u.role !== "Billing Executive") || users.length > 1,
      scope: allocations.length > 0 || scopeMode === "restricted",
    }),
    [branches.length, users, allocations.length, scopeMode],
  );

  const addBranch = async () => {
    const name = branchName.trim();
    if (!name) return;
    if (!effectiveGroupId) {
      toast({ title: "Create a hospital group first", description: "Ask your RCM Buddy contact to set up your group.", variant: "destructive" });
      return;
    }
    setSavingBranch(true);
    const { error } = await supabase.from("hospital_branches").insert({
      org_id: getCurrentOrgId(),
      group_id: effectiveGroupId,
      name,
      city: branchCity.trim() || null,
    });
    setSavingBranch(false);
    if (error) {
      toast({ title: "Could not add branch", description: error.message, variant: "destructive" });
      return;
    }
    await logAccessChange({
      entity: "org_member",
      action: "created",
      summary: `Branch “${name}” added during onboarding`,
      after: { name, city: branchCity.trim() || null },
    });
    toast({ title: "Branch added", description: name });
    setBranchName("");
    setBranchCity("");
    bumpHospitalsVersion();
    await refetch();
  };

  const sendInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    const ok = await createUser({ name: inviteName.trim(), email: inviteEmail.trim().toLowerCase(), role: inviteRole });
    setInviting(false);
    if (ok) {
      await logAccessChange({
        entity: "invite",
        action: "invited",
        summary: `Invited ${inviteName.trim()} as ${inviteRole}`,
        targetEmail: inviteEmail.trim().toLowerCase(),
        after: { role: inviteRole },
      });
      setInviteName("");
      setInviteEmail("");
      setStep("roles");
    }
  };

  const changeRole = async (role: UserRole) => {
    if (!selectedUser) return;
    const before = selectedUser.role;
    const ok = await updateUser(selectedUser.id, { role });
    if (ok) {
      await logAccessChange({
        entity: "user_role",
        action: "updated",
        summary: `${selectedUser.name}: capability role changed`,
        targetEmail: selectedUser.email,
        before: before,
        after: role,
      });
    }
  };

  const saveScope = async () => {
    if (!selectedUser) return;
    // organization_members keys on the auth user id, not app_users.id.
    const { data: link } = await supabase
      .from("app_users")
      .select("auth_user_id")
      .eq("id", selectedUser.id)
      .maybeSingle();
    const authUserId = link?.auth_user_id;
    if (!authUserId) {
      toast({
        title: "Scope not saved",
        description: `${selectedUser.name} hasn't accepted their invite yet — set scope once they sign in.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("organization_members")
      .update({
        branch_scope_mode: scopeMode,
        branch_scope: scopeMode === "restricted" ? scopeBranchIds : [],
      })
      .eq("org_id", getCurrentOrgId())
      .eq("user_id", selectedUser.id);
    if (error) {
      toast({ title: "Could not save scope", description: error.message, variant: "destructive" });
      return;
    }
    await logAccessChange({
      entity: "branch_scope",
      action: "updated",
      summary: `${selectedUser.name}: branch scope set to ${scopeMode === "all" ? "all branches" : `${scopeBranchIds.length} branch(es)`}`,
      targetEmail: selectedUser.email,
      branchId: scopeMode === "restricted" ? scopeBranchIds[0] ?? null : null,
      after: { mode: scopeMode, branches: scopeBranchIds },
    });
    toast({ title: "Scope saved" });
  };

  const addProvider = async () => {
    const p = providerInput.trim();
    if (!p || !selectedUser) return;
    const ok = await allocate(selectedUser.id, p);
    if (ok) {
      await logAccessChange({
        entity: "tpa_allocation",
        action: "granted",
        summary: `${selectedUser.name} allocated payer ${p}`,
        targetEmail: selectedUser.email,
        after: p,
      });
      setProviderInput("");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" /> Hospital Onboarding
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Four steps to get your team live: branches → people → roles → scope.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/settings/access-guide"><ShieldCheck className="h-3.5 w-3.5" /> Access &amp; Roles guide</Link>
          </Button>
        </div>

        {/* Stepper */}
        <div className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setStep(s.key)}
                className={`text-left rounded-lg border p-3 transition ${
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {done[s.key] ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold">Step {i + 1}</span>
                </div>
                <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" /> {s.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
              </button>
            );
          })}
        </div>

        {step === "branches" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-base font-semibold">Step 1 — Add your branches</h2>
              <Alert className="bg-primary/5 border-primary/20">
                <AlertDescription className="text-xs">
                  Your hospital group is created by RCM Buddy. You can add as many branches under it as you need.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap items-end gap-3">
                {groups.length > 1 && (
                  <div className="min-w-[200px]">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Group</label>
                    <Select value={effectiveGroupId} onValueChange={setGroupId}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="min-w-[220px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Branch name</label>
                  <Input className="h-9 mt-1" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Whitefield" />
                </div>
                <div className="min-w-[160px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">City</label>
                  <Input className="h-9 mt-1" value={branchCity} onChange={(e) => setBranchCity(e.target.value)} placeholder="Bengaluru" />
                </div>
                <Button size="sm" onClick={addBranch} disabled={savingBranch || !branchName.trim()}>
                  {savingBranch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add branch"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => <Badge key={b.id} variant="secondary" className="font-normal">{b.name}</Badge>)}
                {branches.length === 0 && <span className="text-xs text-muted-foreground">No branches yet.</span>}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setStep("invite")}>
                Next: invite staff <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "invite" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-base font-semibold">Step 2 — Invite your team</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Name</label>
                  <Input className="h-9 mt-1" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Priya Sharma" />
                </div>
                <div className="min-w-[220px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Work email</label>
                  <Input className="h-9 mt-1" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="priya@hospital.com" />
                </div>
                <div className="min-w-[180px]">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Role</label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send invite"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{users.length} team member(s) so far.</p>
            </CardContent>
          </Card>
        )}

        {(step === "roles" || step === "scope") && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-base font-semibold">
                {step === "roles" ? "Step 3 — Assign roles" : "Step 4 — Branch & TPA scope"}
              </h2>
              <div className="min-w-[240px] max-w-sm">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Team member</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick someone…" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && step === "roles" && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px]">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Capability role</label>
                    <Select value={selectedUser.role} onValueChange={(v) => void changeRole(v as UserRole)}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setStep("scope")}>
                    Next: set scope <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {selectedUser && step === "scope" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px]">
                      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Branch scope</label>
                      <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as "all" | "restricted")}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All branches</SelectItem>
                          <SelectItem value="restricted">Only selected branches</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={saveScope}>Save scope</Button>
                  </div>

                  {scopeMode === "restricted" && (
                    <div className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/30 p-3">
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={scopeBranchIds.includes(b.id)}
                            onCheckedChange={(c) =>
                              setScopeBranchIds((prev) => (c ? [...prev, b.id] : prev.filter((x) => x !== b.id)))
                            }
                          />
                          {b.name}
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px]">
                      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Allocate a payer / TPA</label>
                      <Input className="h-9 mt-1" value={providerInput} onChange={(e) => setProviderInput(e.target.value)} placeholder="e.g. Star Health" />
                    </div>
                    <Button size="sm" variant="outline" onClick={addProvider} disabled={!providerInput.trim()}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allocations.map((a) => (
                      <Badge key={a.id} variant="secondary" className="font-normal gap-1">
                        {a.provider}
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => void deallocate(a.id)}>×</button>
                      </Badge>
                    ))}
                    {allocations.length === 0 && <span className="text-xs text-muted-foreground">No payer restriction — sees all payers.</span>}
                  </div>

                  <DataScopePreview
                    role={selectedUser.role}
                    branchMode={scopeMode}
                    branchIds={scopeBranchIds}
                    providers={allocations.map((a) => a.provider)}
                  />
                </div>
              )}

              {!selectedUser && (
                <p className="text-xs text-muted-foreground">Pick a team member to continue.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
