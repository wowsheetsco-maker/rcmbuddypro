// Bulk Follow-up Email Composer dialog. Lets the user:
// - pick from 4 tones (Formal / Urgent / SLA / Friendly)
// - edit recipient/CC/subject/body inline
// - regenerate or AI-enhance the body via Lovable AI
// - download the same Excel (claims) that will be attached
// - send via backend (Resend) or open in their default mail client
// - send WhatsApp via wa.me (text only — Excel link separate)

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Send,
  RotateCw,
  Sparkles,
  Download,
  MessageCircle,
  Paperclip,
  X,
  Loader2,
  ExternalLink,
  GitCompare,
  FileText,
  Eye,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  Save,
  Share2,
  Copy,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActingUserId } from "@/hooks/useActingUser";
import { formatInr, formatInrCompact, type Claim } from "@/data/mockClaims";
import { cn } from "@/lib/utils";
import { useFollowupAutomation, renderFollowupTemplate } from "@/hooks/useFollowupAutomation";
import { useNavigate } from "@tanstack/react-router";
import SavedDraftsDialog, { loadSavedDrafts, type SavedDraft } from "./SavedDraftsDialog";
import { Inbox, Settings as SettingsIcon } from "lucide-react";

export type FollowUpTone = "formal" | "urgent" | "irdai" | "friendly";

const TONES: { id: FollowUpTone; label: string; color: string }[] = [
  { id: "formal", label: "Formal Reminder", color: "bg-primary" },
  { id: "urgent", label: "Urgent Escalation", color: "bg-destructive" },
  { id: "irdai", label: "SLA Breach Notice", color: "bg-warning" },
  { id: "friendly", label: "Friendly Follow-up", color: "bg-accent" },
];

export interface TpaGroupInfo {
  tpa: string;
  recipientEmail: string;
  ccEmails: string;
  whatsapp: string | null;
  claims: Claim[];
}

