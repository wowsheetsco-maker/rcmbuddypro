import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  Users,
  ShieldAlert,
  Calendar,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  Monitor,
  Heart,
  Upload,
  Send,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  RefreshCw,
  XCircle,
  ScrollText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatInrShort } from "@/data/mockClaims";
import type { InsurerDocument, InsurerProfile, Mode, Relation, SubmissionStatus } from "@/data/insurerProfiles";
import {
  useInsurerContacts,
  findContactForProvider,
  daysUntilContractExpiry,
  CONTRACT_EXPIRY_WARN_DAYS,
  type InsurerContactRow,
} from "@/hooks/useInsurerContacts";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  profile: InsurerProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusBadge: Record<string, string> = {
  active: "bg-accent text-accent-foreground",
  pending_renewal: "bg-warning text-warning-foreground",
  lapsed: "bg-primary text-primary-foreground",
  terminated: "bg-destructive text-destructive-foreground",
};

const relationStyle: Record<Relation, string> = {
  Excellent: "bg-accent text-accent-foreground",
  Good: "bg-secondary text-secondary-foreground",
  Average: "bg-warning text-warning-foreground",
  Strained: "bg-destructive text-destructive-foreground",
};

const modeIcon: Record<Mode, typeof Monitor> = {
  "Online Portal": Monitor,
  Courier: Truck,
  Email: Mail,
  Hybrid: Globe,
};

