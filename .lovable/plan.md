# RCM Buddy Pro — Full 1:1 Port

## Scope at a glance

The uploaded project (`rcm-buddy-pro-614b913a-main`) is a Vite + React Router app with:

- **56 pages** across claims, analytics, communications, gov-schemes, OPD, providers, settings, admin, AI, executive, mobile
- **52 custom components** (drawers, dialogs, command palette, sidebar, etc.) + shadcn UI
- **37 custom hooks** for data + permissions + notifications
- **30+ lib modules** (CSV import/export, metrics, denial analytics, Excel reports, playbooks, WhatsApp, smart reports)
- **27 Supabase migrations** (multi-tenant orgs, RBAC, claims, denials, discrepancies, contacts, reminders, audit, etc.)
- **10 edge functions** (AI generate/enhance, send AI draft email, send discrepancy bulk, outstanding/TPA reminders, team digest, SMTP test, scheduled dispatchers)
- **3 public API webhooks** (notifications dispatch, team digests, WhatsApp delivery)
- Auth (email/password, forgot/reset), multi-org "acting role" switcher, branch picker, onboarding checklist, command palette, theme switcher
- ~40k LOC total

The current template is **TanStack Start v1** (not Vite-React-Router). Routing, server-side, and auth must be rewritten to TanStack idioms; UI components and lib logic port directly.

## Target architecture

- Routing: file-based under `src/routes/` with `_authenticated` layout for the app shell; public routes for `/`, `/login`, `/forgot-password`, `/reset-password`
- Backend: Lovable Cloud (Supabase). All 27 migrations ported to one consolidated migration set; RLS preserved
- Server-side logic: edge functions converted to `createServerFn` under `src/lib/*.functions.ts`; the 3 public webhooks become TSS server routes at `src/routes/api/public/hooks/*.ts`
- Email/AI: Lovable AI Gateway for AI; existing SMTP secrets re-added via `add_secret` (user will provide)
- State: TanStack Query everywhere; auth context via `onAuthStateChange` listener in `__root.tsx`

## Phased delivery

Because of the size (~40k LOC), I will deliver in phases and verify each before moving on. After every phase, the app builds and the new surface is usable.

**Phase 1 — Foundation**
- Enable Lovable Cloud
- Port all 27 SQL migrations (schema, RLS, security-definer functions, triggers)
- Copy `src/assets/` (logos)
- Auth pages (`/login`, `/forgot-password`, `/reset-password`) + `_authenticated` layout
- App shell: `AppLayout`, `AppHeader`, `AppSidebar`, `ActingRoleSwitcher`, `BranchPicker`, `ThemeSwitcher`, `NotificationBell`, `CommandPalette`
- Landing page (`/`)
- Core hooks: `useActingUser`, `useHasPermission`, `useIsPlatformAdmin`, `useAppSettings`, `useOnboardingChecklist`

**Phase 2 — Claims core**
- `ClaimsPage`, `ClaimDrawer`, `ClaimEditDialog`, `ClaimDocumentsPanel`
- Claims CSV import/export (`ImportClaimsPage`, `claimsCsv.ts`, `claimsImport.ts`)
- `PriorityWorklistPage`, `TodaysWorklistPage`, `MyTasksPage`, `Dashboard`
- Hooks: `useClaimsPage`, `usePriorityWorklistPage`, `useLiveClaims`, `useMyTasks`
- Lib: `claimMetrics`, `claimEditHistory`, `claimQualityRules`, `dataQualityEngine`

**Phase 3 — Denials, discrepancies, data quality, queries, TDS**
- `DenialsPage`, `DiscrepancyTrackerPage`, `DataQualityPage`, `QueryPage`, `TdsReportPage`
- Drawers: `DiscrepancyActionDrawer`, `PlaybookDrawer`, `ChecklistDialog`
- Lib: `denialAnalytics`, `discrepancy`, `discrepancyExport`, `playbookMatch`

