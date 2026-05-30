import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Mail, Shield, Users as UsersIcon, UserCheck, UserX, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AppLayout from "@/components/AppLayout";
import UserFormDialog from "@/components/UserFormDialog";
import { useAppUsers, ROLES, type AppUser, type UserRole, type UserStatus } from "@/hooks/useAppUsers";

const roleStyle: Record<UserRole, string> = {
  "Super Admin":        "bg-destructive/15 text-destructive border border-destructive/30",
  "Hospital Admin":     "bg-primary/15 text-primary border border-primary/30",
  "RCM Manager":        "bg-secondary text-secondary-foreground border border-border",
  "Billing Executive":  "bg-accent/40 text-accent-foreground border border-border",
  "Auditor":            "bg-muted text-foreground border border-border",
  "CFO View":           "bg-warning/15 text-warning border border-warning/30",
};

const statusStyle: Record<UserStatus, string> = {
  active:   "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
  inactive: "bg-muted text-muted-foreground border border-border",
  invited:  "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export default function UsersPage() {
  const { users, loading, createUser, updateUser, deleteUser } = useAppUsers();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone, u.department, u.role].some((f) => (f ?? "").toLowerCase().includes(q));
    });
  }, [users, query, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    invited: users.filter((u) => u.status === "invited").length,
    inactive: users.filter((u) => u.status === "inactive").length,
  }), [users]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (u: AppUser) => { setEditing(u); setFormOpen(true); };

  const handleSubmit = async (data: Parameters<Parameters<typeof UserFormDialog>[0]["onSubmit"]>[0]) => {
    const { smtp, ...profile } = data;
    const payload = { ...profile, ...(smtp ?? {}) };
    if (editing) return updateUser(editing.id, payload);
    return createUser(payload);
  };

  const toggleStatus = (u: AppUser) => {
    const next: UserStatus = u.status === "active" ? "inactive" : "active";
    updateUser(u.id, { status: next });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Users & Roles</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage team members, roles, and access permissions</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Invite User
          </Button>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Users", value: stats.total, icon: UsersIcon, tone: "text-foreground" },
            { label: "Active", value: stats.active, icon: UserCheck, tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Invited", value: stats.invited, icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
            { label: "Inactive", value: stats.inactive, icon: UserX, tone: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.label} className="shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <s.icon className={`h-4 w-4 ${s.tone}`} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{s.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, department…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {(query || roleFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }}>
                Clear
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground tabular-nums">
              {filtered.length} of {users.length}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["User", "Contact", "Role", "Status", "Last Login", ""].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">Loading users…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <UsersIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <div className="text-sm text-muted-foreground">No users match your filters.</div>
                      {users.length === 0 && (
                        <Button size="sm" className="mt-3 gap-1.5" onClick={openAdd}>
                          <Plus className="h-3.5 w-3.5" /> Invite your first user
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : filtered.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold">
                          {initials(u.name) || <Shield className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{u.name}</div>
                          {u.designation && <div className="text-[11px] text-foreground/80 truncate">{u.designation}</div>}
                          {u.department && <div className="text-[11px] text-muted-foreground truncate">{u.department}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-xs text-foreground truncate">{u.email}</div>
                      {u.phone && <div className="text-[11px] text-muted-foreground tabular-nums">{u.phone}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge className={`text-[10px] font-medium ${roleStyle[u.role]}`}>{u.role}</Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge className={`text-[10px] font-medium capitalize ${statusStyle[u.status]}`}>{u.status}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground tabular-nums">{formatDate(u.last_login_at)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-xs h-7">Actions</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(u)}>
                            {u.status === "active" ? <><UserX className="h-3.5 w-3.5 mr-2" />Deactivate</> : <><UserCheck className="h-3.5 w-3.5 mr-2" />Activate</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`mailto:${u.email}`}><Mail className="h-3.5 w-3.5 mr-2" />Email</a>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} onSubmit={handleSubmit} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <>This permanently removes <span className="font-medium text-foreground">{deleteTarget.name}</span> from the directory. This action cannot be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) await deleteUser(deleteTarget.id, deleteTarget.name);
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
