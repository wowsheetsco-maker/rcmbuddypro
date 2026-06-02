import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

const ENTITY_TYPES = ["appointment", "report", "invoice", "payment", "general"];

interface Task {
  id: string; entity_type: string; entity_id: string | null;
  title: string; description: string | null; due_at: string | null;
  assigned_to: string | null; status: string; completed_at: string | null;
}
interface User { id: string; name: string; email: string }

export default function OpdTasksPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [t, u] = await Promise.all([
      supabase.from("opd_followup_tasks").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(500),
      supabase.from("app_users").select("id, name, email").eq("status", "active").order("name"),
    ]);
    setRows((t.data ?? []) as Task[]);
    setUsers((u.data ?? []) as User[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  const openCount = rows.filter((r) => r.status === "open").length;
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = rows.filter((r) => r.status === "open" && r.due_at && r.due_at.slice(0, 10) <= today).length;
  const overdue = rows.filter((r) => r.status === "open" && r.due_at && r.due_at < new Date().toISOString()).length;

  const complete = async (id: string) => {
    const { error } = await supabase.from("opd_followup_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else load();
  };

  const reassign = async (id: string, user_id: string) => {
    const { error } = await supabase.from("opd_followup_tasks").update({ assigned_to: user_id || null }).eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Follow-up tasks</h1>
            <p className="text-sm text-muted-foreground">Assign and track follow-ups across appointments, reports, invoices, and payments.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New task</Button></DialogTrigger>
            <NewTaskDialog users={users} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Open</div><div className="text-2xl font-semibold">{openCount}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Due today</div><div className="text-2xl font-semibold text-amber-600">{dueToday}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-2xl font-semibold text-red-600">{overdue}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Tasks ({filtered.length})</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No tasks in this view.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Title</TableHead><TableHead>Source</TableHead><TableHead>Due</TableHead>
                    <TableHead>Assignee</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const overdueRow = r.status === "open" && r.due_at && r.due_at < new Date().toISOString();
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.title}<div className="text-xs text-muted-foreground">{r.description ?? ""}</div></TableCell>
                          <TableCell><Badge variant="outline">{r.entity_type}</Badge></TableCell>
                          <TableCell className={`text-xs ${overdueRow ? "text-red-600 font-semibold" : ""}`}>{r.due_at ? new Date(r.due_at).toLocaleString() : "—"}</TableCell>
                          <TableCell>
                            <Select value={r.assigned_to ?? ""} onValueChange={(v) => reassign(r.id, v)}>
                              <SelectTrigger className="w-40 h-7"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Unassigned</SelectItem>
                                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Badge variant={r.status === "done" ? "outline" : "default"}>{r.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            {r.status === "open" && <Button size="sm" variant="outline" onClick={() => complete(r.id)}><Check className="h-3 w-3 mr-1" /> Done</Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            }
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function NewTaskDialog({ users, onSaved }: { users: User[]; onSaved: () => void }) {
  const [f, setF] = useState({
    title: "", description: "", entity_type: "general",
    due_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    assigned_to: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.title) return toast({ title: "Title required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("opd_followup_tasks").insert({
      org_id: getCurrentOrgId(),
      title: f.title,
      description: f.description || null,
      entity_type: f.entity_type,
      due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
      assigned_to: f.assigned_to || null,
      status: "open",
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Task created" });
    onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New follow-up task</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Title *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Source</Label>
            <Select value={f.entity_type} onValueChange={(v) => setF({ ...f, entity_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Due</Label><Input type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></div>
        </div>
        <div><Label>Assign to</Label>
          <Select value={f.assigned_to} onValueChange={(v) => setF({ ...f, assigned_to: v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create"}</Button></DialogFooter>
    </DialogContent>
  );
}
