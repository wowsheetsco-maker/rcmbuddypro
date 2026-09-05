import { useState } from "react";
import { AlertTriangle, Trash2, Loader2, ArrowLeft, Home } from "lucide-react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { getActingRole } from "@/hooks/useRolePermissions";
import { bumpClaimsVersion } from "@/hooks/useLiveClaims";

const ALLOWED_ROLES = new Set(["Super Admin", "Hospital Admin", "CFO View"]);

export default function DataManagementPage() {
  const router = useRouter();
  const role = getActingRole();
  const allowed = ALLOWED_ROLES.has(role);

  const [confirmText, setConfirmText] = useState("");
  const [includeFollowUps, setIncludeFollowUps] = useState(true);
  const [includeDiscrepancies, setIncludeDiscrepancies] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit = allowed && confirmText.trim().toUpperCase() === "DELETE ALL CLAIMS";

  async function handleClearAll() {
    setBusy(true);
    try {
      let orgId: string | null = null;
      try {
        orgId = getCurrentOrgId();
      } catch {
        orgId = null;
      }

      // Preserve team-entered notes (SPOCs, remarks, action plans, last
      // communication) so they re-attach when a new sheet is uploaded.
      const { saveNotesVault } = await import("@/lib/claimNotesVault");
      {
        let from = 0;
        const PAGE = 1000;
        for (;;) {
          const { data } = await supabase
            .from("claims")
            .select("claim_number,tpa_spoc,hospital_spoc,last_communication_at,last_communication_note,remarks,action_plan")
            .range(from, from + PAGE - 1);
          saveNotesVault((data ?? []) as Record<string, unknown>[]);
          if (!data || data.length < PAGE) break;
          from += PAGE;
        }
      }

      const tables: string[] = [];
      if (includeFollowUps) tables.push("follow_ups");
      if (includeDiscrepancies) {
        tables.push("discrepancy_action_log");
        tables.push("discrepancy_actions");
      }
      // Delete dependents first. A failure here (missing permission on a
      // side table) must NOT stop the claims wipe — collect and report later.
      const warnings: string[] = [];
      for (const t of tables) {
        const q = supabase.from(t as never).delete();
        const { error } = orgId ? await q.eq("org_id", orgId) : await q.not("id", "is", null);
        if (error) warnings.push(`${t}: ${error.message}`);
      }

      let count = 0;
      if (orgId) {
        const { error: claimsErr, count: c } = await supabase
          .from("claims")
          .delete({ count: "exact" })
          .eq("org_id", orgId);
        if (claimsErr) warnings.push(`claims: ${claimsErr.message}`);
        count = c ?? 0;
      }

      // Fallback / verification sweep: anything still visible to this user
      // (wrong or missing org context, rows saved under another workspace)
      // gets removed by id so the screens really do come back empty.
      for (let pass = 0; pass < 10; pass++) {
        const { data: left } = await supabase.from("claims").select("id").limit(1000);
        if (!left || left.length === 0) break;
        const ids = left.map((r) => r.id as string);
        const { error: delErr } = await supabase.from("claims").delete().in("id", ids);
        if (delErr) {
          warnings.push(`claims: ${delErr.message}`);
          break;
        }
        count += ids.length;
      }

      const { count: remaining } = await supabase
        .from("claims")
        .select("id", { count: "exact", head: true });

      // Mark that the user has explicitly cleared their data so the
      // mock/demo claims do NOT come back to haunt them on next load.
      try { localStorage.setItem("rcm-buddy-claims-cleared", "1"); } catch { /* ignore */ }
      bumpClaimsVersion();

      if (remaining && remaining > 0) {
        toast({
          title: "Some claims could not be removed",
          description: `${count} removed, ${remaining} still remaining. ${warnings.join(" | ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Claims data cleared",
          description: `${count} claims removed. Team notes are saved and will re-attach on your next upload.${warnings.length ? ` Note: ${warnings.join(" | ")}` : ""}`,
        });
      }
      setConfirmText("");
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Could not clear claims", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.history.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link to="/today">
            <Home className="h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Management</h1>
        <p className="text-sm text-muted-foreground">
          Administrative tools to reset claims data. Use with extreme caution.
        </p>
      </div>

      {!allowed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restricted</CardTitle>
            <CardDescription>
              Only <strong>Super Admin</strong>, <strong>Hospital Admin</strong>, or <strong>CFO View</strong> can
              perform destructive data operations. You are currently acting as <strong>{role}</strong>.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">Danger Zone — Clear all claims</CardTitle>
          </div>
          <CardDescription>
            Permanently deletes every claim in your organisation so you can re-upload a corrected file.
            This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="fu"
                checked={includeFollowUps}
                onCheckedChange={(v) => setIncludeFollowUps(Boolean(v))}
                disabled={!allowed}
              />
              <Label htmlFor="fu" className="text-sm font-normal">
                Also delete follow-ups linked to these claims (recommended)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="dq"
                checked={includeDiscrepancies}
                onCheckedChange={(v) => setIncludeDiscrepancies(Boolean(v))}
                disabled={!allowed}
              />
              <Label htmlFor="dq" className="text-sm font-normal">
                Also delete discrepancy actions and action log (recommended)
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm">
              Type <code className="rounded bg-muted px-1.5 py-0.5 text-xs">DELETE ALL CLAIMS</code> to confirm
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE ALL CLAIMS"
              disabled={!allowed}
              autoComplete="off"
            />
          </div>

          <Button
            variant="destructive"
            disabled={!canSubmit || busy}
            onClick={() => setOpen(true)}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clear all claims data
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete all claims?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every claim in your organisation
              {includeFollowUps ? ", their follow-ups" : ""}
              {includeDiscrepancies ? ", and discrepancy records" : ""}. There is no undo.
              You can re-upload a corrected file from <strong>Claims → Import</strong> afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleClearAll();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
