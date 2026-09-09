import { and, asc, desc, eq, gt, gte, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  appointments,
  availabilitySlots,
  businessHours,
  callMessages,
  calls,
  confirmations,
  customers,
  integrationConfigs,
  InsertUser,
  knowledgeItems,
  services,
  tenants,
  toolEvents,
  users,
} from "../drizzle/schema";
import type { CallContext } from "../shared/reception";
import { DEFAULT_ELEVENLABS_VOICE } from "../shared/voice";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function ensureDemoTenant() {
  const db = await requireDb();
  const existing = (await db.select().from(tenants).where(eq(tenants.slug, "harbour-dental")).limit(1))[0];
  if (existing) {
    if (process.env.ELEVENLABS_API_KEY) {
      const currentTts = (await db.select().from(integrationConfigs).where(and(eq(integrationConfigs.tenantId, existing.id), eq(integrationConfigs.integrationType, "tts"))).limit(1))[0];
      if (!currentTts || currentTts.provider !== "elevenlabs") {
        await updateVoiceIntegration(existing.id, DEFAULT_ELEVENLABS_VOICE.id, DEFAULT_ELEVENLABS_VOICE.name);
      }
    }
    await ensureAvailabilitySlots(existing.id);
    return existing;
  }

  const now = Date.now();
  const [{ id: tenantId }] = await db.insert(tenants).values({
    name: "Harbour Dental Studio",
    slug: "harbour-dental",
    timezone: "Europe/London",
    phone: "+44 20 7946 0182",
    email: "hello@harbourdental.example",
    address: "18 Wren Street, London, W1",
    parkingInstructions: "Two patient bays are available behind the practice. Metered parking is available on Wren Street.",
    greeting: "Good afternoon, you’ve reached Harbour Dental Studio. I’m Clara, the virtual receptionist. How may I help today?",
    bookingWindowDays: 60,
    cancellationHours: 24,
    slotIntervalMinutes: 15,
    voiceProvider: "browser",
    llmProvider: "gpt-5-mini",
    createdAt: now,
    updatedAt: now,
  }).$returningId();

  await db.insert(services).values([
    { tenantId, name: "New patient examination", description: "A comprehensive oral health assessment for new patients.", durationMinutes: 45, priceMinor: 9500, currency: "GBP", createdAt: now, updatedAt: now },
    { tenantId, name: "Routine dental check-up", description: "Routine examination, oral cancer screening, and prevention advice.", durationMinutes: 30, priceMinor: 6500, currency: "GBP", createdAt: now, updatedAt: now },
    { tenantId, name: "Dental hygiene", description: "Professional clean, gum-health review, and tailored home-care advice.", durationMinutes: 45, priceMinor: 8900, currency: "GBP", createdAt: now, updatedAt: now },
    { tenantId, name: "Emergency consultation", description: "Urgent assessment for dental pain, swelling, or a broken tooth.", durationMinutes: 30, priceMinor: 8500, currency: "GBP", createdAt: now, updatedAt: now },
    { tenantId, name: "Teeth whitening consultation", description: "Suitability assessment and personalised whitening plan.", durationMinutes: 30, priceMinor: 5000, currency: "GBP", createdAt: now, updatedAt: now },
  ]);

  await db.insert(businessHours).values(DAY_NAMES.map((_, dayOfWeek) => ({
    tenantId,
    dayOfWeek,
    isOpen: dayOfWeek >= 1 && dayOfWeek <= 6,
    openTime: dayOfWeek === 6 ? "09:00" : dayOfWeek === 0 ? null : "08:30",
    closeTime: dayOfWeek === 6 ? "14:00" : dayOfWeek === 0 ? null : "17:30",
  })));

  await db.insert(knowledgeItems).values([
    { tenantId, category: "location", title: "Practice address", content: "Harbour Dental Studio is at 18 Wren Street, London, W1.", keywords: "where address directions location", createdAt: now, updatedAt: now },
    { tenantId, category: "parking", title: "Parking", content: "Two patient parking bays are behind the practice, and metered parking is available on Wren Street.", keywords: "parking car bays", createdAt: now, updatedAt: now },
    { tenantId, category: "policy", title: "Cancellation policy", content: "Please give at least 24 hours’ notice to cancel or move an appointment. Late changes may incur a fee.", keywords: "cancel cancellation move late fee", createdAt: now, updatedAt: now },
    { tenantId, category: "faq", title: "Emergency care", content: "For severe swelling, uncontrolled bleeding, breathing difficulty, or a serious injury, seek urgent medical help. The receptionist can transfer other urgent dental concerns to the clinical team.", keywords: "emergency pain swelling bleeding urgent", createdAt: now, updatedAt: now },
    { tenantId, category: "faq", title: "New patients", content: "New patients are welcome. A new patient examination lasts about 45 minutes.", keywords: "new patient first visit", createdAt: now, updatedAt: now },
  ]);

  await db.insert(integrationConfigs).values([
    { tenantId, integrationType: "calendar", provider: "internal_database", enabled: true, config: { systemOfRecord: true }, updatedAt: now },
    { tenantId, integrationType: "telephony", provider: "browser_simulator", enabled: true, config: { liveNumber: false }, updatedAt: now },
    { tenantId, integrationType: "stt", provider: "built_in_whisper", enabled: true, config: { language: "en" }, updatedAt: now },
    { tenantId, integrationType: "tts", provider: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser_speech", enabled: true, config: process.env.ELEVENLABS_API_KEY ? { voiceId: DEFAULT_ELEVENLABS_VOICE.id, voiceName: DEFAULT_ELEVENLABS_VOICE.name, fallback: "browser_speech" } : { voice: "system_default" }, updatedAt: now },
    { tenantId, integrationType: "email", provider: "adapter_not_configured", enabled: false, config: { mode: "future" }, updatedAt: now },
  ]);

  const serviceRows = await db.select().from(services).where(eq(services.tenantId, tenantId)).orderBy(asc(services.id));
  const sampleCustomer = await db.insert(customers).values({ tenantId, name: "Amelia Hart", phone: "07700900112", email: "amelia@example.com", createdAt: now, updatedAt: now }).$returningId();
  const secondCustomer = await db.insert(customers).values({ tenantId, name: "Daniel Reed", phone: "07700900118", email: "daniel@example.com", createdAt: now, updatedAt: now }).$returningId();
  const today = new Date();
  const atTime = (hour: number, minute: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, 0, 0).getTime();
  await db.insert(appointments).values([
    { tenantId, customerId: sampleCustomer[0].id, serviceId: serviceRows[2].id, reference: "HD-DEMO01", startAt: atTime(9, 30), endAt: atTime(10, 15), status: "confirmed", notes: "Routine hygiene visit", source: "staff", createdAt: now, updatedAt: now },
    { tenantId, customerId: secondCustomer[0].id, serviceId: serviceRows[1].id, reference: "HD-DEMO02", startAt: atTime(11, 0), endAt: atTime(11, 30), status: "confirmed", notes: "Six-month review", source: "staff", createdAt: now, updatedAt: now },
  ]);
  await ensureAvailabilitySlots(tenantId);
  return (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
}

export async function ensureAvailabilitySlots(tenantId: number) {
  const db = await requireDb();
  const horizon = Date.now() + 21 * 86_400_000;
  const existingFuture = await db.select({ count: sql<number>`count(*)` }).from(availabilitySlots).where(and(
    eq(availabilitySlots.tenantId, tenantId),
    gte(availabilitySlots.startAt, Date.now()),
    lte(availabilitySlots.startAt, horizon),
    eq(availabilitySlots.enabled, true),
  ));
  if (Number(existingFuture[0]?.count ?? 0) > 100) return;

  const [serviceRows, hourRows] = await Promise.all([
    db.select().from(services).where(and(eq(services.tenantId, tenantId), eq(services.active, true))),
    db.select().from(businessHours).where(eq(businessHours.tenantId, tenantId)),
  ]);
  const now = Date.now();
  const rows: Array<typeof availabilitySlots.$inferInsert> = [];
  for (let offset = 0; offset <= 21; offset++) {
    const day = new Date(now + offset * 86_400_000);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const hours = hourRows.find(item => item.dayOfWeek === day.getDay());
    if (!hours?.isOpen || !hours.openTime || !hours.closeTime) continue;
    const open = new Date(`${date}T${hours.openTime}:00`).getTime();
    const close = new Date(`${date}T${hours.closeTime}:00`).getTime();
    for (const service of serviceRows) {
      for (let startAt = open; startAt + service.durationMinutes * 60_000 <= close; startAt += 15 * 60_000) {
        if (startAt <= now) continue;
        rows.push({ tenantId, serviceId: service.id, startAt, endAt: startAt + service.durationMinutes * 60_000, capacity: 1, enabled: true, source: "internal_schedule", createdAt: now, updatedAt: now });
      }
    }
  }
  for (let index = 0; index < rows.length; index += 400) {
    await db.insert(availabilitySlots).values(rows.slice(index, index + 400)).onDuplicateKeyUpdate({ set: { enabled: true, updatedAt: now } });
  }
}

export async function listPersistedAvailabilitySlots(tenantId: number, serviceId: number, from: number, to: number) {
  const db = await requireDb();
  return db.select().from(availabilitySlots).where(and(
    eq(availabilitySlots.tenantId, tenantId),
    eq(availabilitySlots.serviceId, serviceId),
    eq(availabilitySlots.enabled, true),
    gte(availabilitySlots.startAt, from),
    lte(availabilitySlots.startAt, to),
  )).orderBy(asc(availabilitySlots.startAt));
}

export async function getPracticeBundle(tenantId: number) {
  const db = await requireDb();
  const [tenant, serviceRows, hourRows, knowledgeRows, integrations] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    db.select().from(services).where(eq(services.tenantId, tenantId)).orderBy(asc(services.id)),
    db.select().from(businessHours).where(eq(businessHours.tenantId, tenantId)).orderBy(asc(businessHours.dayOfWeek)),
    db.select().from(knowledgeItems).where(and(eq(knowledgeItems.tenantId, tenantId), eq(knowledgeItems.active, true))).orderBy(asc(knowledgeItems.id)),
    db.select().from(integrationConfigs).where(eq(integrationConfigs.tenantId, tenantId)).orderBy(asc(integrationConfigs.id)),
  ]);
  return { tenant: tenant[0], services: serviceRows, hours: hourRows, knowledge: knowledgeRows, integrations };
}

