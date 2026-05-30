// Browse & reopen previously auto-saved bulk email drafts.
// Drafts are written to localStorage by BulkFollowUpComposer when a backend
// send fails, indexed under "rcm-buddy-email-drafts-index".

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Trash2, RotateCcw, Inbox, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface SavedDraft {
  key: string;
  savedAt: string;
  reason: string;
  insurerName: string;
  recipient: string;
  cc: string;
  subject: string;
  body: string;
  bodyFormat: "html" | "text";
  tone: string;
  claimCount: number;
}

const INDEX_KEY = "rcm-buddy-email-drafts-index";

export function loadSavedDrafts(): SavedDraft[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const keys = JSON.parse(raw) as string[];
    const out: SavedDraft[] = [];
    for (const key of keys) {
      const item = localStorage.getItem(key);
      if (!item) continue;
      try {
        const parsed = JSON.parse(item);
        out.push({ key, ...parsed });
      } catch {
        /* skip corrupt entry */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function deleteDraft(key: string) {
  localStorage.removeItem(key);
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    localStorage.setItem(INDEX_KEY, JSON.stringify(keys.filter((k) => k !== key)));
  } catch {
    /* ignore */
  }
}

function clearAllDrafts() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

function reasonBadge(reason: string): { label: string; className: string } {
  if (/^smtp/i.test(reason))
    return { label: "SMTP missing", className: "bg-warning/10 text-warning border-warning/40" };
  if (/^auth/i.test(reason))
    return { label: "Auth failed", className: "bg-warning/10 text-warning border-warning/40" };
  if (/^network/i.test(reason))
    return { label: "Network", className: "bg-destructive/10 text-destructive border-destructive/40" };
  return { label: "Failed", className: "bg-muted text-muted-foreground border-border" };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user clicks "Reopen" — composer should hydrate from this draft. */
  onReopen: (draft: SavedDraft) => void;
}

export default function SavedDraftsDialog({ open, onOpenChange, onReopen }: Props) {
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (open) setDrafts(loadSavedDrafts());
  }, [open, tick]);

  const grouped = useMemo(() => {
    const sorted = [...drafts].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
    return sorted;
  }, [drafts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Saved drafts
            <Badge variant="outline" className="text-[10px]">
              {grouped.length}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Drafts auto-saved when an email send fell back. Reopen one to load it back into the composer.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-3">
          {grouped.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No saved drafts yet. Drafts appear here automatically when a send fails.
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map((d) => {
                const badge = reasonBadge(d.reason);
                return (
                  <div
                    key={d.key}
                    className="border rounded-md p-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate" title={d.subject}>
                          {d.subject || "(no subject)"}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="font-mono">{d.insurerName}</span>
                          <span>·</span>
                          <span>{d.recipient || "no recipient"}</span>
                          <span>·</span>
                          <span>{d.claimCount} claims</span>
                          <span>·</span>
                          <span>{relativeTime(d.savedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="outline" className={cn("text-[9px] py-0 h-4 gap-0.5", badge.className)}>
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {badge.label}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] py-0 h-4 capitalize">
                          {d.tone}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 font-mono leading-snug mt-1">
                      {d.body.slice(0, 220)}
                      {d.body.length > 220 ? "…" : ""}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => {
                          onReopen(d);
                          onOpenChange(false);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" /> Reopen in composer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          deleteDraft(d.key);
                          setTick((t) => t + 1);
                          toast.success("Draft deleted");
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {grouped.length > 0 && (
          <div className="border-t px-6 py-3 flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => {
                clearAllDrafts();
                setTick((t) => t + 1);
                toast.success("All drafts cleared");
              }}
            >
              <Trash2 className="h-3 w-3" /> Clear all
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
