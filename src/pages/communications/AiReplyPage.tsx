import { useState } from "react";
import { Bot, Mail, MessageSquare, FileText, AlertTriangle, Shield, RefreshCw, ClipboardCopy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { mockClaims } from "@/data/mockClaims";

const replyTypes = [
  { id: "query_reply", label: "Query Reply Email", icon: Mail, desc: "Reply to TPA's query/deficiency letter" },
  { id: "denial_appeal", label: "Denial Appeal Letter", icon: FileText, desc: "Formal appeal for rejected claim" },
  { id: "whatsapp_chase", label: "WhatsApp Chase", icon: MessageSquare, desc: "Quick follow-up to TPA contact" },
  { id: "payment_chase", label: "Payment Chase Email", icon: Mail, desc: "Formal email for overdue payment" },
  { id: "irdai_escalation", label: "SLA Escalation Letter", icon: Shield, desc: "Formal complaint citing SLA regulations" },
  { id: "preauth_followup", label: "Pre-auth Follow-up", icon: RefreshCw, desc: "Follow-up for pending pre-auth" },
  { id: "resubmission", label: "Re-submission Cover Letter", icon: FileText, desc: "Cover letter for re-submitted claim" },
];

export default function AiReplyPage() {
  const [selectedClaim, setSelectedClaim] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [context, setContext] = useState("");
  const [generated, setGenerated] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    const claim = mockClaims.find(c => c.id === selectedClaim);
    setTimeout(() => {
      setGenerated(`Subject: Follow-up on Claim ${claim?.claim_number || ''} – ${claim?.patient_name || ''}\n\nDear Sir/Madam,\n\nThis is with reference to the above-mentioned claim filed on behalf of our patient ${claim?.patient_name || '[Patient]'} for treatment of ${claim?.diagnosis || '[Diagnosis]'}.\n\nThe claim was submitted on ${claim?.claim_creation_date || '[Date]'} with a claimed amount of ₹${claim?.claimed_amount?.toLocaleString('en-IN') || '[Amount]'}. It has been ${claim?.days_since_claim || '[X]'} days since submission and we are yet to receive the settlement.\n\nAs per SLA guidelines (IRDA/HLT/CIR/2015-16/119), cashless claims must be settled within 3 hours and reimbursement claims within 30 days of receiving all documents.\n\nWe request you to kindly expedite the processing and settlement of this claim at the earliest.\n\n${context ? `Additional Note: ${context}\n\n` : ''}Thanking you,\n\n[Hospital Contact Details]\nAster Prime Hospital - Hyderabad`);
      setGenerating(false);
    }, 1500);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-foreground">AI Reply Generator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Generate professional claim follow-up messages using AI</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Config */}
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">1. Select Claim</CardTitle></CardHeader>
              <CardContent>
                <Select value={selectedClaim} onValueChange={setSelectedClaim}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose a claim..." /></SelectTrigger>
                  <SelectContent>
                    {mockClaims.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.claim_number} — {c.patient_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">2. Reply Type</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  {replyTypes.map(rt => (
                    <button
                      key={rt.id}
                      onClick={() => setSelectedType(rt.id)}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selectedType === rt.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <rt.icon className={`h-4 w-4 shrink-0 ${selectedType === rt.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <div className="text-sm font-medium">{rt.label}</div>
                        <div className="text-[11px] text-muted-foreground">{rt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">3. Additional Context</CardTitle></CardHeader>
              <CardContent>
                <Textarea placeholder="e.g., TPA said documents were missing, we have now arranged discharge summary..." value={context} onChange={(e) => setContext(e.target.value)} className="text-sm min-h-[80px]" />
              </CardContent>
            </Card>

            <Button onClick={handleGenerate} disabled={!selectedClaim || !selectedType || generating} className="w-full gap-2">
              <Bot className="h-4 w-4" /> {generating ? "Generating..." : "Generate with AI"}
            </Button>
          </div>

          {/* Right: Output */}
          <div>
            <Card className="shadow-sm h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Generated Response</CardTitle>
                  {generated && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => navigator.clipboard.writeText(generated)}>
                        <ClipboardCopy className="h-3 w-3" /> Copy
                      </Button>
                      <Button size="sm" className="text-xs h-7">Use This</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {generated ? (
                  <div className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 min-h-[400px]">{generated}</div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Select a claim and reply type, then click Generate</p>
                    <Badge variant="outline" className="mt-2 text-[10px]">Powered by AI</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
