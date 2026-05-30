import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";

const CLAIM_STATUSES = [
  "Pre Auth Initiated",
  "Pre Auth Approved",
  "Pre Auth Query",
  "Pre Auth Denied",
  "Discharge Initiated",
  "Discharge Approved",
  "Discharge Query",
  "Discharge Denied",
  "Settlement Initiated",
  "Settled",
  "Closed",
];

// Every column we let the user edit from the UI.
type EditableClaim = {
  claim_number: string;
  claim_status: string;
  patient_name: string;
  patient_contact: string;
  in_patient_number: string;
  member_customer_id: string;
  hospital_name: string;
  tpa_name: string;
  insurance_company_name: string;
  policy_number: string;
  policy_holder_name: string;
  policy_type: string;
  employee_code: string;
  diagnosis: string;
  treatment: string;
  date_of_admission: string;
  date_of_discharge: string;
  claim_creation_date: string;
  doc_submission_date: string;
  payment_update_date: string;
  cheque_neft_utr_no: string;
  cheque_neft_utr_date: string;
  receipt_no: string;
  initial_claim_number: string;
  ihx_ref_id: string;
  insurer_comments: string;
  // numeric
  claimed_amount: string;
  approved_amount: string;
  copay: string;
  shortfall_amount: string;
  hospital_discount: string;
  patient_paid_amount: string;
  settled_amount: string;
  tds_amount: string;
};

const NUMERIC_FIELDS: (keyof EditableClaim)[] = [
  "claimed_amount", "approved_amount", "copay", "shortfall_amount",
  "hospital_discount", "patient_paid_amount", "settled_amount", "tds_amount",
];

const DATE_FIELDS: (keyof EditableClaim)[] = [
  "date_of_admission", "date_of_discharge", "claim_creation_date",
  "doc_submission_date", "payment_update_date", "cheque_neft_utr_date",
];

function s(v: string | null | undefined): string {
  return v ?? "";
}
function n(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "" : String(v);
}

function fromClaim(c: Claim): EditableClaim {
  return {
    claim_number: s(c.claim_number),
    claim_status: s(c.claim_status),
    patient_name: s(c.patient_name),
    patient_contact: s(c.patient_contact),
    in_patient_number: s(c.in_patient_number),
    member_customer_id: s(c.member_customer_id),
    hospital_name: s(c.hospital_name),
    tpa_name: s(c.tpa_name),
    insurance_company_name: s(c.insurance_company_name),
    policy_number: s(c.policy_number),
    policy_holder_name: s(c.policy_holder_name),
    policy_type: s(c.policy_type),
    employee_code: s(c.employee_code),
    diagnosis: s(c.diagnosis),
    treatment: s(c.treatment),
    date_of_admission: s(c.date_of_admission),
    date_of_discharge: s(c.date_of_discharge),
    claim_creation_date: s(c.claim_creation_date),
    doc_submission_date: s(c.doc_submission_date),
    payment_update_date: s(c.payment_update_date),
    cheque_neft_utr_no: s(c.cheque_neft_utr_no),
    cheque_neft_utr_date: s(c.cheque_neft_utr_date),
    receipt_no: s(c.receipt_no),
    initial_claim_number: s(c.initial_claim_number),
    ihx_ref_id: s(c.ihx_ref_id),
    insurer_comments: s(c.insurer_comments),
    claimed_amount: n(c.claimed_amount),
    approved_amount: n(c.approved_amount),
    copay: n(c.copay),
    shortfall_amount: n(c.shortfall_amount),
    hospital_discount: n(c.hospital_discount),
    patient_paid_amount: n(c.patient_paid_amount),
    settled_amount: n(c.settled_amount),
    tds_amount: n(c.tds_amount),
  };
}

interface Props {
  claim: Claim;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (patch: Partial<Claim>) => void;
}

