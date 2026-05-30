import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteSnapshot,
  listSnapshots,
  saveSnapshot,
  type PayerSnapshot,
} from "@/lib/payerSnapshots";
import type { PayerStats } from "@/lib/payerScorecard";

interface SnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: "tpa" | "insurer";
  payers: PayerStats[];
  baselineId: string | null;
  onSelectBaseline: (id: string | null) => void;
}

export function SnapshotDialog({
  open, onOpenChange, view, payers, baselineId, onSelectBaseline,
}: SnapshotDialogProps) {
  const [label, setLabel] = useState("");
  const [snaps, setSnaps] = useState<PayerSnapshot[]>(() => listSnapshots(view));

  const refresh = () => setSnaps(listSnapshots(view));

  const handleSave = () => {
    const snap = saveSnapshot({ label, view, payers });
    toast.success("Snapshot saved", {
      description: `${snap.payers.length} payers captured at ${new Date(snap.takenAt).toLocaleString("en-IN")}`,
    });
    setLabel("");
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteSnapshot(id);
    if (baselineId === id) onSelectBaseline(null);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Snapshots — {view === "tpa" ? "TPAs" : "Insurers"}
          </DialogTitle>
          <DialogDescription>
            Save the current scorecard so you can compare "before/after" in your next TPA review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground">Label (optional)</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Pre-meeting ${new Date().toLocaleDateString("en-IN")}`}
                className="h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleSave}>
              <Camera className="h-3.5 w-3.5 mr-1.5" /> Capture
            </Button>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Saved snapshots
              </h4>
              {baselineId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => onSelectBaseline(null)}
                >
                  Clear comparison
                </Button>
              )}
            </div>
            {snaps.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center border rounded-md">
                No snapshots yet. Capture one before your next negotiation.
              </div>
            )}
            <ul className="space-y-1.5 max-h-[18rem] overflow-y-auto">
              {snaps.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-md border ${
                    baselineId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelectBaseline(s.id);
                      onOpenChange(false);
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-sm font-medium truncate">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(s.takenAt).toLocaleString("en-IN")} · {s.payers.length} payers
                    </div>
                  </button>
                  {baselineId === s.id && (
                    <Badge variant="outline" className="text-[9px] py-0 border-primary text-primary">
                      Baseline
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
