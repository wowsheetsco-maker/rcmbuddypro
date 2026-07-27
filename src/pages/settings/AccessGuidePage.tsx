import { Link } from "@/lib/router-compat";
import {
  ShieldCheck, Crown, Building2, UserCog, Users, ArrowRight, Info,
  Hospital, Landmark, CheckCircle2, XCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Persona {
  key: string;
  label: string;
  icon: typeof Crown;
  who: string;
  can: string[];
  cannot: string[];
  example: string;
  tone: string;
}

const PERSONAS: Persona[] = [
  {
    key: "super_admin",
    label: "Platform Super Admin",
    icon: Crown,
    who: "RCM Buddy internal staff. Stored by email in the platform admin list — never assignable from inside a hospital.",
    can: [
      "Create hospital groups and organisations",
      "Turn product modules on/off per hospital",
      "Promote the first Org Owner for a new hospital",
      "See every organisation on the platform",
    ],
    cannot: ["Be added by a hospital admin", "Be granted from Settings → Users"],
    example:
      "Apollo signs a contract. The Super Admin creates the “Apollo Group” org, enables Claims + OPD modules, and promotes Dr. Rao's account to Org Owner. From that point Apollo runs itself.",
    tone: "border-destructive/30 bg-destructive/5",
  },
  {
    key: "org_owner",
    label: "Org Owner",
    icon: Building2,
    who: "The hospital (or group) head — usually the CFO, COO or Director of Operations.",
    can: [
      "Add and rename branches inside their own group",
      "Invite anyone and set their capability role",
      "Edit the Permissions Matrix for their hospital",
      "Set branch scope and TPA allocations per user",
      "Read the full access audit log",
    ],
    cannot: ["Create a brand-new hospital group", "See other hospitals' data"],
    example:
      "Apollo's COO adds “Apollo Bannerghatta” as a branch, invites 12 billing staff, and restricts each to their own branch.",
    tone: "border-primary/30 bg-primary/5",
  },
  {
    key: "org_admin",
    label: "Org Admin",
    icon: UserCog,
    who: "Day-to-day administrator acting on the Owner's behalf — typically the RCM/Insurance Desk Manager.",
    can: [
      "Invite staff and assign capability roles",
      "Manage branches created by the Owner",
      "Set branch scope and TPA allocations",
      "View the access audit log",
    ],
    cannot: ["Change the Permissions Matrix itself", "Remove the Org Owner", "Enable/disable paid modules"],
    example:
      "The Insurance Desk Manager onboards a new Billing Executive, assigns her Star Health + Care as her payers, and limits her to the Whitefield branch.",
    tone: "border-amber-500/30 bg-amber-500/5",
  },
  {
    key: "member",
    label: "Members (staff)",
    icon: Users,
    who: "Everyone else — RCM Manager, Billing Executive, Auditor, CFO View.",
    can: [
      "Work only inside the modules their capability role allows",
      "See only the branches in their branch scope",
      "See only the payers allocated to them (when allocations exist)",
    ],
    cannot: ["Invite users", "Change permissions", "Change their own scope"],
    example:
      "A Billing Executive opens Claims and sees 412 rows — her branch, her two TPAs. An Auditor in the same hospital sees all 3,900 rows but cannot edit any of them.",
    tone: "border-border bg-muted/30",
  },
];

const LAYERS = [
  {
    n: 1,
    title: "Org membership (owner / admin / manager / member / viewer)",
    body: "Decides structural power — who may invite people, add branches, and open Settings.",
  },
  {
    n: 2,
    title: "Capability role (RCM Manager, Billing Executive, Auditor, CFO View…)",
    body: "Decides what each person can do in each module: view, create, edit, delete, export, send, approve. Edited on the Permissions Matrix.",
  },
  {
    n: 3,
    title: "Data scope (branch scope + TPA allocation)",
    body: "Decides which rows they see. Two Billing Executives can hold identical permissions and still see completely different claims.",
  },
];

export default function AccessGuidePage() {
  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <div>
          <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Access &amp; Roles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Who can do what in RCM Buddy — and how to give your team exactly the right access.
          </p>
        </div>

        <Alert className="bg-primary/5 border-primary/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs text-foreground/80">
            Access is decided by <strong>three independent layers</strong>. A person needs all three to line up
            before they can act on a claim.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="p-5 grid gap-3 md:grid-cols-3">
            {LAYERS.map((l) => (
              <div key={l.n} className="rounded-lg border border-border p-4">
                <Badge variant="outline" className="text-[10px] mb-2">Layer {l.n}</Badge>
                <p className="text-sm font-semibold leading-snug">{l.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{l.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.key} className={`border ${p.tone}`}>
                <CardContent className="p-5 space-y-3">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" /> {p.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">{p.who}</p>
                  <ul className="space-y-1">
                    {p.can.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> {c}
                      </li>
                    ))}
                    {p.cannot.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5 text-destructive/70 shrink-0 mt-0.5" /> {c}
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-md bg-background/70 border border-border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                      Example
                    </p>
                    <p className="text-xs">{p.example}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-base font-semibold mb-2">Common questions</h2>
            <Accordion type="single" collapsible>
              <AccordionItem value="a">
                <AccordionTrigger className="text-sm">A staff member can open a module but sees no rows. Why?</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  Layer 2 passed but layer 3 didn't. Open Settings → Users, edit the person, and check their branch
                  scope and TPA allocations. The <strong>Data scope preview</strong> on that screen shows exactly
                  which rows they'll get before you save.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="b">
                <AccordionTrigger className="text-sm">How do I give someone read-only finance access?</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  Assign the <em>CFO View</em> capability role, leave branch scope on “All branches”, and confirm on
                  the Permissions Matrix that only <em>View</em> and <em>Export</em> are ticked for that role.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="c">
                <AccordionTrigger className="text-sm">Who can add a new hospital or branch?</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  Creating a hospital <em>group</em> is Platform Super Admin only. Adding <em>branches</em> inside
                  your own group is available to the Org Owner and Org Admin under Settings → Hospital Branches.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="d">
                <AccordionTrigger className="text-sm">How do I prove to an auditor who changed access?</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  Settings → Access Audit Log records every role change, permission toggle, and scope update with
                  who did it, when, and the before/after values. Entries can't be edited or deleted.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/settings/onboarding"><Hospital className="h-3.5 w-3.5" /> Start onboarding wizard</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/settings/permissions"><ShieldCheck className="h-3.5 w-3.5" /> Permissions matrix</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/settings/users"><Users className="h-3.5 w-3.5" /> Users &amp; roles</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/settings/access-audit"><Landmark className="h-3.5 w-3.5" /> Access audit log</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-1.5">
            <Link to="/settings">Back to Admin Console <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
