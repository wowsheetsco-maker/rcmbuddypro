# RCM Buddy Sheet (v7) vs rcmbuddy.pro — Parity & Gap Analysis

This is an analysis, not a build. If you approve, I'll turn any section (or the P1 gaps) into an implementation plan.

## 1. What's already in rcmbuddy.pro (parity or better than the Sheet)

| Sheet v7 module | rcmbuddy.pro equivalent | Verdict |
|---|---|---|
| Import & Clean Data | `ImportClaimsPage` + `claimsImport.ts` (validation, dedupe, DQ rules) | **Better** — multi-tenant, DB-backed, audit trail |
| AR Aging | `ArManagementPage` + `arPolicy`/`arPrioritization` | **Better** — buckets + prioritized worklist |
| Payer Scorecard | `PayerScorecardPage` + `payerScorecard.ts` (grades, benchmarks, snapshots, monthly trend) | **Better** — composite score, peer overlay, talking points |
| Follow-up List | `FollowUpEnginePage` + automation + calendar | **Better** — engine, cadences, WhatsApp/email |
| Denial Tracker | `DenialsPage` + `DenialWorkflowPage` + `AppealsTrackerPage` + code library | **Better** — code tagging, playbook, checklist w/ due dates |
| IRDAI TAT Tracker | `is_irdai_breach` flag + breach counters in scorecard/dashboard | **Parity** |
| Cash Flow Forecast | `CashFlowPage` | **Parity** |
| TDS Reconciliation | `TdsReportPage` + reconciliation alerts | **Better** — rule-based short-pay/TDS alerts |
| Dept Analytics | `Dashboard` / drill-downs | **Parity** |
| Daily Work Queue | `TodaysWorklistPage` + `MyTasksPage` + `PriorityWorklistPage` | **Better** — SLA, stuck chip, per-user allocation |
| Query Register | `QueryPage` | **Parity** |
| Staff Performance | `StaffScorecardPage` + `SubmissionTatPage` (doctor/ward/coder) | **Better** |
| Monthly Snapshot | `payerSnapshots.ts` (12-month rolling) | **Parity** |
| Mgmt Report Email | `PdfExportDialog` + `teamDigests` + `send-team-digest` fn | **Parity** |
| Board Deck (Slides) | PDF export of Exec Dashboard | Parity for content, not Slides format |
| IRDAI Complaint / Denial Appeal Letters | `denialAiAppeal.functions.ts` (AI drafts) + Appeals tracker | **Better** — AI-assisted |
| TPA Follow-up Emails / 90-Day Escalation | `send-outstanding-reminder`, `dispatch-tpa-reminders`, `send-discrepancy-bulk` | **Better** |
| WhatsApp Msg Generator | `whatsapp.functions.ts` + templates + delivery webhook | **Better** — real API, not link-only |
| Patient Payment Reminders | Outstanding reminders + wellness invoices | **Parity** |
| Empanelment Expiry Alerts | `TpaInsurersPage` + reminder schedules | **Parity** |
| Daily Claim Digest | Team digests + notifications | **Parity** |
| Weekly Team Scorecard | Team digests | **Parity** |
| Health Check / Setup Checker | `admin/GoNoGoPage`, `AccessCheckerPage` | **Parity** |
| Triggers (cron) | `pg_cron` → `/api/public/hooks/*` | **Better** — proper cron infra |
| Multi-tenancy / roles | Full org/branch/role/subrole matrix, RLS | **Sheet doesn't have this at all** |

## 2. Gaps — in the Sheet but missing (or weaker) in rcmbuddy.pro

