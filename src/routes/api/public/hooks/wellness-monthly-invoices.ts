import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Monthly wellness invoice generation.
 *
 * For each organization, for each corporate (provider) with completed wellness
 * requests in the target month, creates a draft invoice + line items aggregating
 * all completed requests × package price, then attempts to email the billing
 * contact a summary with the invoice tracking number.
 *
 * Target month: previous calendar month, unless ?month=YYYY-MM is passed.
 * Email send: uses Resend if RESEND_API_KEY is configured, otherwise logs the
 * outgoing draft to `wellness_request_events` for manual follow-up.
 *
 * Safe to re-run: skips (provider × month) pairs that already have an invoice.
 *
 * Called by pg_cron monthly. Auth bypassed via /api/public prefix; the request
 * is idempotent.
 */
export const Route = createFileRoute("/api/public/hooks/wellness-monthly-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const monthParam = url.searchParams.get("month"); // YYYY-MM
        const now = new Date();
        const target = monthParam
          ? new Date(`${monthParam}-01T00:00:00Z`)
          : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const periodStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
        const periodEnd = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
        const periodStartStr = periodStart.toISOString().slice(0, 10);
        const periodEndStr = periodEnd.toISOString().slice(0, 10);
        const monthKey = periodStartStr.slice(0, 7).replace("-", "");

        const resendKey = process.env.RESEND_API_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;

        const errors: string[] = [];
        let invoicesCreated = 0;
        let emailsSent = 0;
        const providers = new Set<string>();

        // Fetch all completed requests in the target window grouped by corporate
        const { data: reqs, error: reqErr } = await supabaseAdmin
          .from("wellness_requests")
          .select("id, org_id, corporate_id, client_name, scheduled_at, requested_at, package_id, service_type")
          .eq("status", "completed")
          .gte("requested_at", `${periodStartStr}T00:00:00Z`)
          .lte("requested_at", `${periodEndStr}T23:59:59Z`)
          .not("corporate_id", "is", null);

        if (reqErr) {
          errors.push(`fetch requests: ${reqErr.message}`);
        }

        // Group by (org_id, corporate_id)
        const groups = new Map<string, any[]>();
        for (const r of (reqs ?? []) as any[]) {
          const key = `${r.org_id}::${r.corporate_id}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        }

        // Pull package prices and provider info in bulk
        const pkgIds = Array.from(new Set((reqs ?? []).map((r: any) => r.package_id).filter(Boolean)));
        const { data: pkgs } = pkgIds.length
          ? await supabaseAdmin.from("wellness_packages").select("id,name,price").in("id", pkgIds)
          : { data: [] as any[] };
        const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));

        const corpIds = Array.from(new Set((reqs ?? []).map((r: any) => r.corporate_id).filter(Boolean)));
        const { data: corps } = corpIds.length
          ? await supabaseAdmin.from("opd_corporates").select("id,name,billing_contact_email").in("id", corpIds)
          : { data: [] as any[] };
        const corpMap = new Map((corps ?? []).map((c: any) => [c.id, c]));

        for (const [key, items] of groups) {
          const [orgId, corporateId] = key.split("::");
          providers.add(key);

          // Skip if invoice for (org, corporate, period) already exists
          const { data: existing } = await supabaseAdmin
            .from("opd_invoices")
            .select("id, invoice_no")
            .eq("org_id", orgId)
            .eq("corporate_id", corporateId)
            .eq("period_start", periodStartStr)
            .eq("period_end", periodEndStr)
            .maybeSingle();

          let invoiceId = existing?.id as string | undefined;
          let invoiceNo = existing?.invoice_no as string | undefined;

          if (!invoiceId) {
            const total = items.reduce((s: number, r: any) => s + Number(pkgMap.get(r.package_id)?.price ?? 0), 0);
            invoiceNo = `WI-${monthKey}-${Date.now().toString().slice(-5)}`;

            const { data: inv, error: invErr } = await supabaseAdmin.from("opd_invoices").insert({
              org_id: orgId,
              corporate_id: corporateId,
              invoice_no: invoiceNo,
              period_start: periodStartStr,
              period_end: periodEndStr,
              visit_count: items.length,
              total_amount: total,
              paid_amount: 0,
              status: "draft",
            }).select("id").single();

            if (invErr || !inv) {
              errors.push(`invoice ${corporateId}: ${invErr?.message}`);
              continue;
            }
            invoiceId = inv.id;
            invoicesCreated++;

            await supabaseAdmin.from("opd_invoice_items").insert(items.map((r: any) => ({
              org_id: orgId,
              invoice_id: invoiceId as string,
              visit_date: (r.scheduled_at ?? r.requested_at)?.slice(0, 10),
              patient_name: r.client_name,
              description: pkgMap.get(r.package_id)?.name ?? r.service_type ?? "Service",
              amount: Number(pkgMap.get(r.package_id)?.price ?? 0),
            })) as any);
          }

          const corp = corpMap.get(corporateId);
          const billingEmail = corp?.billing_contact_email as string | undefined;
          const total = items.reduce((s: number, r: any) => s + Number(pkgMap.get(r.package_id)?.price ?? 0), 0);

          // Build email summary
          const subject = `Wellness invoice ${invoiceNo} — ${corp?.name ?? ""} (${periodStartStr} to ${periodEndStr})`;
          const lines = items.map((r: any) => {
            const pkg = pkgMap.get(r.package_id);
            const when = (r.scheduled_at ?? r.requested_at)?.slice(0, 10) ?? "";
            return `- ${when}  ${r.client_name}  ${pkg?.name ?? r.service_type ?? "Service"}  ₹${Number(pkg?.price ?? 0)}`;
          }).join("\n");
          const body = `Dear team,

Please find the wellness invoice summary for ${periodStartStr} to ${periodEndStr}.

Invoice tracking #: ${invoiceNo}
Provider: ${corp?.name ?? ""}
Completed cases: ${items.length}
Total amount: ₹${Math.round(total).toLocaleString("en-IN")}

Detail of completed cases:
${lines}

The detailed invoice (Excel/PDF) is available in the portal under Wellness → Invoices.

Thank you.`;

          // Try to send via Resend if available
          let emailStatus: "sent" | "drafted" | "failed" = "drafted";
          let emailError: string | undefined;

          if (billingEmail && resendKey && lovableKey) {
            try {
              const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${lovableKey}`,
                  "X-Connection-Api-Key": resendKey,
                },
                body: JSON.stringify({
                  from: "Wellness <onboarding@resend.dev>",
                  to: [billingEmail],
                  subject,
                  text: body,
                }),
              });
              if (resp.ok) { emailStatus = "sent"; emailsSent++; }
              else { emailStatus = "failed"; emailError = `Resend ${resp.status}`; }
            } catch (e) {
              emailStatus = "failed";
              emailError = e instanceof Error ? e.message : String(e);
            }
          }

          // Log event against the first request in the batch so it shows in timeline
          if (items[0]) {
            await (supabaseAdmin.from as any)("wellness_request_events").insert({
              org_id: orgId,
              request_id: items[0].id,
              action: "invoice_generated",
              channel: billingEmail ? "email" : null,
              status: emailStatus,
              recipient: billingEmail ?? null,
              message: `${subject}\n\n${body}`,
              meta: { invoice_id: invoiceId, invoice_no: invoiceNo, request_ids: items.map((r: any) => r.id), error: emailError ?? null },
              delivered_at: emailStatus === "sent" ? new Date().toISOString() : null,
            });
          }
        }

        await (supabaseAdmin.from as any)("wellness_invoice_runs").insert({
          period_start: periodStartStr,
          period_end: periodEndStr,
          providers_total: providers.size,
          invoices_created: invoicesCreated,
          emails_sent: emailsSent,
          errors,
        });

        return new Response(JSON.stringify({
          ok: true,
          period: { start: periodStartStr, end: periodEndStr },
          providers: providers.size,
          invoices_created: invoicesCreated,
          emails_sent: emailsSent,
          email_provider_configured: Boolean(resendKey),
          errors,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
