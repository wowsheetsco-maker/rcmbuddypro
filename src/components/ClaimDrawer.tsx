import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, AlertTriangle, Calendar, FileText, Upload, Loader2, Save, RotateCcw,
  UserCog, Hospital, MessageSquare, ClipboardList, MessagesSquare, History,
  Mail, Send, Phone, MessageCircle, Paperclip, Inbox, Bot,
  FileSearch, Image as ImageIcon, ExternalLink, Sparkles, Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Claim } from "@/data/mockClaims";
import { formatInr, formatDays, getStatusColor } from "@/data/mockClaims";
import { supabase } from "@/integrations/supabase/client";
import {
  appendHistory,
  fieldLabel,
  getHistory,
  preview,
  type HistoryEntry,
  type WorkflowField,
} from "@/lib/claimEditHistory";
import CommunicationLauncher from "@/components/CommunicationLauncher";
import ClaimEditDialog from "@/components/ClaimEditDialog";
import { ClaimDocumentsPanel } from "@/components/ClaimDocumentsPanel";
import { useInsurerSpoc } from "@/hooks/useInsurerSpoc";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { useActingUserId } from "@/hooks/useActingUser";
import { useRegisterOverlay } from "@/hooks/useOverlayPresence";

/** Distance (px) the drawer must be dragged down before swipe-to-close fires. */
export const SWIPE_CLOSE_THRESHOLD_PX = 120;
/** Maximum visual stretch applied to the grab handle while dragging. */
const GRAB_STRETCH_MAX = 1.6;

// Mutable workflow fields surfaced to the user (and synced to master)
type EditableFields = {
  tpa_spoc: string;
  hospital_spoc: string;
  last_communication_at: string; // datetime-local string
  last_communication_note: string;
  remarks: string;
  action_plan: string;
};

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Convert to local time, strip seconds for <input type="datetime-local">
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fromClaim(c: Claim): EditableFields {
  return {
    tpa_spoc: c.tpa_spoc ?? "",
    hospital_spoc: c.hospital_spoc ?? "",
    last_communication_at: isoToLocalInput(c.last_communication_at),
    last_communication_note: c.last_communication_note ?? "",
    remarks: c.remarks ?? "",
    action_plan: c.action_plan ?? "",
  };
}

interface Props {
  claim: Claim;
  onClose: () => void;
  /** Notifies the parent so it can patch its in-memory list without a refetch. */
  onUpdated?: (patch: Partial<Claim>) => void;
}