### P1 — Real revenue impact, small effort
1. **Revenue Leakage Detector** (`refreshRevenueLeakage`) — dedicated sheet listing every leakage type (short-pay, TDS gap, missing UTR, zero-approved on discharged, package under-billing). We have partial coverage in Recon Alerts; needs a **single "Leakage Dashboard"** rolling all detectors into ₹ recovered-if-fixed.
2. **Advanced Reconciliation** — bank UTR ↔ settled claim matcher (`BankReconciliationPage` exists, but Sheet's version does fuzzy amount+date+payer matching and flags unallocated credits). Add fuzzy match + unallocated bucket.
3. **Executive Exceptions** — one-page "things that shouldn't exist" (approved-but-not-submitted >7d, settled-but-not-updated, denied-without-appeal, patient discharged but no claim). This is different from KPIs — it's an exception feed. Not currently a dedicated view.
4. **Top Policy Holders / Corporate ranking by patient** — `refreshTopPolicyHolders` ranks payers by unique patients + LTV. We have unique patients per payer but no "chronic patient / repeat family" view.
5. **Zero & Cancelled register** — dedicated audit of ₹0 approvals + cancelled claims with reason. Currently excluded from metrics; should be **visible for audit**, not hidden.

### P2 — Operational polish
6. **Ombudsman Cases workbook** — auto-populate claims >180 days into an Ombudsman filing tracker with deadlines. Missing.
7. **Pre-Auth Tracker** — the Sheet has one. You've explicitly positioned rcmbuddy as post-discharge, but a **light pre-auth ↔ discharge reconciliation** (was pre-auth taken? did discharge happen within validity?) closes a leakage loop.
8. **FY-aware reporting** (Indian Apr–Mar). Sheet uses `getFY_`; rcmbuddy uses calendar year in trend/monthly. Add FY toggle on Executive Dashboard, Benchmarks, Payer Scorecard.
9. **Data Quality Auditor sheet** — DQ rules exist (`useDqRules`), but there's no **"here's every dirty row with the fix"** page. Add a DQ inbox view.
10. **Log Claim Action dialog** — quick free-text action log per claim from any screen (Sheet has a modal). We have edit history but no "log a phone call / note" one-click on every claim card.

### P3 — Nice to have
11. **Google Slides Board Deck** — auto-generate 8-slide PPTX/Slides for CMD/Board (not just PDF). Different asset than the current PDF export.
12. **Version / release notes viewer inside app** ("What's new") — the Sheet has `checkForUpdates`.
13. **Onboarding wizard modal** — step-by-step first-run for new hospitals (SMTP, RCM email, TPA contacts, first import). We have GoNoGo but not a guided wizard.
14. **Bulk denial appeal generator** — "one document, all denied claims, grouped by payer." AI appeal exists per-claim; add a **bulk pack** export.
15. **Empanelment expiry auto-email** — schedules exist, but a dedicated 60/30/7-day cadence for empanelment renewal is worth first-classing.

## 3. Things rcmbuddy.pro does that the Sheet cannot

Worth marketing hard — these are the moat:
- Multi-hospital, multi-branch, RLS-isolated
- Role/subrole permission matrix + audit-checkable access
- Real AI (denial appeals, follow-up enhancement) with PII redaction
- Live realtime claims (`useLiveClaims`) vs polled recalcs
- WhatsApp Business API delivery (not `wa.me` links)
- Cron-driven dispatch (reminders, digests, wellness monthly invoices)
- OPD/Wellness/Corporate/Gov Schemes verticals — entire product lines the Sheet has no notion of
- Appeals tracker with per-payer playbook + checklist + due-date reminders
- Payer benchmarks with peer overlay + snapshot deltas
- Submission TAT by doctor/ward/coder (just shipped)
- Mobile app view

## 4. Suggested next build order (if you want me to close the gaps)

Recommended sprint: **P1 items #1, #2, #3, #5 + P2 #8 (FY toggle)** — biggest revenue signal, ~1 focused build cycle each, all pure frontend/derivation from existing `claims` data (no schema changes).

Ombudsman (#6) and Pre-Auth reconciliation (#7) are the next tier and do need small schema additions.

---

Want me to convert P1 (Leakage Dashboard + Fuzzy Bank Recon + Executive Exceptions + Zero/Cancelled Register + FY toggle) into a concrete build plan?
