import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Mail,
  Phone,
  MessageCircle,
  Plus,
  MoreVertical,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCheck,
  ArrowUpCircle,
  PhoneCall,
  RotateCcw,
  Send,
  GripVertical,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { formatInr } from "@/data/mockClaims";
import { findContactForProvider } from "@/data/insurerContacts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
} from "@dnd-kit/core";

type TaskStatus = "todo" | "in_progress" | "done";
type Channel = "call" | "email" | "whatsapp";

interface FollowUpTask {
  id: number;
  date: string;
  claim: string;
  patient: string;
  tpa: string;
  channel: Channel;
  outstanding: number;
  status: TaskStatus;
  assigned_to: string;
  sla_days: number;
  note?: string;
}

const STAFF = [
  { initials: "PR", name: "Priya Rao" },
  { initials: "AK", name: "Arjun Khanna" },
  { initials: "SM", name: "Sneha Mehta" },
  { initials: "RV", name: "Rahul Verma" },
  { initials: "NS", name: "Nisha Singh" },
];

const seedTasks: FollowUpTask[] = [
  { id: 1, date: "2025-04-12", claim: "PAQ-001", patient: "V Archana", tpa: "Vidal Health", channel: "email", outstanding: 120000, status: "todo", assigned_to: "PR", sla_days: 1 },
  { id: 2, date: "2025-04-14", claim: "552969", patient: "Mr. Abdul Rasheed", tpa: "Ericson TPA", channel: "whatsapp", outstanding: 75217, status: "todo", assigned_to: "AK", sla_days: 2 },
  { id: 3, date: "2025-04-15", claim: "129799368", patient: "Ale Anjaneyulu", tpa: "Medi Assist", channel: "call", outstanding: 8319, status: "in_progress", assigned_to: "SM", sla_days: 4 },
  { id: 4, date: "2025-04-20", claim: "NI-7-21174", patient: "Vishnu Prabhu S", tpa: "Safeway TPA", channel: "call", outstanding: 45080, status: "in_progress", assigned_to: "RV", sla_days: 6 },
  { id: 5, date: "2025-04-25", claim: "MDI9349537", patient: "Siriki Kannam Naidu", tpa: "MDIndia TPA", channel: "email", outstanding: 118919, status: "todo", assigned_to: "NS", sla_days: 9 },
  { id: 6, date: "2025-04-08", claim: "HX-44521", patient: "Ramesh Iyer", tpa: "Health India", channel: "whatsapp", outstanding: 62400, status: "done", assigned_to: "PR", sla_days: 12 },
  { id: 7, date: "2025-04-10", claim: "PAR-99812", patient: "Lakshmi Devi", tpa: "Paramount TPA", channel: "call", outstanding: 34500, status: "done", assigned_to: "AK", sla_days: 11 },
];

