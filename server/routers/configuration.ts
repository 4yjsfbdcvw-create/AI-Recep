import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenants } from "../../drizzle/schema";
import { publicProcedure, router } from "../_core/trpc";
import { ensureDemoTenant, getDb, getPracticeBundle, updateVoiceIntegration } from "../db";
import { listFemaleReceptionVoices } from "../services/tts";

export const configurationRouter = router({
  get: publicProcedure.query(async () => {
    const tenant = await ensureDemoTenant();
    return getPracticeBundle(tenant.id);
  }),
  voices: publicProcedure.query(async () => listFemaleReceptionVoices()),
  updateVoice: publicProcedure.input(z.object({ voiceId: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/) })).mutation(async ({ input }) => {
    const tenant = await ensureDemoTenant();
    const voices = await listFemaleReceptionVoices();
    const selected = voices.find(voice => voice.id === input.voiceId);
    if (!selected) throw new Error("That ElevenLabs voice is not available to this workspace.");
    await updateVoiceIntegration(tenant.id, selected.id, selected.name);
    return getPracticeBundle(tenant.id);
  }),
  updatePractice: publicProcedure.input(z.object({
    name: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(40),
    email: z.string().trim().email(),
    address: z.string().trim().min(5).max(1000),
    parkingInstructions: z.string().trim().max(2000),
    greeting: z.string().trim().min(10).max(2000),
    bookingWindowDays: z.number().int().min(1).max(365),
    cancellationHours: z.number().int().min(0).max(168),
  })).mutation(async ({ input }) => {
    const tenant = await ensureDemoTenant();
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(tenants).set({ ...input, updatedAt: Date.now() }).where(eq(tenants.id, tenant.id));
    return getPracticeBundle(tenant.id);
  }),
});
