import { useNavigate } from "@/lib/router-compat";
import {
  LayoutDashboard, Search, ListChecks, ShieldAlert, Receipt, Upload,
  Phone, Calendar as CalendarIcon, Bot, Users, ScrollText, Landmark,
  CreditCard, FileWarning,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useOverlayCount } from "@/hooks/useOverlayPresence";

type Role = "cfo" | "billing" | "ops" | "admin";

interface MobileAction {
  label: string;
  icon: React.ElementType;
  path: string;
  tone?: "default" | "primary" | "warning" | "danger";
}

// Executive defaults — kept consistent with MobileHomePage Quick Actions.
const EXEC_DEFAULTS: MobileAction[] = [
  { label: "Home",      icon: LayoutDashboard, path: "/m" },
  { label: "Follow-Up", icon: Phone,           path: "/follow-up",      tone: "primary" },
  { label: "Claims",    icon: Search,          path: "/claims" },
  { label: "SLA",     icon: ShieldAlert,     path: "/claims/priority",   tone: "danger"  },
  { label: "Tasks",     icon: ListChecks,      path: "/my-tasks" },
];

const ACTIONS_BY_ROLE: Record<Role, MobileAction[]> = {
  cfo: EXEC_DEFAULTS,
  billing: [
    { label: "Home",        icon: LayoutDashboard, path: "/m" },
    { label: "Follow-Up",   icon: Phone,           path: "/follow-up",                 tone: "primary" },
    { label: "Worklist",    icon: ListChecks,      path: "/claims/priority" },
    { label: "Denials",     icon: FileWarning,     path: "/claims/denials",            tone: "danger"  },
    { label: "AI Reply",    icon: Bot,             path: "/communications/ai-reply" },
  ],
  ops: [
    { label: "Home",         icon: LayoutDashboard, path: "/m" },
    { label: "Claims",       icon: Search,          path: "/claims" },
    { label: "Import",       icon: Upload,          path: "/claims/import",             tone: "primary" },
    { label: "Calendar",     icon: CalendarIcon,    path: "/communications/calendar" },
    { label: "Contacts",     icon: Users,           path: "/providers/contacts" },
  ],
  admin: EXEC_DEFAULTS,
};

const ROLE_LABEL: Record<Role, string> = {
  cfo: "CFO actions",
  billing: "Billing actions",
  ops: "Ops actions",
  admin: "Admin actions",
};

const ROLE_STORAGE_KEY = "rcm-buddy-role";

export default function MobileActionDock() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("cfo");

  useEffect(() => {
    const read = () => {
      const r = (localStorage.getItem(ROLE_STORAGE_KEY) as Role) || "cfo";
      setRole(r);
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("rcm-role-change", read as EventListener);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("rcm-role-change", read as EventListener);
    };
  }, []);

  const actions = ACTIONS_BY_ROLE[role];

  const overlayCount = useOverlayCount();
  const overlayOpen = overlayCount > 0;

  return (
    <nav
      aria-label={ROLE_LABEL[role]}
      aria-hidden={overlayOpen || undefined}
      data-overlay-open={overlayOpen ? "true" : undefined}
      data-testid="mobile-action-dock"
      className={
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 md:hidden " +
        "transition-[opacity,transform] duration-200 " +
        (overlayOpen
          ? "pointer-events-none opacity-0 translate-y-full"
          : "opacity-100 translate-y-0")
      }
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch justify-around px-1 py-1.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const tone =
            a.tone === "primary"
              ? "text-primary"
              : a.tone === "warning"
              ? "text-warning"
              : a.tone === "danger"
              ? "text-destructive"
              : "text-foreground";
          return (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 active:bg-muted"
            >
              <Icon className={`h-5 w-5 ${tone}`} />
              <span className="truncate text-[10.5px] font-medium text-foreground">
                {a.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