export async function getVoiceIntegration(tenantId: number) {
  const db = await requireDb();
  return (await db.select().from(integrationConfigs).where(and(
    eq(integrationConfigs.tenantId, tenantId),
    eq(integrationConfigs.integrationType, "tts"),
  )).limit(1))[0];
}

export async function updateVoiceIntegration(tenantId: number, voiceId: string, voiceName: string) {
  const db = await requireDb();
  const now = Date.now();
  const config = { voiceId, voiceName, modelId: "eleven_flash_v2_5", fallback: "browser_speech" };
  await db.insert(integrationConfigs).values({
    tenantId,
    integrationType: "tts",
    provider: "elevenlabs",
    enabled: true,
    config,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { provider: "elevenlabs", enabled: true, config, updatedAt: now } });
  await db.update(tenants).set({ voiceProvider: "elevenlabs", updatedAt: now }).where(eq(tenants.id, tenantId));
  return getVoiceIntegration(tenantId);
}

export async function findService(tenantId: number, query: string) {
  const db = await requireDb();
  const rows = await db.select().from(services).where(and(eq(services.tenantId, tenantId), eq(services.active, true))).orderBy(asc(services.id));
  const normalized = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  return rows.find(service => {
    const name = service.name.toLowerCase();
    return name.includes(query.toLowerCase()) || normalized.includes("clean") && name.includes("hygiene") || normalized.includes("checkup") && name.includes("check-up") || normalized.includes("emergency") && name.includes("emergency") || normalized.includes("whitening") && name.includes("whitening");
  });
}

