import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Status = "pending" | "approved" | "rejected";

interface RequestRow {
  id: string;
  email: string;
  name: string | null;
  org_id: string | null;
  requested_org_name: string | null;
  message: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const APP_ROLES = [
  "Hospital Admin",
  "RCM Manager",
  "Billing Executive",
  "TPA Coordinator",
  "Front Office",
  "Finance",
  "Auditor",
  "Viewer",
] as const;

export default function AccessRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleById, setRoleById] = useState<Record<string, string>>({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_requests")
      .select("id, email, name, org_id, requested_org_name, message, status, review_note, created_at, reviewed_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load requests", description: error.message, variant: "destructive" });
    }
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => rows.filter((r) => r.status === tab), [rows, tab]);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  const approve = async (row: RequestRow) => {
    if (!row.org_id) {
      toast({
        title: "No hospital on this request",
        description: "The requester typed a hospital name that doesn't exist yet. Create it first, then ask them to re-request.",
        variant: "destructive",
      });
      return;
    }
    setBusyId(row.id);
    const appRole = roleById[row.id] ?? "Billing Executive";
    const { error } = await supabase.rpc("approve_access_request", {
      _request_id: row.id,
      _org_role: appRole === "Hospital Admin" ? "admin" : "member",
      _app_role: appRole,
    } as never);
    setBusyId(null);
    if (error) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Access granted", description: `${row.email} can now sign in to this hospital.` });
    void load();
  };

  const reject = async (row: RequestRow) => {
    setBusyId(row.id);
    const { error } = await supabase.rpc("reject_access_request", {
      _request_id: row.id,
      _note: noteById[row.id]?.trim() || null,
    } as never);
    setBusyId(null);
    if (error) {
      toast({ title: "Rejection failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request rejected" });
    void load();
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Access requests
          </h1>
          <p className="text-sm text-muted-foreground">
            People who signed up without an invitation. Approve to attach them to your hospital,
            or reject with a reason.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pendingCount > 0 ? <Badge className="ml-2">{pendingCount}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize">{tab} requests</CardTitle>
            <CardDescription>
              {tab === "pending"
                ? "Assign the role they should get, then approve."
                : "History of reviewed requests."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">No {tab} requests.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Hospital requested</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">
                      {tab === "pending" ? "Decision" : "Outcome"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.requested_org_name ?? "—"}
                        {!r.org_id ? (
                          <Badge variant="outline" className="ml-2">not on platform</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[22rem] text-sm text-muted-foreground">
                        {r.message ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {tab === "pending" ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <Label className="sr-only" htmlFor={`role-${r.id}`}>Role</Label>
                              <Select
                                value={roleById[r.id] ?? "Billing Executive"}
                                onValueChange={(v) => setRoleById((p) => ({ ...p, [r.id]: v }))}
                              >
                                <SelectTrigger id={`role-${r.id}`} className="w-[11rem]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {APP_ROLES.map((role) => (
                                    <SelectItem key={role} value={role}>{role}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" onClick={() => approve(r)} disabled={busyId === r.id}>
                                {busyId === r.id ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                aria-label="Rejection reason"
                                placeholder="Reason (optional)"
                                className="h-8 w-[11rem]"
                                value={noteById[r.id] ?? ""}
                                onChange={(e) => setNoteById((p) => ({ ...p, [r.id]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reject(r)}
                                disabled={busyId === r.id}
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2 text-sm">
                            {r.status === "approved" ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Approved
                              </>
                            ) : (
                              <>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                Rejected{r.review_note ? ` — ${r.review_note}` : ""}
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
