## Simplified Wellness / OPD module

Replace the existing 15+ OPD pages with a focused 5-screen workflow. Old DB tables stay (no data loss) but old pages are removed from navigation.

### Screens

1. **Providers & Contracts**
   - List wellness providers (corporates / payors) with contract dates, billing cycle, contact person, email, phone.
   - Reuses `opd_corporates` table (already has these fields).
   - Add / edit / archive.

2. **Packages**
   - Per-provider package catalogue (name, type: Consultation / Health Check, price, includes).
   - New table `wellness_packages` linked to corporate.

3. **Requests Inbox** (the heart of the module)
   - Auto-pulls new emails from connected Gmail (label filter, e.g. `Wellness`) every 5 min via cron → creates rows in `wellness_requests`.
   - Manual "Add request" button as fallback.
   - Each row: client name, contact, requested service, provider, status (`new`, `confirmed`, `cancelled`, `rescheduled`, `completed`).
   - Row actions: **Confirm**, **Cancel**, **Reschedule** → opens dialog → on submit sends:
     - Email (Lovable Emails)
     - WhatsApp (existing `whatsapp.functions` integration)
     - "Call" button = `tel:` link (no backend call needed)
   - After consultation/health check: **Send Report** action → upload PDF → emails + WhatsApps it to client, marks request `completed`.

4. **Invoices** (monthly, per provider)
   - "Generate monthly invoice" picks a provider + month → aggregates all `completed` requests in that period × package price → creates invoice → email to provider's billing contact.
   - Excel + PDF export (reuse existing `opdInvoiceExport.ts`).

5. **Management Dashboard**
   - Month filter + per-provider breakdown: requests received, confirmed, completed, cancelled, revenue, outstanding.
   - PDF export button.

### Technical details

**Database migration**
- New table `wellness_packages` (corporate_id, name, type, price, description, active).
- New table `wellness_requests` (corporate_id, package_id, client_name, client_email, client_phone, requested_at, scheduled_at, status, source: `email`/`manual`, source_message_id, report_url, report_sent_at, confirmation_sent_at, notes).
- New table `wellness_gmail_sync` (single row per org: last_history_id, label_filter, enabled).
- RLS: org-scoped, same pattern as existing OPD tables.

**Gmail intake**
- Connect Google Mail via `standard_connectors--connect` (`google_mail`).
- Server route `/api/public/hooks/wellness-gmail-poll` — lists unread messages matching configured query (default `label:wellness is:unread newer_than:7d`), extracts sender / subject / snippet, inserts into `wellness_requests`, marks message read.
- pg_cron schedule every 5 minutes.

**Client messaging**
- Email: scaffold transactional template `wellness-confirmation`, `wellness-reschedule`, `wellness-cancellation`, `wellness-report`.
- WhatsApp: reuse `src/lib/whatsapp.functions.ts` `sendWhatsAppMessage`.
- Call: `tel:` link in UI.

**Report upload**
- Storage bucket `wellness-reports` (private, signed URL for client email).

**Navigation cleanup**
- `OpdLanding.tsx` becomes a 5-tile hub for the new screens.
- Remove old OPD pages from `_LegacyApp.tsx` routes; keep files in place (unreferenced) so no build break, but they won't be reachable.

### Files

**New**
- `src/pages/wellness/WellnessProvidersPage.tsx` (thin wrapper around existing corporates query)
- `src/pages/wellness/WellnessPackagesPage.tsx`
- `src/pages/wellness/WellnessRequestsPage.tsx` (Inbox + actions)
- `src/pages/wellness/WellnessInvoicesPage.tsx`
- `src/pages/wellness/WellnessDashboardPage.tsx`
- `src/routes/api/public/hooks/wellness-gmail-poll.ts`
- `src/lib/wellnessMessaging.ts` (helpers wrapping email + WhatsApp sends)
- `src/lib/email-templates/wellness-confirmation.tsx` (+ reschedule / cancel / report)

**Modified**
- `src/pages/opd/OpdLanding.tsx` — replace tile grid with 5 new tiles.
- `src/_LegacyApp.tsx` — register new routes, remove old OPD routes.

**Migration**
- 3 new tables + RLS + storage bucket + pg_cron job.

### Order of operations

1. DB migration (tables + bucket + cron).
2. Connect Gmail connector (will prompt you).
3. Build screens 1→5.
4. Build Gmail poll route + reminder templates.
5. Rewire `OpdLanding` and routes.

I'll need you to connect your Gmail account when prompted (mid-build). Estimated end state: ~6 new files, 1 migration, old OPD UI hidden.

Approve to proceed.
