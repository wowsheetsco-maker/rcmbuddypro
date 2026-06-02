import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, FileText, Receipt, IndianRupee } from "lucide-react";

interface Counts {
  apptUnconfirmed: number;
  apptRescheduled: number;
  apptNoShow: number;
  reportsAwaiting: number;
  reportsQc: number;
  reportsAwaitingSubmit: number;
  invoicesDraft: number;
  invoicesSubmitted: number;
  invoicesOutstanding: number;
  outstandingAmount: number;
}

const ZERO: Counts = {
  apptUnconfirmed: 0, apptRescheduled: 0, apptNoShow: 0,
  reportsAwaiting: 0, reportsQc: 0, reportsAwaitingSubmit: 0,
  invoicesDraft: 0, invoicesSubmitted: 0, invoicesOutstanding: 0, outstandingAmount: 0,
};

export default function OpdFollowUpPage() {
  const [c, setC] = useState<Counts>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a1, a2, a3, r1, r2, r3, i1, i2, i3] = await Promise.all([
        supabase.from("opd_appointments").select("id", { count: "exact", head: true }).eq("status", "booked").is("provider_confirmed_at", null),
        supabase.from("opd_appointments").select("id", { count: "exact", head: true }).eq("status", "rescheduled"),
        supabase.from("opd_appointments").select("id", { count: "exact", head: true }).eq("status", "no_show"),
        supabase.from("opd_reports").select("id", { count: "exact", head: true }).eq("stage", "awaiting_provider"),
        supabase.from("opd_reports").select("id", { count: "exact", head: true }).eq("stage", "qc"),
        supabase.from("opd_reports").select("id", { count: "exact", head: true }).in("stage", ["received", "qc"]),
        supabase.from("opd_invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("opd_invoices").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("opd_invoices").select("id, total_amount, paid_amount").in("status", ["submitted", "part_paid", "outstanding"]),
      ]);
      const outstanding = (i3.data ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) - Number(r.paid_amount || 0)), 0);
      setC({
        apptUnconfirmed: a1.count ?? 0, apptRescheduled: a2.count ?? 0, apptNoShow: a3.count ?? 0,
        reportsAwaiting: r1.count ?? 0, reportsQc: r2.count ?? 0, reportsAwaitingSubmit: r3.count ?? 0,
        invoicesDraft: i1.count ?? 0, invoicesSubmitted: i2.count ?? 0,
        invoicesOutstanding: (i3.data ?? []).length, outstandingAmount: outstanding,
      });
      setLoading(false);
    })();
  }, []);

  const groups = [
    {
      title: "Appointments", icon: CalendarClock, link: "/opd/appointments",
      items: [
        { label: "Not confirmed by provider", value: c.apptUnconfirmed },
        { label: "Rescheduled", value: c.apptRescheduled },
        { label: "No-shows", value: c.apptNoShow },
      ],
    },
    {
      title: "Reports", icon: FileText, link: "/opd/reports",
      items: [
        { label: "Awaiting provider", value: c.reportsAwaiting },
        { label: "In QC", value: c.reportsQc },
        { label: "Awaiting submission", value: c.reportsAwaitingSubmit },
      ],
    },
    {
      title: "Invoices", icon: Receipt, link: "/opd/invoices",
      items: [
        { label: "Draft", value: c.invoicesDraft },
        { label: "Submitted (awaiting payment)", value: c.invoicesSubmitted },
        { label: "Outstanding", value: c.invoicesOutstanding },
      ],
    },
    {
      title: "Payments", icon: IndianRupee, link: "/opd/invoices",
      items: [
        { label: "Total outstanding (₹)", value: `₹${Math.round(c.outstandingAmount).toLocaleString("en-IN")}` },
      ],
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Outstanding follow-up</h1>
          <p className="text-sm text-muted-foreground">Single operational view: what's stuck across appointments, reports, invoices, and payments.</p>
        </header>

        {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => (
              <Card key={g.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><g.icon className="h-4 w-4" /> {g.title}</CardTitle>
                  <Link to={g.link} className="text-xs text-primary hover:underline">Open →</Link>
                </CardHeader>
                <CardContent className="space-y-2">
                  {g.items.map((it) => (
                    <div key={it.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{it.label}</span>
                      <Badge variant="outline" className="tabular-nums">{it.value}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        }
      </div>
    </AppLayout>
  );
}