export async function searchKnowledge(tenantId: number, query: string) {
  const db = await requireDb();
  const terms = query.toLowerCase().split(/\W+/).filter(term => term.length > 2).slice(0, 8);
  const rows = await db.select().from(knowledgeItems).where(and(eq(knowledgeItems.tenantId, tenantId), eq(knowledgeItems.active, true)));
  const scored = rows.map(item => ({
    ...item,
    score: terms.reduce((score, term) => score + (`${item.title} ${item.keywords ?? ""} ${item.content}`.toLowerCase().includes(term) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return scored.filter(item => item.score > 0).slice(0, 3);
}

export async function listAppointments(tenantId: number, from: number, to: number) {
  const db = await requireDb();
  return db.select({
    id: appointments.id,
    reference: appointments.reference,
    startAt: appointments.startAt,
    endAt: appointments.endAt,
    status: appointments.status,
    source: appointments.source,
    notes: appointments.notes,
    customerName: customers.name,
    customerPhone: customers.phone,
    customerEmail: customers.email,
    serviceName: services.name,
    durationMinutes: services.durationMinutes,
    priceMinor: services.priceMinor,
    currency: services.currency,
  }).from(appointments)
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(and(eq(appointments.tenantId, tenantId), gte(appointments.startAt, from), lte(appointments.startAt, to)))
    .orderBy(asc(appointments.startAt));
}

export async function checkSlotConflict(tenantId: number, startAt: number, endAt: number, excludeAppointmentId?: number) {
  const db = await requireDb();
  const conditions = [
    eq(appointments.tenantId, tenantId),
    eq(appointments.status, "confirmed"),
    lt(appointments.startAt, endAt),
    gt(appointments.endAt, startAt),
  ];
  if (excludeAppointmentId) conditions.push(ne(appointments.id, excludeAppointmentId));
  return (await db.select({ id: appointments.id }).from(appointments).where(and(...conditions)).limit(1)).length > 0;
}

function makeReference() {
  return `HD-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function createAppointment(input: { tenantId: number; serviceId: number; customerName: string; customerPhone?: string; customerEmail?: string; startAt: number; endAt: number; notes?: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const slot = (await tx.select().from(availabilitySlots).where(and(
      eq(availabilitySlots.tenantId, input.tenantId),
      eq(availabilitySlots.serviceId, input.serviceId),
      eq(availabilitySlots.startAt, input.startAt),
      eq(availabilitySlots.endAt, input.endAt),
      eq(availabilitySlots.enabled, true),
    )).limit(1))[0];
    if (!slot) throw new Error("The selected appointment time is not in the persisted availability ledger.");
    const conflicts = await tx.select({ count: sql<number>`count(*)` }).from(appointments).where(and(
      eq(appointments.tenantId, input.tenantId),
      eq(appointments.status, "confirmed"),
      lt(appointments.startAt, input.endAt),
      gt(appointments.endAt, input.startAt),
    ));
    if (Number(conflicts[0]?.count ?? 0) >= slot.capacity) throw new Error("The selected appointment time is no longer available.");
    const now = Date.now();
    const existingCustomer = input.customerPhone
      ? (await tx.select().from(customers).where(and(eq(customers.tenantId, input.tenantId), eq(customers.phone, input.customerPhone))).limit(1))[0]
      : undefined;
    const customerId = existingCustomer?.id ?? (await tx.insert(customers).values({ tenantId: input.tenantId, name: input.customerName, phone: input.customerPhone, email: input.customerEmail, createdAt: now, updatedAt: now }).$returningId())[0].id;
    const reference = makeReference();
    const [{ id }] = await tx.insert(appointments).values({ ...input, customerId, reference, status: "confirmed", source: "ai_receptionist", createdAt: now, updatedAt: now }).$returningId();
    return { id, reference, customerId };
  });
}

export async function findAppointmentForCustomer(tenantId: number, reference: string, phone?: string) {
  const db = await requireDb();
  const conditions = [eq(appointments.tenantId, tenantId), eq(appointments.reference, reference.toUpperCase())];
  if (phone) conditions.push(eq(customers.phone, phone));
  return (await db.select({ appointment: appointments, customer: customers, service: services }).from(appointments)
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(and(...conditions)).limit(1))[0];
}

export async function rescheduleAppointment(tenantId: number, appointmentId: number, startAt: number, endAt: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const current = (await tx.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId))).limit(1))[0];
    if (!current) throw new Error("Appointment not found");
    const slot = (await tx.select().from(availabilitySlots).where(and(
      eq(availabilitySlots.tenantId, tenantId),
      eq(availabilitySlots.serviceId, current.serviceId),
      eq(availabilitySlots.startAt, startAt),
      eq(availabilitySlots.endAt, endAt),
      eq(availabilitySlots.enabled, true),
    )).limit(1))[0];
    if (!slot) throw new Error("The selected appointment time is not in the persisted availability ledger.");
    const conflicts = await tx.select({ count: sql<number>`count(*)` }).from(appointments).where(and(
      eq(appointments.tenantId, tenantId), eq(appointments.status, "confirmed"), ne(appointments.id, appointmentId), lt(appointments.startAt, endAt), gt(appointments.endAt, startAt),
    ));
    if (Number(conflicts[0]?.count ?? 0) >= slot.capacity) throw new Error("The selected appointment time is no longer available.");
    await tx.update(appointments).set({ startAt, endAt, updatedAt: Date.now() }).where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
    return { success: true };
  });
}

export async function cancelAppointment(tenantId: number, appointmentId: number) {
  const db = await requireDb();
  await db.update(appointments).set({ status: "cancelled", updatedAt: Date.now() }).where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
  return { success: true };
}

export async function createCall(tenantId: number, greeting: string) {
  const db = await requireDb();
  const now = Date.now();
  const externalId = `CALL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const [{ id }] = await db.insert(calls).values({ tenantId, externalId, status: "active", state: "GREETING", context: { misunderstandingCount: 0 }, startedAt: now, updatedAt: now }).$returningId();
  await db.insert(callMessages).values({ tenantId, callId: id, speaker: "agent", body: greeting, createdAt: now });
  return getCall(tenantId, id);
}

export async function getCall(tenantId: number, callId: number) {
  const db = await requireDb();
  const call = (await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId))).limit(1))[0];
  if (!call) throw new Error("Call not found");
  const [messages, events] = await Promise.all([
    db.select().from(callMessages).where(and(eq(callMessages.callId, callId), eq(callMessages.tenantId, tenantId))).orderBy(asc(callMessages.createdAt)),
    db.select().from(toolEvents).where(and(eq(toolEvents.callId, callId), eq(toolEvents.tenantId, tenantId))).orderBy(desc(toolEvents.createdAt)),
  ]);
  return { call, messages, toolEvents: events };
}

export async function addCallMessage(tenantId: number, callId: number, speaker: "customer" | "agent" | "system", body: string, metadata?: unknown) {
  const db = await requireDb();
  await db.insert(callMessages).values({ tenantId, callId, speaker, body, metadata, createdAt: Date.now() });
}

export async function updateCall(tenantId: number, callId: number, changes: Partial<{ status: "active" | "completed" | "transferred" | "abandoned"; state: string; intent: string | null; confidence: number | null; callerName: string | null; callerPhone: string | null; summary: string | null; context: CallContext; appointmentId: number | null; escalated: boolean; escalationReason: string | null; endedAt: number | null }>) {
  const db = await requireDb();
  await db.update(calls).set({ ...changes, updatedAt: Date.now() }).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
}

export async function addToolEvent(tenantId: number, callId: number, toolName: string, status: "success" | "failure" | "blocked", input?: unknown, output?: unknown) {
  const db = await requireDb();
  await db.insert(toolEvents).values({ tenantId, callId, toolName, status, input, output, createdAt: Date.now() });
}

export async function createConfirmation(tenantId: number, appointmentId: number, body: string, recipient?: string, channel: "in_app" | "email" | "sms" = "in_app") {
  const db = await requireDb();
  const now = Date.now();
  const [{ id }] = await db.insert(confirmations).values({ tenantId, appointmentId, channel, recipient, status: channel === "in_app" ? "sent" : "queued", body, providerMessageId: channel === "in_app" ? `INAPP-${crypto.randomUUID().slice(0, 8)}` : null, createdAt: now, sentAt: channel === "in_app" ? now : null }).$returningId();
  return { id, channel, status: channel === "in_app" ? "sent" as const : "queued" as const };
}

export async function listRecentCalls(tenantId: number, limit = 20) {
  const db = await requireDb();
  return db.select({
    id: calls.id,
    externalId: calls.externalId,
    status: calls.status,
    state: calls.state,
    intent: calls.intent,
    confidence: calls.confidence,
    callerName: calls.callerName,
    callerPhone: calls.callerPhone,
    summary: calls.summary,
    escalated: calls.escalated,
    escalationReason: calls.escalationReason,
    startedAt: calls.startedAt,
    endedAt: calls.endedAt,
    appointmentReference: appointments.reference,
  }).from(calls).leftJoin(appointments, eq(calls.appointmentId, appointments.id)).where(eq(calls.tenantId, tenantId)).orderBy(desc(calls.startedAt)).limit(limit);
}

export async function getMetrics(tenantId: number) {
  const db = await requireDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000 - 1;
  const [callCounts, bookingCounts] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      escalated: sql<number>`sum(case when ${calls.escalated} = 1 then 1 else 0 end)`,
      completed: sql<number>`sum(case when ${calls.status} = 'completed' then 1 else 0 end)`,
      avgDuration: sql<number>`avg(case when ${calls.endedAt} is not null then ${calls.endedAt} - ${calls.startedAt} else null end)`,
    }).from(calls).where(and(eq(calls.tenantId, tenantId), gte(calls.startedAt, start.getTime()), lte(calls.startedAt, end))),
    db.select({
      total: sql<number>`count(*)`,
      confirmed: sql<number>`sum(case when ${appointments.status} = 'confirmed' then 1 else 0 end)`,
      cancelled: sql<number>`sum(case when ${appointments.status} = 'cancelled' then 1 else 0 end)`,
    }).from(appointments).where(and(eq(appointments.tenantId, tenantId), gte(appointments.startAt, start.getTime()), lte(appointments.startAt, end))),
  ]);
  return { calls: callCounts[0], bookings: bookingCounts[0] };
}

export { DAY_NAMES };
