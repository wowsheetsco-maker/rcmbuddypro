import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, type ComponentType, type ReactElement } from "react";
import { useLocation, useNavigate, Navigate } from "@/lib/router-compat";
import { useViewMode } from "./hooks/useViewMode";

import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import ClaimsPage from "./pages/ClaimsPage";
import NotFound from "./pages/NotFound.tsx";
// Analytics
import PayerScorecardPage from "./pages/analytics/PayerScorecardPage";
import TpaReportPage from "./pages/analytics/TpaReportPage";
import CashFlowPage from "./pages/analytics/CashFlowPage";
import CorporatePerformancePage from "./pages/analytics/CorporatePerformancePage";
import TrendsAnalyticsPage from "./pages/analytics/TrendsAnalyticsPage";
import StaffScorecardPage from "./pages/analytics/StaffScorecardPage";
// Claims sub-pages
import PriorityWorklistPage from "./pages/claims/PriorityWorklistPage";
import DenialsPage from "./pages/claims/DenialsPage";

import TdsReportPage from "./pages/claims/TdsReportPage";
import ImportClaimsPage from "./pages/claims/ImportClaimsPage";
import DataQualityPage from "./pages/claims/DataQualityPage";
import DiscrepancyTrackerPage from "./pages/claims/DiscrepancyTrackerPage";
import QueryPage from "./pages/claims/QueryPage";
// Communications
import FollowUpCalendarPage from "./pages/communications/FollowUpCalendarPage";
import AiReplyPage from "./pages/communications/AiReplyPage";
import OutstandingRemindersPage from "./pages/communications/OutstandingRemindersPage";
import FollowUpEnginePage from "./pages/communications/FollowUpEnginePage";
import AutomationPage from "./pages/communications/AutomationPage";
import MobileFollowUpPage from "./pages/MobileFollowUpPage";
// Providers
import TpaInsurersPage from "./pages/providers/TpaInsurersPage";
import ContactsPage from "./pages/providers/ContactsPage";
// Settings
import UsersPage from "./pages/settings/UsersPage";
import PermissionsPage from "./pages/settings/PermissionsPage";
import EffectivePermissionsPage from "./pages/settings/EffectivePermissionsPage";
import IntegrationsPage from "./pages/settings/IntegrationsPage";
import NotificationsPage from "./pages/settings/NotificationsPage";
import DqRulesPage from "./pages/settings/DqRulesPage";
import AiProvidersPage from "./pages/settings/AiProvidersPage";
import SubjectTemplatesPage from "./pages/settings/SubjectTemplatesPage";
import HospitalBranchesPage from "./pages/settings/HospitalBranchesPage";
import MyEmailPage from "./pages/settings/MyEmailPage";
import FollowupAutomationPage from "./pages/settings/FollowupAutomationPage";
import TeamDigestsPage from "./pages/settings/TeamDigestsPage";
import WhatsAppTemplatesPage from "./pages/settings/WhatsAppTemplatesPage";
import DataManagementPage from "./pages/settings/DataManagementPage";
// AI Center
import AiCenterPage from "./pages/AiCenterPage";
import AiCreationPage from "./pages/ai/AiCreationPage";
// My Tasks
import MyTasksPage from "./pages/MyTasksPage";
// Mobile home
import MobileHomePage from "./pages/MobileHomePage";
import TodaysWorklistPage from "./pages/TodaysWorklistPage";
// Admin Control Panel (platform-admin only)
import ControlPanelPage from "./pages/admin/ControlPanelPage";
import GoNoGoPage from "./pages/admin/GoNoGoPage";
import OrgAccessPage from "./pages/admin/OrgAccessPage";
import PromoteUserPage from "./pages/admin/PromoteUserPage";
import RolesMatrixPage from "./pages/admin/RolesMatrixPage";
import AccessCheckerPage from "./pages/admin/AccessCheckerPage";
import LaunchPage from "./pages/LaunchPage";
// Gov Schemes + OPD/Wellness
import GovSchemesLanding from "./pages/gov-schemes/GovSchemesLanding";
import GovPreAuthPage from "./pages/gov-schemes/GovPreAuthPage";
import GovClaimsPage from "./pages/gov-schemes/GovClaimsPage";
import GovPackagesPage from "./pages/gov-schemes/GovPackagesPage";
import OpdLanding from "./pages/opd/OpdLanding";
import OpdVisitsPage from "./pages/opd/OpdVisitsPage";
import OpdVisitCapturePage from "./pages/opd/OpdVisitCapturePage";
import OpdVisitImportPage from "./pages/opd/OpdVisitImportPage";
import OpdCorporatesPage from "./pages/opd/OpdCorporatesPage";
import OpdBulkSubmitPage from "./pages/opd/OpdBulkSubmitPage";
import OpdEmployeesPage from "./pages/opd/OpdEmployeesPage";
import OpdEligibilitySyncPage from "./pages/opd/OpdEligibilitySyncPage";
import AhcPackagesPage from "./pages/opd/AhcPackagesPage";
import AhcBookingsPage from "./pages/opd/AhcBookingsPage";
import WellnessEventsPage from "./pages/opd/WellnessEventsPage";
import OpdAnalyticsPage from "./pages/opd/OpdAnalyticsPage";
import OpdEligibilityCheckPage from "./pages/opd/OpdEligibilityCheckPage";
import OpdAppointmentsPage from "./pages/opd/OpdAppointmentsPage";
import OpdReportsPage from "./pages/opd/OpdReportsPage";
import OpdFollowUpPage from "./pages/opd/OpdFollowUpPage";
import OpdInvoicesPage from "./pages/opd/OpdInvoicesPage";
import OpdTasksPage from "./pages/opd/OpdTasksPage";
import PlaceholderPage from "./pages/PlaceholderPage";

