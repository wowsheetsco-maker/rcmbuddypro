import { useMemo, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Sparkles, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AiToolDialog, { TOOL_META, type AiTool } from "@/components/AiToolDialog";
import type { Claim } from "@/data/mockClaims";

interface Props {
  claim: Claim;
  /** When provided, the launcher renders as a single-tool button (no menu). */
  defaultTool?: AiTool;
  /** Compact icon-only button. */
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  /** Optional label override; defaults to "AI Draft". */
  label?: string;
  /** Hide chevron when only one tool is meaningful. */
  hideChevron?: boolean;
  /** Refetch list / timeline after a draft or send. */
  onDraftSaved?: () => void;
  className?: string;
}

/** Convert a Claim into pre-fill values for a given AI tool. */
function buildInitialValues(claim: Claim, tool: AiTool): Record<string, string | number> {
  const denied = Math.max(0, claim.claimed_amount - claim.approved_amount);
  const base = {
    claim_reference: claim.claim_number,
    patient_name: claim.patient_name,
    tpa_insurer: claim.tpa_name || claim.insurance_company_name || "",
  };
  switch (tool) {
    case "appeal_letter":
      return {
        ...base,
        denied_amount: denied || claim.outstanding_amount || claim.claimed_amount,
        additional_context: [
          claim.diagnosis ? `Diagnosis: ${claim.diagnosis}` : "",
          claim.treatment ? `Treatment: ${claim.treatment}` : "",
          claim.insurer_comments ? `Insurer note: ${claim.insurer_comments}` : "",
        ].filter(Boolean).join("\n"),
      };
    case "query_reply":
      return {
        ...base,
        claimed_amount: claim.claimed_amount,
        query_text: claim.insurer_comments ?? "",
        clinical_details: [
          claim.diagnosis ? `Diagnosis: ${claim.diagnosis}` : "",
          claim.treatment ? `Treatment: ${claim.treatment}` : "",
        ].filter(Boolean).join("\n"),
      };
    case "discharge_summary":
      return {
        patient_name: claim.patient_name,
        diagnosis: claim.diagnosis ?? "",
        tpa_insurer: base.tpa_insurer,
        admission_date: claim.date_of_admission ?? "",
        discharge_date: claim.date_of_discharge ?? "",
        claimed_amount: claim.claimed_amount,
        clinical_details: claim.treatment ?? "",
      };
    case "insurer_email":
      return {
        ...base,
        outstanding_amount: claim.outstanding_amount,
        admission_date: claim.date_of_admission ?? "",
        discharge_date: claim.date_of_discharge ?? "",
        days_pending: claim.days_since_claim,
        email_purpose: claim.is_irdai_breach ? "Escalation" : "Routine Follow-up",
      };
  }
}

const ALL_TOOLS: AiTool[] = ["appeal_letter", "query_reply", "discharge_summary", "insurer_email"];

export default function AiDraftLauncher({
  claim, defaultTool, size = "sm", variant = "outline",
  label = "AI Draft", hideChevron, onDraftSaved, className,
}: Props) {
  const [openTool, setOpenTool] = useState<AiTool | null>(null);

  const initialValues = useMemo(
    () => (openTool ? buildInitialValues(claim, openTool) : undefined),
    [openTool, claim],
  );

  const insurerName = claim.tpa_name || claim.insurance_company_name || "";

  const handleClick = (e: React.MouseEvent) => {
    // Stop event propagation so clicking inside table rows doesn't open drawers
    e.stopPropagation();
    if (defaultTool) setOpenTool(defaultTool);
  };

  // Single-tool fast path
  if (defaultTool) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          className={`gap-1.5 ${className ?? ""}`}
          onClick={handleClick}
        >
          <Sparkles className="h-3.5 w-3.5" /> {label}
        </Button>
        {openTool && (
          <AiToolDialog
            tool={openTool}
            open={!!openTool}
            onOpenChange={(o) => !o && setOpenTool(null)}
            initialValues={initialValues}
            claimId={claim.id}
            claimNumber={claim.claim_number}
            patientName={claim.patient_name}
            insurerName={insurerName}
            onDraftSaved={onDraftSaved}
          />
        )}
      </>
    );
  }

  // Multi-tool dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className={`gap-1.5 ${className ?? ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Sparkles className="h-3.5 w-3.5" /> {label}
            {!hideChevron && <ChevronDown className="h-3 w-3 opacity-70" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Draft with AI for this claim
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_TOOLS.map((t) => {
            const meta = TOOL_META[t];
            const Icon = meta.icon;
            return (
              <DropdownMenuItem key={t} onClick={() => setOpenTool(t)} className="gap-2 text-xs cursor-pointer">
                <Icon className="h-3.5 w-3.5" />
                {meta.title.replace("Generate ", "").replace("AI ", "")}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {openTool && (
        <AiToolDialog
          tool={openTool}
          open={!!openTool}
          onOpenChange={(o) => !o && setOpenTool(null)}
          initialValues={initialValues}
          claimId={claim.id}
          claimNumber={claim.claim_number}
          patientName={claim.patient_name}
          insurerName={insurerName}
          onDraftSaved={onDraftSaved}
        />
      )}
    </>
  );
}
