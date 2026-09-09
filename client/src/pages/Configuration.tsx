import { PageHeader, StatusPill } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  AudioLines,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Link2,
  Mic2,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { voiceProviderGuidance } from "@shared/voice";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Configuration() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.configuration.get.useQuery();
  const voices = trpc.configuration.voices.useQuery(undefined, { retry: false });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    parkingInstructions: "",
    greeting: "",
    bookingWindowDays: 60,
    cancellationHours: 24,
  });

  useEffect(() => {
    if (data?.tenant) {
      setForm({
        name: data.tenant.name,
        phone: data.tenant.phone || "",
        email: data.tenant.email || "",
        address: data.tenant.address || "",
        parkingInstructions: data.tenant.parkingInstructions || "",
        greeting: data.tenant.greeting,
        bookingWindowDays: data.tenant.bookingWindowDays,
        cancellationHours: data.tenant.cancellationHours,
      });
    }
  }, [data]);

  const update = trpc.configuration.updatePractice.useMutation({
    onSuccess: async () => {
      await utils.configuration.get.invalidate();
      toast.success("Practice configuration saved");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const updateVoice = trpc.configuration.updateVoice.useMutation({
    onSuccess: async () => {
      await utils.configuration.get.invalidate();
      toast.success("Clara’s ElevenLabs voice updated");
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(form);
  };

  if (isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  if (error || !data) {
    return (
      <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50 shadow-soft">
        <CardContent className="flex flex-col items-center p-10 text-center text-amber-950">
          <AlertTriangle className="h-8 w-8" />
          <h1 className="mt-4 font-display text-xl font-semibold">Practice setup is temporarily unavailable</h1>
          <p className="mt-2 max-w-md text-sm opacity-75">No configuration has been changed. Retry when the practice database is available.</p>
          <Button className="mt-6" variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const voiceAdapters = data.integrations.filter(item => ["stt", "tts", "llm"].includes(item.integrationType));
  const ttsAdapter = data.integrations.find(item => item.integrationType === "tts");
  const ttsConfig = (ttsAdapter?.config ?? {}) as { voiceId?: string; voiceName?: string; modelId?: string; fallback?: string };
  const selectedVoice = voices.data?.find(voice => voice.id === ttsConfig.voiceId);
  const voiceErrorGuidance = voices.error ? voiceProviderGuidance(voices.error.message) : null;

  return (
    <div className="mx-auto max-w-[1500px] enter-soft">
      <PageHeader
        eyebrow="Tenant configuration"
        title="Practice setup"
        description="Manage the authoritative business facts, booking rules, and adapter settings Clara can use in patient conversations."
        actions={<StatusPill tone="success"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Tenant isolated</StatusPill>}
      />
      <Tabs defaultValue="practice">
        <TabsList className="mb-5 h-auto flex-wrap justify-start rounded-xl bg-muted p-1">
          <TabsTrigger value="practice" className="rounded-lg"><Settings2 className="mr-2 h-4 w-4" />Practice</TabsTrigger>
          <TabsTrigger value="hours" className="rounded-lg"><Clock3 className="mr-2 h-4 w-4" />Hours</TabsTrigger>
          <TabsTrigger value="services" className="rounded-lg"><Stethoscope className="mr-2 h-4 w-4" />Services</TabsTrigger>
          <TabsTrigger value="knowledge" className="rounded-lg"><BookOpenText className="mr-2 h-4 w-4" />Knowledge</TabsTrigger>
          <TabsTrigger value="voice" className="rounded-lg"><Mic2 className="mr-2 h-4 w-4" />Voice</TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-lg"><Link2 className="mr-2 h-4 w-4" />Adapters</TabsTrigger>
        </TabsList>

        <TabsContent value="practice">
          <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-0 bg-card/95 shadow-soft">
              <CardHeader><CardTitle className="text-base">Practice profile</CardTitle></CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Field label="Practice name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Telephone"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Email"><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Address"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
                <div className="sm:col-span-2"><Field label="Parking information"><Textarea value={form.parkingInstructions} onChange={e => setForm({ ...form, parkingInstructions: e.target.value })} rows={3} /></Field></div>
                <div className="sm:col-span-2"><Field label="Receptionist greeting"><Textarea value={form.greeting} onChange={e => setForm({ ...form, greeting: e.target.value })} rows={4} /></Field></div>
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card className="border-0 bg-card/95 shadow-soft">
                <CardHeader><CardTitle className="text-base">Booking rules</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <Field label="Booking window (days)"><Input type="number" value={form.bookingWindowDays} onChange={e => setForm({ ...form, bookingWindowDays: Number(e.target.value) })} /></Field>
                  <Field label="Cancellation notice (hours)"><Input type="number" value={form.cancellationHours} onChange={e => setForm({ ...form, cancellationHours: Number(e.target.value) })} /></Field>
                  <div className="rounded-xl bg-secondary p-4 text-xs leading-5 text-secondary-foreground"><Clock3 className="mb-2 h-4 w-4 text-primary" />Availability comes from persisted tenant slots, remains constrained by business hours, and is checked against confirmed appointments.</div>
                </CardContent>
              </Card>
              <Button type="submit" disabled={update.isPending} className="h-12 w-full rounded-xl"><Save className="mr-2 h-4 w-4" />{update.isPending ? "Saving…" : "Save configuration"}</Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="hours">
          <Card className="border-0 bg-card/95 shadow-soft">
            <CardHeader><CardTitle className="text-base">Authoritative business hours</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y overflow-hidden rounded-2xl border bg-white/60">
                {data.hours.map(day => <div key={day.id} className="flex items-center justify-between px-4 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-secondary p-2 text-primary"><Clock3 className="h-4 w-4" /></div><span className="text-sm font-semibold">{dayNames[day.dayOfWeek]}</span></div>{day.isOpen ? <span className="text-sm font-semibold">{day.openTime}–{day.closeTime}</span> : <StatusPill>Closed</StatusPill>}</div>)}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">These hours ground patient answers and constrain the persisted availability ledger. A calendar adapter can later publish slots without changing the call workflow.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.services.map(service => <Card key={service.id} className="border-0 bg-card/95 shadow-soft"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="rounded-xl bg-secondary p-2 text-primary"><Stethoscope className="h-4 w-4" /></div><StatusPill tone={service.active ? "success" : "neutral"}>{service.active ? "Active" : "Paused"}</StatusPill></div><h3 className="mt-5 font-display text-base font-semibold">{service.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{service.description}</p><div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">{service.durationMinutes} minutes</span><span className="font-semibold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: service.currency }).format(service.priceMinor / 100)}</span></div></CardContent></Card>)}
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
          <Card className="border-0 bg-card/95 shadow-soft"><CardHeader><CardTitle className="text-base">Grounded practice knowledge</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{data.knowledge.map(item => <div key={item.id} className="rounded-2xl border bg-white/60 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{item.category}</span><BookOpenText className="h-4 w-4 text-muted-foreground" /></div><h3 className="mt-3 text-sm font-semibold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.content}</p></div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="voice">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-0 bg-card/95 shadow-soft">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AudioLines className="h-4 w-4 text-primary" />Voice pipeline</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Clara’s speaking voice</p><p className="mt-1 text-sm font-semibold">Natural female ElevenLabs voice</p></div><StatusPill tone={voices.error ? "warning" : "success"}>{voices.isLoading ? "Loading" : voices.error ? "Unavailable" : "Connected"}</StatusPill></div>
                  <div className="mt-4"><Label className="text-xs font-semibold">Voice</Label><Select value={ttsConfig.voiceId || "Xb7hH8MSUJpSbSDYk0k2"} onValueChange={voiceId => updateVoice.mutate({ voiceId })} disabled={voices.isLoading || updateVoice.isPending || !voices.data?.length}><SelectTrigger className="mt-2 h-11 bg-white"><SelectValue placeholder="Choose a female voice" /></SelectTrigger><SelectContent>{voices.data?.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}</SelectContent></Select></div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">{voiceErrorGuidance ? `${voiceErrorGuidance.title}. ${voiceErrorGuidance.detail}` : selectedVoice?.description || "Alice provides a clear, friendly British voice suited to a professional dental reception desk."}</p>
                </div>
                {voiceAdapters.map(adapter => <div key={adapter.id} className="flex items-center justify-between rounded-2xl border bg-white/60 p-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{adapter.integrationType}</p><p className="mt-1 text-sm font-semibold">{adapter.provider.replaceAll("_", " ")}</p></div><StatusPill tone={adapter.enabled ? "success" : "neutral"}>{adapter.enabled ? "Active" : "Prepared"}</StatusPill></div>)}
              </CardContent>
            </Card>
            <Card className="border-0 bg-primary text-primary-foreground shadow-soft">
              <CardContent className="p-6"><Mic2 className="h-6 w-6 text-emerald-300" /><h3 className="mt-5 font-display text-xl font-semibold">A more human first impression.</h3><p className="mt-3 text-sm leading-6 text-primary-foreground/70">Clara now uses {ttsConfig.voiceName || "Alice"} through ElevenLabs’ low-latency speech model. The API key stays on the server, generated audio is not persisted, and browser speech remains available as a graceful fallback.</p><div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4 text-xs leading-5 text-primary-foreground/75">Model: {ttsConfig.modelId || "eleven_flash_v2_5"}<br />Fallback: {(ttsConfig.fallback || "browser_speech").replaceAll("_", " ")}</div><p className="mt-4 text-xs leading-5 text-primary-foreground/60">If the ElevenLabs credit balance or key usage limit is reached, the simulator reports the quota issue explicitly, preserves the transcript, and attempts the device voice fallback.</p></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-4 md:grid-cols-2">{data.integrations.map(integration => <Card key={integration.id} className="border-0 bg-card/95 shadow-soft"><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-secondary p-3 text-primary">{integration.integrationType === "stt" ? <Sparkles className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}</div><div className="flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{integration.integrationType}</p><p className="mt-1 text-sm font-semibold">{integration.provider.replaceAll("_", " ")}</p></div><StatusPill tone={integration.enabled ? "success" : "neutral"}>{integration.enabled ? "Connected" : "Prepared"}</StatusPill></CardContent></Card>)}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-xs font-semibold">{label}</Label>{children}</div>;
}
