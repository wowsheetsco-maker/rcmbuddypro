import { useEffect, useMemo, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Circle, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";
import { getCurrentOrgId, peekCurrentOrgId } from "@/lib/currentOrg";

type Status = "pending" | "green" | "red";

type Item = {
  id: string;
  org_id: string;
  key: string;
  title: string;
  description: string | null;
  status: Status;
  note: string | null;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
};

export default function GoNoGoPage() {
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [preflight, setPreflight] = useState<{ ok: boolean; failures: string[] } | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const orgId = peekCurrentOrgId() ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const oid = orgId ?? getCurrentOrgId();
      // Ensure seeded
      await supabase.rpc("seed_launch_checklist", { _org_id: oid });
      const { data, error } = await supabase
        .from("launch_checklist")
        .select("*")
        .eq("org_id", oid)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setItems((data ?? []) as Item[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load checklist");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const runPreflight = useCallback(async () => {
    setPreflightLoading(true);
    try {
      const { getPreflightStatus } = await import("@/lib/preflight.functions");
      const res = await getPreflightStatus();
      setPreflight(res);
      // Auto-mark the rls_clean item
      const rls = items.find((i) => i.key === "rls_clean");
      if (rls) {
        await supabase
          .from("launch_checklist")
          .update({ status: res.ok ? "green" : "red", note: res.failures.join("\n") || null })
          .eq("id", rls.id);
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Preflight failed");
    } finally {
      setPreflightLoading(false);
    }
  }, [items, load]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // Realtime
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("launch_checklist_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "launch_checklist" },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, load]);

  const overall: "go" | "no-go" = useMemo(() => {
    if (items.length === 0) return "no-go";
    return items.every((i) => i.status === "green") ? "go" : "no-go";
  }, [items]);

  const setStatus = async (item: Item, status: Status) => {
    const { error } = await supabase
      .from("launch_checklist")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) toast.error(error.message);
  };

  const setNote = async (item: Item, note: string) => {
    const { error } = await supabase
      .from("launch_checklist")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) toast.error(error.message);
  };

  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <Card className="max-w-xl mx-auto mt-12">
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
          </CardHeader>
          <CardContent>Platform admin access required.</CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7" />
            <div>
              <h1 className="text-2xl font-semibold">Go / No-Go — T-2h Gate</h1>
              <p className="text-sm text-muted-foreground">
                All items must be green before publishing.
              </p>
            </div>
          </div>
          <div
            className={
              "px-6 py-3 rounded-full text-lg font-bold " +
              (overall === "go"
                ? "bg-green-100 text-green-800 border-2 border-green-500"
                : "bg-red-100 text-red-800 border-2 border-red-500")
            }
          >
            {overall === "go" ? "GO" : "NO-GO"}
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live RLS Preflight</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={runPreflight}
              disabled={preflightLoading}
            >
              {preflightLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run probe
            </Button>
          </CardHeader>
          <CardContent>
            {preflight === null ? (
              <p className="text-sm text-muted-foreground">
                Click "Run probe" to scan org-scoped tables for missing RLS policies.
              </p>
            ) : preflight.ok ? (
              <p className="text-sm text-green-700">
                ✓ All org-scoped tables have RLS enabled and reference org helpers.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700">
                  {preflight.failures.length} issue(s):
                </p>
                <ul className="text-xs text-red-700 list-disc ml-5 space-y-0.5">
                  {preflight.failures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onStatus={(s) => setStatus(item, s)}
                onNote={(n) => setNote(item, n)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ChecklistRow({
  item,
  onStatus,
  onNote,
}: {
  item: Item;
  onStatus: (s: Status) => void;
  onNote: (n: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  useEffect(() => setNoteDraft(item.note ?? ""), [item.note]);

  const icon =
    item.status === "green" ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    ) : item.status === "red" ? (
      <XCircle className="h-5 w-5 text-red-600" />
    ) : (
      <Circle className="h-5 w-5 text-muted-foreground" />
    );

  const badge =
    item.status === "green" ? (
      <Badge className="bg-green-600">Green</Badge>
    ) : item.status === "red" ? (
      <Badge variant="destructive">Red</Badge>
    ) : (
      <Badge variant="outline">Pending</Badge>
    );

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {icon}
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{item.title}</div>
                {item.description && (
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {badge}
                <Button
                  size="sm"
                  variant={item.status === "green" ? "default" : "outline"}
                  className={item.status === "green" ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={() => onStatus("green")}
                >
                  Green
                </Button>
                <Button
                  size="sm"
                  variant={item.status === "red" ? "destructive" : "outline"}
                  onClick={() => onStatus("red")}
                >
                  Red
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onStatus("pending")}>
                  Reset
                </Button>
              </div>
            </div>
            <Textarea
              placeholder="Notes (optional)…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                if (noteDraft !== (item.note ?? "")) onNote(noteDraft);
              }}
              className="text-xs"
              rows={2}
            />
            <div className="text-[10px] text-muted-foreground">
              Updated {new Date(item.updated_at).toLocaleString()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
