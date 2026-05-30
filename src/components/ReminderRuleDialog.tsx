import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ReminderSchedule } from "@/hooks/useReminderSchedules";
import { useLiveClaims } from "@/hooks/useLiveClaims";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: ReminderSchedule | null;
  onSave: (
    input: Partial<ReminderSchedule> & { name: string },
  ) => Promise<boolean>;
}

const DOW = [
  { v: 0, l: "Sunday" }, { v: 1, l: "Monday" }, { v: 2, l: "Tuesday" },
  { v: 3, l: "Wednesday" }, { v: 4, l: "Thursday" }, { v: 5, l: "Friday" },
  { v: 6, l: "Saturday" },
];

export default function ReminderRuleDialog({ open, onOpenChange, initial, onSave }: Props) {
  const { claims } = useLiveClaims();
  const tpaList = useMemo(() => {
    const set = new Set<string>();
    for (const c of claims) {
      const k = c.tpa_name || c.insurance_company_name;
      if (k) set.add(k);
    }
    return Array.from(set).sort();
  }, [claims]);

  const [form, setForm] = useState<Partial<ReminderSchedule> & { name: string }>({
    name: "",
    scope: "tpa",
    cadence: "weekly",
    send_hour: 10,
    send_minute: 0,
    day_of_week: 1,
    include_pending: true,
    include_discrepancies: false,
    include_irdai_breaches: false,
    include_denied: false,
    include_aging_summary: true,
    min_outstanding: 0,
    attach_excel: true,
    is_active: true,
  });

  useEffect(() => {
    if (initial) setForm(initial);
    else setForm({
      name: "",
      scope: "tpa",
      cadence: "weekly",
      send_hour: 10,
      send_minute: 0,
      day_of_week: 1,
      include_pending: true,
      include_discrepancies: false,
      include_irdai_breaches: false,
      include_denied: false,
      include_aging_summary: true,
      min_outstanding: 0,
      attach_excel: true,
      is_active: true,
    });
  }, [initial, open]);

  const set = <K extends keyof ReminderSchedule>(k: K, v: ReminderSchedule[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    if (form.scope === "tpa" && !form.tpa_name) return;
    const ok = await onSave(form);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Reminder Rule" : "New Reminder Rule"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basics">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-3 pt-3">
            <div>
              <Label>Rule name</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Weekly reminder · Star Health"
              />
            </div>
            <div>
              <Label>Scope</Label>
              <Select
                value={form.scope ?? "tpa"}
                onValueChange={(v) => set("scope", v as "tpa" | "global")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tpa">Specific TPA / Insurer</SelectItem>
                  <SelectItem value="global">Global (aging bucket fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "tpa" ? (
              <div>
                <Label>TPA / Insurer</Label>
                <Select
                  value={form.tpa_name ?? ""}
                  onValueChange={(v) => set("tpa_name", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tpaList.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Aging bucket trigger</Label>
                <Select
                  value={form.aging_bucket ?? "all"}
                  onValueChange={(v) => set("aging_bucket", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buckets</SelectItem>
                    <SelectItem value="0-30">0–30 days</SelectItem>
                    <SelectItem value="31-60">31–60 days</SelectItem>
                    <SelectItem value="61-90">61–90 days</SelectItem>
                    <SelectItem value="90+">90+ days</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Fallback rule — applies to every TPA whose claims fall in this bucket
                  when no per-TPA rule exists.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_active ?? true}
                onCheckedChange={(v) => set("is_active", v)}
              />
              <Label>Active</Label>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cadence</Label>
                <Select
                  value={form.cadence ?? "weekly"}
                  onValueChange={(v) => set("cadence", v as ReminderSchedule["cadence"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="every_n_days">Every N days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.cadence === "every_n_days" && (
                <div>
                  <Label>Every N days</Label>
                  <Input
                    type="number" min={1}
                    value={form.every_n_days ?? 7}
                    onChange={(e) => set("every_n_days", Number(e.target.value))}
                  />
                </div>
              )}
              {(form.cadence === "weekly" || form.cadence === "biweekly") && (
                <div>
                  <Label>Day of week</Label>
                  <Select
                    value={String(form.day_of_week ?? 1)}
                    onValueChange={(v) => set("day_of_week", Number(v))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOW.map((d) => (
                        <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.cadence === "monthly" && (
                <div>
                  <Label>Day of month (1–28)</Label>
                  <Input
                    type="number" min={1} max={28}
                    value={form.day_of_month ?? 1}
                    onChange={(e) => set("day_of_month", Number(e.target.value))}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Send hour (IST, 0–23)</Label>
                <Input
                  type="number" min={0} max={23}
                  value={form.send_hour ?? 10}
                  onChange={(e) => set("send_hour", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Send minute</Label>
                <Input
                  type="number" min={0} max={59}
                  value={form.send_minute ?? 0}
                  onChange={(e) => set("send_minute", Number(e.target.value))}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Pick which claim categories should be pulled into the email + Excel.
            </p>
            {[
              ["include_pending", "Pending claims (outstanding > 0)"],
              ["include_discrepancies", "Discrepancies (short-paid)"],
              ["include_irdai_breaches", "SLA breaches (> 15d)"],
              ["include_denied", "Denied / Rejected claims"],
              ["include_aging_summary", "Show aging-bucket summary in email"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between border rounded-md px-3 py-2">
                <Label className="text-sm">{label}</Label>
                <Switch
                  checked={Boolean(form[k as keyof ReminderSchedule])}
                  onCheckedChange={(v) => set(k as keyof ReminderSchedule, v as never)}
                />
              </div>
            ))}
            <div>
              <Label>Minimum outstanding (₹)</Label>
              <Input
                type="number" min={0}
                value={form.min_outstanding ?? 0}
                onChange={(e) => set("min_outstanding", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only include claims above this amount. Use 0 for all.
              </p>
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">Attach Excel report</Label>
              <Switch
                checked={form.attach_excel ?? true}
                onCheckedChange={(v) => set("attach_excel", v)}
              />
            </div>
          </TabsContent>

          <TabsContent value="email" className="space-y-3 pt-3">
            <div>
              <Label>Recipient override (email)</Label>
              <Input
                placeholder="leave blank to use TPA contact on file"
                value={form.recipient_email_override ?? ""}
                onChange={(e) => set("recipient_email_override", e.target.value)}
              />
            </div>
            <div>
              <Label>CC override (comma separated)</Label>
              <Input
                placeholder="cfo@hospital.com, billing@hospital.com"
                value={form.cc_emails_override ?? ""}
                onChange={(e) => set("cc_emails_override", e.target.value)}
              />
            </div>
            <div>
              <Label>Subject template</Label>
              <Input
                placeholder="Outstanding claims · {{tpa}}"
                value={form.subject_template ?? ""}
                onChange={(e) => set("subject_template", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Token: <code>{`{{tpa}}`}</code>
              </p>
            </div>
            <div>
              <Label>Body override (optional)</Label>
              <Textarea
                rows={5}
                placeholder="Leave blank to use the default formatted email."
                value={form.body_template ?? ""}
                onChange={(e) => set("body_template", e.target.value)}
              />
            </div>
            <div>
              <Label>Notes (internal)</Label>
              <Textarea
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save changes" : "Create rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
