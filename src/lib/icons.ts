/**
 * Single source of truth for icon semantics across the RCM app.
 *
 * Rule: every concept has exactly one icon. Don't import lucide directly
 * for these — import from this map so a "Follow-up" never collides with
 * a "Call" elsewhere in the product.
 */
import {
  CalendarClock,
  PhoneCall,
  MessageCircle,
  Mail,
  Ban,
  ShieldAlert,
  Hourglass,
  CircleCheck,
  Gavel,
  FileSearch,
  FileText,
  TriangleAlert,
  IndianRupee,
  Inbox,
  Activity,
  Building2,
  Stethoscope,
  Users,
  Settings,
  BarChart3,
  ListChecks,
} from "lucide-react";

export const RcmIcons = {
  followUp: CalendarClock,
  call: PhoneCall,
  whatsapp: MessageCircle,
  email: Mail,
  denial: Ban,
  irdaiBreach: ShieldAlert,
  aging: Hourglass,
  paid: CircleCheck,
  appeal: Gavel,
  discrepancy: FileSearch,
  document: FileText,
  warning: TriangleAlert,
  amount: IndianRupee,
  inbox: Inbox,
  activity: Activity,
  hospital: Building2,
  clinical: Stethoscope,
  team: Users,
  settings: Settings,
  analytics: BarChart3,
  worklist: ListChecks,
} as const;

export type RcmIconName = keyof typeof RcmIcons;
