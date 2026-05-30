import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLES, type UserRole } from "@/hooks/useAppUsers";
import { getActingRole, setActingRole } from "@/hooks/useRolePermissions";

export default function ActingRoleSwitcher() {
  const [role, setRole] = useState<UserRole>(getActingRole());

  useEffect(() => {
    const h = () => setRole(getActingRole());
    window.addEventListener("rcm-acting-role-change", h);
    return () => window.removeEventListener("rcm-acting-role-change", h);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 pl-2 pr-1 py-0.5">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">Acting as</span>
            <Select
              value={role}
              onValueChange={(v) => { setActingRole(v as UserRole); setRole(v as UserRole); }}
            >
              <SelectTrigger
                className="h-6 w-auto min-w-[110px] border-0 bg-transparent px-1.5 text-[11px] font-medium focus:ring-0 focus:ring-offset-0 shadow-none gap-1"
                aria-label="Preview as role"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">
            <div className="font-medium">Role preview</div>
            <div className="text-muted-foreground">Sidebar items and pages will reflect this role's permissions.</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