// suppress unused-import warnings — kept for reference and future use
void OutstandingRemindersPage;

const REDIRECT_GATE = "rcm-mobile-redirected";
const DESKTOP_HOME_ROUTES = new Set<string>(["/", "/dashboard/executive"]);

function isDeepLink(pathname: string): boolean {
  if (pathname === "/m") return false;
  if (DESKTOP_HOME_ROUTES.has(pathname)) return false;
  return pathname.length > 1;
}

function MobileRedirect() {
  const { isMobile, override } = useViewMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (override === "desktop") {
      try { sessionStorage.removeItem(REDIRECT_GATE); } catch { /* noop */ }
    }
  }, [override]);

  useEffect(() => {
    if (!isMobile) return;
    if (override === "desktop") return;
    if (location.pathname === "/m") return;
    if (isDeepLink(location.pathname)) return;
    if (!DESKTOP_HOME_ROUTES.has(location.pathname)) return;
    try {
      if (sessionStorage.getItem(REDIRECT_GATE)) return;
      sessionStorage.setItem(REDIRECT_GATE, "1");
    } catch { /* noop */ }
    navigate("/m", { replace: true });
  }, [isMobile, override, location.pathname, navigate]);
  return null;
}

/**
 * Path → component table. Any string keys are treated as exact-match paths.
 * Functions return the rendered element (e.g. for redirects).
 */
type RouteEntry = ComponentType | (() => ReactElement);