export interface ComposerTarget {
  insurerName: string;
  recipientEmail: string;
  ccEmails: string;
  whatsapp?: string | null;
  claims: Claim[];
  /** When sending to multiple TPAs in one composer, list each so the user can override per-TPA recipients. */
  tpaGroups?: TpaGroupInfo[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ComposerTarget | null;
  hospitalName?: string;
  onSent?: () => void;
  /** Initial tone preset when opening (defaults to "formal"). */
  defaultTone?: FollowUpTone;
}

function templateBody(
  tone: FollowUpTone,
  ctx: ComposerTarget,
  hospital: string,
): string {
  const total = ctx.claims.reduce((s, c) => s + c.outstanding_amount, 0);
  const oldest = ctx.claims.reduce(
    (m, c) => Math.max(m, c.days_since_claim),
    0,
  );
  const breaches = ctx.claims.filter((c) => c.is_irdai_breach).length;

  const summary = ctx.claims
    .slice(0, 8)
    .map(
      (c, i) =>
        `${i + 1}. Claim: ${c.claim_number} | Patient: ${c.patient_name} | Amount: ${formatInr(c.outstanding_amount)} | Status: ${c.claim_status} | Days: ${c.days_since_claim || "—"}`,
    )
    .join("\n");
  const more =
    ctx.claims.length > 8 ? `\n…and ${ctx.claims.length - 8} more (see Excel attachment)` : "";

  switch (tone) {
    case "urgent":
      return `Dear Sir/Madam,

This is an URGENT escalation regarding ${ctx.claims.length} long-pending claim(s) with ${ctx.insurerName} totalling ${formatInr(total)}. The oldest claim is now ${oldest} days old, well beyond the agreed payment TAT.

Pending Claims Summary:
${summary}${more}

We have made multiple follow-ups on these claims without resolution. Please treat this as a final reminder before we are forced to escalate the matter to senior management and, where applicable, to the SLA grievance cell.

Kindly process payment / share UTR details within 48 hours. The complete claim-wise list is attached as Excel.

Regards,
Billing & Claims Team
${hospital}`;

    case "irdai":
      return `Dear Sir/Madam,

This is a formal notice regarding ${breaches} claim(s) from ${ctx.insurerName} that have BREACHED the SLA 30-day claim settlement guideline (per SLA Health Insurance Regulations, 2016). Total outstanding on breached claims: ${formatInr(total)}.

Pending Claims Summary:
${summary}${more}

As per Regulation 27 of the SLA (Health Insurance) Regulations 2016, claims must be settled within 30 days of receipt of last necessary document. Continued delay constitutes a regulatory breach and may invite penal interest.

Please remit payment within 7 working days, failing which we will be constrained to file a formal complaint with the SLA grievance redressal cell.

Regards,
Billing & Claims Team
${hospital}`;

    case "friendly":
      return `Hi Team,

Hope you're doing well! Just a quick nudge on ${ctx.claims.length} claim(s) pending with ${ctx.insurerName} — adding up to ${formatInr(total)}. The oldest one is around ${oldest} days now.

Pending Claims Summary:
${summary}${more}

Could you please take a quick look and let us know the status whenever you get a moment? An Excel attachment with all the details is included for easy reference.

Thanks so much for your continued support!

Warm regards,
Billing & Claims Team
${hospital}`;

    case "formal":
    default:
      return `Dear Sir/Madam,

Greetings from the Revenue Cycle Management department of ${hospital}.

This is a formal follow-up regarding ${ctx.claims.length} outstanding claim(s) pending with your office. The total outstanding amount stands at ${formatInr(total)}.

Pending Claims Summary:
${summary}${more}

We kindly request your urgent attention to process the above-mentioned claims at the earliest. Please find the complete claim-wise breakdown attached as an Excel file.

Should you require any further information or supporting documents, please do not hesitate to reach out.

Regards,
Billing & Claims Team
${hospital}`;
  }
}

function buildSubject(tone: FollowUpTone, insurerName: string): string {
  const prefix: Record<FollowUpTone, string> = {
    formal: "Follow-up: Outstanding Claims",
    urgent: "URGENT: Outstanding Claims Escalation",
    irdai: "SLA Breach Notice: Outstanding Claims",
    friendly: "Quick reminder: Pending Claims",
  };
  return `${prefix[tone]} — ${insurerName}`;
}

function buildExcelDownload(insurerName: string, claims: Claim[]): void {
  const rows = claims.map((c, i) => ({
    "S.No": i + 1,
    "Claim Number": c.claim_number,
    "Patient Name": c.patient_name,
    "Policy Number": c.policy_number ?? "—",
    "Admission": c.date_of_admission ?? "—",
    "Discharge": c.date_of_discharge ?? "—",
    "Doc Submitted": c.doc_submission_date ?? "—",
    "Outstanding (INR)": c.outstanding_amount,
    "Age (Days)": c.days_since_claim,
    "Status": c.claim_status,
    "SLA Breach": c.is_irdai_breach ? "YES" : "No",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 18 }, { wch: 26 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    { wch: 10 }, { wch: 18 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending Claims");
  const today = new Date().toISOString().slice(0, 10);
  const safeName = insurerName.replace(/[^a-z0-9]+/gi, "-");
  XLSX.writeFile(wb, `Pending-Claims-${safeName}-${today}.xlsx`);
}

export default function BulkFollowUpComposer({
  open,
  onOpenChange,
  target,
  hospitalName = "Our Hospital",
  onSent,
  defaultTone = "formal",
}: Props) {
  const { config: automation } = useFollowupAutomation();
  const [tone, setTone] = useState<FollowUpTone>(defaultTone);
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyTouched, setBodyTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [bodyFormat, setBodyFormat] = useState<"html" | "text">("html");

  // Per-TPA overrides (only used when target.tpaGroups is set, i.e. bulk multi-TPA)
  type Override = { email: string; cc: string; whatsapp: string };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const updateOverride = (tpa: string, patch: Partial<Override>) =>
    setOverrides((prev) => ({
      ...prev,
      [tpa]: { ...(prev[tpa] ?? { email: "", cc: "", whatsapp: "" }), ...patch },
    }));

  // Send-failure status: surfaces SMTP / auth issues directly in the composer
  // so the user knows exactly why the backend send fell back.
  type SendFailure = {
    kind: "smtp" | "auth" | "network" | "unknown";
    message: string;
    at: number;
    draftKey: string | null;
  };
  const [sendFailure, setSendFailure] = useState<SendFailure | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftsCount, setDraftsCount] = useState<number>(() => loadSavedDrafts().length);
  const navigate = useNavigate();

  const hydrateFromDraft = (d: SavedDraft) => {
    setRecipient(d.recipient || "");
    setCc(d.cc || "");
    setSubject(d.subject || "");
    setBody(d.body || "");
    setBodyFormat(d.bodyFormat || "html");
    setTone((d.tone as FollowUpTone) || "formal");
    setBodyTouched(true);
    setSendFailure(null);
    toast.success("Draft loaded into composer");
  };

  // 3-way version tracking — original template, regenerated draft, AI version
  const [originalDraft, setOriginalDraft] = useState("");
  const [regeneratedDraft, setRegeneratedDraft] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  type ActiveVersion = "original" | "regenerated" | "ai";
  const [activeVersion, setActiveVersion] = useState<ActiveVersion>("original");
  const [compareOpen, setCompareOpen] = useState(false);
  // Default-open so the user sees the rendered preview & variables immediately
  // when the composer is launched from a row action.
  const [previewOpen, setPreviewOpen] = useState(true);
  const [confirmSendOpen, setConfirmSendOpen] = useState<null | "email" | "whatsapp">(null);

  // Build subject/body — prefer org-level templates from Followup Automation settings;
  // fall back to the built-in defaults so the composer still works on first load.
  const buildSubjectWith = (t: FollowUpTone, ctx: ComposerTarget): string => {
    const tpl = automation.templates[t];
    if (tpl?.subject) {
      return renderFollowupTemplate(tpl.subject, {
        insurer: ctx.insurerName,
        hospital: hospitalName,
      });
    }
    return buildSubject(t, ctx.insurerName);
  };

  const buildBodyWith = (t: FollowUpTone, ctx: ComposerTarget): string => {
    const tpl = automation.templates[t];
    if (!tpl?.body) return templateBody(t, ctx, hospitalName);
    const total = ctx.claims.reduce((s, c) => s + c.outstanding_amount, 0);
    const oldest = ctx.claims.reduce((m, c) => Math.max(m, c.days_since_claim), 0);
    const breaches = ctx.claims.filter((c) => c.is_irdai_breach).length;
    const summary = ctx.claims.slice(0, 8).map((c, i) =>
      `${i + 1}. Claim: ${c.claim_number} | Patient: ${c.patient_name} | Amount: ${formatInr(c.outstanding_amount)} | Status: ${c.claim_status} | Days: ${c.days_since_claim || "—"}`,
    ).join("\n") + (ctx.claims.length > 8 ? `\n…and ${ctx.claims.length - 8} more (see Excel attachment)` : "");
    return renderFollowupTemplate(tpl.body, {
      insurer: ctx.insurerName,
      hospital: hospitalName,
      claim_count: ctx.claims.length,
      total: formatInr(total).replace(/^₹/, ""),
      oldest_days: oldest,
      breaches,
      summary,
    });
  };

  // Reset state when opening with a new target
  useEffect(() => {
    if (open && target) {
      setTone(defaultTone);
      setRecipient(target.recipientEmail || "");
      setCc(target.ccEmails || "");
      setWhatsappNumber(target.whatsapp || "");
      setSubject(buildSubjectWith(defaultTone, target));
      const initial = buildBodyWith(defaultTone, target);
      setBody(initial);
      setOriginalDraft(initial);
      setRegeneratedDraft(null);
      setAiDraft(null);
      setActiveVersion("original");
      setCompareOpen(false);
      setBodyTouched(false);
      // Pre-populate per-TPA overrides from existing contact data
      if (target.tpaGroups && target.tpaGroups.length > 0) {
        const init: Record<string, Override> = {};
        for (const g of target.tpaGroups) {
          init[g.tpa] = {
            email: g.recipientEmail || "",
            cc: g.ccEmails || "",
            whatsapp: g.whatsapp || "",
          };
        }
        setOverrides(init);
      } else {
        setOverrides({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target, hospitalName, defaultTone, automation.templates]);

  // When tone changes (and user hasn't manually edited), regenerate body & subject
  useEffect(() => {
    if (!target || !open) return;
    setSubject(buildSubjectWith(tone, target));
    if (!bodyTouched) {
      const fresh = buildBodyWith(tone, target);
      setBody(fresh);
      setOriginalDraft(fresh);
      setRegeneratedDraft(null);
      setAiDraft(null);
      setActiveVersion("original");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone, target, open, hospitalName, bodyTouched, automation.templates]);

  const stats = useMemo(() => {
    if (!target) return { total: 0, oldest: 0, breaches: 0 };
    const total = target.claims.reduce((s, c) => s + c.outstanding_amount, 0);
    const oldest = target.claims.reduce(
      (m, c) => Math.max(m, c.days_since_claim),
      0,
    );
    const breaches = target.claims.filter((c) => c.is_irdai_breach).length;
    return { total, oldest, breaches };
  }, [target]);

  if (!target) return null;

  const switchVersion = (v: ActiveVersion) => {
    if (v === "original") setBody(originalDraft);
    else if (v === "regenerated" && regeneratedDraft) setBody(regeneratedDraft);
    else if (v === "ai" && aiDraft) setBody(aiDraft);
    setActiveVersion(v);
    setBodyTouched(false);
  };

  const regenerate = () => {
    const fresh = templateBody(tone, target, hospitalName);
    setRegeneratedDraft(fresh);
    setBody(fresh);
    setActiveVersion("regenerated");
    setBodyTouched(false);
    toast.success("Draft regenerated — compare with the original");
  };

  const aiEnhance = async () => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-enhance-followup",
        {
          body: {
            tone,
            format: "text",
            insurerName: target.insurerName,
            hospitalName,
            claimCount: target.claims.length,
            totalOutstanding: stats.total,
            oldestDays: stats.oldest,
            breachCount: stats.breaches,
            currentBody: body,
            mode: "enhance",
            claims: target.claims.slice(0, 10).map((c) => ({
              claim_number: c.claim_number,
              patient_name: c.patient_name,
              outstanding_amount: c.outstanding_amount,
              days_since_claim: c.days_since_claim,
              claim_status: c.claim_status,
            })),
          },
        },
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.body) {
        setAiDraft(data.body);
        setBody(data.body);
        setActiveVersion("ai");
        setBodyTouched(false);
        toast.success("AI-enhanced draft ready — compare side-by-side");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI enhance failed");
    } finally {
      setAiBusy(false);
    }
  };

  // Save the current draft to localStorage so the user never loses work when
  // backend send fails. Returns the storage key for reference.
  const saveDraftLocally = (reason: string): string => {
    const key = `rcm-buddy-email-draft-${target.insurerName.replace(/\s+/g, "-")}-${Date.now()}`;
    try {
      const draft = {
        savedAt: new Date().toISOString(),
        reason,
        insurerName: target.insurerName,
        recipient,
        cc,
        subject,
        body,
        bodyFormat,
        tone,
        claimCount: target.claims.length,
      };
      localStorage.setItem(key, JSON.stringify(draft));
      // Maintain a lightweight index so other surfaces (e.g. drafts list) can find these.
      const idxRaw = localStorage.getItem("rcm-buddy-email-drafts-index");
      const idx = idxRaw ? (JSON.parse(idxRaw) as string[]) : [];
      idx.unshift(key);
      localStorage.setItem(
        "rcm-buddy-email-drafts-index",
        JSON.stringify(idx.slice(0, 25)),
      );
    } catch {
      /* storage full or disabled — silent */
    }
    setDraftsCount(loadSavedDrafts().length);
    return key;
  };

  const classifyFailure = (msg: string): SendFailure["kind"] => {
    if (/smtp|not configured|no.*sender|sender.*domain|domain.*not/i.test(msg)) return "smtp";
    if (/unauthor|forbidden|invalid.*key|api.*key|401|403/i.test(msg)) return "auth";
    if (/network|fetch|timeout|econn|503|502|504/i.test(msg)) return "network";
    return "unknown";
  };

  // Build the email payload for a single insurer/TPA. Used both for the
  // single-TPA flow and (looped) for multi-TPA bulk sends with overrides.
  const buildEmailPayload = (
    insurerName: string,
    recipientEmail: string,
    ccEmails: string,
    claimsForGroup: Claim[],
  ) => {
    const ccList = ccEmails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      insurerId: 0,
      insurerName,
      recipientEmail: recipientEmail.trim(),
      ccEmails: ccList,
      hospitalName,
      spocName: "Claims Team",
      spocEmail: "billing@hospital.in",
      paymentTatDays: 30,
      customSubject: subject,
      customBody: body,
      bodyFormat,
      tone,
      claims: claimsForGroup.map((c) => ({
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
  };

  const sendEmail = async () => {
    const isMulti = !!(target.tpaGroups && target.tpaGroups.length > 0);

    // Multi-TPA: loop and send per group using overrides
    if (isMulti) {
      const groups = target.tpaGroups!;
      const ready = groups
        .map((g) => ({ g, ov: overrides[g.tpa] ?? { email: g.recipientEmail, cc: g.ccEmails, whatsapp: g.whatsapp ?? "" } }))
        .filter((x) => x.ov.email.trim());
      if (ready.length === 0) {
        toast.error("Add at least one recipient email in the per-TPA list below");
        return;
      }
      setSending(true);
      setSendFailure(null);
      let ok = 0;
      const failures: string[] = [];
      for (const { g, ov } of ready) {
        try {
          const payload = buildEmailPayload(g.tpa, ov.email, ov.cc, g.claims);
          const { data, error } = await supabase.functions.invoke(
            "send-outstanding-reminder",
            { body: { ...payload, actingUserId: getActingUserId() } },
          );
          if (error) throw new Error(error.message);
          if (data?.success === false) throw new Error(data.error || "Send failed");
          ok++;
        } catch (e) {
          failures.push(`${g.tpa}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      setSending(false);
      const skipped = groups.length - ready.length;
      if (failures.length === 0) {
        toast.success(`Sent ${ok} email${ok === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped — no recipient)` : ""}`);
        onSent?.();
        onOpenChange(false);
      } else {
        const firstMsg = failures[0];
        const kind = classifyFailure(firstMsg);
        const draftKey = saveDraftLocally(`bulk:${kind}:${failures.join(" | ")}`);
        setSendFailure({ kind, message: failures.join(" • "), at: Date.now(), draftKey });
        toast.error(`${ok} sent · ${failures.length} failed`, {
          description: "See per-TPA panel and status below.",
          duration: 10000,
          action: { label: "Retry", onClick: () => void sendEmail() },
        });
      }
      return;
    }

    if (!recipient.trim()) {
      toast.error("Recipient email is required — add it in the To field above");
      return;
    }
    setSending(true);
    setSendFailure(null);
    try {
      const payload = buildEmailPayload(target.insurerName, recipient, cc, target.claims);
      const { data, error } = await supabase.functions.invoke(
        "send-outstanding-reminder",
        { body: { ...payload, actingUserId: getActingUserId() } },
      );
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data.error || "Send failed");
      toast.success(`Email sent to ${target.insurerName}`);
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send email";
      const kind = classifyFailure(msg);
      const draftKey = saveDraftLocally(`${kind}: ${msg}`);
      setSendFailure({ kind, message: msg, at: Date.now(), draftKey });

      const friendly =
        kind === "smtp"
          ? "Email sending isn't configured (SMTP missing)"
          : kind === "auth"
            ? "Email service rejected the request (auth failed)"
            : kind === "network"
              ? "Couldn't reach the email service"
              : "Email send failed";

      toast.error(friendly, {
        description: "Draft saved. Retry, or open in your mail app.",
        duration: 10000,
        action: { label: "Retry", onClick: () => void sendEmail() },
        cancel: { label: "Mail App", onClick: () => openInMailClient() },
      });
    } finally {
      setSending(false);
    }
  };

  const openInMailClient = () => {
    if (!recipient.trim()) {
      toast.error("Recipient email is required");
      return;
    }
    const ccQs = cc.trim() ? `&cc=${encodeURIComponent(cc)}` : "";
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}${ccQs}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_self");
    toast.message("Opened in your mail client", {
      description: "Don't forget to attach the Excel below.",
    });
  };

  const buildWhatsAppText = () =>
    `*${subject}*\n\n${body}\n\n— ${hospitalName}\n(${target.claims.length} claim${target.claims.length === 1 ? "" : "s"} · ${formatInrCompact(stats.total)} outstanding)`;

  const sendWhatsApp = async () => {
    const isMulti = !!(target.tpaGroups && target.tpaGroups.length > 0);

    // Multi-TPA: open one wa.me tab per group with a number; fallback for the rest
    if (isMulti) {
      const groups = target.tpaGroups!;
      const withNum = groups.filter((g) => (overrides[g.tpa]?.whatsapp ?? g.whatsapp ?? "").trim());
      if (withNum.length === 0) {
        toast.error("No WhatsApp numbers entered for any selected TPA", {
          description: "Add a number in the per-TPA list, copy the message, or download Excel.",
          duration: 10000,
          action: {
            label: "Copy message",
            onClick: () => {
              navigator.clipboard?.writeText(buildWhatsAppText());
              toast.success("Message copied to clipboard");
            },
          },
        });
        return;
      }
      setWaBusy(true);
      let opened = 0;
      let blocked = 0;
      for (const g of withNum) {
        const raw = (overrides[g.tpa]?.whatsapp ?? g.whatsapp ?? "").replace(/\D/g, "");
        if (!raw) continue;
        const url = `https://wa.me/${raw}?text=${encodeURIComponent(buildWhatsAppText())}`;
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (win) opened++;
        else blocked++;
      }
      setWaBusy(false);
      const skipped = groups.length - withNum.length;
      if (opened > 0) {
        toast.success(`Opened WhatsApp for ${opened} TPA${opened === 1 ? "" : "s"}${skipped ? ` (${skipped} without number)` : ""}`);
      }
      if (blocked > 0) {
        toast.error(`${blocked} popup${blocked === 1 ? "" : "s"} blocked`, {
          description: "Allow popups, or copy the message and paste into WhatsApp.",
        });
      }
      return;
    }

    const num = whatsappNumber.replace(/\D/g, "");
    if (!num) {
      toast.error("Enter a WhatsApp number above, or use the fallback", {
        description: "You can copy the message or share via another channel.",
        duration: 9000,
        action: {
          label: "Copy text",
          onClick: () => {
            navigator.clipboard?.writeText(buildWhatsAppText());
            toast.success("Message copied to clipboard");
          },
        },
        cancel: {
          label: "Download Excel",
          onClick: () => buildExcelDownload(target.insurerName, target.claims),
        },
      });
      return;
    }
    setWaBusy(true);
    try {
      const text = buildWhatsAppText();
      const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) throw new Error("popup-blocked");
      toast.success("WhatsApp opened", {
        description: "Attach the Excel separately if needed.",
      });
    } catch (e) {
      const blocked = e instanceof Error && e.message === "popup-blocked";
      toast.error(blocked ? "WhatsApp couldn't open (popup blocked)" : "WhatsApp share failed", {
        description: "Use one of the fallbacks below.",
        duration: 10000,
        action: {
          label: "Copy message",
          onClick: () => {
            navigator.clipboard?.writeText(buildWhatsAppText());
            toast.success("Message copied — paste into WhatsApp");
          },
        },
        cancel: {
          label: "Share link",
          onClick: async () => {
            const shareUrl = `https://wa.me/${num}?text=${encodeURIComponent(buildWhatsAppText())}`;
            if (navigator.share) {
              try {
                await navigator.share({ title: subject, text: buildWhatsAppText(), url: shareUrl });
              } catch { /* user cancelled */ }
            } else {
              await navigator.clipboard?.writeText(shareUrl);
              toast.success("Share link copied to clipboard");
            }
          },
        },
      });
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="bg-foreground text-background px-6 py-4 flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2 text-background">
            <Mail className="h-5 w-5" />
            Bulk Follow-up Email Composer
          </DialogTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDraftsOpen(true)}
              className="text-background/70 hover:text-background inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-background/10 transition-colors"
              title="Browse auto-saved drafts"
            >
              <Inbox className="h-3.5 w-3.5" />
              Drafts
              {draftsCount > 0 && (
                <span className="bg-background/20 text-background text-[10px] rounded-full px-1.5 py-0 min-w-[18px] text-center">
                  {draftsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="text-background/70 hover:text-background p-1"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {/* TPA + stats summary */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-medium">
              {target.insurerName}
            </Badge>
            <Badge variant="outline">{target.claims.length} claims</Badge>
            <Badge variant="outline" className="font-mono">
              {formatInrCompact(stats.total)} outstanding
            </Badge>
            {stats.oldest > 0 && (
              <Badge variant="outline">{stats.oldest}d oldest</Badge>
            )}
            {stats.breaches > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                ⚠ {stats.breaches} SLA breach
              </Badge>
            )}
          </div>

          {/* Recipients (single-TPA mode) */}
          {!target.tpaGroups || target.tpaGroups.length === 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      To: TPA / Insurer Email
                    </Label>
                    {!recipient.trim() && (
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/providers/contacts" })}
                        className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <SettingsIcon className="h-2.5 w-2.5" /> Add in Settings → Contacts
                      </button>
                    )}
                  </div>
                  <Input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="claims@tpa.com"
                    className={cn("mt-1", !recipient.trim() && "border-warning/60 bg-warning/5")}
                  />
                  {!recipient.trim() && (
                    <p className="text-[10px] text-warning mt-1">
                      ⚠ No email on file — type one here to send, or add it permanently in Settings → Contacts.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    CC
                  </Label>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="manager@hospital.com"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* WhatsApp number — editable inline so the user never gets stuck */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      WhatsApp Number (optional)
                    </Label>
                    {!whatsappNumber.trim() && (
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/providers/contacts" })}
                        className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <SettingsIcon className="h-2.5 w-2.5" /> Add in Settings → Contacts
                      </button>
                    )}
                  </div>
                  <Input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className={cn("mt-1 font-mono text-sm", !whatsappNumber.trim() && "border-dashed")}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {whatsappNumber.trim()
                      ? `→ wa.me/${whatsappNumber.replace(/\D/g, "")}`
                      : "No number? You can still copy the message or share via another channel."}
                  </p>
                </div>
              </div>
            </>
          ) : (
            // Multi-TPA mode: per-TPA editable recipients with warning summary
            <PerTpaRecipientsPanel
              groups={target.tpaGroups}
              overrides={overrides}
              onChange={updateOverride}
              onAddInSettings={() => navigate({ to: "/providers/contacts" })}
            />
          )}

          {/* Subject */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Subject
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 font-medium"
            />
          </div>

          {/* Tone selector */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Tone
            </Label>
            <RadioGroup
              value={tone}
              onValueChange={(v) => {
                setTone(v as FollowUpTone);
                setBodyTouched(false);
              }}
              className="flex flex-wrap gap-4 mt-2"
            >
              {TONES.map((t) => (
                <label
                  key={t.id}
                  htmlFor={`tone-${t.id}`}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <RadioGroupItem id={`tone-${t.id}`} value={t.id} />
                  {t.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Body with action buttons */}
          <div>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Email Body (Editable)
              </Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={regenerate}
                  disabled={aiBusy || sending}
                  className="h-8"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={aiEnhance}
                  disabled={aiBusy || sending}
                  className="h-8"
                >
                  {aiBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-secondary" />
                  )}
                  AI Enhance
                </Button>
                <Button
                  variant={compareOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCompareOpen((o) => !o)}
                  disabled={!regeneratedDraft && !aiDraft}
                  title={
                    !regeneratedDraft && !aiDraft
                      ? "Regenerate or AI-enhance first to compare"
                      : "Compare versions side-by-side"
                  }
                  className="h-8"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  {compareOpen ? "Hide compare" : "Compare"}
                </Button>
              </div>
            </div>

            {/* Version switcher tabs */}
            <Tabs
              value={activeVersion}
              onValueChange={(v) => switchVersion(v as ActiveVersion)}
              className="mb-2"
            >
              <TabsList className="h-8">
                <TabsTrigger value="original" className="text-xs gap-1.5">
                  <FileText className="h-3 w-3" /> Original Template
                </TabsTrigger>
                <TabsTrigger
                  value="regenerated"
                  className="text-xs gap-1.5"
                  disabled={!regeneratedDraft}
                >
                  <RotateCw className="h-3 w-3" /> Regenerated
                </TabsTrigger>
                <TabsTrigger value="ai" className="text-xs gap-1.5" disabled={!aiDraft}>
                  <Sparkles className="h-3 w-3" /> AI-Enhanced
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {compareOpen ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="border rounded-md overflow-hidden">
                  <div className="px-2 py-1 bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 border-b">
                    <FileText className="h-3 w-3" /> Original Template
                  </div>
                  <pre className="text-[10px] leading-snug whitespace-pre-wrap p-2 max-h-[260px] overflow-y-auto font-mono">
                    {originalDraft || <em className="text-muted-foreground">—</em>}
                  </pre>
                </div>
                <div
                  className={cn(
                    "border rounded-md overflow-hidden",
                    !regeneratedDraft && "opacity-50",
                  )}
                >
                  <div className="px-2 py-1 bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 border-b">
                    <RotateCw className="h-3 w-3" /> Regenerated Draft
                  </div>
                  <pre className="text-[10px] leading-snug whitespace-pre-wrap p-2 max-h-[260px] overflow-y-auto font-mono">
                    {regeneratedDraft || (
                      <em className="text-muted-foreground">
                        Click <strong>Regenerate</strong> to create a fresh draft from the current
                        tone.
                      </em>
                    )}
                  </pre>
                </div>
                <div className={cn("border rounded-md overflow-hidden", !aiDraft && "opacity-50")}>
                  <div className="px-2 py-1 bg-secondary/15 text-[10px] font-semibold uppercase tracking-wider text-secondary flex items-center gap-1 border-b">
                    <Sparkles className="h-3 w-3" /> AI-Enhanced
                  </div>
                  <pre className="text-[10px] leading-snug whitespace-pre-wrap p-2 max-h-[260px] overflow-y-auto font-mono">
                    {aiDraft || (
                      <em className="text-muted-foreground">
                        Click <strong>AI Enhance</strong> to refine the current draft with Lovable
                        AI.
                      </em>
                    )}
                  </pre>
                </div>
              </div>
            ) : (
              <Textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setBodyTouched(true);
                }}
                rows={14}
                className="font-mono text-xs leading-relaxed resize-none"
              />
            )}

            {compareOpen && (
              <p className="text-[10px] text-muted-foreground mt-2">
                💡 Pick a version above (Original / Regenerated / AI-Enhanced) to load it into the
                editor before sending.
              </p>
            )}
          </div>

          {/* Variables preview panel */}
          <div className="rounded-md border bg-muted/30">
            <button
              type="button"
              onClick={() => setPreviewOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                {previewOpen ? (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-secondary" />
                )}
                Variables preview
                <span className="text-[10px] font-normal text-muted-foreground">
                  — see how amounts, names & counts will render
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                {previewOpen ? "Hide" : "Show"}
              </span>
            </button>
            {previewOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                  <VarRow label="Provider / TPA" value={target.insurerName} mono />
                  <VarRow label="Hospital" value={hospitalName} mono />
                  <VarRow label="Claim count" value={String(target.claims.length)} mono />
                  <VarRow label="Total outstanding" value={formatInr(stats.total)} mono accent />
                  <VarRow
                    label="Outstanding (compact)"
                    value={formatInrCompact(stats.total)}
                    mono
                  />
                  <VarRow label="Oldest claim age" value={`${stats.oldest} days`} mono />
                  <VarRow
                    label="SLA breaches"
                    value={String(stats.breaches)}
                    mono
                    danger={stats.breaches > 0}
                  />
                  <VarRow label="To" value={recipient || "—"} mono className="col-span-2" />
                  <VarRow label="CC" value={cc || "—"} mono />
                </div>

                {/* Sample claim row preview (first claim, fully rendered) */}
                {target.claims[0] && (
                  <div className="rounded bg-background border px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">
                      Sample claim line (as it appears in the email body)
                    </div>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-snug">
{`1. Claim: ${target.claims[0].claim_number} | Patient: ${target.claims[0].patient_name} | Amount: ${formatInr(target.claims[0].outstanding_amount)} | Status: ${target.claims[0].claim_status} | Days: ${target.claims[0].days_since_claim || "—"}`}
                    </pre>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  💡 These exact values are substituted wherever they appear in the body, subject
                  and Excel attachment. Edit the body above to see changes reflect on send.
                </p>
              </div>
            )}
          </div>

          {/* Attachment notice */}
          <div className="bg-secondary/10 border border-secondary/30 rounded-md px-3 py-2 text-xs flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-secondary" />
            <span>
              <strong>Attachment:</strong> Excel with {target.claims.length}{" "}
              claim{target.claims.length === 1 ? "" : "s"} will be auto-attached.
            </span>
          </div>

          {/* Send-failure status panel — shows exactly why the backend send failed */}
          {sendFailure && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "rounded-md border px-3 py-2.5 text-xs space-y-2",
                sendFailure.kind === "smtp" || sendFailure.kind === "auth"
                  ? "border-warning/40 bg-warning/10"
                  : "border-destructive/40 bg-destructive/10",
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "h-4 w-4 mt-0.5 flex-shrink-0",
                    sendFailure.kind === "smtp" || sendFailure.kind === "auth"
                      ? "text-warning"
                      : "text-destructive",
                  )}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">
                      {sendFailure.kind === "smtp"
                        ? "SMTP not configured"
                        : sendFailure.kind === "auth"
                          ? "Email service auth failed"
                          : sendFailure.kind === "network"
                            ? "Network error reaching email service"
                            : "Email send failed"}
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 h-4 uppercase">
                      Fell back to draft
                    </Badge>
                    {sendFailure.draftKey && (
                      <Badge variant="outline" className="text-[9px] py-0 h-4 gap-1">
                        <Save className="h-2.5 w-2.5" /> Draft saved
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground break-words">
                    {sendFailure.kind === "smtp" &&
                      "Configure SMTP under Settings → Integrations to enable in-app sending. "}
                    {sendFailure.kind === "auth" &&
                      "Check API key / sender domain in Settings → Integrations. "}
                    <span className="font-mono text-[10px] opacity-80">{sendFailure.message}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={sendEmail} disabled={sending}>
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Retry send
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openInMailClient}>
                  <ExternalLink className="h-3 w-3" /> Open saved draft in Mail App
                </Button>
                {(sendFailure.kind === "smtp" || sendFailure.kind === "auth") && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      navigate({ to: "/settings/integrations" });
                    }}
                  >
                    <SettingsIcon className="h-3 w-3" /> Fix in Settings → Integrations
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${subject}\n\n${body}`);
                    toast.success("Draft copied to clipboard");
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs ml-auto"
                  onClick={() => setSendFailure(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t bg-muted/30 px-6 py-3 flex flex-wrap items-center gap-2 justify-end">
          {/* Body format: HTML vs plain text */}
          <div className="mr-auto flex items-center gap-3">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Body format
            </Label>
            <RadioGroup
              value={bodyFormat}
              onValueChange={(v) => setBodyFormat(v as "html" | "text")}
              className="flex items-center gap-3"
            >
              <label htmlFor="bf-html" className="flex items-center gap-1.5 text-xs cursor-pointer">
                <RadioGroupItem id="bf-html" value="html" />
                HTML
              </label>
              <label htmlFor="bf-text" className="flex items-center gap-1.5 text-xs cursor-pointer">
                <RadioGroupItem id="bf-text" value="text" />
                Plain Text
              </label>
            </RadioGroup>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => buildExcelDownload(target.insurerName, target.claims)}
          >
            <Download className="h-4 w-4" /> Download Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openInMailClient}
            disabled={sending}
            title="Open in Outlook / Gmail"
          >
            <ExternalLink className="h-4 w-4" /> Mail App
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmSendOpen("whatsapp")}
            disabled={sending || waBusy}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            title={target.whatsapp ? "Review & send via WhatsApp" : "No number — opens fallback options"}
          >
            {waBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {target.whatsapp ? "Send WhatsApp" : "WhatsApp / Share"}
            {!target.whatsapp && <Share2 className="h-3 w-3 ml-1 opacity-70" />}
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmSendOpen("email")}
            disabled={sending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Email
          </Button>
        </div>
      </DialogContent>
      <SavedDraftsDialog
        open={draftsOpen}
        onOpenChange={(o) => {
          setDraftsOpen(o);
          if (!o) setDraftsCount(loadSavedDrafts().length);
        }}
        onReopen={hydrateFromDraft}
      />

      {/* Send confirmation — final check before dispatching the email or opening WhatsApp */}
      <AlertDialog
        open={confirmSendOpen !== null}
        onOpenChange={(o) => { if (!o) setConfirmSendOpen(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmSendOpen === "whatsapp" ? (
                <><MessageCircle className="h-4 w-4 text-accent" /> Confirm WhatsApp send</>
              ) : (
                <><Send className="h-4 w-4 text-primary" /> Confirm email send</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-xs">
                <div className="rounded-md border bg-muted/40 p-2.5 space-y-1.5">
                  {confirmSendOpen === "email" ? (
                    <>
                      <div><span className="text-muted-foreground">To:</span> <span className="font-mono">{recipient || "—"}</span></div>
                      {cc && <div><span className="text-muted-foreground">CC:</span> <span className="font-mono">{cc}</span></div>}
                      <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{subject || "—"}</span></div>
                    </>
                  ) : (
                    <div><span className="text-muted-foreground">WhatsApp:</span> <span className="font-mono">{target.whatsapp || "— (will show fallback options)"}</span></div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" className="text-[10px]">{target.claims.length} claim{target.claims.length === 1 ? "" : "s"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{target.insurerName}</Badge>
                    <Badge variant="outline" className="text-[10px]">Total {formatInr(stats.total)}</Badge>
                    {stats.breaches > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                        {stats.breaches} SLA breach{stats.breaches === 1 ? "" : "es"}
                      </Badge>
                    )}
                    {confirmSendOpen === "email" && (
                      <Badge variant="outline" className="text-[10px]"><Paperclip className="h-2.5 w-2.5 mr-0.5" /> Excel attached</Badge>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  This action will {confirmSendOpen === "email" ? "dispatch the email immediately and log it to Communication Log." : "open WhatsApp with the pre-filled message and log the click."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "text-xs",
                confirmSendOpen === "whatsapp"
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              onClick={() => {
                const which = confirmSendOpen;
                setConfirmSendOpen(null);
                if (which === "email") void sendEmail();
                else if (which === "whatsapp") void sendWhatsApp();
              }}
            >
              {confirmSendOpen === "whatsapp" ? "Open WhatsApp" : "Send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function VarRow({
  label,
  value,
  mono,
  accent,
  danger,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded bg-background border px-2 py-1.5 flex flex-col gap-0.5 min-w-0",
        className,
      )}
    >
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </span>
      <span
        className={cn(
          "truncate",
          mono && "font-mono",
          accent && "text-secondary font-semibold",
          danger && "text-destructive font-semibold",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Editable per-TPA recipients panel for bulk multi-TPA sends.
 * Shows a warning summary at the top, then a row per TPA with inline editable
 * email / cc / WhatsApp inputs so the user can override or fill missing
 * contact details without leaving the composer.
 */
function PerTpaRecipientsPanel({
  groups,
  overrides,
  onChange,
  onAddInSettings,
}: {
  groups: TpaGroupInfo[];
  overrides: Record<string, { email: string; cc: string; whatsapp: string }>;
  onChange: (tpa: string, patch: Partial<{ email: string; cc: string; whatsapp: string }>) => void;
  onAddInSettings: () => void;
}) {
  const rows = groups.map((g) => {
    const ov = overrides[g.tpa] ?? { email: g.recipientEmail, cc: g.ccEmails, whatsapp: g.whatsapp ?? "" };
    return { g, ov, missingEmail: !ov.email.trim(), missingWa: !ov.whatsapp.trim() };
  });
  const missingEmailList = rows.filter((r) => r.missingEmail).map((r) => r.g.tpa);
  const missingWaList = rows.filter((r) => r.missingWa).map((r) => r.g.tpa);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Recipients per TPA ({groups.length})
        </Label>
        <button
          type="button"
          onClick={onAddInSettings}
          className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
        >
          <SettingsIcon className="h-2.5 w-2.5" /> Manage in Settings → Contacts
        </button>
      </div>

      {(missingEmailList.length > 0 || missingWaList.length > 0) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] space-y-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              {missingEmailList.length > 0 && (
                <div>
                  <span className="font-semibold">Missing email ({missingEmailList.length}):</span>{" "}
                  <span className="text-muted-foreground">{missingEmailList.join(", ")}</span>
                </div>
              )}
              {missingWaList.length > 0 && (
                <div>
                  <span className="font-semibold">Missing WhatsApp ({missingWaList.length}):</span>{" "}
                  <span className="text-muted-foreground">{missingWaList.join(", ")}</span>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                Enter recipients inline below to override, or{" "}
                <button onClick={onAddInSettings} className="text-primary hover:underline">
                  add them in Settings → Contacts
                </button>
                . TPAs without a recipient will be skipped.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
        {rows.map(({ g, ov, missingEmail, missingWa }) => (
          <div key={g.tpa} className="px-2.5 py-2 grid grid-cols-1 md:grid-cols-[180px_1fr_1fr_140px] gap-2 items-start">
            <div className="min-w-0">
              <div className="text-xs font-medium truncate" title={g.tpa}>{g.tpa}</div>
              <div className="text-[10px] text-muted-foreground">
                {g.claims.length} claim{g.claims.length === 1 ? "" : "s"}
              </div>
              {(missingEmail || missingWa) && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {missingEmail && <Badge variant="outline" className="text-[8px] py-0 h-3.5 bg-warning/15 text-warning border-warning/40">no email</Badge>}
                  {missingWa && <Badge variant="outline" className="text-[8px] py-0 h-3.5 bg-muted text-muted-foreground">no WA</Badge>}
                </div>
              )}
            </div>
            <Input
              value={ov.email}
              onChange={(e) => onChange(g.tpa, { email: e.target.value })}
              placeholder="claims@tpa.com"
              className={cn("h-7 text-xs", missingEmail && "border-warning/60 bg-warning/5")}
            />
            <Input
              value={ov.cc}
              onChange={(e) => onChange(g.tpa, { cc: e.target.value })}
              placeholder="cc@hospital.com"
              className="h-7 text-xs"
            />
            <Input
              value={ov.whatsapp}
              onChange={(e) => onChange(g.tpa, { whatsapp: e.target.value })}
              placeholder="+91 98765…"
              className={cn("h-7 text-xs font-mono", missingWa && "border-dashed")}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        💡 Email is sent once per TPA using the address shown here. WhatsApp opens one tab per TPA with a number.
      </p>
    </div>
  );
}
