// Bulk Follow-up Send Progress Tracker
// Sequentially fires the `send-outstanding-reminder` edge function for each
// selected TPA, tracks per-row status (pending / sending / sent / failed),
// and lets the user retry only the ones that failed.

import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, XCircle, Loader2, RotateCw, Clock, AlertCircle, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActingUserId } from "@/hooks/useActingUser";
import { formatInrCompact, type Claim } from "@/data/mockClaims";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface BulkSendTarget {
  tpa: string;
  recipientEmail: string;
  ccEmails: string;
  claims: Claim[];
}

type RowStatus = "pending" | "sending" | "sent" | "failed";

interface RowState extends BulkSendTarget {
  status: RowStatus;
  error?: string;
  messageId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: BulkSendTarget[];
  hospitalName?: string;
  customSubject?: string;
  customBody?: string;
  tone?: "formal" | "urgent" | "irdai" | "friendly";
  onComplete?: () => void;
}

export default function BulkSendProgressDialog({
  open,
  onOpenChange,
  targets,
  hospitalName = "Our Hospital",
  customSubject,
  customBody,
  tone = "formal",
  onComplete,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  // Initialize rows whenever targets change
  useEffect(() => {
    if (open) {
      setRows(targets.map((t) => ({ ...t, status: "pending" })));
      cancelRef.current = false;
    }
  }, [open, targets]);

  const sendOne = async (row: RowState): Promise<RowState> => {
    try {
      const ccList = (row.ccEmails || "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        insurerId: 0,
        insurerName: row.tpa,
        recipientEmail: row.recipientEmail,
        ccEmails: ccList,
        hospitalName,
        spocName: "Claims Team",
        spocEmail: "billing@hospital.in",
        paymentTatDays: 30,
        customSubject,
        customBody,
        tone,
        claims: row.claims.map((c) => ({
          claim_number: c.claim_number,
          patient_name: c.patient_name,
          policy_number: c.policy_number,
          date_of_admission: c.date_of_admission,
          date_of_discharge: c.date_of_discharge,
          doc_submission_date: c.doc_submission_date,
          outstanding_amount: c.outstanding_amount,
          days_since_claim: c.days_since_claim,
          claim_status: c.claim_status,
          is_irdai_breach: c.is_irdai_breach,
        })),
      };

      const { data, error } = await supabase.functions.invoke(
        "send-outstanding-reminder",
        { body: { ...payload, actingUserId: getActingUserId() } },
      );

      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data.error || "Send failed");
      return { ...row, status: "sent", messageId: data?.messageId };
    } catch (e) {
      return {
        ...row,
        status: "failed",
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  };

  const runQueue = async (indexes: number[]) => {
    setRunning(true);
    cancelRef.current = false;

    for (const idx of indexes) {
      if (cancelRef.current) break;

      // Mark sending
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: "sending", error: undefined };
        return next;
      });

      // Fire the request — re-read latest row to get any in-flight edits
      const current = await new Promise<RowState>((resolve) => {
        setRows((prev) => {
          resolve(prev[idx]);
          return prev;
        });
      });

      const result = await sendOne({ ...current, status: "sending" });

      setRows((prev) => {
        const next = [...prev];
        next[idx] = result;
        return next;
      });
    }

    setRunning(false);
  };

  const startAll = () => {
    const pending = rows
      .map((r, i) => (r.status === "pending" ? i : -1))
      .filter((i) => i >= 0);
    if (pending.length === 0) {
      toast.error("Nothing to send");
      return;
    }
    void runQueue(pending);
  };

  const retryFailed = () => {
    const failed = rows
      .map((r, i) => (r.status === "failed" ? i : -1))
      .filter((i) => i >= 0);
    if (failed.length === 0) return;
    // Reset failed rows to pending then re-run
    setRows((prev) =>
      prev.map((r) => (r.status === "failed" ? { ...r, status: "pending", error: undefined } : r)),
    );
    void runQueue(failed);
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  const sentCount = rows.filter((r) => r.status === "sent").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const sendingCount = rows.filter((r) => r.status === "sending").length;
  const total = rows.length;
  const done = sentCount + failedCount;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = !running && done === total && total > 0;

  // Trigger onComplete once when finished
  useEffect(() => {
    if (allDone) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  const statusBadge = (s: RowStatus) => {
    switch (s) {
      case "sent":
        return (
          <Badge variant="outline" className="bg-accent/15 text-accent-foreground border-accent/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Sent
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case "sending":
        return (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Sending
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (running ? null : onOpenChange(o))}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="bg-foreground text-background px-6 py-4 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-background">Bulk Send Progress</DialogTitle>
          <button
            onClick={() => !running && onOpenChange(false)}
            className={cn(
              "text-background/70 hover:text-background",
              running && "opacity-30 cursor-not-allowed",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        {/* Progress summary */}
        <div className="px-6 py-4 border-b space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{done} of {total} processed</span>
              <Badge variant="outline" className="bg-accent/15 text-accent-foreground border-accent/30">
                ✓ {sentCount} sent
              </Badge>
              {failedCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  ✗ {failedCount} failed
                </Badge>
              )}
              {(pendingCount + sendingCount) > 0 && (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  {pendingCount + sendingCount} remaining
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Row list */}
        <div className="overflow-y-auto px-6 py-3 flex-1">
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={`${r.tpa}-${i}`}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-sm",
                  r.status === "failed" && "border-destructive/30 bg-destructive/5",
                  r.status === "sent" && "border-accent/30 bg-accent/5",
                  r.status === "sending" && "border-primary/30 bg-primary/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.tpa}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {r.recipientEmail || <em>no email on file</em>} · {r.claims.length} claim
                    {r.claims.length === 1 ? "" : "s"} · {formatInrCompact(
                      r.claims.reduce((s, c) => s + c.outstanding_amount, 0),
                    )}
                  </div>
                  {r.error && (
                    <div className="text-[11px] text-destructive mt-1 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="break-all">{r.error}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0">{statusBadge(r.status)}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer actions */}
        <div className="border-t bg-muted/30 px-6 py-3 flex flex-wrap items-center gap-2 justify-end">
          {!running && pendingCount === total && total > 0 && (
            <Button onClick={startAll} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Start sending {total} email{total === 1 ? "" : "s"}
            </Button>
          )}
          {running && (
            <Button variant="outline" onClick={cancel}>
              Cancel queue
            </Button>
          )}
          {allDone && failedCount > 0 && (
            <Button onClick={retryFailed} variant="outline" className="gap-1.5">
              <RotateCw className="h-4 w-4" /> Retry {failedCount} failed
            </Button>
          )}
          {allDone && (
            <Button
              onClick={() => onOpenChange(false)}
              variant={failedCount === 0 ? "default" : "outline"}
            >
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
