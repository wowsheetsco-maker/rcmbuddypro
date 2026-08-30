import { useCallback, useEffect, useState } from "react";
import { Building2, Clock, Loader2, LogOut, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrgOption {
  id: string;
  name: string;
}

interface MyRequest {
  id: string;
  status: string;
  review_note: string | null;
  created_at: string;
  org_id: string | null;
  requested_org_name: string | null;
}

/**
 * Landing screen for a signed-in user who belongs to no hospital yet.
 * They pick the hospital they work at (or type its name) and submit a
 * request; a hospital admin or platform super admin approves it.
 */
export default function RequestAccessPage() {
  const { userId, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [otherName, setOtherName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<MyRequest[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (user) {
      setEmail(user.email ?? "");
      setName((user.user_metadata?.name as string | undefined) ?? "");
    }
    const [{ data: orgRows }, { data: reqRows }] = await Promise.all([
      supabase.rpc("list_joinable_organizations"),
      supabase
        .from("access_requests")
        .select("id, status, review_note, created_at, org_id, requested_org_name")
        .order("created_at", { ascending: false }),
    ]);
    setOrgs((orgRows ?? []) as OrgOption[]);
    setMine((reqRows ?? []) as MyRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = mine.find((r) => r.status === "pending") ?? null;
  const rejected = !pending && mine.find((r) => r.status === "rejected");

  const submit = async () => {
    if (!userId) return;
    if (!orgId && !otherName.trim()) {
      toast({
        title: "Pick a hospital",
        description: "Choose your hospital from the list or type its name.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("access_requests").insert({
      requester_user_id: userId,
      email: email.toLowerCase(),
      name: name.trim() || null,
      org_id: orgId || null,
      requested_org_name: orgId ? (orgs.find((o) => o.id === orgId)?.name ?? null) : otherName.trim(),
      message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not send request", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request sent", description: "An administrator will review your access request." });
    await load();
    await refresh();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Access required</span>
          </div>
          <CardTitle className="text-2xl">You're not linked to a hospital yet</CardTitle>
          <CardDescription>
            For patient-data safety, every account must be attached to exactly one hospital
            workspace. Request access below and an administrator will approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : pending ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <div className="flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4" /> Request pending review
              </div>
              <p className="mt-1 text-muted-foreground">
                You asked to join{" "}
                <strong>{pending.requested_org_name ?? "a hospital"}</strong> on{" "}
                {new Date(pending.created_at).toLocaleString()}. You'll get access as soon as an
                admin approves it.
              </p>
            </div>
          ) : (
            <>
              {rejected ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <XCircle className="h-4 w-4" /> Previous request declined
                  </div>
                  {rejected.review_note ? (
                    <p className="mt-1 text-muted-foreground">Reason: {rejected.review_note}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ra-name">Your name</Label>
                  <Input id="ra-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. A. Sharma" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ra-email">Work email</Label>
                  <Input id="ra-email" value={email} readOnly className="bg-muted" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hospital</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {orgs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hospitals listed yet — type your hospital name below instead.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ra-other" className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Hospital not listed?
                </Label>
                <Input
                  id="ra-other"
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  placeholder="Type the hospital / group name"
                  disabled={!!orgId}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ra-msg">Message to the admin (optional)</Label>
                <Textarea
                  id="ra-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Team, role and who can vouch for you."
                  rows={3}
                />
              </div>

              <Button onClick={submit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Request access
              </Button>
            </>
          )}

          <Button variant="ghost" size="sm" onClick={signOut} className="w-full">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
