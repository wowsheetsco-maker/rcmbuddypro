import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import AppLayout from "@/components/AppLayout";

interface Props {
  resourceLabel?: string;
  actionLabel?: string;
}

/**
 * Shown in place of a route when the current role lacks permission.
 * Keeps the URL stable (no redirect) so admins can see what was attempted.
 */
export function AccessDenied({ resourceLabel, actionLabel = "view" }: Props) {
  const navigate = useNavigate();
  const what = resourceLabel ? `${actionLabel} ${resourceLabel}` : "open this page";
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 grid place-items-center mb-4">
          <ShieldOff className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-display text-foreground">Access denied</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Your role doesn't have permission to {what}. If you believe this is a
          mistake, ask an admin to update your permissions in Settings → Permissions.
        </p>
        <div className="flex items-center gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Back to dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/settings/permissions")}
          >
            View permissions
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

export default AccessDenied;