const channelMeta: Record<Channel, { icon: typeof Mail; label: string; cls: string }> = {
  call: { icon: Phone, label: "Call", cls: "bg-secondary/10 text-secondary border-secondary/20" },
  email: { icon: Mail, label: "Email", cls: "bg-accent/10 text-accent border-accent/20" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", cls: "bg-success/10 text-emerald-700 border-emerald-200" },
};

const COLUMNS: { id: TaskStatus; title: string; accent: string; empty: string }[] = [
  { id: "todo", title: "To Do", accent: "bg-muted-foreground", empty: "No pending tasks" },
  { id: "in_progress", title: "In Progress", accent: "bg-warning", empty: "Nothing in progress" },
  { id: "done", title: "Done", accent: "bg-accent", empty: "No completed tasks yet" },
];

function daysOverdue(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

function slaTone(days: number) {
  if (days < 3) return { color: "destructive", label: "Critical", bar: "bg-destructive" };
  if (days <= 7) return { color: "warning", label: "Watch", bar: "bg-warning" };
  return { color: "accent", label: "Healthy", bar: "bg-accent" };
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

/** Build a default follow-up message body from the task. */
function composeMessage(task: FollowUpTask): { subject: string; body: string } {
  const subject = `Follow-up: Claim ${task.claim} – ${task.patient} – Outstanding ${formatInr(task.outstanding)}`;
  const body = [
    `Dear Sir/Madam,`,
    ``,
    `This is a follow-up regarding the below claim pending settlement with ${task.tpa}:`,
    ``,
    `• Claim Number: ${task.claim}`,
    `• Patient Name: ${task.patient}`,
    `• Outstanding Amount: ${formatInr(task.outstanding)}`,
    `• Days since submission: ${task.sla_days < 15 ? 15 - task.sla_days : "exceeded 15 days"}`,
    ``,
    `As per SLA guidelines, we request settlement / a status update at the earliest.`,
    task.note ? `\nNote: ${task.note}` : ``,
    ``,
    `Thanks & Regards,`,
    `RCM Team`,
  ].join("\n");
  return { subject, body };
}

export default function FollowUpCalendarPage() {
  const [tasks, setTasks] = useState<FollowUpTask[]>(seedTasks);
  const [assignOpen, setAssignOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(new Date());
  const [newAssignee, setNewAssignee] = useState<string>("PR");
  const [newChannel, setNewChannel] = useState<Channel>("call");
  const [newClaim, setNewClaim] = useState("");
  const [newPatient, setNewPatient] = useState("");
  const [newNote, setNewNote] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const metrics = useMemo(() => {
    const overdue = tasks.filter((t) => t.status !== "done" && daysOverdue(t.date) > 0).length;
    const dueToday = tasks.filter((t) => t.status !== "done" && isToday(t.date)).length;
    const thisWeek = tasks.filter((t) => t.status !== "done" && isThisWeek(t.date)).length;
    const completedMonth = tasks.filter((t) => {
      if (t.status !== "done") return false;
      const d = new Date(t.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { overdue, dueToday, thisWeek, completedMonth };
  }, [tasks]);

  const grouped = useMemo(
    () => ({
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  const updateStatus = (id: number, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    toast.success(`Task moved to ${status.replace("_", " ")}`);
  };

  const reschedule = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = new Date(t.date);
        next.setDate(next.getDate() + 3);
        return { ...t, date: next.toISOString().slice(0, 10) };
      }),
    );
    toast.success("Rescheduled by 3 days");
  };

  const escalate = (id: number) => toast.warning(`Task #${id} escalated to manager`);
  const logCall = (id: number) => toast.success(`Call logged for task #${id}`);

  /** Channel-aware send: pulls TPA contact from Settings → Insurer Contacts. */
  const handleSend = (task: FollowUpTask) => {
    const contact = findContactForProvider(task.tpa);
    const { subject, body } = composeMessage(task);

    if (task.channel === "email") {
      if (!contact?.email) {
        toast.error(`No email on file for ${task.tpa}. Add one in Settings → Contacts.`);
        return;
      }
      const url = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      toast.success(`Email drafted to ${contact.name} (${contact.email})`);
      return;
    }
    if (task.channel === "whatsapp") {
      const number = contact?.whatsapp?.replace(/\D/g, "");
      if (!number) {
        toast.error(`No WhatsApp number on file for ${task.tpa}. Add one in Settings → Contacts.`);
        return;
      }
      const url = `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener");
      toast.success(`WhatsApp opened for ${contact!.name}`);
      return;
    }
    // call
    if (!contact?.phone) {
      toast.error(`No phone on file for ${task.tpa}. Add one in Settings → Contacts.`);
      return;
    }
    window.location.href = `tel:${contact.phone.replace(/\s/g, "")}`;
    toast.success(`Calling ${contact.name} (${contact.phone})`);
  };

  const handleCreate = () => {
    if (!newClaim || !newPatient || !newDueDate) {
      toast.error("Claim, patient and due date are required");
      return;
    }
    const id = Math.max(...tasks.map((t) => t.id)) + 1;
    setTasks((prev) => [
      ...prev,
      {
        id,
        date: newDueDate.toISOString().slice(0, 10),
        claim: newClaim,
        patient: newPatient,
        tpa: "—",
        channel: newChannel,
        outstanding: 0,
        status: "todo",
        assigned_to: newAssignee,
        sla_days: 10,
        note: newNote,
      },
    ]);
    toast.success(`Assigned to ${STAFF.find((s) => s.initials === newAssignee)?.name}`);
    setAssignOpen(false);
    setNewClaim("");
    setNewPatient("");
    setNewNote("");
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(Number(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = Number(active.id);
    const overId = String(over.id);
    // Either dropped on a column (id is column status) or on a card (find that card's status)
    let nextStatus: TaskStatus | undefined;
    if (overId === "todo" || overId === "in_progress" || overId === "done") {
      nextStatus = overId;
    } else {
      const overTask = tasks.find((t) => t.id === Number(overId));
      nextStatus = overTask?.status;
    }
    if (!nextStatus) return;
    setTasks((prev) => {
      const cur = prev.find((t) => t.id === taskId);
      if (!cur || cur.status === nextStatus) return prev;
      return prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus! } : t));
    });
    const cur = tasks.find((t) => t.id === taskId);
    if (cur && cur.status !== nextStatus) {
      toast.success(`Moved to ${nextStatus.replace("_", " ")}`);
    }
  };

  const activeTask = activeId != null ? tasks.find((t) => t.id === activeId) : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Follow-up Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Drag cards between columns to update status. Send button uses contacts from Settings.
            </p>
          </div>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Assign Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign follow-up task</DialogTitle>
                <DialogDescription>
                  Email & WhatsApp contacts auto-populate from Settings → Insurer / TPA contacts when sending.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Claim #</label>
                    <Input value={newClaim} onChange={(e) => setNewClaim(e.target.value)} placeholder="e.g. PAQ-1024" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Patient</label>
                    <Input value={newPatient} onChange={(e) => setNewPatient(e.target.value)} placeholder="Patient name" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Assign to</label>
                  <Select value={newAssignee} onValueChange={setNewAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAFF.map((s) => (
                        <SelectItem key={s.initials} value={s.initials}>
                          {s.name} ({s.initials})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Due date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start font-normal", !newDueDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newDueDate ? format(newDueDate, "PP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={newDueDate} onSelect={setNewDueDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Channel</label>
                    <Select value={newChannel} onValueChange={(v) => setNewChannel(v as Channel)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="email">Email (auto from Settings)</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp (auto from Settings)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Note</label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Context for the follow-up (deduction reason, query, etc.)"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create task</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary metrics — unified KpiCard */}
        <KpiGrid cols={4}>
          <MetricCard icon={AlertTriangle} label="Overdue" value={metrics.overdue} tone="destructive" />
          <MetricCard icon={Clock} label="Due Today" value={metrics.dueToday} tone="warning" />
          <MetricCard icon={TrendingUp} label="This Week" value={metrics.thisWeek} tone="secondary" />
          <MetricCard icon={CheckCheck} label="Completed (month)" value={metrics.completedMonth} tone="accent" />
        </KpiGrid>

        {/* Kanban with DnD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {COLUMNS.map((col) => (
              <DroppableColumn key={col.id} id={col.id} title={col.title} count={grouped[col.id].length} accent={col.accent}>
                {grouped[col.id].map((t) => (
                  <DraggableTaskCard
                    key={t.id}
                    task={t}
                    onStatus={updateStatus}
                    onReschedule={reschedule}
                    onEscalate={escalate}
                    onLogCall={logCall}
                    onSend={handleSend}
                  />
                ))}
                {grouped[col.id].length === 0 && <EmptyState text={col.empty} />}
              </DroppableColumn>
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="rotate-2 opacity-95">
                <TaskCard task={activeTask} onStatus={() => {}} onReschedule={() => {}} onEscalate={() => {}} onLogCall={() => {}} onSend={() => {}} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </AppLayout>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  tone: "destructive" | "warning" | "secondary" | "accent";
}) {
  const iconTone: Record<string, string> = {
    destructive: "text-destructive",
    warning: "text-warning",
    secondary: "text-secondary",
    accent: "text-accent",
  };
  return (
    <KpiCard
      label={label}
      value={value}
      empty={value === 0}
      tone={tone === "destructive" ? "denial" : "default"}
      icon={<Icon className={cn("h-3.5 w-3.5", iconTone[tone])} />}
    />
  );
}

function DroppableColumn({
  id,
  title,
  count,
  accent,
  children,
}: {
  id: TaskStatus;
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-muted/40 rounded-lg border border-border/60 flex flex-col min-h-[300px] transition-colors",
        isOver && "bg-primary/5 border-primary/40 ring-2 ring-primary/20",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", accent)} />
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{count}</Badge>
        </div>
      </div>
      <div className="p-2.5 space-y-2.5 flex-1">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center text-xs text-muted-foreground py-8 italic border-2 border-dashed border-border/60 rounded-md">
      {text}
    </div>
  );
}

function DraggableTaskCard(props: {
  task: FollowUpTask;
  onStatus: (id: number, s: TaskStatus) => void;
  onReschedule: (id: number) => void;
  onEscalate: (id: number) => void;
  onLogCall: (id: number) => void;
  onSend: (t: FollowUpTask) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id });
  return (
    <div
      ref={setNodeRef}
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      <TaskCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskCard({
  task,
  onStatus,
  onReschedule,
  onEscalate,
  onLogCall,
  onSend,
  dragHandleProps,
  dragging,
}: {
  task: FollowUpTask;
  onStatus: (id: number, s: TaskStatus) => void;
  onReschedule: (id: number) => void;
  onEscalate: (id: number) => void;
  onLogCall: (id: number) => void;
  onSend: (t: FollowUpTask) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: any;
  dragging?: boolean;
}) {
  const overdue = daysOverdue(task.date);
  const isOverdue = overdue > 0 && task.status !== "done";
  const ChannelIcon = channelMeta[task.channel].icon;
  const sla = slaTone(task.sla_days);
  const slaPct = Math.max(0, Math.min(100, (task.sla_days / 15) * 100));
  const assignee = STAFF.find((s) => s.initials === task.assigned_to);
  const contact = findContactForProvider(task.tpa);
  const sendLabel =
    task.channel === "email" ? "Email" : task.channel === "whatsapp" ? "WhatsApp" : "Call";
  const canSend =
    task.channel === "email"
      ? !!contact?.email
      : task.channel === "whatsapp"
      ? !!contact?.whatsapp
      : !!contact?.phone;

  return (
    <Card className={cn(
      "shadow-sm border bg-card hover:shadow-md transition-shadow",
      isOverdue && "border-destructive/40 bg-destructive/[0.03]",
      dragging && "shadow-xl ring-2 ring-primary/40",
    )}>
      <CardContent className="p-3 space-y-2.5">
        {/* Header with drag handle */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <button
              {...dragHandleProps}
              aria-label="Drag task"
              className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground -ml-1 mt-0.5 p-0.5 rounded hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0">
              <div className="font-mono text-xs text-muted-foreground">{task.claim}</div>
              <div className="font-semibold text-sm truncate">{task.patient}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {task.tpa}
                {contact && <span className="ml-1 text-accent">• contact ✓</span>}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Quick actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {task.status !== "done" && (
                <DropdownMenuItem onClick={() => onStatus(task.id, "done")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Done
                </DropdownMenuItem>
              )}
              {task.status === "todo" && (
                <DropdownMenuItem onClick={() => onStatus(task.id, "in_progress")}>
                  <ArrowUpCircle className="h-3.5 w-3.5 mr-2" /> Start
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onReschedule(task.id)}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reschedule (+3d)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEscalate(task.id)}>
                <ArrowUpCircle className="h-3.5 w-3.5 mr-2" /> Escalate to Manager
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLogCall(task.id)}>
                <PhoneCall className="h-3.5 w-3.5 mr-2" /> Log Call
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Outstanding */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Outstanding</span>
          <span className="font-semibold text-sm tabular-nums">{formatInr(task.outstanding)}</span>
        </div>

        {/* Channel + due */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className={cn("text-[10px] gap-1 font-medium", channelMeta[task.channel].cls)}>
            <ChannelIcon className="h-3 w-3" />
            {channelMeta[task.channel].label}
          </Badge>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            {format(new Date(task.date), "dd MMM")}
          </div>
        </div>

        {/* Overdue indicator */}
        {isOverdue && (
          <div className="text-[11px] font-medium text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {overdue} {overdue === 1 ? "day" : "days"} overdue
          </div>
        )}

        {/* SLA progress */}
        <div className="space-y-1 pt-1 border-t border-border/60">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground uppercase tracking-wide">SLA SLA</span>
            <span className={cn(
              "font-semibold",
              sla.color === "destructive" && "text-destructive",
              sla.color === "warning" && "text-warning",
              sla.color === "accent" && "text-accent",
            )}>
              {task.sla_days}d left · {sla.label}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", sla.bar)}
              style={{ width: `${slaPct}%` }}
            />
          </div>
        </div>

        {/* Footer: assignee + send */}
        <div className="flex items-center justify-between pt-1 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground">
                {task.assigned_to}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-muted-foreground truncate">{assignee?.name}</span>
          </div>
          <Button
            size="sm"
            variant={canSend ? "default" : "outline"}
            className="h-7 px-2 text-[11px] gap-1"
            disabled={!canSend && task.channel !== "call"}
            onClick={(e) => {
              e.stopPropagation();
              onSend(task);
            }}
            title={
              canSend
                ? `Send via ${sendLabel} to ${contact?.name}`
                : `No ${sendLabel} on file — add in Settings`
            }
          >
            <Send className="h-3 w-3" />
            {sendLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
