import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload, FileCheck2, Loader2, UserPlus, Inbox, CheckCircle2, Building2, Download, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useHospitals } from "@/hooks/useHospitals";
import { useAppUsers } from "@/hooks/useAppUsers";
import SubmissionDetailDrawer from "@/components/SubmissionDetailDrawer";

const BUCKET = "claim-documents";
const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);

interface Submission {
  id: string;
  claim_id: string;
  branch_id: string | null;
  assignee_id: string | null;
  status: "pending" | "in_progress" | "submitted" | "acknowledged" | "cancelled";
  submission_mode: string | null;
  portal_ref: string | null;
  courier_awb: string | null;
  courier_partner: string | null;
  submitted_at: string | null;
  ack_received_at: string | null;
  ack_doc_url: string | null;
  ack_doc_path: string | null;
  notes: string | null;
  due_date: string | null;
}

function daysAgo(date: string | null | undefined): number {
  if (!date) return 0;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export default function SubmissionTrackerPage() {
  const { claims, loading: claimsLoading } = useLiveClaims();
  const { branches } = useHospitals();
  const { users } = useAppUsers();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "in_flight" | "done">("pending");
  const [assignDialog, setAssignDialog] = useState<{ claimId: string } | null>(null);
  const [submitDialog, setSubmitDialog] = useState<{ sub: Submission } | null>(null);
  const [ackDialog, setAckDialog] = useState<{ sub: Submission } | null>(null);
  const [detailDrawer, setDetailDrawer] = useState<{ sub: Submission; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [officerEdits, setOfficerEdits] = useState<Record<string, string>>({});

  const fetchSubs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("claim_submissions" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setSubs((data ?? []) as unknown as Submission[]);
    setLoading(false);
  };

  useEffect(() => { void fetchSubs(); }, []);

  const subByClaim = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of subs) m.set(s.claim_id, s);
    return m;
  }, [subs]);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Eligible claims: discharged, not settled, no doc_submission_date OR has open submission row
  const rows = useMemo(() => {
    const out: { claim: typeof claims[number]; sub: Submission | null; daysSince: number }[] = [];
    for (const c of claims) {
      if (!c.date_of_discharge) continue;
      const status = (c.claim_status || "").toLowerCase();
      if (SETTLED.has(status)) continue;
      const sub = subByClaim.get(c.id) ?? null;
      if (!sub && c.doc_submission_date) continue;
      out.push({ claim: c, sub, daysSince: daysAgo(c.date_of_discharge) });
    }
    return out.sort((a, b) => b.daysSince - a.daysSince);
  }, [claims, subByClaim]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (tab === "pending") {
      list = list.filter((r) => !r.sub || r.sub.status === "pending");
    } else if (tab === "in_flight") {
      list = list.filter((r) => r.sub && (r.sub.status === "in_progress" || r.sub.status === "submitted"));
    } else {
      list = list.filter((r) => r.sub?.status === "acknowledged");
    }
    if (!q) return list;
    return list.filter((r) =>
      `${r.claim.claim_number ?? ""} ${r.claim.patient_name} ${r.claim.tpa_name ?? ""}`
        .toLowerCase().includes(q),
    );
  }, [rows, tab, search]);

  const counts = useMemo(() => {
    let pending = 0, inFlight = 0, done = 0, overdue = 0;
    for (const r of rows) {
      const s = r.sub?.status;
      if (!s || s === "pending") pending++;
      else if (s === "in_progress" || s === "submitted") inFlight++;
      else if (s === "acknowledged") done++;
      if ((!s || s === "pending") && r.daysSince > 7) overdue++;
    }
    return { pending, inFlight, done, overdue };
  }, [rows]);

  const handleAssign = async (claimId: string, assigneeId: string | null, dueDate: string | null) => {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return;
    const existing = subByClaim.get(claimId);
    const branchId = claim.hospital_branch_id ?? null;
    const payload = {
      claim_id: claimId,
      branch_id: branchId,
      assignee_id: assigneeId,
      status: "pending" as const,
      due_date: dueDate,
    };
    const op = existing
      ? supabase.from("claim_submissions" as any).update(payload).eq("id", existing.id)
      : supabase.from("claim_submissions" as any).insert(payload);
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success(existing ? "Task reassigned" : "Submission task created");
    setAssignDialog(null);
    void fetchSubs();
  };

  const handleMarkSubmitted = async (
    sub: Submission,
    mode: string,
    portalRef: string,
    awb: string,
    partner: string,
    notes: string,
  ) => {
    const { error } = await supabase.from("claim_submissions" as any).update({
      status: "submitted",
      submission_mode: mode || null,
      portal_ref: portalRef || null,
      courier_awb: awb || null,
      courier_partner: partner || null,
      notes: notes || sub.notes,
      submitted_at: new Date().toISOString(),
    }).eq("id", sub.id);
    if (error) { toast.error(error.message); return; }
    // Also stamp claim.doc_submission_date
    await supabase.from("claims").update({
      doc_submission_date: new Date().toISOString().slice(0, 10),
    }).eq("id", sub.claim_id);
    toast.success("Marked submitted");
    setSubmitDialog(null);
    void fetchSubs();
  };

  const handleUploadAck = async (sub: Submission, file: File) => {
    const path = `submissions/${sub.claim_id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { data: signed } = await supabase.storage.from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const { error } = await supabase.from("claim_submissions" as any).update({
      status: "acknowledged",
      ack_received_at: new Date().toISOString(),
      ack_doc_path: path,
      ack_doc_url: signed?.signedUrl ?? null,
    }).eq("id", sub.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Acknowledgement saved");
    setAckDialog(null);
    void fetchSubs();
  };

  const handleSetBranchOfficer = async (branchId: string, officerId: string | null) => {
    const { error } = await supabase
      .from("hospital_branches")
      .update({ submission_officer_id: officerId } as any)
      .eq("id", branchId);
    if (error) { toast.error(error.message); return; }
    toast.success("Branch officer updated");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Claim Submission Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Track claim document submission to TPA/Insurer — assign to branch officers, capture portal/courier proof, and store acknowledgements.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Pending", v: counts.pending, tone: "text-amber-600" },
            { l: "Overdue >7d", v: counts.overdue, tone: "text-rose-600" },
            { l: "In Flight", v: counts.inFlight, tone: "text-blue-600" },
            { l: "Acknowledged", v: counts.done, tone: "text-emerald-600" },
          ].map((s) => (
            <Card key={s.l}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.v}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Branch Submission Officers</CardTitle>
          </CardHeader>
          <CardContent>
            {branches.length === 0 ? (
              <div className="text-sm text-muted-foreground">No branches yet.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-2">
                {branches.map((b) => {
                  const current = (b as any).submission_officer_id as string | null;
                  const value = officerEdits[b.id] ?? current ?? "none";
                  return (
                    <div key={b.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{b.city ?? "—"}</div>
                      </div>
                      <Select
                        value={value}
                        onValueChange={(v) => {
                          setOfficerEdits((m) => ({ ...m, [b.id]: v }));
                          void handleSetBranchOfficer(b.id, v === "none" ? null : v);
                        }}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-xs">
                          <SelectValue placeholder="Assign officer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unassigned —</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="pending"><Inbox className="h-3.5 w-3.5 mr-1" /> Pending ({counts.pending})</TabsTrigger>
                <TabsTrigger value="in_flight"><Upload className="h-3.5 w-3.5 mr-1" /> In Flight ({counts.inFlight})</TabsTrigger>
                <TabsTrigger value="done"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledged ({counts.done})</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Search claim / patient / TPA"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </CardHeader>
          <CardContent>
            {loading || claimsLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No claims in this bucket.</div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>TPA / Insurer</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Discharge</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map(({ claim, sub, daysSince }) => {
                      const branch = claim.hospital_branch_id ? branchById.get(claim.hospital_branch_id) : null;
                      const defaultOfficer = branch ? ((branch as any).submission_officer_id as string | null) : null;
                      const assignee = sub?.assignee_id ?? defaultOfficer;
                      const assigneeUser = assignee ? userById.get(assignee) : null;
                      const overdue = !sub && daysSince > 7;
                      return (
                        <TableRow key={claim.id}>
                          <TableCell className="font-medium">{claim.claim_number || claim.ihx_ref_id}</TableCell>
                          <TableCell>{claim.patient_name}</TableCell>
                          <TableCell className="text-xs">{claim.tpa_name || claim.insurance_company_name || "—"}</TableCell>
                          <TableCell className="text-xs">{branch?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            {claim.date_of_discharge}{" "}
                            <span className={overdue ? "text-rose-600 font-medium" : "text-muted-foreground"}>
                              ({daysSince}d)
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {assigneeUser?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {sub?.status ?? "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {sub && (
                              <Button size="sm" variant="ghost" onClick={() => setDetailDrawer({ sub, label: `${claim.claim_number || claim.ihx_ref_id} · ${claim.patient_name}` })}>
                                <Eye className="h-3 w-3 mr-1" /> View
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setAssignDialog({ claimId: claim.id })}>
                              <UserPlus className="h-3 w-3 mr-1" /> Assign
                            </Button>
                            {sub && sub.status !== "acknowledged" && (
                              <Button size="sm" variant="outline" onClick={() => setSubmitDialog({ sub })}>
                                <Upload className="h-3 w-3 mr-1" /> Mark Submitted
                              </Button>
                            )}
                            {sub && (sub.status === "submitted" || sub.status === "in_progress") && (
                              <Button size="sm" variant="outline" onClick={() => setAckDialog({ sub })}>
                                <FileCheck2 className="h-3 w-3 mr-1" /> Upload Ack
                              </Button>
                            )}
                            {sub?.ack_doc_url && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={sub.ack_doc_url} target="_blank" rel="noreferrer">
                                  <Download className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {assignDialog && (
        <AssignDialog
          claimId={assignDialog.claimId}
          claims={claims}
          branchById={branchById}
          users={users}
          existing={subByClaim.get(assignDialog.claimId) ?? null}
          onClose={() => setAssignDialog(null)}
          onSave={handleAssign}
        />
      )}
      {submitDialog && (
        <SubmitDialog
          sub={submitDialog.sub}
          onClose={() => setSubmitDialog(null)}
          onSave={handleMarkSubmitted}
        />
      )}
      {ackDialog && (
        <AckDialog
          sub={ackDialog.sub}
          onClose={() => setAckDialog(null)}
          onUpload={handleUploadAck}
          fileRef={fileRef}
        />
      )}
      <SubmissionDetailDrawer
        open={!!detailDrawer}
        onClose={() => setDetailDrawer(null)}
        submissionId={detailDrawer?.sub.id ?? null}
        claimId={detailDrawer?.sub.claim_id ?? null}
        claimLabel={detailDrawer?.label ?? ""}
        submissionMode={detailDrawer?.sub.submission_mode ?? null}
      />
    </AppLayout>
  );
}

function AssignDialog({
  claimId, claims, branchById, users, existing, onClose, onSave,
}: {
  claimId: string;
  claims: ReturnType<typeof useLiveClaims>["claims"];
  branchById: Map<string, any>;
  users: ReturnType<typeof useAppUsers>["users"];
  existing: Submission | null;
  onClose: () => void;
  onSave: (claimId: string, assigneeId: string | null, dueDate: string | null) => void;
}) {
  const claim = claims.find((c) => c.id === claimId);
  const branch = claim?.hospital_branch_id ? branchById.get(claim.hospital_branch_id) : null;
  const defaultOfficer = (branch?.submission_officer_id as string | null) ?? null;
  const [assignee, setAssignee] = useState<string>(existing?.assignee_id ?? defaultOfficer ?? "");
  const [due, setDue] = useState<string>(existing?.due_date ?? "");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Submission Task</DialogTitle>
          <DialogDescription>
            {claim?.claim_number || claim?.ihx_ref_id} · {claim?.patient_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.id === defaultOfficer ? "· Branch officer" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due date (optional)</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(claimId, assignee || null, due || null)} disabled={!assignee}>
            {existing ? "Reassign" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitDialog({
  sub, onClose, onSave,
}: {
  sub: Submission;
  onClose: () => void;
  onSave: (sub: Submission, mode: string, portalRef: string, awb: string, partner: string, notes: string) => void;
}) {
  const [mode, setMode] = useState(sub.submission_mode ?? "portal");
  const [portalRef, setPortalRef] = useState(sub.portal_ref ?? "");
  const [awb, setAwb] = useState(sub.courier_awb ?? "");
  const [partner, setPartner] = useState(sub.courier_partner ?? "");
  const [notes, setNotes] = useState(sub.notes ?? "");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Claim Submitted</DialogTitle>
          <DialogDescription>Record how documents were submitted to TPA/Insurer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portal">Portal upload</SelectItem>
                <SelectItem value="courier">Courier</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="hand_delivery">Hand delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "portal" && (
            <div>
              <Label>Portal reference / acknowledgement ID</Label>
              <Input value={portalRef} onChange={(e) => setPortalRef(e.target.value)} />
            </div>
          )}
          {mode === "courier" && (
            <>
              <div>
                <Label>Courier partner</Label>
                <Input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="DTDC / Blue Dart / Speed Post" />
              </div>
              <div>
                <Label>AWB / Tracking number</Label>
                <Input value={awb} onChange={(e) => setAwb(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(sub, mode, portalRef, awb, partner, notes)}>Mark Submitted</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AckDialog({
  sub, onClose, onUpload, fileRef,
}: {
  sub: Submission;
  onClose: () => void;
  onUpload: (sub: Submission, file: File) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Acknowledgement</DialogTitle>
          <DialogDescription>Attach stamped/signed acknowledgement from TPA or courier POD.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && <div className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!file || uploading}
            onClick={async () => {
              if (!file) return;
              setUploading(true);
              try { await onUpload(sub, file); } finally { setUploading(false); }
            }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
