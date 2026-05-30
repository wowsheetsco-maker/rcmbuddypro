import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AiToolDialog, { TOOL_META, type AiTool } from "@/components/AiToolDialog";
import { useAiProviders, PROVIDER_META, type ProviderKind } from "@/hooks/useAiProviders";

const TOOLS: AiTool[] = ["appeal_letter", "query_reply", "discharge_summary", "insurer_email"];

export default function AiCreationPage() {
  const { defaultProvider, providers } = useAiProviders();
  const [openTool, setOpenTool] = useState<AiTool | null>(null);
  const active = providers.filter((p) => p.is_active);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="rounded-xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-primary/20 p-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/15">
              <Wand2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display text-foreground">AI Creation</h1>
              <p className="text-sm text-muted-foreground mt-1">
                One place to generate replies, appeals, discharge summaries and insurer emails.
                {defaultProvider && (
                  <> Powered by <span className="font-semibold text-foreground">
                    {PROVIDER_META[defaultProvider.provider as ProviderKind]?.label}
                  </span>.</>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOOLS.map((tool) => {
            const meta = TOOL_META[tool];
            const Icon = meta.icon;
            return (
              <button
                key={tool}
                onClick={() => setOpenTool(tool)}
                disabled={active.length === 0}
                className="group text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`inline-flex p-2.5 rounded-lg ${meta.accent} mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {meta.title.replace("Generate ", "").replace("AI ", "")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{meta.subtitle}</p>
                <Badge className="mt-3 text-[10px] font-semibold bg-primary/10 text-primary border-0">
                  <Sparkles className="h-3 w-3 mr-1" /> Create
                </Badge>
              </button>
            );
          })}
        </div>

        {active.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No active AI provider configured. Add one in <span className="font-semibold">AI Studio → AI Providers</span>.
            </CardContent>
          </Card>
        )}
      </div>

      {openTool && (
        <AiToolDialog
          tool={openTool}
          open={!!openTool}
          onOpenChange={(o) => !o && setOpenTool(null)}
        />
      )}
    </AppLayout>
  );
}