function initials(name: string) {
  return name
    .split(" ")
    .filter((p) => !/^(mr\.|ms\.|mrs\.|dr\.)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export default function InsurerProfileDrawer({ profile, open, onOpenChange }: Props) {
  if (!profile) return null;
  const ModeIcon = modeIcon[profile.submissionMode];
  const mouDaysLeft = daysUntil(profile.mouEnd);
  const tariffDaysLeft = daysUntil(profile.tariffRenewal);
  const openEscalations = profile.escalations.filter((e) => e.status !== "Resolved");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-muted shrink-0">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-display leading-tight pr-6">{profile.name}</SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="text-[10px] uppercase">{profile.type}</Badge>
                  <Badge className={`text-[10px] ${statusBadge[profile.status]}`}>
                    {profile.status.replace("_", " ")}
                  </Badge>
                  <Badge className={`text-[10px] gap-1 ${relationStyle[profile.relation]}`}>
                    <Heart className="h-2.5 w-2.5" /> {profile.relation}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Quick KPIs */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[
              { label: "Open Claims", value: profile.openClaims, tone: "" },
              { label: "Outstanding", value: formatInrShort(profile.outstanding), tone: profile.outstanding > 1000000 ? "text-destructive" : "" },
              { label: "Avg TAT", value: `${profile.avgTat}d`, tone: profile.avgTat > profile.paymentTat ? "text-destructive" : "text-accent-foreground" },
              { label: "Pay TAT SLA", value: `${profile.paymentTat}d`, tone: "" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-md border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className={`text-sm font-semibold tabular-nums mt-0.5 ${kpi.tone}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="px-6 py-4">
          <TabsList className="grid grid-cols-5 w-full h-9">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="escalation" className="text-xs">
              Escalation
              {openEscalations.length > 0 && (
                <span className="ml-1 px-1 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold">
                  {openEscalations.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
            <TabsTrigger value="spoc" className="text-xs">SPOC & Visits</TabsTrigger>
            <TabsTrigger value="renewal" className="text-xs">Renewal</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Addresses
                </h4>
                <div className="space-y-2 text-xs">
                  <AddressRow label="Head Office" value={profile.hoAddress} />
                  <AddressRow label="Branch Office" value={profile.branchAddress} />
                  <AddressRow label="Document Submission" value={profile.docSubmissionAddress} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Submission & Channels
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <InfoTile icon={ModeIcon} label="Submission Mode" value={profile.submissionMode} />
                  <InfoTile icon={Phone} label="Helpline" value={profile.helplineNumber} href={`tel:${profile.helplineNumber}`} />
                  <a
                    href={profile.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 flex items-center justify-between rounded-md border bg-muted/30 hover:bg-muted px-3 py-2 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Provider Portal</p>
                        <p className="text-xs font-medium">{profile.portalUrl}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ESCALATION MATRIX */}
          <TabsContent value="escalation" className="space-y-4 mt-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Escalation Matrix
              </h4>
              <div className="space-y-2">
                {profile.escalationMatrix.map((c) => (
                  <Card key={c.level}>
                    <CardContent className="pt-3 pb-3 px-4">
                      <div className="flex items-start gap-3">
                        <Badge className="text-[10px] bg-primary text-primary-foreground shrink-0">{c.level}</Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{c.name}</p>
                            <Badge variant="outline" className="text-[9px] gap-1">
                              <Clock className="h-2.5 w-2.5" /> {c.responseHours}h SLA
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{c.designation}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                            <a href={`mailto:${c.email}`} className="text-secondary hover:underline flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.email}
                            </a>
                            <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:underline">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </a>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Active Escalations
              </h4>
              {profile.escalations.length === 0 ? (
                <Card><CardContent className="py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-accent mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No escalations on record</p>
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {profile.escalations.map((e) => (
                    <Card key={e.id}>
                      <CardContent className="pt-3 pb-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Badge variant="outline" className="text-[9px]">{e.raisedBy}</Badge>
                              <Badge className={`text-[9px] ${
                                e.status === "Open" ? "bg-destructive text-destructive-foreground"
                                : e.status === "In Progress" ? "bg-warning text-warning-foreground"
                                : "bg-accent text-accent-foreground"
                              }`}>{e.status}</Badge>
                              <span className="text-[10px] text-muted-foreground">{e.raisedOn} · {e.ageDays}d old</span>
                            </div>
                            <p className="text-xs">{e.subject}</p>
                          </div>
                          {e.status !== "Resolved" && <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* DOCUMENTS */}
          <TabsContent value="documents" className="mt-4 space-y-4">
            <PortalCredentialsCard profile={profile} />
            <DocumentsList profile={profile} />
          </TabsContent>

          {/* SPOC & VISITS */}
          <TabsContent value="spoc" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Hospital SPOC
                </h4>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                      {initials(profile.hospitalSpoc.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{profile.hospitalSpoc.name}</p>
                    <p className="text-xs text-muted-foreground">{profile.hospitalSpoc.role}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                      <a href={`mailto:${profile.hospitalSpoc.email}`} className="text-secondary hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {profile.hospitalSpoc.email}
                      </a>
                      <a href={`tel:${profile.hospitalSpoc.phone}`} className="flex items-center gap-1 hover:underline">
                        <Phone className="h-3 w-3" /> {profile.hospitalSpoc.phone}
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Last Visit / Interaction
                </h4>
                {profile.lastVisit ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="text-[10px] bg-muted text-foreground">{profile.lastVisit.mode}</Badge>
                      <span className="font-medium tabular-nums">{profile.lastVisit.date}</span>
                      <span className="text-muted-foreground">· by {profile.lastVisit.by}</span>
                    </div>
                    <p className="rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed">
                      {profile.lastVisit.discussion}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No visits logged yet</p>
                )}
                <Button size="sm" variant="outline" className="mt-3 h-7 text-xs gap-1">
                  <Calendar className="h-3 w-3" /> Log new visit
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RENEWAL */}
          <TabsContent value="renewal" className="space-y-3 mt-4">
            <RenewalRow label="MOU Period" start={profile.mouStart} end={profile.mouEnd} daysLeft={mouDaysLeft} />
            <RenewalRow label="Tariff / Rate Card" start={profile.tariffEffective} end={profile.tariffRenewal} daysLeft={tariffDaysLeft} />
            <ContractDetailsCard providerName={profile.name} />
            <Card>
              <CardContent className="pt-4 pb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Payment Commitment</h4>
                <div className="flex items-center justify-between text-sm">
                  <span>Committed Payment TAT</span>
                  <span className="font-semibold tabular-nums">{profile.paymentTat} days</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1.5">
                  <span>Current Avg TAT</span>
                  <span className={`font-semibold tabular-nums ${profile.avgTat > profile.paymentTat ? "text-destructive" : "text-accent-foreground"}`}>
                    {profile.avgTat} days {profile.avgTat > profile.paymentTat && `(+${profile.avgTat - profile.paymentTat})`}
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs leading-relaxed">{value}</p>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) {
  const Body = (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate">{value}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="rounded-md border bg-muted/30 hover:bg-muted px-3 py-2 transition-colors">{Body}</a>
  ) : (
    <div className="rounded-md border bg-muted/30 px-3 py-2">{Body}</div>
  );
}

function RenewalRow({
  label,
  start,
  end,
  daysLeft,
}: {
  label: string;
  start: string;
  end: string;
  daysLeft: number;
}) {
  const tone =
    daysLeft < 0 ? "text-destructive" : daysLeft < 30 ? "text-destructive" : daysLeft < 90 ? "text-warning" : "text-accent-foreground";
  const status =
    daysLeft < 0 ? "EXPIRED" : daysLeft < 30 ? "RENEW URGENT" : daysLeft < 90 ? "RENEW SOON" : "ACTIVE";
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4>
          <Badge className={`text-[9px] ${
            daysLeft < 30 ? "bg-destructive text-destructive-foreground"
            : daysLeft < 90 ? "bg-warning text-warning-foreground"
            : "bg-accent text-accent-foreground"
          }`}>{status}</Badge>
        </div>
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span>{start} → {end}</span>
          <span className={`font-semibold ${tone}`}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────── PORTAL CREDENTIALS ────────────────────────────
function PortalCredentialsCard({ profile }: { profile: InsurerProfile }) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creds, setCreds] = useState(
    profile.portalCredentials ?? { username: "", password: "", lastRotated: new Date().toISOString().slice(0, 10), notes: "" },
  );
  const hasCreds = !!profile.portalCredentials;

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const save = () => {
    if (!creds.username.trim() || !creds.password.trim()) {
      toast.error("Username and password are required");
      return;
    }
    // mock persist
    profile.portalCredentials = { ...creds, lastRotated: new Date().toISOString().slice(0, 10) };
    setEditing(false);
    toast.success("Portal credentials saved");
  };

  return (
    <Card className="border-secondary/30">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Provider Portal Credentials
          </h4>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
              <a href={profile.portalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> Open portal
              </a>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditing(true)}>
              <RefreshCw className="h-3 w-3" /> {hasCreds ? "Update" : "Add"}
            </Button>
          </div>
        </div>

        {hasCreds ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">User ID</p>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="font-mono text-xs truncate">{creds.username}</p>
                <button onClick={() => copy("Username", creds.username)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Password</p>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="font-mono text-xs truncate">{show ? creds.password : "••••••••••"}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button onClick={() => copy("Password", creds.password)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
            <div className="col-span-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Last rotated: <span className="tabular-nums font-medium">{creds.lastRotated}</span></span>
              {creds.notes && <span className="italic truncate ml-2">{creds.notes}</span>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No portal credentials saved yet. Click "Add" to store the user ID and password.</p>
        )}

        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Portal credentials — {profile.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Stored securely. Used for "Submit to portal" actions and quick portal sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Portal URL</Label>
                <Input value={profile.portalUrl} readOnly className="h-9 text-xs bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">User ID</Label>
                <Input
                  value={creds.username}
                  maxLength={120}
                  onChange={(e) => setCreds({ ...creds, username: e.target.value })}
                  className="h-9 text-xs"
                  placeholder="e.g. AHMC-MA-9921"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <Input
                  type={show ? "text" : "password"}
                  value={creds.password}
                  maxLength={120}
                  onChange={(e) => setCreds({ ...creds, password: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  value={creds.notes ?? ""}
                  maxLength={300}
                  onChange={(e) => setCreds({ ...creds, notes: e.target.value })}
                  className="text-xs min-h-[60px]"
                  placeholder="Rotation policy, shared with…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={save}>Save credentials</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────── DOCUMENTS LIST ────────────────────────────
const submissionStatusStyle: Record<SubmissionStatus, string> = {
  "Not Submitted": "bg-muted text-muted-foreground",
  "Submitted": "bg-secondary text-secondary-foreground",
  "Acknowledged": "bg-accent text-accent-foreground",
  "Rejected": "bg-destructive text-destructive-foreground",
};

function DocumentsList({ profile }: { profile: InsurerProfile }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitDoc, setSubmitDoc] = useState<InsurerDocument | null>(null);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File exceeds 20MB limit");
      return;
    }
    toast.success(`Uploaded "${file.name}" (${(file.size / 1024).toFixed(0)} KB)`);
    e.target.value = "";
  };

  const onDownload = (d: InsurerDocument) => {
    toast.success(`Downloading ${d.name}…`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Documents ({profile.documents.length})
        </h4>
        <div>
          <input ref={fileRef} type="file" hidden onChange={onUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3" /> Upload new
          </Button>
        </div>
      </div>

      {profile.documents.map((d) => {
        const expDays = d.expiryDate ? daysUntil(d.expiryDate) : null;
        const expiringSoon = expDays !== null && expDays <= 60;
        const sub = d.lastSubmission;
        const SubModeIcon = sub ? (modeIcon[sub.mode as Mode] ?? Mail) : null;
        return (
          <Card key={d.id}>
            <CardContent className="pt-3 pb-3 px-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-muted shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      <Badge variant="outline" className="text-[9px]">{d.type}</Badge>
                      {d.fileSize && <span className="text-[10px] text-muted-foreground">· {d.fileSize}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      Effective {d.effectiveDate}
                      {d.expiryDate ? ` → ${d.expiryDate}` : " · No expiry"}
                      {expiringSoon && expDays !== null && (
                        <span className="text-warning ml-1.5 font-medium">· {expDays}d left</span>
                      )}
                      {d.uploadedOn && <span className="ml-1.5">· uploaded {d.uploadedOn}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onDownload(d)}>
                    <Download className="h-3 w-3" /> Download
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSubmitDoc(d)}>
                    <Send className="h-3 w-3" /> Submit
                  </Button>
                </div>
              </div>

              {/* Last submission strip */}
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px]">
                {sub && SubModeIcon ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <SubModeIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">via</span>
                      <span className="font-medium">{sub.mode}</span>
                      <span className="text-muted-foreground">on</span>
                      <span className="tabular-nums font-medium">{sub.date}</span>
                      {sub.reference && (
                        <span className="text-muted-foreground truncate">· ref {sub.reference}</span>
                      )}
                    </div>
                    <Badge className={`text-[9px] ${submissionStatusStyle[sub.status]}`}>
                      {sub.status === "Acknowledged" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                      {sub.status === "Rejected" && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                      {sub.status}
                    </Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground italic">Not yet submitted to {profile.name}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <SubmitDocumentDialog
        profile={profile}
        doc={submitDoc}
        onClose={() => setSubmitDoc(null)}
      />
    </div>
  );
}

// ──────────────────────────── SUBMIT DIALOG ────────────────────────────
function SubmitDocumentDialog({
  profile,
  doc,
  onClose,
}: {
  profile: InsurerProfile;
  doc: InsurerDocument | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"Online Portal" | "Courier" | "Email" | "In-Person">(
    profile.submissionMode === "Hybrid" ? "Online Portal" : (profile.submissionMode as "Online Portal" | "Courier" | "Email"),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  if (!doc) return null;

  const submit = () => {
    if (!date) {
      toast.error("Submission date is required");
      return;
    }
    if ((mode === "Courier" || mode === "Online Portal") && !reference.trim()) {
      toast.error(mode === "Courier" ? "AWB / tracking number required" : "Portal acknowledgement ID required");
      return;
    }
    // mock persist on the in-memory profile
    doc.lastSubmission = {
      mode,
      date,
      status: mode === "Online Portal" ? "Acknowledged" : "Submitted",
      reference: reference.trim() || undefined,
      submittedBy: profile.hospitalSpoc.name,
    };
    toast.success(`${doc.type} submitted to ${profile.name} via ${mode}`);
    if (mode === "Online Portal") {
      window.open(profile.portalUrl, "_blank", "noopener,noreferrer");
    }
    setReference("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Submit document
          </DialogTitle>
          <DialogDescription className="text-xs">
            {doc.name} · {doc.type} → <span className="font-medium">{profile.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Submission mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Online Portal">Online Portal</SelectItem>
                <SelectItem value="Courier">Courier</SelectItem>
                <SelectItem value="Email">Email</SelectItem>
                <SelectItem value="In-Person">In-Person</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Default mode for {profile.name}: <span className="font-medium">{profile.submissionMode}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Submission date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
          </div>

          {mode === "Online Portal" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Portal acknowledgement ID</Label>
              <Input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MA-PRT-88412" className="h-9 text-xs" />
              <p className="text-[10px] text-muted-foreground">Saving will open the portal in a new tab.</p>
            </div>
          )}
          {mode === "Courier" && (
            <div className="space-y-1.5">
              <Label className="text-xs">AWB / tracking number</Label>
              <Input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="e.g. DTDC-77129" className="h-9 text-xs" />
              <p className="text-[10px] text-muted-foreground">Send to: {profile.docSubmissionAddress}</p>
            </div>
          )}
          {mode === "Email" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Email subject reference (optional)</Label>
              <Input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="e.g. EM-2025-0421" className="h-9 text-xs" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className="text-xs min-h-[60px]" placeholder="Internal note for audit trail" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} className="gap-1">
            <Send className="h-3 w-3" /> Mark submitted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── CONTRACT DETAILS ──────────────────────────
/**
 * Reads/writes `insurer_contacts.contract_expiry_date` for the primary
 * contact matching this provider name. The dispatch-notifications hook
 * reads the same column and emits "contract_expiry" notifications when
 * the date falls within CONTRACT_EXPIRY_WARN_DAYS of today.
 */
function ContractDetailsCard({ providerName }: { providerName: string }) {
  const { contacts, loading, reload } = useInsurerContacts();
  const match = useMemo<InsurerContactRow | undefined>(
    () => findContactForProvider(contacts, providerName),
    [contacts, providerName],
  );
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(match?.contract_expiry_date ?? "");
  }, [match?.id, match?.contract_expiry_date]);

  const daysLeft = daysUntilContractExpiry(value || null);
  const warn =
    daysLeft !== null && daysLeft >= 0 && daysLeft <= CONTRACT_EXPIRY_WARN_DAYS;
  const expired = daysLeft !== null && daysLeft < 0;

  const save = async () => {
    if (!match) return;
    const next = value.trim() ? value : null;
    if (next === (match.contract_expiry_date ?? null)) return;
    setSaving(true);
    const { error } = await supabase
      .from("insurer_contacts")
      .update({ contract_expiry_date: next })
      .eq("id", match.id);
    setSaving(false);
    if (error) {
      toast.error("Could not save contract date", { description: error.message });
      return;
    }
    toast.success(next ? "Contract expiry date saved" : "Contract expiry date cleared");
    await reload();
  };

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5" /> Contract Details
          </h4>
          {warn && (
            <Badge className="text-[9px] bg-warning text-warning-foreground gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              {daysLeft === 0 ? "EXPIRES TODAY" : `RENEW IN ${daysLeft}d`}
            </Badge>
          )}
          {expired && (
            <Badge className="text-[9px] bg-destructive text-destructive-foreground gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              EXPIRED {Math.abs(daysLeft!)}d AGO
            </Badge>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading contact…
          </p>
        ) : !match ? (
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>No contact record found for <span className="font-medium text-foreground">{providerName}</span>.</p>
            <Link
              to="/providers/contacts"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Add one in Settings → Contacts
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="contract-expiry-date" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Contract Expiry Date
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="contract-expiry-date"
                  type="date"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onBlur={() => void save()}
                  disabled={saving}
                  className="h-9 text-xs max-w-[200px]"
                />
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {value && !saving && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setValue("");
                      void save();
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {daysLeft !== null && !warn && !expired && (
                <p className="text-[11px] text-accent-foreground">
                  {daysLeft}d until renewal
                </p>
              )}
              {!value && (
                <p className="text-[11px] text-muted-foreground">
                  Set a date to receive renewal notifications {CONTRACT_EXPIRY_WARN_DAYS} days before expiry.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
