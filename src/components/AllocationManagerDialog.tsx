import { useEffect, useMemo, useState } from "react";
import { Plus, X, UserCog } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppUsers } from "@/hooks/useAppUsers";
import { useUserAllocations } from "@/hooks/useUserAllocations";
import { useLiveClaims } from "@/hooks/useLiveClaims";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialUserId?: string | null;
}

/**
 * Admin-style allocation manager: pick a user, then add/remove TPAs/Insurers
 * they are responsible for. Used to drive My Tasks visibility.
 */
export default function AllocationManagerDialog({ open, onOpenChange, initialUserId }: Props) {
  const { users } = useAppUsers();
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const { allocations, allocate, deallocate } = useUserAllocations(userId);
  const { claims } = useLiveClaims();
  const [providerToAdd, setProviderToAdd] = useState<string>("");

  useEffect(() => {
    if (open && initialUserId) setUserId(initialUserId);
  }, [open, initialUserId]);

  // Distinct provider list: TPA + Insurer
  const allProviders = useMemo(() => {
    const set = new Set<string>();
    for (const c of claims) {
      if (c.tpa_name) set.add(c.tpa_name.trim());
      if (c.insurance_company_name) set.add(c.insurance_company_name.trim());
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [claims]);

  const allocatedSet = useMemo(
    () => new Set(allocations.map((a) => a.provider.toLowerCase())),
    [allocations],
  );

  const available = allProviders.filter((p) => !allocatedSet.has(p.toLowerCase()));

  const handleAdd = async () => {
    if (!userId || !providerToAdd) return;
    const ok = await allocate(userId, providerToAdd);
    if (ok) setProviderToAdd("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Manage TPA / Insurer allocations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Executive
            </label>
            <Select value={userId ?? ""} onValueChange={(v) => setUserId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select an executive…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} <span className="text-muted-foreground">· {u.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {userId && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Add TPA / Insurer
                </label>
                <div className="flex gap-2">
                  <Select value={providerToAdd} onValueChange={setProviderToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Pick a provider…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {available.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          All providers already allocated.
                        </div>
                      ) : (
                        available.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAdd} disabled={!providerToAdd}>
                    <Plus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Allocated ({allocations.length})
                  </span>
                </div>
                {allocations.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No allocations yet. Add a TPA above, or leave empty to fall back to name-matching.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allocations.map((a) => (
                      <Badge
                        key={a.id}
                        variant="secondary"
                        className="flex items-center gap-1.5 pr-1 text-[12px]"
                      >
                        {a.provider}
                        <button
                          aria-label={`Remove ${a.provider}`}
                          onClick={() => deallocate(a.id)}
                          className="ml-1 rounded p-0.5 hover:bg-background/60"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
