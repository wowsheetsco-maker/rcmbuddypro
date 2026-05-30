import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Search, Sparkles, Bot, Plus, Menu, ChevronDown,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SmartReportDialog from "@/components/SmartReportDialog";
import BranchPicker from "@/components/BranchPicker";
import CommandPalette from "@/components/CommandPalette";
import { useSidebarState } from "@/components/sidebar-context";
import { useHospitals } from "@/hooks/useHospitals";
import { usePlan } from "@/lib/usePlan";
import logoIcon from "@/assets/rcm-buddy-logo.png";
import { cn } from "@/lib/utils";

export default function TopActionBar() {
  const { isMobile, setMobileOpen } = useSidebarState();
  const { groups, branches } = useHospitals();
  const plan = usePlan();
  const [smartOpen, setSmartOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const primary = groups[0];
  const branchCount = branches.filter((b) => b.group_id === primary?.id).length;
  const subtitle = primary
    ? `${branches.find((b) => b.group_id === primary.id)?.city ?? "All India"} • ${branchCount || 0} branch${branchCount === 1 ? "" : "es"}`
    : "Workspace";

  // Cmd/Ctrl + K opens palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const planLabel = plan === "enterprise" ? "ENTERPRISE" : plan === "pro" ? "PRO" : "STARTER";
  const showPlanPill = plan !== "starter";

  return (
    <>
      <header className="sticky top-0 z-30 glass-chrome border-b border-border/60">
        <div className="flex h-[72px] items-center gap-3 px-4 md:gap-5 md:px-6">
          {/* Mobile menu */}
          {isMobile && (
            <Button
              variant="ghost" size="icon"
              onClick={() => setMobileOpen(true)}
              className="h-9 w-9 -ml-1"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* LEFT — logo + workspace switcher */}
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="shrink-0 flex items-center gap-2" aria-label="RCM Buddy home">
              <img src={logoIcon} alt="" className="h-8 w-8 rounded-lg" />
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="text-[15px] font-extrabold tracking-tight text-foreground leading-none">
                  RCM <span className="text-primary">Buddy</span>
                </span>
                {showPlanPill && (
                  <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-primary text-primary-foreground text-[9.5px] font-bold tracking-wider">
                    {planLabel}
                  </span>
                )}
              </span>
            </Link>
            <div className="hidden md:block h-8 w-px bg-border/70" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex flex-col items-start min-w-0 rounded-lg px-2.5 py-1.5 hover:bg-muted/70 transition-colors">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground truncate max-w-[200px]">
                    {primary?.name ?? "My Hospital"}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                    {subtitle}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Workspace
                </DropdownMenuLabel>
                <div className="px-2 py-1.5">
                  <BranchPicker />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* CENTER — command palette search */}
          <div className="flex-1 flex justify-center px-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                "group flex items-center gap-2.5 w-full max-w-md h-10 rounded-xl border bg-card/70 px-3.5 text-left",
                "shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200",
                searchFocused
                  ? "border-primary/60 ring-4 ring-primary/10 bg-card"
                  : "border-border/70 hover:border-border hover:bg-card",
              )}
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="flex-1 text-[13px] text-muted-foreground truncate">
                Search anything…
              </span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md border border-border/70 bg-muted/60 text-[10.5px] font-medium text-muted-foreground tabular-nums">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* RIGHT — actions */}
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* AI Insights (was Smart Report) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSmartOpen(true)}
              className="hidden md:inline-flex h-9 gap-1.5 rounded-xl text-foreground/80 hover:text-foreground hover:bg-muted/70 px-3"
            >
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <span className="text-[12.5px] font-medium">AI Insights</span>
            </Button>

            {/* Primary CTA */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 gap-1.5 rounded-xl btn-primary-grad text-primary-foreground px-3.5 shadow-[0_1px_2px_rgba(91,61,245,0.25),0_4px_12px_-2px_rgba(91,61,245,0.35)] hover:shadow-[0_2px_4px_rgba(91,61,245,0.3),0_8px_20px_-4px_rgba(91,61,245,0.45)] transition-all hover:-translate-y-px"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  <span className="text-[12.5px] font-semibold">New</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/claims/import">Import claims</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/communications/ai-reply">New AI reply</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/my-tasks">New follow-up task</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/providers/contacts">New contact</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Assistant */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-muted/70"
              aria-label="AI Assistant"
            >
              <Link to="/communications/ai-reply">
                <Bot className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.75} />
              </Link>
            </Button>

            {/* Bell */}
            <NotificationBell />

            {/* Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-xl pl-1 pr-2 py-1 hover:bg-muted/70 transition-colors">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-[12px] font-semibold">
                    DM
                  </div>
                  <div className="hidden lg:flex flex-col items-start leading-tight">
                    <span className="text-[12.5px] font-semibold text-foreground">Dr. Mehta</span>
                    <span className="text-[10.5px] text-muted-foreground">Hospital Admin</span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/settings/users">Profile & users</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings/integrations">Integrations</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings/my-email">Email settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/login">Sign in</Link></DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <SmartReportDialog open={smartOpen} onOpenChange={setSmartOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
