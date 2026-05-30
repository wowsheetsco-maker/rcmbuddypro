import { useMemo, useState } from "react";
import {
  X, ChevronRight, FileText, Phone, ArrowUpRight, Scale, ListChecks,
  Building2, Stethoscope, AlertCircle, Clock, BookOpen, Copy, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Claim } from "@/data/mockClaims";
import { formatInr } from "@/data/mockClaims";
import { matchPlaybook } from "@/lib/playbookMatch";
import {
  ESCALATION_LADDER, SLA_CIRCULARS, PLAYBOOK_CATEGORY_COLORS,
} from "@/data/cashlessPlaybook";
import { toast } from "@/hooks/use-toast";

export default function PlaybookDrawer({
  claim, onClose,
}: { claim: Claim; onClose: () => void }) {
  const match = useMemo(() => matchPlaybook(claim), [claim]);
  const [copied, setCopied] = useState(false);

  if (!match) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[520px] bg-card border-l shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        <DrawerHeader claim={claim} onClose={onClose} subtitle="No matching playbook entry" />
        <div className="p-6 text-sm text-muted-foreground">
          This claim status doesn't match a known cashless denial pattern.
        </div>
      </div>
    );
  }

  const { entry, matchedTerms } = match;
  const categoryColor = PLAYBOOK_CATEGORY_COLORS[entry.category] || "hsl(var(--muted))";

  const relevantCirculars = SLA_CIRCULARS.filter(c => {
    const ctx = `${entry.reason} ${entry.category} ${entry.dept}`.toLowerCase();
    const apt = c.appliesTo.toLowerCase();
    if (apt.includes("psychiatric") && ctx.includes("psychiatr")) return true;
    if (apt.includes("daycare") && (ctx.includes("daycare") || ctx.includes("chemo") || ctx.includes("dialysis"))) return true;
    if (apt.includes("ped") && (ctx.includes("ped") || ctx.includes("pre-existing"))) return true;
    if (apt.includes("implants") && (ctx.includes("implant") || ctx.includes("stent"))) return true;
    if (apt.includes("all health")) return true;
    return false;
  });

  // Determine which escalation rungs to highlight based on the entry's escalation text
  const highlightLevels = inferEscalationLevels(entry.escalation);

  function copyAppealDraft() {
    const draft = buildAppealDraft(claim, entry, relevantCirculars.map(c => c.reference));
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      toast({ title: "Appeal draft copied", description: "Paste into email / TPA portal." });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[560px] bg-card border-l shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
      <DrawerHeader claim={claim} onClose={onClose} subtitle={entry.reason} />

      {/* Match summary strip */}
      <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
          <span className="text-xs font-medium">{entry.category}</span>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Stethoscope className="h-3 w-3" /> {entry.dept}
        </Badge>
        <Badge variant="outline" className="text-[10px]">{entry.type}</Badge>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Clock className="h-3 w-3" /> TAT {entry.tat}
        </Badge>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Policy clause */}
          <section>
            <SectionTitle icon={Scale}>Policy clause cited</SectionTitle>
            <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">{entry.clause}</p>
          </section>

          <Separator />

          {/* Action steps */}
          <section>
            <SectionTitle icon={ListChecks}>Hospital action steps</SectionTitle>
            <ol className="mt-2 space-y-2">
              {entry.actions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground/85 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <Separator />

          {/* Required docs */}
          <section>
            <SectionTitle icon={FileText}>Documents required by TPA</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.docs.map(doc => (
                <Badge key={doc} variant="secondary" className="text-[10px] font-normal">{doc}</Badge>
              ))}
            </div>
          </section>

          <Separator />

          {/* Escalation ladder */}
          <section>
            <SectionTitle icon={ArrowUpRight}>Escalation path</SectionTitle>
            <p className="text-xs text-muted-foreground mt-1">{entry.escalation}</p>
            <div className="mt-3 space-y-1.5">
              {ESCALATION_LADDER.map(level => {
                const isHighlight = highlightLevels.includes(level.level);
                return (
                  <div
                    key={level.level}
                    className={`flex items-start gap-3 p-2.5 rounded-md border transition-colors ${
                      isHighlight ? "bg-primary/5 border-primary/30" : "bg-card border-border"
                    }`}
                  >
                    <div className={`shrink-0 h-6 w-6 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                      isHighlight ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      L{level.level}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{level.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{level.tat}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{level.authority}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">{level.contact}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* SLA circulars */}
          {relevantCirculars.length > 0 && (
            <>
              <section>
                <SectionTitle icon={BookOpen}>SLA circulars to cite</SectionTitle>
                <Accordion type="single" collapsible className="mt-2">
                  {relevantCirculars.map(c => (
                    <AccordionItem key={c.reference} value={c.reference} className="border rounded-md px-3 mb-1.5 border-border">
                      <AccordionTrigger className="py-2 text-xs hover:no-underline">
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline" className="text-[9px] py-0">{c.year}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 space-y-1.5">
                        <p className="text-[11px] font-mono text-muted-foreground">{c.reference}</p>
                        <p className="text-xs text-foreground/80">{c.mandate}</p>
                        <p className="text-[11px] text-muted-foreground italic">→ {c.hospitalAction}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
              <Separator />
            </>
          )}

          {/* Expected outcome */}
          <section>
            <SectionTitle icon={AlertCircle}>Expected outcome</SectionTitle>
            <div className="mt-2 p-3 rounded-md bg-accent/10 border border-accent/30 text-sm text-foreground/85">
              {entry.outcome}
            </div>
          </section>

          {matchedTerms.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Matched on: {matchedTerms.slice(0, 6).map(t => `"${t}"`).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t p-4 flex items-center gap-2 bg-card">
        <Button onClick={copyAppealDraft} className="flex-1 gap-2" size="sm">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy appeal draft"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Phone className="h-3.5 w-3.5" /> Log follow-up
        </Button>
      </div>
    </div>
  );
}

function DrawerHeader({ claim, onClose, subtitle }: { claim: Claim; onClose: () => void; subtitle: string }) {
  return (
    <div className="flex items-start justify-between p-5 border-b">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-display">{claim.claim_number}</h2>
          <Badge variant="destructive" className="text-[10px]">{claim.claim_status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{claim.patient_name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Building2 className="h-3 w-3" /> {claim.tpa_name}
        </p>
        <p className="text-xs font-medium text-foreground mt-2 flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-primary" /> {subtitle}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
          Outstanding: <span className="font-semibold text-destructive">{formatInr(claim.outstanding_amount || claim.claimed_amount)}</span>
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function inferEscalationLevels(escalationText: string): number[] {
  const t = escalationText.toLowerCase();
  const levels: number[] = [1]; // TPA desk is always step 1
  if (t.includes("medical") || t.includes("reviewer") || t.includes("doctor")) levels.push(2);
  if (t.includes("insurer") || t.includes("claims head") || t.includes("cmo") || t.includes("cmd")) levels.push(3);
  if (t.includes("grievance")) levels.push(4);
  if (t.includes("irdai") || t.includes("bima bharosa")) levels.push(5);
  if (t.includes("ombudsman")) levels.push(6);
  if (t.includes("consumer")) levels.push(7);
  if (t.includes("court")) levels.push(8);
  return levels;
}

function buildAppealDraft(claim: Claim, entry: ReturnType<typeof matchPlaybook> extends infer T ? T extends { entry: infer E } ? E : never : never, circularRefs: string[]) {
  const lines = [
    `Subject: Appeal — Cashless claim ${claim.claim_number} (${claim.patient_name})`,
    ``,
    `To: ${claim.tpa_name}${claim.insurance_company_name ? ` / ${claim.insurance_company_name}` : ""}`,
    `Re: Denial — "${entry.reason}"`,
    `Policy clause cited: ${entry.clause}`,
    `Outstanding: ₹${(claim.outstanding_amount || claim.claimed_amount).toLocaleString("en-IN")}`,
    ``,
    `We respectfully appeal the denial of the above cashless claim.`,
    ``,
    `Action steps taken:`,
    ...entry.actions.map((a, i) => `  ${i + 1}. ${a}`),
    ``,
    `Documents enclosed:`,
    ...entry.docs.map(d => `  • ${d}`),
    ``,
    circularRefs.length > 0 ? `Citing SLA references: ${circularRefs.join("; ")}` : "",
    ``,
    `Requested escalation: ${entry.escalation}`,
    `Expected resolution TAT: ${entry.tat}`,
    ``,
    `Regards,`,
    `Insurance Desk — Hospital`,
  ].filter(Boolean);
  return lines.join("\n");
}