const ROUTES: Record<string, RouteEntry> = {
  "/": ExecutiveDashboard,
  "/launch": LaunchPage,
  "/m": MobileHomePage,
  "/my-tasks": MyTasksPage,
  "/today": TodaysWorklistPage,
  "/dashboard/executive": ExecutiveDashboard,
  "/claims": ClaimsPage,

  // Hub landing redirects
  "/recovery": () => <Navigate to="/claims/discrepancy" replace />,
  "/analytics": () => <Navigate to="/analytics/cash-flow" replace />,
  "/network": () => <Navigate to="/providers" replace />,
  "/team": () => <Navigate to="/settings/users" replace />,

  // Analytics
  "/analytics/cash-flow": CashFlowPage,
  "/analytics/payer-scorecard": PayerScorecardPage,
  "/analytics/tpa-report": TpaReportPage,
  "/analytics/corporate": CorporatePerformancePage,
  "/analytics/health-score": () => <Navigate to="/analytics/cash-flow" replace />,
  "/analytics/trends": TrendsAnalyticsPage,
  "/analytics/staff-scorecard": StaffScorecardPage,

  // Claims sub-pages
  "/claims/priority": PriorityWorklistPage,
  "/claims/outstanding": FollowUpEnginePage,
  "/claims/follow-up": FollowUpCalendarPage,
  "/claims/denials": DenialsPage,
  
  "/claims/tds": TdsReportPage,
  "/claims/import": ImportClaimsPage,
  "/claims/data-quality": DataQualityPage,
  "/claims/discrepancy": DiscrepancyTrackerPage,
  "/claims/query": QueryPage,

  // Communications
  "/communications/calendar": FollowUpCalendarPage,
  "/communications/ai-reply": AiReplyPage,
  // Outstanding moved into Claims module — keep old URL working.
  "/communications/outstanding-reminders": () => <Navigate to="/claims/outstanding" replace />,
  "/communications/follow-up-engine": () => <Navigate to="/claims/outstanding" replace />,
  "/communications/automation": AutomationPage,
  "/communications": () => <Navigate to="/communications/calendar" replace />,
  "/communications/denial-appeal": () => <Navigate to="/communications/ai-reply" replace />,
  "/follow-up": MobileFollowUpPage,

  // Providers
  "/providers": TpaInsurersPage,
  "/providers/contacts": ContactsPage,
  "/providers/corporates": () => <Navigate to="/providers" replace />,
  "/providers/contracts": () => <Navigate to="/providers" replace />,

  // Settings
  "/settings/users": UsersPage,
  "/settings/permissions": PermissionsPage,
  "/settings/effective-permissions": EffectivePermissionsPage,
  "/settings/integrations": IntegrationsPage,
  "/settings/notifications": NotificationsPage,
  "/settings/dq-rules": DqRulesPage,
  "/settings/ai-providers": AiProvidersPage,
  "/settings/subject-templates": SubjectTemplatesPage,
  "/settings/hospital-branches": HospitalBranchesPage,
  "/settings/my-email": MyEmailPage,
  "/settings/followup-automation": FollowupAutomationPage,
  "/settings/team-digests": TeamDigestsPage,
  "/settings/whatsapp-templates": WhatsAppTemplatesPage,
  "/settings/data-management": DataManagementPage,
  "/settings/subscription": () => <Navigate to="/settings/users" replace />,

  // AI
  "/ai-center": AiCenterPage,
  "/ai-studio/create": AiCreationPage,
  "/ai-studio": () => <Navigate to="/ai-studio/create" replace />,

  // Admin
  "/admin": ControlPanelPage,
  "/admin/hospitals": ControlPanelPage,
  "/admin/users": ControlPanelPage,
  "/admin/plans": ControlPanelPage,
  "/admin/tokens": ControlPanelPage,
  "/admin/performance": ControlPanelPage,
  "/admin/go-no-go": GoNoGoPage,
  "/admin/org-access": OrgAccessPage,
  "/admin/promote-user": PromoteUserPage,
  "/admin/roles-matrix": RolesMatrixPage,
  "/admin/access-checker": AccessCheckerPage,

  // Government Schemes (Phase 1 scaffold)
  "/gov-schemes": GovSchemesLanding,
  "/gov-schemes/dashboard": GovSchemesLanding,
  "/gov-schemes/pre-auth": GovPreAuthPage,
  "/gov-schemes/claims": GovClaimsPage,
  "/gov-schemes/packages": GovPackagesPage,
  "/gov-schemes/empanelment": () => <PlaceholderPage title="Empanelment Tracker" description="MOU dates, portal credentials and renewal alerts — Phase 4." />,
  "/gov-schemes/deduction-analytics": () => <PlaceholderPage title="Deduction Analytics" description="Top deduction heads, scheme-wise rate-cut % and recoverable vs non-recoverable — Phase 4." />,
  "/gov-schemes/import": () => <PlaceholderPage title="Import Government Claims" description="PMJAY / state portal Excel import — Phase 4." />,

  // OPD & Wellness
  "/opd": OpdLanding,
  "/opd/dashboard": OpdLanding,
  "/opd/visits": OpdVisitsPage,
  "/opd/visits/new": OpdVisitCapturePage,
  "/opd/visits/import": OpdVisitImportPage,
  "/opd/corporates": OpdCorporatesPage,
  "/opd/employees": OpdEmployeesPage,
  "/opd/eligibility": OpdEligibilitySyncPage,
  "/opd/packages": AhcPackagesPage,
  "/opd/ahc-bookings": AhcBookingsPage,
  "/opd/wellness-events": WellnessEventsPage,
  "/opd/bulk-submit": OpdBulkSubmitPage,
  "/opd/analytics": OpdAnalyticsPage,
};

import AccessDenied from "@/components/auth/AccessDenied";
import { useHasPermission } from "@/hooks/useHasPermission";
import type { Resource, Action } from "@/hooks/useRolePermissions";

/**
 * Path-prefix → required (resource, action). First match wins. Mirrors the
 * permissions matrix on /settings/permissions so blocked routes show the
 * AccessDenied page instead of rendering.
 */
const ROUTE_PERMISSION_RULES: ReadonlyArray<{
  prefix: string;
  resource: Resource;
  action: Action;
  label: string;
}> = [
  { prefix: "/analytics",      resource: "analytics", action: "view", label: "Analytics" },
  { prefix: "/settings/users", resource: "users",     action: "edit", label: "Users & Roles" },
];

function requiredPermissionForPath(path: string) {
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (path === rule.prefix || path.startsWith(rule.prefix + "/")) return rule;
  }
  return null;
}

function RouteOutlet() {
  const location = useLocation();
  // Strip trailing slash (except root)
  const path = location.pathname !== "/" ? location.pathname.replace(/\/+$/, "") : "/";
  const entry = ROUTES[path];
  if (!entry) return <NotFound />;

  const rule = requiredPermissionForPath(path);
  return rule ? (
    <RouteWithPermission rule={rule} Component={entry as ComponentType} />
  ) : (
    (() => { const El = entry as ComponentType; return <El />; })()
  );
}

function RouteWithPermission({
  rule,
  Component,
}: {
  rule: { resource: Resource; action: Action; label: string };
  Component: ComponentType;
}) {
  const allowed = useHasPermission(rule.resource, rule.action);
  if (!allowed) return <AccessDenied resourceLabel={rule.label} actionLabel={String(rule.action)} />;
  return <Component />;
}

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <MobileRedirect />
    <RouteOutlet />
  </TooltipProvider>
);

export default App;
