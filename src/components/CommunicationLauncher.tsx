// Unified Communication launcher for a single claim.
// Replaces the legacy "AI Draft" button on the Claim Drawer.
// Options:
//   • Automatic Followup  — picks tone by aging / breach, opens BulkFollowUpComposer
//   • Manual Email        — opens BulkFollowUpComposer with default Formal tone
//   • AI Email            — opens AiToolDialog with the insurer_email tool
//   • WhatsApp            — opens WhatsAppComposerDialog

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare, ChevronDown, Sparkles, Mail, Send, MessageCircle, Bot,
} from "lucide-react";
import type { Claim } from "@/data/mockClaims";
import BulkFollowUpComposer, { type ComposerTarget, type FollowUpTone } from "@/components/BulkFollowUpComposer";
import AiToolDialog from "@/components/AiToolDialog";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { useInsurerContacts, findContactForProvider } from "@/hooks/useInsurerContacts";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { useActingUserId } from "@/hooks/useActingUser";
import { toast } from "sonner";

interface Props {
  claim: Claim;
  hospitalName?: string;
  tpaSpocName?: string | null;
  onLogged?: () => void;
}

/** Choose tone automatically based on pendency / SLA breach. */
function autoTone(claim: Claim): FollowUpTone {
  if (claim.is_irdai_breach) return "irdai";
  if (claim.days_since_claim > 30) return "urgent";
  if (claim.days_since_claim > 15) return "formal";
  return "friendly";
}

export default function CommunicationLauncher({
  claim, hospitalName = "My Hospital", tpaSpocName, onLogged,
}: Props) {
  const { contacts } = useInsurerContacts();
  const [actingUserId] = useActingUserId();
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [aiOpen, setAiOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  const insurerName = claim.tpa_name || claim.insurance_company_name || "";
  const contact = useMemo(
    () => findContactForProvider(contacts, insurerName),
    [contacts, insurerName],
  );

  const target: ComposerTarget = {
    insurerName,
    recipientEmail: contact?.email ?? "",
    ccEmails: contact?.cc_emails ?? "",
    whatsapp: contact?.whatsapp ?? null,
    claims: [claim],
  };

  const openComposer = (tone: FollowUpTone) => {
    if (!contact?.email) {
      toast.error(`No email on file for ${insurerName || "this insurer"}.`, {
        description: "Add it under Settings → Contacts.",
      });
      return;
    }
    setComposerTone(tone);
    setComposerOpen(true);
  };

  const openAi = () => setAiOpen(true);

  const openWa = () => {
    const num = contact?.whatsapp ?? null;
    if (!num || !normalizeWhatsAppNumber(num)) {
      toast.error("No WhatsApp number on file for this insurer.", {
        description: "Add it under Settings → Contacts.",
      });
      return;
    }
    setWaOpen(true);
  };

  // Insurer-email AI initial values (mirrors AiDraftLauncher mapping)
  const aiInitial = useMemo(() => ({
    claim_reference: claim.claim_number,
    patient_name: claim.patient_name,
    tpa_insurer: insurerName,
    outstanding_amount: claim.outstanding_amount,
    admission_date: claim.date_of_admission ?? "",
    discharge_date: claim.date_of_discharge ?? "",
    days_pending: claim.days_since_claim,
    email_purpose: claim.is_irdai_breach ? "Escalation" : "Routine Follow-up",
  }), [claim, insurerName]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Communication
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Send for this claim
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => openComposer(autoTone(claim))} className="gap-2 text-xs cursor-pointer">
            <Send className="h-3.5 w-3.5 text-primary" />
            <div className="flex flex-col">
              <span className="font-medium">Automatic Followup Mail</span>
              <span className="text-[10px] text-muted-foreground">
                Tone auto-picked by pendency
              </span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openComposer("formal")} className="gap-2 text-xs cursor-pointer">
            <Mail className="h-3.5 w-3.5 text-secondary" />
            <div className="flex flex-col">
              <span className="font-medium">Manual Email</span>
              <span className="text-[10px] text-muted-foreground">Edit subject & body</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={openAi} className="gap-2 text-xs cursor-pointer">
            <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
            <div className="flex flex-col">
              <span className="font-medium">AI Draft Email</span>
              <span className="text-[10px] text-muted-foreground">Generated from claim context</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openWa} className="gap-2 text-xs cursor-pointer">
            <MessageCircle className="h-3.5 w-3.5 text-whatsapp" />
            <div className="flex flex-col">
              <span className="font-medium">WhatsApp</span>
              <span className="text-[10px] text-muted-foreground">
                {contact?.whatsapp ? "Pick a template" : "No number on file"}
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BulkFollowUpComposer
        open={composerOpen}
        onOpenChange={(o) => {
          setComposerOpen(o);
          if (!o) onLogged?.();
        }}
        target={composerOpen ? target : null}
        hospitalName={hospitalName}
        defaultTone={composerTone}
      />

      {aiOpen && (
        <AiToolDialog
          tool="insurer_email"
          open={aiOpen}
          onOpenChange={(o) => { setAiOpen(o); if (!o) onLogged?.(); }}
          initialValues={aiInitial}
          claimId={claim.id}
          claimNumber={claim.claim_number}
          patientName={claim.patient_name}
          insurerName={insurerName}
          onDraftSaved={onLogged}
        />
      )}

      <WhatsAppComposerDialog
        open={waOpen}
        onOpenChange={(o) => { setWaOpen(o); if (!o) onLogged?.(); }}
        claimId={claim.id}
        recipient={contact?.whatsapp ?? null}
        recipientLabel={`${insurerName} · WhatsApp`}
        defaultRole="billing"
        performedBy={actingUserId}
        context={{
          patient_name: claim.patient_name,
          claim_number: claim.claim_number,
          hospital_name: claim.hospital_name,
          outstanding_amount: claim.outstanding_amount,
          days_since_claim: claim.days_since_claim,
          tpa_name: claim.tpa_name,
          tpa_spoc_name: tpaSpocName ?? null,
          insurance_company_name: claim.insurance_company_name,
          last_communication_note: claim.last_communication_note,
        }}
      />
    </>
  );
}
