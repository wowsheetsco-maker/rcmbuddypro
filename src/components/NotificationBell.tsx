import { Bell, Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "@/lib/router-compat";

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  const handleClick = (n: typeof items[0]) => {
    void markRead(n.id);
    if (n.ref_claim_id) {
      navigate({ pathname: "/claims", search: `?openClaim=${n.ref_claim_id}` });
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && unreadCount > 0) void markAllRead();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl hover:bg-muted/70"
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-[10px] font-semibold text-white ring-2 ring-background tabular-nums">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => void markAllRead()}
            >
              <Check className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/40 ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      {n.message && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.message}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {timeAgo(n.created_at)}
                        </div>
                        {n.ref_claim_id && (
                          <div className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                            <ExternalLink className="h-2.5 w-2.5" />
                            Open claim
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-3 py-2 text-center">
          <a
            href="/settings/notifications"
            className="text-xs text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              navigate("/settings/notifications");
            }}
          >
            Notification settings
          </a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
