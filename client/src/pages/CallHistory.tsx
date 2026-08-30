import { PageHeader, StatusPill } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowUpRight, CalendarCheck2, PhoneCall, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useState } from "react";

export default function CallHistory() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: calls, isLoading, error, refetch } = trpc.dashboard.calls.useQuery();
  const { data: detail, error: detailError, refetch: refetchDetail } = trpc.reception.get.useQuery(
    { callId: selectedId ?? 1 },
    { enabled: selectedId !== null },
  );

  if (error) {
    return (
      <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50 shadow-soft">
        <CardContent className="flex flex-col items-center p-10 text-center text-amber-950">
          <AlertTriangle className="h-8 w-8" />
          <h1 className="mt-4 font-display text-xl font-semibold">Call history is temporarily unavailable</h1>
          <p className="mt-2 max-w-md text-sm opacity-75">The audit log has not been altered. Retry when the database connection is restored.</p>
          <Button className="mt-6" variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] enter-soft">
      <PageHeader eyebrow="Quality and compliance" title="Call audit trail" description="Review intent, outcome, booking references, tool evidence, and complete handoff context for every simulated conversation." />
      {isLoading ? <Skeleton className="h-[600px]" /> : (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="border-0 bg-card/95 shadow-soft">
            <CardContent className="p-2">
              <ScrollArea className="max-h-[480px] xl:h-[680px] xl:max-h-none">
                <div className="space-y-1 p-2">
                  {calls?.map(call => (
                    <button key={call.id} onClick={() => setSelectedId(call.id)} className={`w-full rounded-xl p-4 text-left transition-colors ${selectedId === call.id ? "bg-secondary" : "hover:bg-muted/70"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-sm font-semibold">{call.callerName || "Unknown caller"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(call.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
                        <StatusPill tone={call.escalated ? "warning" : call.status === "completed" ? "success" : "neutral"}>{call.escalated ? "handoff" : call.status}</StatusPill>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3"><span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{call.intent?.replaceAll("_", " ") || "Intent pending"}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></div>
                    </button>
                  ))}
                  {!calls?.length && <p className="p-8 text-center text-sm text-muted-foreground">No calls have been recorded yet.</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-0 bg-card/95 shadow-soft">
            <CardContent className="p-6">
              {detailError ? (
                <div className="grid min-h-[300px] place-items-center text-center xl:min-h-[640px]"><div><AlertTriangle className="mx-auto h-8 w-8 text-amber-700" /><h2 className="mt-4 font-display text-lg font-semibold">Unable to load this call</h2><p className="mt-2 text-sm text-muted-foreground">The audit list remains available. Retry this record when the connection recovers.</p><Button className="mt-5" variant="outline" onClick={() => refetchDetail()}><RefreshCw className="mr-2 h-4 w-4" />Retry call</Button></div></div>
              ) : detail ? (
                <div>
                  <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{detail.call.externalId}</p><h2 className="mt-2 font-display text-xl font-semibold">{detail.call.callerName || "Unknown caller"}</h2><p className="mt-1 text-sm text-muted-foreground">{detail.call.summary || "Conversation is still in progress."}</p></div>
                    <StatusPill tone={detail.call.escalated ? "warning" : "success"}>{detail.call.status}</StatusPill>
                  </div>
                  <div className="grid gap-3 py-5 sm:grid-cols-3">
                    <AuditFact icon={PhoneCall} label="Intent" value={detail.call.intent?.replaceAll("_", " ") || "—"} />
                    <AuditFact icon={CalendarCheck2} label="Booking" value={(detail.call.context as Record<string, string> | null)?.appointmentReference || "No transaction"} />
                    <AuditFact icon={ShieldAlert} label="Escalation" value={detail.call.escalated ? "Human handoff" : "Not required"} />
                  </div>
                  {detail.call.escalationReason && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="font-semibold">Handoff context:</span> {detail.call.escalationReason}</div>}
                  <h3 className="font-display text-sm font-semibold">Transcript</h3>
                  <div className="mt-3 max-h-[290px] space-y-3 overflow-auto rounded-2xl border bg-white/55 p-4">{detail.messages.map(message => <div key={message.id} className="grid grid-cols-[70px_1fr] gap-3 text-sm"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{message.speaker}</span><p className="leading-5">{message.body}</p></div>)}</div>
                  <h3 className="mt-5 flex items-center gap-2 font-display text-sm font-semibold"><Wrench className="h-4 w-4" />Tool evidence</h3>
                  <div className="mt-3 space-y-2">{detail.toolEvents.map(event => <div key={event.id} className="flex items-center justify-between rounded-xl border bg-white/55 px-4 py-3"><div><p className="text-xs font-semibold">{event.toolName.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleString("en-GB")}</p></div><StatusPill tone={event.status === "success" ? "success" : event.status === "failure" ? "danger" : "warning"}>{event.status}</StatusPill></div>)}</div>
                </div>
              ) : (
                <div className="grid min-h-[300px] place-items-center text-center xl:min-h-[640px]"><div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><PhoneCall className="h-5 w-5" /></div><h2 className="mt-5 font-display text-lg font-semibold">Select a call to inspect</h2><p className="mt-2 text-sm text-muted-foreground">The full transcript and tool audit will appear here.</p></div></div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AuditFact({ icon: Icon, label, value }: { icon: typeof PhoneCall; label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-3"><Icon className="h-4 w-4 text-primary" /><p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xs font-semibold">{value}</p></div>;
}
