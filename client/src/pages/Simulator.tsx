import { PageHeader, StatusPill } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { latestAgentMessage, selectPreferredVoice, speechPlaybackErrorMessage } from "@/lib/speech";
import { Bot, CheckCircle2, Headphones, Mic, MicOff, PhoneCall, PhoneOff, Send, Sparkles, UserRound, Volume2, VolumeX, Waves } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type CallData = Awaited<ReturnType<ReturnType<typeof trpc.useUtils>["reception"]["get"]["fetch"]>>;

export default function Simulator() {
  const [callData, setCallData] = useState<CallData | null>(null);
  const [utterance, setUtterance] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "speaking" | "unsupported" | "error">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const lastSpokenMessageIdRef = useRef<number | string | null>(null);
  const start = trpc.reception.start.useMutation({ onSuccess: data => { lastSpokenMessageIdRef.current = null; setCallData(data); } });
  const turn = trpc.reception.turn.useMutation({ onSuccess: data => setCallData(data), onError: error => toast.error(error.message) });
  const transfer = trpc.reception.transfer.useMutation({ onSuccess: data => setCallData(data) });
  const end = trpc.reception.end.useMutation({ onSuccess: data => setCallData(data) });
  const transcribe = trpc.reception.transcribe.useMutation();
  const context = (callData?.call.context ?? {}) as Record<string, unknown>;
  const active = callData?.call.status === "active";
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const voiceNeedsAttention = speechStatus === "unsupported" || speechStatus === "error";
  const voiceLabel = !voiceEnabled ? "voice muted" : speechStatus === "speaking" ? "speaking" : voiceNeedsAttention ? "voice unavailable" : "voice on";

  useEffect(() => {
    if (!speechSupported) {
      setSpeechStatus("unsupported");
      return;
    }
    const loadVoices = () => { availableVoicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  const speakMessage = useCallback((body: string, messageId: number | string) => {
    if (!("speechSynthesis" in window)) {
      setSpeechStatus("unsupported");
      toast.error("Speech playback is not supported in this browser.");
      return;
    }
    const synthesis = window.speechSynthesis;
    const speech = new SpeechSynthesisUtterance(body);
    const voice = selectPreferredVoice(availableVoicesRef.current, "en-GB");
    if (voice) speech.voice = voice;
    speech.lang = voice?.lang || "en-GB";
    speech.rate = 0.96;
    speech.pitch = 1;
    speech.volume = 1;
    speech.onstart = () => setSpeechStatus("speaking");
    speech.onend = () => setSpeechStatus("idle");
    speech.onerror = event => {
      if (event.error === "canceled" || event.error === "interrupted") {
        setSpeechStatus("idle");
        return;
      }
      const availableVoiceCount = synthesis.getVoices().length;
      setSpeechStatus(availableVoiceCount === 0 || event.error === "synthesis-failed" ? "unsupported" : "error");
      console.warn("[Voice playback]", { error: event.error, availableVoiceCount });
      toast.error(speechPlaybackErrorMessage(event.error, availableVoiceCount));
    };
    synthesis.cancel();
    synthesis.resume();
    lastSpokenMessageIdRef.current = messageId;
    synthesis.speak(speech);
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !callData || voiceNeedsAttention) return;
    const latest = latestAgentMessage(callData.messages);
    if (!latest || latest.id === lastSpokenMessageIdRef.current) return;
    speakMessage(latest.body, latest.id);
  }, [callData, speakMessage, voiceEnabled, voiceNeedsAttention]);

  const submit = async (text = utterance) => {
    const clean = text.trim();
    if (!clean || !callData || turn.isPending) return;
    setUtterance("");
    await turn.mutateAsync({ callId: callData.call.id, utterance: clean });
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  const startRecording = async () => {
    if (!callData || !active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = await transcribe.mutateAsync({ dataUrl: reader.result as string, mimeType: (blob.type.split(";")[0] || "audio/webm") as "audio/webm", size: blob.size });
            if (result.text.trim()) await submit(result.text);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to transcribe recording");
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access was not available. You can continue with typed messages.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const speakLatest = () => {
    const latest = latestAgentMessage(callData?.messages ?? []);
    if (latest) speakMessage(latest.body, latest.id);
  };

  const toggleVoice = () => {
    if (!speechSupported) return toast.error("Speech playback is not supported in this browser.");
    if (voiceNeedsAttention) {
      setSpeechStatus("idle");
      setVoiceEnabled(true);
      const latest = latestAgentMessage(callData?.messages ?? []);
      if (latest) speakMessage(latest.body, latest.id);
      return;
    }
    if (voiceEnabled) {
      window.speechSynthesis.cancel();
      setSpeechStatus("idle");
      setVoiceEnabled(false);
      toast.message("Automatic voice replies muted");
      return;
    }
    setVoiceEnabled(true);
    const latest = latestAgentMessage(callData?.messages ?? []);
    if (latest) speakMessage(latest.body, latest.id);
    toast.success("Automatic voice replies enabled");
  };

  return (
    <div className="mx-auto max-w-[1500px] enter-soft">
      <PageHeader eyebrow="Conversation laboratory" title="Call simulator" description="Test realistic dental enquiries and appointment workflows. Every transactional statement is backed by a logged database tool result." actions={callData ? <div className="flex items-center gap-2"><StatusPill tone={active ? "success" : callData.call.escalated ? "warning" : "neutral"}>{active ? "Live call" : callData.call.status}</StatusPill><span className="text-xs text-muted-foreground">{callData.call.externalId}</span></div> : undefined} />

      {!callData ? <Card className="overflow-hidden border-0 bg-[#173e35] text-white shadow-soft"><CardContent className="surface-grid grid min-h-[520px] place-items-center p-8 text-center"><div className="max-w-xl"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"><PhoneCall className="h-7 w-7 text-emerald-200" /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Browser voice lab</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Meet Clara, your dental AI receptionist.</h2><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-white/65">Start a call, type or speak as a patient, and watch Clara classify intent, collect details, check real availability, and create a validated appointment.</p><Button onClick={() => start.mutate()} disabled={start.isPending} className="mt-8 h-12 rounded-full bg-[#f4efdf] px-7 text-[#173e35] hover:bg-white">{start.isPending ? <Waves className="mr-2 h-4 w-4 animate-pulse" /> : <PhoneCall className="mr-2 h-4 w-4" />}Start simulated call</Button></div></CardContent></Card> : (
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="flex min-h-[700px] flex-col overflow-hidden border-0 bg-card/95 shadow-soft">
            <CardHeader className="flex-row items-center justify-between border-b bg-white/55 py-4"><div className="flex items-center gap-3"><div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="h-5 w-5" />{active && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />}</div><div><CardTitle className="text-sm">Clara</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Harbour Dental Studio · {voiceLabel}</p></div></div><div className="flex items-center gap-1 sm:gap-2"><Button variant={voiceEnabled && !voiceNeedsAttention ? "secondary" : "ghost"} size="icon" aria-label={voiceNeedsAttention ? "Retry automatic voice replies" : voiceEnabled ? "Mute automatic voice replies" : "Enable automatic voice replies"} title={voiceNeedsAttention ? "Voice unavailable — click to retry" : voiceEnabled ? "Automatic voice replies are on" : "Automatic voice replies are muted"} onClick={toggleVoice}>{voiceEnabled && !voiceNeedsAttention ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label="Replay latest reply aloud" title="Replay latest reply" onClick={speakLatest}><Headphones className="h-4 w-4" /></Button>{active ? <Button variant="outline" size="sm" className="rounded-full bg-transparent" onClick={() => end.mutate({ callId: callData.call.id })}><PhoneOff className="mr-2 h-4 w-4" />End call</Button> : <Button size="sm" className="rounded-full" onClick={() => start.mutate()}>New call</Button>}</div></CardHeader>
            <ScrollArea className="flex-1"><CardContent className="space-y-4 p-5 sm:p-7">{callData.messages.map(message => <div key={message.id} className={`flex gap-3 ${message.speaker === "customer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.speaker === "customer" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary text-secondary-foreground"}`}><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">{message.speaker === "customer" ? <UserRound className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}{message.speaker}</div>{message.body}</div></div>)}{turn.isPending && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-xs text-muted-foreground"><span className="inline-flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:100ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:200ms]" /></span></div></div>}<div ref={scrollRef} /></CardContent></ScrollArea>
            <div className="border-t bg-white/75 p-4"><div className="flex items-end gap-2"><div className="relative flex-1"><Input value={utterance} onChange={event => setUtterance(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }} disabled={!active || turn.isPending || transcribe.isPending} placeholder={active ? "Type what the patient says…" : "This call has ended"} className="h-12 rounded-xl bg-white pr-12" /><Button variant="ghost" size="icon" disabled={!active || turn.isPending} onClick={isRecording ? stopRecording : startRecording} aria-label={isRecording ? "Stop recording" : "Record voice"} className={`absolute right-1.5 top-1.5 h-9 w-9 rounded-lg ${isRecording ? "bg-red-50 text-red-600" : ""}`}>{isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button></div><Button size="icon" className="h-12 w-12 rounded-xl" disabled={!active || !utterance.trim() || turn.isPending} onClick={() => void submit()} aria-label="Send utterance"><Send className="h-4 w-4" /></Button></div><div className="mt-2 flex flex-col gap-1 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{transcribe.isPending ? "Transcribing secure recording…" : isRecording ? "Listening… tap the microphone to send" : speechStatus === "speaking" ? "Clara is speaking…" : voiceNeedsAttention ? "Browser voice unavailable · use the retry button or transcript" : voiceEnabled ? "Automatic spoken replies on · microphone input supported" : "Spoken replies muted · transcript remains available"}</span><span>AI may be inaccurate; tools stay authoritative</span></div></div>
          </Card>

          <div className="space-y-5">
            <Card className="border-0 bg-card/95 shadow-soft"><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Live call state</CardTitle><StatusPill tone="success">Audited</StatusPill></div></CardHeader><CardContent className="space-y-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">State</p><p className="mt-1 font-display text-lg font-semibold">{callData.call.state.replaceAll("_", " ")}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Intent</p><p className="mt-1 truncate text-xs font-semibold">{callData.call.intent?.replaceAll("_", " ") || "Listening"}</p></div><div className="rounded-xl bg-muted p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p><p className="mt-1 text-xs font-semibold">{callData.call.confidence ? `${callData.call.confidence}%` : "—"}</p></div></div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Extracted details</p><dl className="space-y-2 text-xs">{[["Patient", context.customerName], ["Service", context.serviceName], ["Date", context.date], ["Time", context.time], ["Reference", context.appointmentReference]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4"><dt className="text-muted-foreground">{String(label)}</dt><dd className="max-w-[60%] truncate font-semibold">{String(value || "Not collected")}</dd></div>)}</dl></div></CardContent></Card>
            <Card className="border-0 bg-card/95 shadow-soft"><CardHeader className="pb-3"><CardTitle className="text-base">Tool activity</CardTitle></CardHeader><CardContent className="space-y-3">{callData.toolEvents.length ? callData.toolEvents.slice(0, 5).map(event => <div key={event.id} className="flex items-start gap-3"><div className="mt-0.5 rounded-full bg-emerald-50 p-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /></div><div><p className="text-xs font-semibold">{event.toolName.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{event.status} · {new Date(event.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p></div></div>) : <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Tool results appear here as Clara works.</p>}</CardContent></Card>
            {active && <Button variant="outline" className="h-11 w-full rounded-xl border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" onClick={() => transfer.mutate({ callId: callData.call.id, reason: "Operator initiated handoff from the live simulator." })}><UserRound className="mr-2 h-4 w-4" />Transfer to human</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
