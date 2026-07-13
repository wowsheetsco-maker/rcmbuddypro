## Overview

Five related enhancements. Several already exist as pages — the work is to close specific gaps you named (alert rules, code tagging, SLA reminders, benchmark charts, and a Docs-to-Submit tab), not to rebuild them.

Since these are all substantial, I want to confirm scope before writing code so we don't sprawl. Below is what I'd build, in the order I'd ship it.

---

### 1. Docs-to-Submit tab in Claims menu (smallest, do first)

- New route `/_authenticated/claims/docs-to-submit` → `DocsToSubmitPage`.
- Uses existing `isDocsToSubmit()` from `claimStatusBuckets.ts` (approved status + discharged, not yet submitted).
- Table: claim no, patient, discharge date, days since discharge, approved amount, payer, assignee. Row action → "Mark submitted" (opens submission drawer).
- Add "Docs to Submit" link in the Claims sidebar group with a live count badge.

### 2. Reconciliation alert rules (settlement + TDS shortfall)

- Add `reconciliation_alerts` table (org-scoped, RLS + grants) with rule config: threshold % variance, TDS-tolerance %, notify channel.
- Server fn `evaluateReconciliationAlerts` — on each settled claim, compute expected = approved − expected_TDS; if settled < expected − tolerance, insert a notification row.
- UI: alert rules panel in Settings → Notifications, alert inbox surfaced on Bank Reconciliation page (extends existing page, no new nav).
- No cron yet — evaluate on claim update trigger + on-demand "Re-scan" button.

### 3. Denial recovery workflow upgrades

- Extend existing `DenialWorkflowPage`: add denial-code multi-select per claim (dictionary already in `data/denialCodes.ts`).
- Appeal status column (draft → submitted → accepted/rejected) writing to existing `claim_appeals` table.
- "Suggested next action" panel — reuses `playbookMatch.ts` + payer from `insurerProfiles.ts` to render 2–3 concrete steps.

### 4. Stuck-claims worklist with SLA

- Extend `PriorityWorklistPage` (do not create new route): add filter chip "Stuck" that limits to Processing / Claim in Progress / Settlement Initiated where `days_since_last_update > sla_days` (configurable per payer, default 15).
- Row badge shows SLA breach severity. "Send reminder" button writes a follow-up + optional WhatsApp/email via existing `whatsapp.functions` / reminders pipeline.
- Nightly cron (`pg_cron` → existing dispatch-notifications hook) emails owners of breached rows.

### 5. Payer & TPA benchmark dashboards

- Extend existing `PayerScorecardPage` + `TpaReportPage`:
  - Add month-by-month trend chart (denial rate %, avg turnaround days, net realization %) — data already available via `payerTrends.ts` + `payerBenchmarks.ts`.
  - Add a "vs peer average" column so each payer/TPA can be benchmarked against the org average.
- No new routes needed.

---

## Technical notes

- One migration: `reconciliation_alerts` table + `reconciliation_alert_events` log, both with `org_id` + RLS + GRANTs.
- No new secrets; alerts reuse existing notification pipeline.
- All logic goes through `createServerFn` (no edge functions).
- Extend, don't duplicate — most of the surface area already exists (`DenialWorkflowPage`, `PriorityWorklistPage`, `PayerScorecardPage`, `TpaReportPage`, `BankReconciliationPage`).

---

## Questions before I start

1. **Scope:** ship all 5, or start with #1 + #2 (the two you'll see value from fastest) and queue the rest?
2. **Alert delivery:** in-app only, or also email/WhatsApp on first pass?
3. **Stuck-claim SLA default:** 15 days good, or a different threshold per stage (Processing 10, Settlement Initiated 30)?
