import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { transcribeAudio } from "../_core/voiceTranscription";
import { endCall, processTurn, transferCall } from "../agent/orchestrator";
import { addToolEvent, createCall, ensureDemoTenant, getCall, getVoiceIntegration } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { DEFAULT_ELEVENLABS_VOICE } from "../../shared/voice";
import { generateElevenLabsSpeech } from "../services/tts";

async function demoTenant() {
  return ensureDemoTenant();
}

export const receptionRouter = router({
  start: publicProcedure.mutation(async () => {
    const tenant = await demoTenant();
    return createCall(tenant.id, tenant.greeting);
  }),
  get: publicProcedure.input(z.object({ callId: z.number().int().positive() })).query(async ({ input }) => {
    const tenant = await demoTenant();
    return getCall(tenant.id, input.callId);
  }),
  turn: publicProcedure.input(z.object({ callId: z.number().int().positive(), utterance: z.string().trim().min(1).max(2000) })).mutation(async ({ input }) => {
    const tenant = await demoTenant();
    return processTurn(tenant.id, input.callId, input.utterance);
  }),
  speech: publicProcedure.input(z.object({
    callId: z.number().int().positive(),
    messageId: z.number().int().positive(),
  })).mutation(async ({ input }) => {
    const tenant = await demoTenant();
    const data = await getCall(tenant.id, input.callId);
    const message = data.messages.find(item => item.id === input.messageId && item.speaker === "agent");
    if (!message) throw new Error("The requested agent message was not found in this call.");
    const integration = await getVoiceIntegration(tenant.id);
    const config = (integration?.config ?? {}) as { voiceId?: string; voiceName?: string };
    const voiceId = config.voiceId || DEFAULT_ELEVENLABS_VOICE.id;
    try {
      const result = await generateElevenLabsSpeech(message.body, voiceId);
      await addToolEvent(tenant.id, input.callId, "synthesize_speech", "success", { messageId: message.id }, { provider: result.provider, voiceId: result.voiceId, modelId: result.modelId });
      return { ...result, voiceName: config.voiceName || DEFAULT_ELEVENLABS_VOICE.name };
    } catch (error) {
      await addToolEvent(tenant.id, input.callId, "synthesize_speech", "failure", { messageId: message.id }, { provider: "elevenlabs", error: error instanceof Error ? error.message : "Speech generation failed" });
      throw error;
    }
  }),
  transfer: publicProcedure.input(z.object({ callId: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })).mutation(async ({ input }) => {
    const tenant = await demoTenant();
    return transferCall(tenant.id, input.callId, input.reason);
  }),
  end: publicProcedure.input(z.object({ callId: z.number().int().positive() })).mutation(async ({ input }) => {
    const tenant = await demoTenant();
    return endCall(tenant.id, input.callId);
  }),
  transcribe: publicProcedure.input(z.object({ dataUrl: z.string().min(20), mimeType: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]), size: z.number().max(16 * 1024 * 1024) })).mutation(async ({ input }) => {
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new Error("Invalid audio data");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Recording exceeds the 16MB transcription limit");
    const extension = input.mimeType.includes("ogg") ? "ogg" : input.mimeType.includes("mp4") ? "m4a" : input.mimeType.includes("wav") ? "wav" : input.mimeType.includes("mpeg") ? "mp3" : "webm";
    const uploaded = await storagePut(`voice-simulator/${crypto.randomUUID()}.${extension}`, bytes, input.mimeType);
    const audioUrl = await storageGetSignedUrl(uploaded.key);
    const result = await transcribeAudio({ audioUrl, language: "en", prompt: "Dental appointment conversation with dates, times, treatments, names, and booking references." });
    if ("error" in result) throw new Error(result.error);
    return { text: result.text, language: result.language };
  }),
});