export default function ClaimEditDialog({ claim, open, onOpenChange, onSaved }: Props) {
  const initial = useMemo(() => fromClaim(claim), [claim]);
  const [draft, setDraft] = useState<EditableClaim>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(fromClaim(claim));
  }, [claim, open]);

  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof EditableClaim)[]).some((k) => initial[k] !== draft[k]),
    [initial, draft],
  );

  const set = (k: keyof EditableClaim, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const buildPatch = () => {
    const patch: Record<string, unknown> = {};
    (Object.keys(draft) as (keyof EditableClaim)[]).forEach((k) => {
      const v = draft[k].trim();
      if (NUMERIC_FIELDS.includes(k)) {
        const num = v === "" ? 0 : Number(v);
        patch[k] = Number.isNaN(num) ? 0 : num;
      } else if (DATE_FIELDS.includes(k)) {
        patch[k] = v === "" ? null : v;
      } else if (k === "claim_number" || k === "patient_name" || k === "tpa_name" || k === "claim_status") {
        patch[k] = v;
      } else {
        patch[k] = v === "" ? null : v;
      }
    });

    const claimed = Number(patch.claimed_amount) || 0;
    const settled = Number(patch.settled_amount) || 0;
    const tds = Number(patch.tds_amount) || 0;
    const copay = Number(patch.copay) || 0;
    const discount = Number(patch.hospital_discount) || 0;
    const paid = Number(patch.patient_paid_amount) || 0;
    patch.outstanding_amount = Math.max(0, claimed - settled - tds - copay - discount - paid);

    return patch;
  };

  const handleSave = async () => {
    if (!draft.claim_number.trim()) return toast.error("Claim number is required");
    if (!draft.patient_name.trim()) return toast.error("Patient name is required");
    if (!draft.tpa_name.trim()) return toast.error("TPA / Insurer is required");
    if (!draft.claim_status.trim()) return toast.error("Status is required");
    if (!draft.claim_creation_date.trim()) return toast.error("Claim creation date is required");

    setSaving(true);
    const patch = buildPatch();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("claims").update(patch as any).eq("id", claim.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save", { description: error.message });
      return;
    }
    toast.success("Claim updated");
    onSaved?.(patch as Partial<Claim>);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Claim · {claim.claim_number}</DialogTitle>
          <DialogDescription>
            Update any field below. Changes are saved to the master record. Outstanding is recalculated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="Status & References">
            <Field label="Claim Number *">
              <Input value={draft.claim_number} onChange={(e) => set("claim_number", e.target.value)} />
            </Field>
            <Field label="Status *">
              <Select value={draft.claim_status} onValueChange={(v) => set("claim_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  {!CLAIM_STATUSES.includes(draft.claim_status) && draft.claim_status && (
                    <SelectItem value={draft.claim_status}>{draft.claim_status}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Initial Claim #">
              <Input value={draft.initial_claim_number} onChange={(e) => set("initial_claim_number", e.target.value)} />
            </Field>
            <Field label="IHX Ref">
              <Input value={draft.ihx_ref_id} onChange={(e) => set("ihx_ref_id", e.target.value)} />
            </Field>
            <Field label="Receipt No">
              <Input value={draft.receipt_no} onChange={(e) => set("receipt_no", e.target.value)} />
            </Field>
          </Section>

          <Separator />

          <Section title="Financials (₹)">
            {[
              ["claimed_amount", "Claimed"],
              ["approved_amount", "Approved"],
              ["settled_amount", "Settled"],
              ["tds_amount", "TDS"],
              ["copay", "Copay"],
              ["shortfall_amount", "Shortfall"],
              ["hospital_discount", "Hospital Discount"],
              ["patient_paid_amount", "Patient Paid"],
            ].map(([k, label]) => (
              <Field key={k} label={label as string}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={draft[k as keyof EditableClaim]}
                  onChange={(e) => set(k as keyof EditableClaim, e.target.value)}
                />
              </Field>
            ))}
          </Section>

          <Separator />

          <Section title="Timeline">
            {[
              ["date_of_admission", "Admission"],
              ["date_of_discharge", "Discharge"],
              ["claim_creation_date", "Claim Created *"],
              ["doc_submission_date", "Documents Submitted"],
              ["payment_update_date", "Payment Update"],
              ["cheque_neft_utr_date", "Cheque / UTR Date"],
            ].map(([k, label]) => (
              <Field key={k} label={label as string}>
                <Input
                  type="date"
                  value={draft[k as keyof EditableClaim]}
                  onChange={(e) => set(k as keyof EditableClaim, e.target.value)}
                />
              </Field>
            ))}
            <Field label="Cheque / UTR No">
              <Input value={draft.cheque_neft_utr_no} onChange={(e) => set("cheque_neft_utr_no", e.target.value)} />
            </Field>
          </Section>

          <Separator />

          <Section title="Patient & Hospital">
            <Field label="Patient Name *">
              <Input value={draft.patient_name} onChange={(e) => set("patient_name", e.target.value)} />
            </Field>
            <Field label="Patient Contact">
              <Input value={draft.patient_contact} onChange={(e) => set("patient_contact", e.target.value)} />
            </Field>
            <Field label="IP Number">
              <Input value={draft.in_patient_number} onChange={(e) => set("in_patient_number", e.target.value)} />
            </Field>
            <Field label="Member / Customer ID">
              <Input value={draft.member_customer_id} onChange={(e) => set("member_customer_id", e.target.value)} />
            </Field>
            <Field label="Hospital Name" colSpan={2}>
              <Input value={draft.hospital_name} onChange={(e) => set("hospital_name", e.target.value)} />
            </Field>
          </Section>

          <Separator />

          <Section title="Insurance">
            <Field label="TPA / Insurer *" colSpan={2}>
              <Input value={draft.tpa_name} onChange={(e) => set("tpa_name", e.target.value)} />
            </Field>
            <Field label="Insurance Company" colSpan={2}>
              <Input value={draft.insurance_company_name} onChange={(e) => set("insurance_company_name", e.target.value)} />
            </Field>
            <Field label="Policy Number">
              <Input value={draft.policy_number} onChange={(e) => set("policy_number", e.target.value)} />
            </Field>
            <Field label="Policy Type">
              <Input value={draft.policy_type} onChange={(e) => set("policy_type", e.target.value)} />
            </Field>
            <Field label="Policy Holder">
              <Input value={draft.policy_holder_name} onChange={(e) => set("policy_holder_name", e.target.value)} />
            </Field>
            <Field label="Employee Code">
              <Input value={draft.employee_code} onChange={(e) => set("employee_code", e.target.value)} />
            </Field>
          </Section>

          <Separator />

          <Section title="Clinical">
            <Field label="Diagnosis" colSpan={2}>
              <Textarea
                value={draft.diagnosis}
                onChange={(e) => set("diagnosis", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Treatment" colSpan={2}>
              <Textarea
                value={draft.treatment}
                onChange={(e) => set("treatment", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Insurer Comments" colSpan={2}>
              <Textarea
                value={draft.insurer_comments}
                onChange={(e) => set("insurer_comments", e.target.value)}
                rows={3}
              />
            </Field>
          </Section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, colSpan = 1, children }: { label: string; colSpan?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={colSpan === 2 ? "col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