export default function ClaimDrawer({ claim, onClose, onUpdated }: Props) {
  const nrr = claim.approved_amount > 0
    ? (((claim.settled_amount + claim.tds_amount) / claim.approved_amount) * 100).toFixed(1)
    : "0.0";

  // Resolve TPA / Hospital SPOCs from the master InsurerProfile (escalation matrix)
  const spoc = useInsurerSpoc(claim.tpa_name, claim.insurance_company_name);

  const initial = useMemo(() => fromClaim(claim), [claim]);
  const [draft, setDraft] = useState<EditableFields>(initial);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => getHistory(claim.id));
  const [commLogReloadTick, setCommLogReloadTick] = useState(0);
  const [commLog, setCommLog] = useState<CommLogEntry[]>([]);
  const [commFilter, setCommFilter] = useState<CommSource | "all">("all");
  const [ocrDrawer, setOcrDrawer] = useState<{ entryId: string; aiGenerationId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [waComposer, setWaComposer] = useState<{
    recipient: string;
    label: string;
    role: string;
  } | null>(null);
  const [actingUserId] = useActingUserId();
  // Track whether the user has manually edited the SPOC fields, so auto-fill
  // never silently overwrites their changes.
  const [tpaSpocAutoFilled, setTpaSpocAutoFilled] = useState(false);
  const [hospSpocAutoFilled, setHospSpocAutoFilled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("discrepancy_action_log")
      .select(
        "id, action_type, channel, recipient, subject, body_preview, performed_at, tone, notes, attachments, cc_emails, ai_generation_id",
      )
      .eq("claim_id", claim.id)
      .order("performed_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        setCommLog((data ?? []).map(normalizeLogEntry));
      });
    return () => { cancelled = true; };
  }, [claim.id, commLogReloadTick]);

  // Reset the local draft & reload history whenever a new claim is opened.
  // Then auto-fill SPOC fields from the InsurerProfile if the master record
  // is blank. The user can override at any time — saving will persist their value.
  useEffect(() => {
    const fresh = fromClaim(claim);
    let usedTpaAuto = false;
    let usedHospAuto = false;
    if (!fresh.tpa_spoc && spoc.tpaSpoc) {
      fresh.tpa_spoc = spoc.tpaSpoc.display;
      usedTpaAuto = true;
    }
    if (!fresh.hospital_spoc && spoc.hospitalSpoc) {
      fresh.hospital_spoc = spoc.hospitalSpoc.display;
      usedHospAuto = true;
    }
    setDraft(fresh);
    setTpaSpocAutoFilled(usedTpaAuto);
    setHospSpocAutoFilled(usedHospAuto);
    setHistory(getHistory(claim.id));
  }, [claim, spoc.tpaSpoc, spoc.hospitalSpoc]);

  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof EditableFields)[]).some((k) => initial[k] !== draft[k]),
    [initial, draft],
  );

  const handleChange = (k: keyof EditableFields, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k === "tpa_spoc") setTpaSpocAutoFilled(false);
    if (k === "hospital_spoc") setHospSpocAutoFilled(false);
  };

  // Manually re-apply the auto-fill from the InsurerProfile (e.g. user cleared
  // a field and wants it back).
  const applyTpaSpocFromProfile = () => {
    if (!spoc.tpaSpoc) return;
    setDraft((d) => ({ ...d, tpa_spoc: spoc.tpaSpoc!.display }));
    setTpaSpocAutoFilled(true);
  };
  const applyHospSpocFromProfile = () => {
    if (!spoc.hospitalSpoc) return;
    setDraft((d) => ({ ...d, hospital_spoc: spoc.hospitalSpoc!.display }));
    setHospSpocAutoFilled(true);
  };

  const handleReset = () => setDraft(initial);

  // Build the DB patch from a draft + the previous-values snapshot for undo.
  const buildPatch = (d: EditableFields) => ({
    tpa_spoc: d.tpa_spoc || null,
    hospital_spoc: d.hospital_spoc || null,
    last_communication_at: localInputToIso(d.last_communication_at),
    last_communication_note: d.last_communication_note || null,
    remarks: d.remarks || null,
    action_plan: d.action_plan || null,
  });

  const persist = async (patch: ReturnType<typeof buildPatch>) => {
    const { error } = await supabase.from("claims").update(patch).eq("id", claim.id);
    return error;
  };

  const handleSave = async () => {
    setSaving(true);
    const previousDraft = initial;
    const previousPatch = buildPatch(previousDraft);
    const newPatch = buildPatch(draft);

    const error = await persist(newPatch);
    setSaving(false);
    if (error) {
      toast.error("Failed to save", { description: error.message });
      return;
    }

    // Compute changed fields and persist to local edit history.
    const changedKeys = (Object.keys(initial) as (keyof EditableFields)[]).filter(
      (k) => initial[k] !== draft[k],
    );
    const now = new Date().toISOString();
    const entries: HistoryEntry[] = changedKeys.map((k) => ({
      field: k as WorkflowField,
      at: now,
      preview: preview(draft[k]),
    }));
    appendHistory(claim.id, entries);
    setHistory((h) => [...entries, ...h].slice(0, 25));

    onUpdated?.(newPatch);

    toast.success("Saved to master", {
      description:
        changedKeys.length === 1
          ? `Updated ${fieldLabel(changedKeys[0] as WorkflowField)}`
          : `Updated ${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"}`,
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const undoErr = await persist(previousPatch);
          if (undoErr) {
            toast.error("Undo failed", { description: undoErr.message });
            return;
          }
          setDraft(previousDraft);
          onUpdated?.(previousPatch);
          // Log the undo itself so the history stays honest.
          const undoNow = new Date().toISOString();
          const undoEntries: HistoryEntry[] = changedKeys.map((k) => ({
            field: k as WorkflowField,
            at: undoNow,
            preview: `↶ reverted to: ${preview(previousDraft[k])}`,
          }));
          appendHistory(claim.id, undoEntries);
          setHistory((h) => [...undoEntries, ...h].slice(0, 25));
          toast.success("Reverted to previous values");
        },
      },
    });
  };

  const stampNow = () => {
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60000;
    handleChange("last_communication_at", new Date(now.getTime() - tz).toISOString().slice(0, 16));
  };

  // Most-recent edit per workflow field, for the "Last edited" hints in History tab.
  const lastEditByField = useMemo(() => {
    const map = new Map<WorkflowField, HistoryEntry>();
    for (const e of history) if (!map.has(e.field)) map.set(e.field, e);
    return map;
  }, [history]);

  // ---- Mobile UX: Escape, focus management, swipe-down-to-close ----
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);

  // Tell the mobile bottom dock (and any other chrome) to back off while open.
  useRegisterOverlay(true);

  useEffect(() => {
    // Initial focus + focus trap
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while drawer is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;
    // Only start swipe if touch begins near the top grab area
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drawer-grab]")) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (touchStartY.current == null) return;
    if (dragY > SWIPE_CLOSE_THRESHOLD_PX) onClose();
    setDragY(0);
    touchStartY.current = null;
  };

  // Drag feedback: opacity fades from 1 → 0.7 as we approach threshold;
  // grab handle stretches horizontally to telegraph the gesture.
  const dragProgress = Math.min(1, dragY / SWIPE_CLOSE_THRESHOLD_PX);
  const panelOpacity = 1 - dragProgress * 0.3;
  const handleScaleX = 1 + (GRAB_STRETCH_MAX - 1) * dragProgress;
  const handleOpacity = 0.3 + dragProgress * 0.6;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Claim ${claim.claim_number}`}
      tabIndex={-1}
      data-testid="claim-drawer"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
        opacity: panelOpacity,
      }}
      className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 z-40 w-full md:max-w-[520px] bg-card border-l shadow-xl flex flex-col animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
    >
      {/* Mobile grab handle for swipe-to-close */}
      <div data-drawer-grab className="md:hidden flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
        <div
          data-testid="claim-drawer-grab"
          className="h-1.5 w-12 rounded-full bg-muted-foreground/30"
          style={{
            transform: `scaleX(${handleScaleX})`,
            opacity: handleOpacity,
            transition: dragY ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          }}
        />
      </div>
      {/* Header */}
      <div data-drawer-grab className="flex items-start justify-between p-5 pt-3 md:pt-5 border-b">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-display">{claim.claim_number}</h2>
            <Badge className={`text-[10px] capitalize ${getStatusColor(claim.claim_status)}`}>{claim.claim_status}</Badge>
            {claim.is_irdai_breach && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" /> SLA Breach
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {claim.patient_name} · {claim.tpa_name}
          </p>
          {claim.insurance_company_name && (
            <p className="text-xs text-muted-foreground truncate">{claim.insurance_company_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <CommunicationLauncher
            claim={claim}
            tpaSpocName={spoc.tpaSpoc?.name ?? draft.tpa_spoc ?? null}
            onLogged={() => setCommLogReloadTick((t) => t + 1)}
          />
          <Button ref={closeBtnRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close" data-testid="claim-drawer-close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="details" className="h-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-5 h-10 overflow-x-auto">
            <TabsTrigger value="details" className="text-xs data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Details</TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Workflow</TabsTrigger>
            <TabsTrigger value="comms" className="text-xs gap-1 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              Comms
              {commLog.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{commLog.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              History
              {history.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{history.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Timeline</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="p-5 space-y-5 mt-0">
            {/* Outstanding highlight */}
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Outstanding Amount</div>
              <div className="text-3xl font-bold text-primary">{formatInr(claim.outstanding_amount)}</div>
              <div className="text-xs text-muted-foreground mt-1"><span className="tabular-nums">{formatDays(claim.days_since_claim, { long: true })}</span> old · NRR: <span className="tabular-nums">{nrr}%</span></div>
            </div>

            {/* Quick workflow snapshot (read-only chips that link to Workflow tab) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SnapshotPill icon={UserCog} label="TPA SPOC" value={claim.tpa_spoc || spoc.tpaSpoc?.display || null} />
              <SnapshotPill icon={Hospital} label="Hospital SPOC" value={claim.hospital_spoc || spoc.hospitalSpoc?.display || null} />
              <SnapshotPill
                icon={MessageSquare}
                label="Last Comm."
                value={claim.last_communication_at ? new Date(claim.last_communication_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null}
              />
              <SnapshotPill icon={ClipboardList} label="Action Plan" value={claim.action_plan} truncate />
            </div>

            {/* Financial Breakdown */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial Breakdown</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Claimed", claim.claimed_amount],
                  ["Approved", claim.approved_amount],
                  ["Settled", claim.settled_amount],
                  ["TDS", claim.tds_amount],
                  ["Copay", claim.copay],
                  ["Shortfall", claim.shortfall_amount],
                  ["Hospital Discount", claim.hospital_discount],
                  ["Patient Paid", claim.patient_paid_amount],
                  ["Outstanding", claim.outstanding_amount],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between rounded bg-muted/50 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{label as string}</span>
                    <span className="text-xs font-semibold tabular-nums">{formatInr(value as number)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Clinical Details */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Clinical Details</h3>
              <div className="space-y-2 text-sm">
                {claim.diagnosis && <div className="flex justify-between"><span className="text-muted-foreground">Diagnosis</span><span className="font-medium text-right max-w-[260px]">{claim.diagnosis}</span></div>}
                {claim.treatment && <div className="flex justify-between"><span className="text-muted-foreground">Treatment</span><span className="font-medium text-right max-w-[260px]">{claim.treatment}</span></div>}
                {claim.policy_type && <div className="flex justify-between"><span className="text-muted-foreground">Policy Type</span><span className="font-medium">{claim.policy_type}</span></div>}
                {claim.policy_holder_name && <div className="flex justify-between"><span className="text-muted-foreground">Policy Holder</span><span className="font-medium">{claim.policy_holder_name}</span></div>}
                {claim.policy_number && <div className="flex justify-between"><span className="text-muted-foreground">Policy Number</span><span className="font-mono text-xs">{claim.policy_number}</span></div>}
                {claim.member_customer_id && <div className="flex justify-between"><span className="text-muted-foreground">Member ID</span><span className="font-mono text-xs">{claim.member_customer_id}</span></div>}
                {claim.employee_code && <div className="flex justify-between"><span className="text-muted-foreground">Employee Code</span><span className="font-mono text-xs">{claim.employee_code}</span></div>}
              </div>
            </div>

            <Separator />

            {/* Patient & Hospital */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Patient & Hospital</h3>
              <div className="space-y-2 text-sm">
                {claim.hospital_name && <div className="flex justify-between"><span className="text-muted-foreground">Hospital</span><span className="font-medium text-right max-w-[260px]">{claim.hospital_name}</span></div>}
                {claim.patient_contact && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Patient Contact</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">{claim.patient_contact}</span>
                      <a
                        href={`tel:${claim.patient_contact}`}
                        className="inline-flex items-center justify-center h-6 w-6 rounded border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                        aria-label="Call patient"
                        title="Call"
                      >
                        <Phone className="h-3 w-3" />
                      </a>
                      {normalizeWhatsAppNumber(claim.patient_contact) && (
                        <button
                          type="button"
                          onClick={() => setWaComposer({
                            recipient: claim.patient_contact!,
                            label: `Patient · ${claim.patient_name}`,
                            role: "ops",
                          })}
                          className="inline-flex items-center justify-center h-6 w-6 rounded border border-whatsapp/40 bg-whatsapp/10 text-whatsapp hover:bg-whatsapp/20"
                          aria-label="Open WhatsApp composer"
                          title="WhatsApp – pick template"
                        >
                          <MessageCircle className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {claim.in_patient_number && <div className="flex justify-between"><span className="text-muted-foreground">IP Number</span><span className="font-mono">{claim.in_patient_number}</span></div>}
              </div>
            </div>

            <Separator />

            {/* Dates */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Timeline</h3>
              <div className="space-y-2 text-sm">
                {[
                  ["Admission", claim.date_of_admission],
                  ["Discharge", claim.date_of_discharge],
                  ["Claim Created", claim.claim_creation_date],
                  ["Doc Submitted", claim.doc_submission_date],
                  ["Payment Update", claim.payment_update_date],
                  ["Cheque/UTR Date", claim.cheque_neft_utr_date],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3 w-3" />{label as string}</span>
                    <span className="font-medium tabular-nums">{value as string}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Age</span>
                  <span className={`font-medium tabular-nums ${claim.is_irdai_breach ? 'text-denial' : ''}`}>{formatDays(claim.days_since_claim, { long: true })}</span>
                </div>
              </div>
            </div>

            {/* Insurer Comments */}
            {claim.insurer_comments && (
              <>
                <Separator />
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Insurer Comments</h3>
                  <div className="rounded-lg border bg-muted/50 p-3 text-sm">{claim.insurer_comments}</div>
                </div>
              </>
            )}

            {/* IHX / Reference Info */}
            <Separator />
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reference</h3>
              <div className="space-y-1.5 text-sm">
                {claim.ihx_ref_id && <div className="flex justify-between"><span className="text-muted-foreground">IHX Ref</span><span className="font-mono text-xs">{claim.ihx_ref_id}</span></div>}
                {claim.initial_claim_number && <div className="flex justify-between"><span className="text-muted-foreground">Initial Claim #</span><span className="font-mono text-xs">{claim.initial_claim_number}</span></div>}
                {claim.cheque_neft_utr_no && <div className="flex justify-between"><span className="text-muted-foreground">UTR No</span><span className="font-mono text-xs">{claim.cheque_neft_utr_no}</span></div>}
                {claim.receipt_no && <div className="flex justify-between"><span className="text-muted-foreground">Receipt</span><span className="font-mono text-xs">{claim.receipt_no}</span></div>}
              </div>
            </div>
          </TabsContent>

          {/* Editable workflow fields → sync to master claims table */}
          <TabsContent value="workflow" className="p-5 mt-0 space-y-4">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs flex gap-2 items-start">
              <MessagesSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                Edits here update the master claims record immediately. They show up in
                Priority Worklist, Reminders, and Reports.
              </div>
            </div>

            {/* Auto-fill source banner */}
            {spoc.profile && (spoc.tpaSpoc || spoc.hospitalSpoc) && (
              <div className="rounded-md border border-accent/30 bg-accent/5 p-2.5 text-[11px] flex gap-2 items-start">
                <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">Auto-filled from TPA profile</span>
                  <span className="text-muted-foreground"> · {spoc.profile.name}</span>
                  <p className="text-muted-foreground/80 mt-0.5">
                    SPOC details below are pulled from the master escalation matrix and Hospital SPOC. Edit freely — your changes are saved to this claim.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5 text-muted-foreground" /> TPA SPOC
                    {tpaSpocAutoFilled && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-accent/40 text-accent">
                        <Sparkles className="h-2.5 w-2.5" /> auto
                      </Badge>
                    )}
                  </Label>
                  <div className="flex items-center gap-2">
                    {spoc.tpaSpoc?.phone && normalizeWhatsAppNumber(spoc.tpaSpoc.phone) && (
                      <button
                        type="button"
                        onClick={() => setWaComposer({
                          recipient: spoc.tpaSpoc!.phone,
                          label: `TPA SPOC · ${spoc.tpaSpoc!.name}`,
                          role: "billing",
                        })}
                        className="inline-flex items-center gap-1 text-[10px] text-whatsapp hover:underline"
                        title="WhatsApp TPA SPOC"
                      >
                        <MessageCircle className="h-3 w-3" /> WA
                      </button>
                    )}
                    {spoc.tpaSpoc && draft.tpa_spoc !== spoc.tpaSpoc.display && (
                      <button
                        type="button"
                        onClick={applyTpaSpocFromProfile}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Use {spoc.tpaSpoc.name.split(" ").slice(-1)[0]}
                      </button>
                    )}
                  </div>
                </div>
                <Input
                  value={draft.tpa_spoc}
                  placeholder={spoc.tpaSpoc?.display || "Name / phone / email"}
                  onChange={(e) => handleChange("tpa_spoc", e.target.value)}
                  className="h-9 text-sm"
                />
                {spoc.tpaSpoc?.designation && tpaSpocAutoFilled && (
                  <p className="text-[10px] text-muted-foreground">{spoc.tpaSpoc.designation}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Hospital className="h-3.5 w-3.5 text-muted-foreground" /> Hospital SPOC
                    {hospSpocAutoFilled && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-accent/40 text-accent">
                        <Sparkles className="h-2.5 w-2.5" /> auto
                      </Badge>
                    )}
                  </Label>
                  {spoc.hospitalSpoc && draft.hospital_spoc !== spoc.hospitalSpoc.display && (
                    <button
                      type="button"
                      onClick={applyHospSpocFromProfile}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Use {spoc.hospitalSpoc.name.split(" ").slice(-1)[0]}
                    </button>
                  )}
                </div>
                <Input
                  value={draft.hospital_spoc}
                  placeholder={spoc.hospitalSpoc?.display || "Name / phone / email"}
                  onChange={(e) => handleChange("hospital_spoc", e.target.value)}
                  className="h-9 text-sm"
                />
                {spoc.hospitalSpoc?.designation && hospSpocAutoFilled && (
                  <p className="text-[10px] text-muted-foreground">{spoc.hospitalSpoc.designation}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Last Communication
                </Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={stampNow}>
                  Set to now
                </Button>
              </div>
              <Input
                type="datetime-local"
                value={draft.last_communication_at}
                onChange={(e) => handleChange("last_communication_at", e.target.value)}
                className="h-9 text-sm"
              />
              <Textarea
                value={draft.last_communication_note}
                onChange={(e) => handleChange("last_communication_note", e.target.value)}
                placeholder="What was discussed? (channel, ref no, who you spoke with…)"
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Remarks
              </Label>
              <Textarea
                value={draft.remarks}
                onChange={(e) => handleChange("remarks", e.target.value)}
                placeholder="Internal notes about this claim"
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" /> Action Plan
              </Label>
              <Textarea
                value={draft.action_plan}
                onChange={(e) => handleChange("action_plan", e.target.value)}
                placeholder="Next steps, owner, target date…"
                rows={4}
                className="text-sm resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!dirty || saving}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save to master
              </Button>
            </div>
          </TabsContent>

          {/* Communication Log: AI drafts, emails, follow-ups against this claim */}
          <TabsContent value="comms" className="p-5 mt-0 space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-xs flex gap-2 items-start">
              <MessagesSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-muted-foreground">
                Every email, WhatsApp and AI draft sent against this claim.
                Newest first. Use the <span className="font-medium text-foreground">Communication</span> button above to send a new follow-up — automatic, manual, AI or WhatsApp.
              </div>
            </div>

            {/* Channel filter chips */}
            {commLog.length > 0 && (() => {
              const counts = {
                all: commLog.length,
                auto_email: 0, manual_email: 0, ai_draft: 0, whatsapp: 0,
              } as Record<CommSource | "all", number>;
              commLog.forEach((c) => { counts[classifyCommEntry(c)]++; });
              const chips: { id: CommSource | "all"; label: string }[] = [
                { id: "all", label: "All" },
                { id: "auto_email", label: "Automatic Email" },
                { id: "manual_email", label: "Manual Email" },
                { id: "ai_draft", label: "AI Draft" },
                { id: "whatsapp", label: "WhatsApp" },
              ];
              return (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCommFilter(c.id)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        commFilter === c.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.label} <span className="opacity-60">({counts[c.id]})</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {(() => {
              const visible = commFilter === "all"
                ? commLog
                : commLog.filter((c) => classifyCommEntry(c) === commFilter);
              if (visible.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-10 text-center border rounded-md">
                    <Inbox className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {commFilter === "all" ? "No communication yet" : "No entries for this filter"}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Drafts, emails and reminders will appear here automatically.
                    </p>
                  </div>
                );
              }
              return (
                <ol className="space-y-2.5">
                  {visible.map((c) => {
                  const meta = describeAction(c.action_type);
                  const ChannelIcon = channelIcon(c.channel);
                  const ActionIcon = meta.icon;
                  const attachments = c.attachments;
                  const ccList = c.cc_emails;
                  return (
                    <li
                      key={c.id}
                      className="rounded-md border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`p-1.5 rounded-md shrink-0 ${meta.accent}`}>
                            <ActionIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold">{meta.label}</span>
                              {c.tone && (
                                <Badge variant="outline" className="text-[9px] py-0 h-4 capitalize">
                                  {c.tone.replace(/_/g, " ")}
                                </Badge>
                              )}
                              {c.channel && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <ChannelIcon className="h-3 w-3" />
                                  {c.channel}
                                </span>
                              )}
                            </div>
                            {c.recipient && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                → {c.recipient}
                              </p>
                            )}
                          </div>
                        </div>
                        <time className="text-[10px] text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
                          {new Date(c.performed_at).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </time>
                      </div>

                      {c.subject && (
                        <p className="text-xs font-medium leading-snug pl-7">
                          {c.subject}
                        </p>
                      )}

                      {c.body_preview && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed pl-7 line-clamp-3 whitespace-pre-wrap break-words">
                          {c.body_preview}
                        </p>
                      )}

                      {/* CC recipients (structured) */}
                      {ccList.length > 0 && (
                        <div className="flex items-center gap-1.5 pl-7 text-[10px] text-muted-foreground flex-wrap">
                          <span className="font-medium">CC:</span>
                          {ccList.map((e) => (
                            <span key={e} className="px-1.5 py-0.5 rounded bg-muted border truncate max-w-[180px]">
                              {e}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Attachment thumbnails */}
                      {attachments.length > 0 && (
                        <div className="pl-7 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Paperclip className="h-3 w-3" />
                            {attachments.length} file{attachments.length === 1 ? "" : "s"}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {attachments.map((a) => (
                              <AttachmentThumb key={a.path} attachment={a} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* OCR text drawer link */}
                      {c.ai_generation_id && attachments.length > 0 && (
                        <div className="pl-7">
                          <button
                            type="button"
                            onClick={() => setOcrDrawer({ entryId: c.id, aiGenerationId: c.ai_generation_id! })}
                            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <FileSearch className="h-3 w-3" /> View OCR text
                          </button>
                        </div>
                      )}
                    </li>
                  );
                  })}
                </ol>
              );
            })()}
          </TabsContent>

          <TabsContent value="history" className="p-5 mt-0 space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-xs flex gap-2 items-start">
              <History className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-muted-foreground">
                Tracks when workflow fields on this claim were last edited from this device.
                Newest changes appear first.
              </div>
            </div>

            {/* Per-field summary so you can see at a glance what's stale */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Last edited per field</h3>
              <div className="grid grid-cols-1 gap-1.5">
                {(["tpa_spoc","hospital_spoc","last_communication_at","last_communication_note","remarks","action_plan"] as WorkflowField[]).map((f) => {
                  const last = lastEditByField.get(f);
                  return (
                    <div key={f} className="flex items-center justify-between rounded border bg-background px-2.5 py-1.5">
                      <span className="text-xs font-medium">{fieldLabel(f)}</span>
                      <span className={`text-[11px] tabular-nums ${last ? "text-muted-foreground" : "text-muted-foreground/60 italic"}`}>
                        {last ? new Date(last.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full timeline */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Activity timeline</h3>
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-4 text-center border rounded-md">
                  No edits recorded yet. Changes saved from the Workflow tab will appear here.
                </div>
              ) : (
                <ol className="relative border-l border-border ml-2 space-y-3">
                  {history.map((e, i) => (
                    <li key={`${e.at}-${e.field}-${i}`} className="ml-4">
                      <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium">{fieldLabel(e.field)}</span>
                        <time className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </time>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{e.preview}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-0">
            <ClaimTimeline claim={claim} />
          </TabsContent>

          <TabsContent value="documents" className="p-5 mt-0">
            <ClaimDocumentsPanel claimId={claim.id} />
          </TabsContent>
        </Tabs>
      </div>

      {ocrDrawer && (
        <OcrTextDrawer
          aiGenerationId={ocrDrawer.aiGenerationId}
          onClose={() => setOcrDrawer(null)}
        />
      )}

      <ClaimEditDialog
        claim={claim}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(patch) => onUpdated?.(patch)}
      />

      <WhatsAppComposerDialog
        open={!!waComposer}
        onOpenChange={(o) => {
          if (!o) {
            setWaComposer(null);
            // Bump tick so Communication Log re-fetches and shows the new WA entry
            setCommLogReloadTick((t) => t + 1);
          }
        }}
        claimId={claim.id}
        recipient={waComposer?.recipient}
        recipientLabel={waComposer?.label}
        defaultRole={waComposer?.role ?? "any"}
        performedBy={actingUserId}
        context={{
          patient_name: claim.patient_name,
          claim_number: claim.claim_number,
          hospital_name: claim.hospital_name,
          outstanding_amount: claim.outstanding_amount,
          days_since_claim: claim.days_since_claim,
          tpa_name: claim.tpa_name,
          tpa_spoc_name: spoc.tpaSpoc?.name ?? draft.tpa_spoc ?? null,
          insurance_company_name: claim.insurance_company_name,
          last_communication_note: claim.last_communication_note,
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Communication-log helpers — structured payload, thumbnails, OCR.
 * ──────────────────────────────────────────────────────────────── */

interface AttachmentRecord { name: string; path: string; size?: number }

interface CommLogEntry {
  id: string;
  action_type: string;
  channel: string | null;
  recipient: string | null;
  subject: string | null;
  body_preview: string | null;
  performed_at: string;
  tone: string | null;
  notes: string | null;
  attachments: AttachmentRecord[];
  cc_emails: string[];
  ai_generation_id: string | null;
}

/** Normalise the row from Supabase, falling back to legacy notes-text parsing. */
function normalizeLogEntry(raw: Record<string, unknown>): CommLogEntry {
  const attachmentsField = raw.attachments;
  let attachments: AttachmentRecord[] = [];
  if (Array.isArray(attachmentsField)) {
    attachments = attachmentsField
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        name: String(x.name ?? x.path ?? "attachment"),
        path: String(x.path ?? ""),
        size: typeof x.size === "number" ? x.size : undefined,
      }))
      .filter((x) => x.path);
  }

  const ccField = raw.cc_emails;
  let ccEmails: string[] = [];
  if (Array.isArray(ccField)) {
    ccEmails = ccField.map((x) => String(x)).filter(Boolean);
  }

  // Legacy fallback — older rows stored counts/CC inside `notes`.
  if (attachments.length === 0 && typeof raw.notes === "string") {
    // We can't recover paths, but we can synthesise placeholder names so the count still shows.
    const m = raw.notes.match(/(\d+)\s+attachment/i);
    if (m) {
      const n = Math.min(Number(m[1]), 8);
      attachments = Array.from({ length: n }).map((_, i) => ({
        name: `Attachment ${i + 1}`,
        path: "",
      }));
    }
  }
  if (ccEmails.length === 0 && typeof raw.notes === "string") {
    const m = raw.notes.match(/CC:\s*([^·]+)/i);
    if (m) ccEmails = m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  return {
    id: String(raw.id),
    action_type: String(raw.action_type ?? ""),
    channel: (raw.channel as string | null) ?? null,
    recipient: (raw.recipient as string | null) ?? null,
    subject: (raw.subject as string | null) ?? null,
    body_preview: (raw.body_preview as string | null) ?? null,
    performed_at: String(raw.performed_at ?? new Date().toISOString()),
    tone: (raw.tone as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    attachments,
    cc_emails: ccEmails,
    ai_generation_id: (raw.ai_generation_id as string | null) ?? null,
  };
}

/** Map an action_type from discrepancy_action_log → icon, label & accent. */
function describeAction(actionType: string): { label: string; icon: React.ElementType; accent: string } {
  switch (actionType) {
    case "ai_email_sent":
      return { label: "AI Email Sent", icon: Send, accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" };
    case "ai_draft_generated":
      return { label: "AI Draft Generated", icon: Bot, accent: "text-violet-600 bg-violet-50 dark:bg-violet-950/30" };
    case "email_sent":
      return { label: "Email Sent", icon: Mail, accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" };
    case "bulk_email_sent":
      return { label: "Bulk Follow-up", icon: Mail, accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" };
    case "reminder_scheduled":
      return { label: "Reminder Scheduled", icon: Calendar, accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" };
    case "reminder_sent":
      return { label: "Reminder Sent", icon: Send, accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" };
    case "whatsapp_sent":
      return { label: "WhatsApp Sent", icon: MessageCircle, accent: "text-green-600 bg-green-50 dark:bg-green-950/30" };
    case "call_logged":
      return { label: "Call Logged", icon: Phone, accent: "text-slate-600 bg-slate-100 dark:bg-slate-800/50" };
    case "note_added":
      return { label: "Note Added", icon: FileText, accent: "text-slate-600 bg-slate-100 dark:bg-slate-800/50" };
    default:
      return { label: actionType.replace(/_/g, " "), icon: MessagesSquare, accent: "text-slate-600 bg-slate-100 dark:bg-slate-800/50" };
  }
}

/** Group log entries into one of four user-facing channels for the filter chips. */
export type CommSource = "auto_email" | "manual_email" | "ai_draft" | "whatsapp";

function classifyCommEntry(e: CommLogEntry): CommSource {
  switch (e.action_type) {
    case "whatsapp_sent":
      return "whatsapp";
    case "ai_email_sent":
    case "ai_draft_generated":
      return "ai_draft";
    case "reminder_sent":
    case "reminder_scheduled":
    case "bulk_email_sent":
      return "auto_email";
    default:
      return (e.channel ?? "").toLowerCase() === "whatsapp" ? "whatsapp" : "manual_email";
  }
}

function channelIcon(channel: string | null): React.ElementType {
  switch ((channel ?? "").toLowerCase()) {
    case "email": return Mail;
    case "whatsapp": return MessageCircle;
    case "phone":
    case "call": return Phone;
    default: return MessageSquare;
  }
}

function SnapshotPill({
  icon: Icon,
  label,
  value,
  truncate,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  truncate?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className={`text-xs font-medium ${value ? "" : "text-muted-foreground italic"} ${truncate ? "truncate" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

/**
 * AttachmentThumb — image previews use a signed URL from the ai-attachments
 * bucket; PDFs and unknown types render an icon-only chip. Clicking opens
 * the file in a new tab via a freshly-issued signed URL.
 */
function AttachmentThumb({ attachment }: { attachment: AttachmentRecord }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isImage = /\.(png|jpe?g|webp|gif|bmp)$/i.test(attachment.name);
  const isPdf = /\.pdf$/i.test(attachment.name);

  useEffect(() => {
    if (!isImage || !attachment.path) return;
    let cancelled = false;
    void supabase.storage
      .from("ai-attachments")
      .createSignedUrl(attachment.path, 3600)
      .then(({ data }) => { if (!cancelled) setImgUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [attachment.path, isImage]);

  const openFile = async () => {
    if (!attachment.path) return;
    const { data } = await supabase.storage
      .from("ai-attachments")
      .createSignedUrl(attachment.path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  // Legacy entries with no storage path → render a static chip
  if (!attachment.path) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/40 text-[10px] text-muted-foreground">
        <FileText className="h-3 w-3" /> {attachment.name}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openFile}
      title={attachment.name}
      className="group relative flex items-center gap-1.5 rounded border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
    >
      {isImage && imgUrl ? (
        <img
          src={imgUrl}
          alt={attachment.name}
          className="h-12 w-12 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-12 w-12 flex items-center justify-center bg-muted">
          {isPdf ? (
            <FileText className="h-5 w-5 text-rose-600" />
          ) : isImage ? (
            <ImageIcon className="h-5 w-5 text-blue-600" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="px-1.5 pr-2 max-w-[120px]">
        <div className="text-[10px] font-medium truncate">{attachment.name}</div>
        {typeof attachment.size === "number" && (
          <div className="text-[9px] text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</div>
        )}
      </div>
      <ExternalLink className="h-3 w-3 text-muted-foreground absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/**
 * OcrTextDrawer — fetches `ocr_text` from public.ai_generations for the
 * given run and displays it in a slide-over so the user can verify what
 * the model actually saw from the uploaded denial / query letter.
 */
function OcrTextDrawer({
  aiGenerationId,
  onClose,
}: { aiGenerationId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ tool: string; provider: string; model: string; created_at: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("ai_generations")
      .select("ocr_text, tool, provider, model, created_at")
      .eq("id", aiGenerationId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setText((data?.ocr_text as string | null) ?? "");
        if (data) setMeta({
          tool: String(data.tool),
          provider: String(data.provider),
          model: String(data.model),
          created_at: String(data.created_at),
        });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [aiGenerationId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row">
      <div className="hidden md:block flex-1 bg-foreground/40" onClick={onClose} />
      <div className="w-full md:max-w-[480px] flex-1 md:flex-none bg-card border-l shadow-xl flex flex-col animate-in slide-in-from-bottom md:slide-in-from-right duration-200">
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">OCR / Extracted Text</h3>
            </div>
            {meta && (
              <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                {meta.tool.replace(/_/g, " ")} · {meta.provider} · {meta.model}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading OCR…
            </div>
          ) : !text ? (
            <div className="text-center py-10">
              <FileSearch className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No OCR text available.</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                The attachment may have been uploaded before OCR was enabled,
                or the document had no extractable text.
              </p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono bg-muted/40 border rounded p-3">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
