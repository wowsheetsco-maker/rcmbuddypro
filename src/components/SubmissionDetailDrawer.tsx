import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, FileCheck2, FileX2, History, ClipboardList, Download, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { resendSubmissionReminder } from "@/lib/submissionReminders.functions";
import { useAppUsers } from "@/hooks/useAppUsers";

const BUCKET = "claim-documents";

interface DocRow {
  id: string;
  doc_key: string;
  label: string;
  required_for_portal: boolean;
  required_for_courier: boolean;
  status: "missing" | "attached" | "not_applicable";
  doc_path: string | null;
  doc_url: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  notes: string | null;
  sort_order: number;
}

interface EventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  submissionId: string | null;
  claimId: string | null;
  claimLabel: string;
  submissionMode: string | null;
}

export default function SubmissionDetailDrawer({
  open, onClose, submissionId, claimId, claimLabel, submissionMode,
}: Props) {
  const { users } = useAppUsers();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"portal" | "courier">(
    (submissionMode === "courier" ? "courier" : "portal"),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const resendFn = useServerFn(resendSubmissionReminder);

  const resend = async () => {
    if (!submissionId) return;
    setResending(true);
    try {
      const res = await resendFn({ data: { submissionId } });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to send reminder");
        return;
      }
      const c = res.channels_used ?? { in_app: 0, email: 0, whatsapp: 0 };
      const parts: string[] = [];
      if (c.in_app) parts.push(`${c.in_app} in-app`);
      if (c.email) parts.push(`${c.email} email`);
      if (c.whatsapp) parts.push(`${c.whatsapp} WhatsApp`);
      toast.success(
        parts.length ? `Reminder sent: ${parts.join(", ")}` : "No recipients had channels configured",
      );
      const failed = (res.recipients ?? []).flatMap((r) => {
        const errs: string[] = [];
        if (r.email && !r.email.ok && r.email.error && r.email.error !== "email_not_configured")
          errs.push(`Email to ${r.name}: ${r.email.error}`);
        if (r.whatsapp && !r.whatsapp.ok && r.whatsapp.error && r.whatsapp.error !== "whatsapp_not_configured")
          errs.push(`WhatsApp to ${r.name}: ${r.whatsapp.error}`);
        return errs;
      });
      if (failed.length) toast.warning(failed.join(" · "));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reminder");
    } finally {
      setResending(false);
    }
  };

  const userName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "System");
  }, [users]);

  const load = async () => {
    if (!submissionId || !claimId) return;
    setLoading(true);
    const [{ data: d }, { data: e }] = await Promise.all([
      supabase.from("claim_submission_documents" as any)
        .select("*").eq("submission_id", submissionId).order("sort_order"),
      supabase.from("claim_submission_events" as any)
        .select("*").eq("claim_id", claimId).order("created_at", { ascending: false }),
    ]);
    setDocs((d ?? []) as unknown as DocRow[]);
    setEvents((e ?? []) as unknown as EventRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submissionId]);

  const seed = async () => {
    if (!submissionId) return;
    await supabase.rpc("seed_submission_checklist" as never, { _submission_id: submissionId } as never);
    void load();
  };

  const setStatus = async (doc: DocRow, status: DocRow["status"]) => {
    const { error } = await supabase.from("claim_submission_documents" as any)
      .update({ status }).eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    if (claimId && submissionId) {
      await supabase.from("claim_submission_events" as any).insert({
        submission_id: submissionId,
        claim_id: claimId,
        event_type: status === "not_applicable" ? "document_marked_na" :
          status === "missing" ? "document_removed" : "document_attached",
        payload: { doc_key: doc.doc_key, status },
      });
    }
    void load();
  };

  const toggleRequirement = async (doc: DocRow, field: "required_for_portal" | "required_for_courier", v: boolean) => {
    const { error } = await supabase.from("claim_submission_documents" as any)
      .update({ [field]: v }).eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const uploadFor = async (doc: DocRow, file: File) => {
    if (!claimId) return;
    setUploadingFor(doc.id);
    try {
      const path = `submissions/${claimId}/${doc.doc_key}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) { toast.error(upErr.message); return; }
      const { data: signed } = await supabase.storage.from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      const { error } = await supabase.from("claim_submission_documents" as any).update({
        status: "attached", doc_path: path, doc_url: signed?.signedUrl ?? null,
        uploaded_at: new Date().toISOString(),
      }).eq("id", doc.id);
      if (error) { toast.error(error.message); return; }
      if (submissionId) {
        await supabase.from("claim_submission_events" as any).insert({
          submission_id: submissionId,
          claim_id: claimId,
          event_type: "document_attached",
          payload: { doc_key: doc.doc_key, file_name: file.name },
        });
      }
      toast.success(`${doc.label} attached`);
      void load();
    } finally {
      setUploadingFor(null);
    }
  };

  const visible = docs.filter((d) =>
    filter === "portal" ? d.required_for_portal : d.required_for_courier,
  );
  const missing = visible.filter((d) => d.status === "missing").length;
  const attached = visible.filter((d) => d.status === "attached").length;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Submission Details</SheetTitle>
          <SheetDescription>{claimLabel}</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="checklist" className="mt-4">
          <TabsList>
            <TabsTrigger value="checklist"><ClipboardList className="h-3.5 w-3.5 mr-1" /> Checklist</TabsTrigger>
            <TabsTrigger value="timeline"><History className="h-3.5 w-3.5 mr-1" /> Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="checklist" className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filter} onValueChange={(v) => setFilter(v as "portal" | "courier")}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Portal submission</SelectItem>
                  <SelectItem value="courier">Courier submission</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-xs">
                {attached}/{visible.length} attached
              </Badge>
              {missing > 0 && (
                <Badge variant="outline" className="text-xs text-rose-600 border-rose-300">
                  {missing} missing
                </Badge>
              )}
              {docs.length === 0 && (
                <Button size="sm" variant="outline" onClick={seed}>Seed default checklist</Button>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((d) => (
                  <div key={d.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{d.label}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                          <label className="flex items-center gap-1">
                            <Checkbox
                              checked={d.required_for_portal}
                              onCheckedChange={(v) => toggleRequirement(d, "required_for_portal", !!v)}
                            />
                            Portal
                          </label>
                          <label className="flex items-center gap-1">
                            <Checkbox
                              checked={d.required_for_courier}
                              onCheckedChange={(v) => toggleRequirement(d, "required_for_courier", !!v)}
                            />
                            Courier
                          </label>
                          {d.uploaded_at && (
                            <span>· uploaded {new Date(d.uploaded_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${
                        d.status === "attached" ? "text-emerald-600 border-emerald-300" :
                        d.status === "not_applicable" ? "text-muted-foreground" :
                        "text-rose-600 border-rose-300"
                      }`}>
                        {d.status === "attached" ? "Attached" : d.status === "not_applicable" ? "N/A" : "Missing"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <input
                        ref={fileRef}
                        type="file"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadFor(d, f);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="sm" variant="outline"
                        disabled={uploadingFor === d.id}
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".pdf,.jpg,.jpeg,.png";
                          input.onchange = () => {
                            const f = input.files?.[0];
                            if (f) void uploadFor(d, f);
                          };
                          input.click();
                        }}
                      >
                        {uploadingFor === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                        {d.status === "attached" ? "Replace" : "Attach"}
                      </Button>
                      {d.doc_url && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={d.doc_url} target="_blank" rel="noreferrer">
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setStatus(d, "not_applicable")}>
                        <FileX2 className="h-3 w-3 mr-1" /> N/A
                      </Button>
                      {d.status !== "missing" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(d, "missing")}>
                          Mark missing
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {visible.length === 0 && (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    No documents required for this submission mode.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
              </div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No events yet.</div>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-4 pt-2">
                {events.map((e) => (
                  <li key={e.id} className="ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                    <time className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </time>
                    <div className="text-sm font-medium capitalize">
                      {e.event_type.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-muted-foreground">by {userName(e.actor_id)}</div>
                    {Object.keys(e.payload ?? {}).length > 0 && (
                      <pre className="text-[10px] mt-1 bg-muted/50 rounded p-2 overflow-auto max-h-32">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
