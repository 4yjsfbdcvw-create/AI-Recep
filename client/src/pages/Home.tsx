import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, StatusPill } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowRight, CalendarCheck2, Clock3, PhoneCall, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { useLocation } from "wouter";

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.dashboard.overview.useQuery();
  if (isLoading) return <div className="space-y-5"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (error || !data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">The practice overview could not be loaded. {error?.message}</div>;

  const totalCalls = Number(data.metrics.calls?.total ?? 0);
  const escalated = Number(data.metrics.calls?.escalated ?? 0);
  const handledRate = totalCalls ? Math.round(((totalCalls - escalated) / totalCalls) * 100) : 100;
  const metrics = [
    { label: "Calls today", value: totalCalls, meta: "Browser simulator", icon: PhoneCall },
    { label: "AI handled", value: `${handledRate}%`, meta: "Guardrailed workflows", icon: Sparkles },
    { label: "Appointments", value: Number(data.metrics.bookings?.confirmed ?? 0), meta: "Confirmed today", icon: CalendarCheck2 },
    { label: "Human handoffs", value: escalated, meta: "Context preserved", icon: UserRoundCheck },
  ];

  return (
    <div className="mx-auto max-w-[1500px] enter-soft">
      <PageHeader eyebrow="Harbour Dental Studio" title="Good afternoon" description="Monitor today’s patient conversations, appointment flow, and safety handoffs from one calm workspace." actions={<Button onClick={() => navigate("/simulator")} className="h-11 rounded-full px-5 shadow-soft"><PhoneCall className="mr-2 h-4 w-4" />Start simulated call</Button>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => <Card key={metric.label} className="border-0 bg-card/90 shadow-soft" style={{ animationDelay: `${index * 45}ms` }}><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-muted-foreground">{metric.label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em]">{metric.value}</p><p className="mt-2 text-xs text-muted-foreground">{metric.meta}</p></div><div className="rounded-xl bg-secondary p-2.5 text-primary"><metric.icon className="h-5 w-5" /></div></div></CardContent></Card>)}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <Card className="border-0 bg-card/95 shadow-soft">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><div><CardTitle className="text-base">Today’s appointment book</CardTitle><p className="mt-1 text-xs text-muted-foreground">Live from the internal booking database</p></div><StatusPill tone="success"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />System of record</StatusPill></CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border bg-white/70">
              {data.schedule.length ? data.schedule.map((appointment, index) => <div key={appointment.id} className={`grid grid-cols-[70px_1fr_auto] items-center gap-4 px-4 py-4 ${index ? "border-t" : ""}`}><div className="font-display text-sm font-semibold">{formatTime(appointment.startAt)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{appointment.customerName}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.serviceName} · {appointment.durationMinutes} min</p></div><StatusPill tone={appointment.status === "confirmed" ? "success" : "neutral"}>{appointment.status}</StatusPill></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No appointments are scheduled for today.</div>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden border-0 bg-[#173e35] text-white shadow-soft"><CardContent className="surface-grid p-6"><div className="flex items-center gap-2 text-emerald-200"><ShieldCheck className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Safety posture</span></div><h2 className="mt-5 font-display text-xl font-semibold">Transactional claims stay grounded.</h2><p className="mt-2 text-sm leading-6 text-white/65">Clara can only confirm availability or bookings after a validated database operation succeeds.</p><div className="mt-5 flex items-center gap-2 text-xs text-white/75"><span className="h-2 w-2 rounded-full bg-emerald-300" />All guardrails operational</div></CardContent></Card>
          <Card className="border-0 bg-card/95 shadow-soft"><CardHeader className="pb-3"><CardTitle className="text-base">Practice pulse</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" />Agent status</span><StatusPill tone="success">Ready</StatusPill></div><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Opening today</span><span className="font-semibold">08:30–17:30</span></div><Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={() => navigate("/configuration")}>Review practice setup<ArrowRight className="ml-auto h-4 w-4" /></Button></CardContent></Card>
        </div>
      </section>

      <Card className="mt-5 border-0 bg-card/95 shadow-soft"><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">Recent conversations</CardTitle><p className="mt-1 text-xs text-muted-foreground">Intent, outcome, and escalation context</p></div><Button variant="ghost" size="sm" onClick={() => navigate("/calls")}>View audit trail<ArrowRight className="ml-2 h-4 w-4" /></Button></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-2">{data.calls.slice(0, 4).map(call => <div key={call.id} className="rounded-2xl border bg-white/60 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{call.callerName || "Unknown caller"}</p><p className="mt-1 text-xs text-muted-foreground">{call.intent?.replaceAll("_", " ") || "Intent pending"} · {new Date(call.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p></div><StatusPill tone={call.escalated ? "warning" : call.status === "completed" ? "success" : "neutral"}>{call.escalated ? "Handoff" : call.status}</StatusPill></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{call.summary || "Conversation in progress."}</p></div>)}{!data.calls.length && <div className="col-span-2 rounded-2xl border border-dashed p-7 text-center text-sm text-muted-foreground">Start a simulated call to populate the live audit trail.</div>}</div></CardContent></Card>
    </div>
  );
}
