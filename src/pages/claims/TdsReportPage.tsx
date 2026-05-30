import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { RcmIcons } from "@/lib/icons";
import AppLayout from "@/components/AppLayout";
import { formatInr, type Claim } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type EditableField = "tds_amount" | "cheque_neft_utr_no" | "payment_update_date";

interface EditState {
  id: string;
  field: EditableField;
  value: string;
}

export default function TdsReportPage() {
  const { claims, loading, isMock, refetch } = useLiveClaims();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const tdsData = claims.filter(c => c.tds_amount > 0);
  const totalTds = tdsData.reduce((s, c) => s + c.tds_amount, 0);
  const totalSettled = tdsData.reduce((s, c) => s + c.settled_amount, 0);

  const startEdit = (c: Claim, field: EditableField) => {
    const raw =
      field === "tds_amount" ? String(c.tds_amount) :
      field === "cheque_neft_utr_no" ? (c.cheque_neft_utr_no ?? "") :
      (c.payment_update_date ?? "");
    setEdit({ id: c.id, field, value: raw });
  };

  const cancelEdit = () => setEdit(null);

  const saveEdit = async () => {
    if (!edit) return;
    if (isMock) {
      toast({ title: "Sample data", description: "Import real claims to enable editing.", variant: "destructive" });
      setEdit(null);
      return;
    }
    setSaving(true);
    const patch: { tds_amount?: number; cheque_neft_utr_no?: string | null; payment_update_date?: string | null } = {};
    if (edit.field === "tds_amount") {
      const n = Number(edit.value);
      if (Number.isNaN(n) || n < 0) {
        toast({ title: "Invalid amount", description: "Enter a non-negative number.", variant: "destructive" });
        setSaving(false);
        return;
      }
      patch.tds_amount = n;
    } else if (edit.field === "cheque_neft_utr_no") {
      patch.cheque_neft_utr_no = edit.value.trim() || null;
    } else if (edit.field === "payment_update_date") {
      patch.payment_update_date = edit.value || null;
    }

    const { error } = await supabase.from("claims").update(patch).eq("id", edit.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated", description: "Master record synced." });
    setEdit(null);
    refetch();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const renderEditable = (c: Claim, field: EditableField, display: React.ReactNode, inputType: string = "text") => {
    const isEditing = edit?.id === c.id && edit.field === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            type={inputType}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onKeyDown={onKey}
            className="h-7 text-xs px-2"
          />
          <button onClick={saveEdit} disabled={saving} className="text-success hover:opacity-70" aria-label="Save">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" aria-label="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => startEdit(c, field)}
        className="group inline-flex items-center gap-1.5 hover:text-primary text-left"
        title="Click to edit"
      >
        <span>{display}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-foreground">TDS Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            TDS deductions across settled claims · {tdsData.length} entries · click any value to edit
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data — read only</Badge>}
          </p>
        </div>

        <KpiGrid cols={3}>
          <KpiCard
            label="Total TDS deducted"
            value={formatInr(totalTds)}
            loading={loading}
            empty={!loading && totalTds === 0}
            icon={<RcmIcons.amount className="h-3.5 w-3.5 text-destructive" />}
          />
          <KpiCard
            label="Total settled amount"
            value={formatInr(totalSettled)}
            loading={loading}
            empty={!loading && totalSettled === 0}
            icon={<RcmIcons.paid className="h-3.5 w-3.5 text-success" />}
          />
          <KpiCard
            label="Effective TDS rate"
            value={`${totalSettled > 0 ? ((totalTds / totalSettled) * 100).toFixed(1) : 0}%`}
            loading={loading}
            empty={!loading && totalSettled === 0}
            icon={<RcmIcons.analytics className="h-3.5 w-3.5 text-primary" />}
          />
        </KpiGrid>

        <Card className="shadow-sm">
          <Table dense wrapperClassName="max-h-[calc(100vh-340px)]">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Claim No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead priority="secondary">TPA</TableHead>
                <TableHead align="right">Settled</TableHead>
                <TableHead align="right">TDS</TableHead>
                <TableHead align="right" priority="tertiary">TDS %</TableHead>
                <TableHead priority="secondary">UTR No</TableHead>
                <TableHead priority="tertiary">Payment Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tdsData.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-[11px]">{c.claim_number}</TableCell>
                  <TableCell>{c.patient_name}</TableCell>
                  <TableCell priority="secondary" className="text-muted-foreground">{c.tpa_name}</TableCell>
                  <TableCell numeric>{formatInr(c.settled_amount)}</TableCell>
                  <TableCell numeric className="font-semibold">
                    {renderEditable(c, "tds_amount", formatInr(c.tds_amount), "number")}
                  </TableCell>
                  <TableCell numeric priority="tertiary">{c.settled_amount > 0 ? ((c.tds_amount / c.settled_amount) * 100).toFixed(1) : 0}%</TableCell>
                  <TableCell priority="secondary" className="font-mono text-[11px]">
                    {renderEditable(c, "cheque_neft_utr_no", c.cheque_neft_utr_no || "—")}
                  </TableCell>
                  <TableCell priority="tertiary" className="text-[11px] tabular-nums">
                    {renderEditable(c, "payment_update_date", c.payment_update_date || "—", "date")}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && tdsData.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">No TDS entries.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppLayout>
  );
}
