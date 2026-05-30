import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Sparkles, Bot, FileWarning, MessageSquareWarning, ClipboardList, Mail,
  Settings as SettingsIcon, Zap, Clock, Activity, TrendingUp, AlertCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AiToolDialog, { TOOL_META, type AiTool } from "@/components/AiToolDialog";
import { useAiProviders, PROVIDER_META, type ProviderKind } from "@/hooks/useAiProviders";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface RecentGen {
  id: string;
  tool: string;
  provider: string;
  model: string;
  status: string;
  created_at: string;
  input_summary: string | null;
  attachments_count: number;
}

const TOOL_CARDS: Array<{
  tool: AiTool;
  badge: string;
  badgeClass: string;
}> = [
  { tool: "appeal_letter",     badge: "HIGH VALUE",     badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  { tool: "discharge_summary", badge: "CLINICAL DOCS",  badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  { tool: "query_reply",       badge: "TPA RESPONSE",   badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  { tool: "insurer_email",     badge: "COMMUNICATION",  badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
];

export default function AiCenterPage() {
  const { providers, defaultProvider, loading } = useAiProviders();
  const [openTool, setOpenTool] = useState<AiTool | null>(null);
  const [recent, setRecent] = useState<RecentGen[]>([]);
  const [stats, setStats] = useState({ totalCalls: 0, totalTokens: 0, last24h: 0 });

  useEffect(() => {
    void loadRecent();
  }, []);

  const loadRecent = async () => {
    const [{ data: gens }, { data: counts }] = await Promise.all([
      supabase.from("ai_generations").select("id, tool, provider, model, status, created_at, input_summary, attachments_count")
        .order("created_at", { ascending: false }).limit(8),
      supabase.from("ai_generations").select("id, created_at, prompt_tokens, completion_tokens").limit(2000),
    ]);
    setRecent((gens ?? []) as RecentGen[]);
    if (counts) {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const totalTokens = counts.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
      const last24h = counts.filter((r) => new Date(r.created_at).getTime() >= since).length;
      setStats({ totalCalls: counts.length, totalTokens, last24h });
    }
  };

  const activeProviders = useMemo(() => providers.filter((p) => p.is_active), [providers]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-primary/20 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-primary/15">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
                  AI Tools Hub
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {defaultProvider
                    ? <>Powered by <span className="font-semibold text-foreground">{defaultProvider.display_name}</span> ({PROVIDER_META[defaultProvider.provider as ProviderKind]?.label}) — uses your configured API key.</>
                    : "Bring your own LLM API key to start drafting clinically accurate appeals, replies, summaries and emails."}
                </p>
              </div>
            </div>
            <Link to="/settings/ai-providers">
              <Button variant="outline" size="sm" className="gap-1.5">
                <SettingsIcon className="h-4 w-4" /> Manage AI Providers
              </Button>
            </Link>
          </div>

          {/* Session stats */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip icon={Bot} label="Active providers" value={activeProviders.length} />
            <StatChip icon={Zap} label="Total calls" value={stats.totalCalls.toLocaleString()} />
            <StatChip icon={Activity} label="Last 24h" value={stats.last24h.toLocaleString()} />
            <StatChip icon={TrendingUp} label="Total tokens" value={stats.totalTokens.toLocaleString()} />
          </div>

          {!loading && activeProviders.length === 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-3">
              <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">API key not configured.</span> Go to <Link to="/settings/ai-providers" className="underline font-semibold">Settings → AI Providers</Link> to add Claude, OpenAI, OpenRouter or Gemini key.
              </div>
            </div>
          )}
        </div>

        {/* Tool cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOOL_CARDS.map(({ tool, badge, badgeClass }) => {
            const meta = TOOL_META[tool];
            const Icon = meta.icon;
            return (
              <button
                key={tool}
                onClick={() => setOpenTool(tool)}
                disabled={activeProviders.length === 0}
                className="group text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`inline-flex p-2.5 rounded-lg ${meta.accent} mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {meta.title.replace("Generate ", "").replace("AI ", "")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{meta.subtitle}</p>
                <Badge className={`mt-3 text-[10px] font-semibold ${badgeClass} border-0`}>{badge}</Badge>
              </button>
            );
          })}
        </div>

        {/* Recent activity */}
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Recent AI Drafts
              </h2>
              <Badge variant="outline" className="text-[10px]">{recent.length} shown</Badge>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No drafts yet. Pick a tool above to generate your first one.</p>
            ) : (
              <div className="space-y-1.5">
                {recent.map((r) => {
                  const tm = TOOL_META[r.tool as AiTool];
                  const Icon = tm?.icon ?? Bot;
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className={`p-1.5 rounded ${tm?.accent ?? "bg-muted"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{tm?.title.replace("Generate ", "").replace("AI ", "") ?? r.tool}</span>
                          <Badge variant="outline" className="text-[10px]">{r.provider}</Badge>
                          {r.attachments_count > 0 && (
                            <Badge variant="secondary" className="text-[10px]">📎 {r.attachments_count}</Badge>
                          )}
                          {r.status === "error" && <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                        </div>
                        {r.input_summary && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.input_summary}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {openTool && (
        <AiToolDialog
          tool={openTool}
          open={!!openTool}
          onOpenChange={(o) => {
            if (!o) {
              setOpenTool(null);
              void loadRecent();
            }
          }}
        />
      )}
    </AppLayout>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-card/60 border border-border/60 px-3 py-2 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