**Phase 4 — Analytics**
- All 6 analytics pages (CashFlow, CorporatePerformance, PayerScorecard, StaffScorecard, TpaReport, TrendsAnalytics) + `ExecutiveDashboard`
- Drilldown drawers (Corporate, Insurer, Executive)
- Charts (Recharts), `Sparkline`, `KpiCard`, smart-report Excel export
- Lib: `payerScorecard`, `payerBenchmarks`, `payerSnapshots`, `payerTrends`, `corporateStats`, `trendsAnalytics`, `denialAnalytics`, `smartReportExcel`, `smartReports`, `tpaReportExport`

**Phase 5 — Communications + AI**
- 5 communications pages (AiReply, Automation, FollowUpCalendar, FollowUpEngine, OutstandingReminders)
- AI Center + AI Creation pages
- Composers: `AiDraftLauncher`, `AiEmailSendDialog`, `AiToolDialog`, `BulkFollowUpComposer`, `DiscrepancyBulkComposer`, `WhatsAppComposerDialog`, `SavedDraftsDialog`, `ReminderRuleDialog`, `SmartReportDialog`
- Server fns (replacing edge functions): `ai-generate`, `ai-enhance-followup`, `send-ai-draft-email`, `send-discrepancy-bulk`, `send-outstanding-reminder`, `send-team-digest`, `smtp-test`, `dispatch-scheduled-reminders`, `dispatch-tpa-reminders` → all `*.functions.ts`
- Public webhooks → server routes at `src/routes/api/public/hooks/*`
- AI provider via Lovable AI Gateway

**Phase 6 — Gov schemes, OPD, providers**
- Gov schemes landing + Claims/PreAuth/Packages
- OPD landing + Visits/Corporates/BulkSubmit
- Providers: Contacts (+ CSV import), TPA/Insurers (+ profile drawer, import/export, payer compare)

**Phase 7 — Settings + Admin**
- 14 settings pages (Users, Permissions, EffectivePermissions, HospitalBranches, Notifications, Integrations, MyEmail, SubjectTemplates, WhatsAppTemplates, AiProviders, TeamDigests, DqRules, FollowupAutomation, DataManagement)
- 3 admin pages (ControlPanel, GoNoGo, OrgAccess)
- Mobile pages (`MobileHomePage`, `MobileFollowUpPage`) + `MobileActionDock`, `SwipeableCard`

**Phase 8 — Polish & QA**
- Wire `CommandPalette` to all routes
- Onboarding checklist
- Permission gates on every route via `_authenticated/$.tsx` + `useHasPermission`
- Manual smoke pass on each page, fix runtime errors
- Build verification

## Technical notes

- **Routing rewrite**: every page becomes a `createFileRoute("/_authenticated/<path>")`. Sub-paths like `/claims/priority` map to `src/routes/_authenticated/claims/priority.tsx`. Dynamic IDs become `$id` segments. Hash anchors avoided.
- **react-router-dom → @tanstack/react-router**: a thin compat layer (`router-compat.tsx`) already exists in the source — I'll port it so internal components keep using `Link`/`useNavigate` without per-file rewrites where possible, but pages will be migrated to native TanStack APIs.
- **Edge functions → server functions**: bodies are reused verbatim with imports swapped from `Deno.env` to `process.env` and `serve()` wrapper replaced with `createServerFn` + Zod input validators + `requireSupabaseAuth` (or admin client for system-triggered ones).
- **Secrets needed** (will request via `add_secret` when reached): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Phase 5). AI uses `LOVABLE_API_KEY` (already present).
- **Scheduled dispatchers** (`dispatch-scheduled-reminders`, `dispatch-tpa-reminders`): exposed as `/api/public/cron/*` with a shared `CRON_SECRET` header check; user wires pg_cron later.
- **Tests/E2E**: the source includes Cypress + Playwright + Vitest configs. Not ported in this plan (out of scope for "recreate the app"). Can be added on request after Phase 8.
- **Excluded from port**: `_LegacyApp.tsx`, `Index.tsx` (placeholder), `PlaceholderPage.tsx`, `LaunchPage.tsx` (legacy launcher), source's `cypress/` `e2e/` `scripts/` folders.

## What I need from you to start

Nothing — I have everything to begin Phase 1 once you switch to build mode. SMTP credentials will be requested at Phase 5; until then everything runs against Lovable Cloud + AI Gateway.

Approve this plan and switch to build mode to start with Phase 1 (Foundation).
