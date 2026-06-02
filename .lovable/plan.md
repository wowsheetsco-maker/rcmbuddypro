## Wellness / OPD — full build plan

The spec covers ~9 functional areas. Rather than one huge migration + 20 pages in a single turn (high risk of breakage), I'll ship it in 4 phases. Each phase is independently usable and leaves the app green.

### Phase 1 — Data model (1 migration)

Extend existing tables and add what's missing:

- `opd_corporates` — add `hr_contact_name/email/phone`, `billing_contact_name/email/phone`, `employee_limit`, `dependents_allowed`, `invoice_cycle` (monthly/quarterly), `package_id`.
- `opd_employees` — already exists; ensure `status`, `department`, `mobile`, `email`, `corporate_id`. Add if missing.
- New `opd_dependents` (employee_id, relation [spouse/child/parent], name, dob, gender, is_active).
- New `opd_appointments` (corporate_id, employee_id, provider, specialty, scheduled_at, status [booked/confirmed/rescheduled/cancelled/completed/no_show], provider_confirmed_at, reminder_24h_sent_at, reminder_same_day_sent_at, notes).
- New `opd_reports` (appointment_id OR visit_id, stage [awaiting_provider/received/qc/sent_employee/sent_corporate/closed], received_at, qc_at, sent_employee_at, sent_corporate_at, sla_target_at, file_path, file_name).
- New `opd_invoices` (corporate_id, invoice_no, period_start, period_end, visit_count, gross_amount, tax_amount, total_amount, due_date, status [draft/submitted/part_paid/paid/outstanding], paid_amount, generated_at, submitted_at).
- New `opd_invoice_items` (invoice_id, visit_id, amount).
- New `opd_followup_tasks` (entity_type [appointment/report/invoice/payment], entity_id, title, due_at, assigned_to app_user_id, status [open/done], completed_at).

All tables: org_id NOT NULL, full GRANT + RLS via `is_org_member(org_id)` matching existing OPD tables.

### Phase 2 — Operational pages

1. **Eligibility Check** (`/opd/eligibility`) — search by Employee ID / mobile / corporate, instant ✅/❌ card with employee + dependents + corporate validity dates.
2. **Outstanding Follow-Up Dashboard** (`/opd/follow-up`) — 4 tile groups (Appointments / Reports / Invoices / Payments) with drill-through lists.
3. **Report Tracking** (`/opd/reports`) — workflow board with RAG SLA chips (green <24h, amber 24-72h, red >72h).
4. **Appointments** (`/opd/appointments`) — list + capture, status pipeline, provider-confirmation toggle, manual "send reminder" action.

### Phase 3 — Revenue & invoicing

5. **Invoices** (`/opd/invoices`) — list with status pipeline + aging; "Generate bulk invoice" dialog (corporate + period → preview visit count & amount → create draft → submit).
6. **Invoice detail** drawer — items, status transitions, payment recording.
7. Hook into existing OPD analytics for **Corporate-wise revenue + utilization** widgets.

### Phase 4 — Tasks & wellness events

8. **Follow-Up Tasks** (`/opd/tasks`) — Kanban / list, assign to team members, due dates, source entity link.
9. **Wellness Events** — extend existing `WellnessEventsPage` with outcomes (screened, abnormal, follow-up required), team assignment, attendance log.
10. **Navigation polish** — OPD landing tile grid matches the recommended menu in the spec (Dashboard / Corporates / Employees / Eligibility / Appointments / Visits / Reports / Follow-Up / Invoices / Events / Analytics).

### What I will NOT change

- Existing Visits / AHC / Bulk Submit / Corporates / Employees pages stay as-is; new pages link to them.
- Auth, gov-schemes, claims modules untouched.

### Sequencing

I'll ship Phase 1 (single migration) first and wait for your approval, then Phases 2–4 as separate batches so each is reviewable. Each phase is ~half a day of work.

**Confirm and I'll start with the Phase 1 migration.**
