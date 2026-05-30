import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";
import TopActionBar from "@/components/TopActionBar";
import ActionCentreBar from "@/components/ActionCentreBar";
import HubTabBar from "@/components/HubTabBar";
import MobileActionDock from "@/components/MobileActionDock";
import { SidebarProvider, useSidebarState } from "@/components/sidebar-context";
import { GlobalFilterProvider } from "@/components/global-filter-context";

function LayoutShell({ children }: { children: React.ReactNode }) {
  const { collapsed, isMobile } = useSidebarState();
  // On mobile we render sidebar as an overlay (Sheet) so content gets no left margin.
  const ml = isMobile ? "ml-0" : collapsed ? "ml-14" : "ml-60";
  return (
    <div className="flex min-h-screen print:block">
      <div className="print:hidden">
        <AppSidebar />
      </div>
      <div className={`flex flex-1 flex-col min-w-0 transition-[margin] duration-200 ${ml} print:ml-0`}>
        <div className="print:hidden">
          <TopActionBar />
          <AppHeader />
          {/* Action Centre is desktop-only; HubTabBar shows on all sizes
              (scrolls horizontally on mobile) so deep-link navigation works
              everywhere. */}
          <div className="hidden md:block">
            <ActionCentreBar />
          </div>
          <HubTabBar />
        </div>
        <main
          className="flex-1 overflow-auto bg-background p-3 pb-24 md:p-6 md:pb-6 print:overflow-visible print:p-0 print:pb-0"
          style={{ paddingBottom: isMobile ? "calc(env(safe-area-inset-bottom) + 5.5rem)" : undefined }}
        >
          {children}
        </main>
      </div>
      <div className="print:hidden">
        <MobileActionDock />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalFilterProvider>
      <SidebarProvider>
        <LayoutShell>{children}</LayoutShell>
      </SidebarProvider>
    </GlobalFilterProvider>
  );
}
