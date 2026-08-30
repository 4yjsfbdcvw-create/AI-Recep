import type { CallContext, ExtractedTurn, ReceptionIntent } from "../../shared/reception";
import { invokeLLM } from "../_core/llm";
import {
  addCallMessage,
  addToolEvent,
  cancelAppointment,
  createAppointment,
  findAppointmentForCustomer,
  findService,
  getCall,
  getPracticeBundle,
  rescheduleAppointment,
  searchKnowledge,
  updateCall,
} from "../db";
import { getAvailability, validateSlot } from "../services/availability";
import { InAppConfirmationAdapter } from "../services/confirmation";
import { assertValidatedTransactionalClaim, fallbackExtractTurn, shouldEscalate, toolUnavailableHandoffReason } from "./rules";

const extractionSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["BOOK_APPOINTMENT", "RESCHEDULE_APPOINTMENT", "CANCEL_APPOINTMENT", "CHECK_AVAILABILITY", "GENERAL_ENQUIRY", "PRICING_QUERY", "OPENING_HOURS", "LOCATION_QUERY", "COMPLAINT", "HUMAN_HANDOFF", "UNKNOWN"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    customerName: { type: ["string", "null"] },
    customerPhone: { type: ["string", "null"] },
    customerEmail: { type: ["string", "null"] },
    service: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, resolving relative dates using the supplied current date" },
    time: { type: ["string", "null"], description: "24-hour HH:mm" },
    appointmentReference: { type: ["string", "null"] },
    confirmation: { type: "boolean" },
    sensitive: { type: "boolean" },
  },
  required: ["intent", "confidence", "customerName", "customerPhone", "customerEmail", "service", "date", "time", "appointmentReference", "confirmation", "sensitive"],
  additionalProperties: false,
};

function readModelText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text) : "").join("").trim();
  }
  return "";
}

async function extractTurn(utterance: string, context: CallContext, services: string[]) {
  try {
    const result = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You classify a dental receptionist caller's latest turn and extract explicit details. Current local date: ${new Date().toISOString().slice(0, 10)}. Available services: ${services.join(", ")}. Existing context: ${JSON.stringify(context)}. Never infer a booking reference, contact detail, date, or time that the caller did not supply. A short affirmative response is confirmation only when pendingConfirmation is true. Sensitive is true for clinical diagnosis, severe symptoms, payments, refunds, or private-record requests.`,
        },
        { role: "user", content: utterance },
      ],
      response_format: { type: "json_schema", json_schema: { name: "dental_reception_turn", strict: true, schema: extractionSchema } },
    });
    const content = readModelText(result.choices?.[0]?.message?.content);
    if (!content) throw new Error("Structured model output was empty");
    return JSON.parse(content) as ExtractedTurn;
  } catch (error) {
    console.warn("[Agent] Structured extraction failed; using deterministic fallback", error);
    return fallbackExtractTurn(utterance);
  }
}

function mergeContext(context: CallContext, turn: ExtractedTurn): CallContext {
  return {
    ...context,
    customerName: turn.customerName ?? context.customerName,
    customerPhone: turn.customerPhone ?? context.customerPhone,
    customerEmail: turn.customerEmail ?? context.customerEmail,
    serviceName: turn.service ?? context.serviceName,
    date: turn.date ?? context.date,
    time: turn.time ?? context.time,
    appointmentReference: turn.appointmentReference ?? context.appointmentReference,
    misunderstandingCount: turn.intent === "UNKNOWN" ? (context.misunderstandingCount ?? 0) + 1 : 0,
  };
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value / 100);
}

function formatSlot(startAt: number) {
  return new Date(startAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function groundedKnowledgeResponse(intent: ReceptionIntent, query: string, bundle: Awaited<ReturnType<typeof getPracticeBundle>>, matches: Awaited<ReturnType<typeof searchKnowledge>>) {
  if (intent === "OPENING_HOURS") {
    const lines = bundle.hours.map(item => item.isOpen ? `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][item.dayOfWeek]} ${item.openTime}–${item.closeTime}` : `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][item.dayOfWeek]} closed`);
    const parking = /park|car/i.test(query) ? ` Parking information: ${bundle.tenant.parkingInstructions}` : "";
    return `Our opening hours are ${lines.join(", ")}.${parking}`;
  }
  if (intent === "PRICING_QUERY") {
    const relevant = bundle.services.filter(service => query.toLowerCase().includes(service.name.toLowerCase().split(" ")[0]) || bundle.services.length <= 5);
    return `Our current fees are ${relevant.map(service => `${service.name} ${formatMoney(service.priceMinor, service.currency)}`).join(", ")}.`;
  }
  if (intent === "LOCATION_QUERY") {
    const parking = /park|car/i.test(query) ? ` ${bundle.tenant.parkingInstructions}` : "";
    return `We are located at ${bundle.tenant.address}.${parking}`;
  }
  if (intent === "GENERAL_ENQUIRY") {
    const normalized = query.toLowerCase();
    const relevant = bundle.services.filter(service => service.name.toLowerCase().split(/\W+/).filter(word => word.length > 3).some(word => normalized.includes(word)));
    if (relevant.length) {
      return relevant.map(service => `${service.name}: ${service.description} The configured fee is ${formatMoney(service.priceMinor, service.currency)}.`).join(" ");
    }
  }
  if (matches.length) return matches.map(item => item.content).join(" ");
  return `I can help with appointments, services, fees, opening hours, directions, parking, and practice policies. What would you like to know?`;
}

async function draftNaturalResponse(facts: string, callerText: string) {
  try {
    const result = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are Clara, a concise and warm dental receptionist. Rewrite the supplied verified facts into one or two natural spoken sentences. Use only the facts supplied. Do not add availability, prices, policies, customer details, or clinical advice." },
        { role: "user", content: `Caller: ${callerText}\nVerified facts: ${facts}` },
      ],
    });
    return readModelText(result.choices?.[0]?.message?.content) || facts;
  } catch {
    return facts;
  }
}

async function recordAndReturn(tenantId: number, callId: number, response: string, state: string, context: CallContext, intent: ReceptionIntent, confidence: number) {
  await addCallMessage(tenantId, callId, "agent", response, { state, intent });
  await updateCall(tenantId, callId, { state, context, intent, confidence, callerName: context.customerName ?? null, callerPhone: context.customerPhone ?? null });
  return getCall(tenantId, callId);
}

async function handoff(tenantId: number, callId: number, reason: string, context: CallContext, intent: ReceptionIntent, confidence: number) {
  const response = "I’m going to bring a member of our reception team into this conversation. I’ll pass along the details you’ve already shared so you won’t need to repeat yourself.";
  await addToolEvent(tenantId, callId, "transfer_to_human", "success", { reason }, { contextShared: true });
  await addCallMessage(tenantId, callId, "agent", response, { state: "HUMAN_HANDOFF" });
  await updateCall(tenantId, callId, { status: "transferred", state: "HUMAN_HANDOFF", context, intent, confidence, escalated: true, escalationReason: reason, summary: `Caller requires human assistance. ${reason}`, endedAt: Date.now() });
  return getCall(tenantId, callId);
}

async function processTurnInternal(tenantId: number, callId: number, utterance: string) {
  const [callData, bundle] = await Promise.all([getCall(tenantId, callId), getPracticeBundle(tenantId)]);
  if (callData.call.status !== "active") throw new Error("This call is no longer active.");
  await addCallMessage(tenantId, callId, "customer", utterance);
  const previous = (callData.call.context ?? {}) as CallContext;
  const turn = await extractTurn(utterance, previous, bundle.services.map(service => service.name));
  if (previous.pendingConfirmation && turn.confirmation && turn.intent === "UNKNOWN") {
    turn.intent = previous.pendingAction === "cancel" ? "CANCEL_APPOINTMENT" : previous.pendingAction === "reschedule" ? "RESCHEDULE_APPOINTMENT" : "BOOK_APPOINTMENT";
    turn.confidence = Math.max(turn.confidence, 90);
  }
  let context = mergeContext(previous, turn);
  const escalationReason = shouldEscalate(turn, context.misunderstandingCount ?? 0);
  if (escalationReason) return handoff(tenantId, callId, escalationReason, context, turn.intent, turn.confidence);

  if (["OPENING_HOURS", "PRICING_QUERY", "LOCATION_QUERY", "GENERAL_ENQUIRY"].includes(turn.intent)) {
    const matches = await searchKnowledge(tenantId, utterance);
    const facts = groundedKnowledgeResponse(turn.intent, utterance, bundle, matches);
    await addToolEvent(tenantId, callId, "get_tenant_knowledge", "success", { query: utterance }, { sourceIds: matches.map(item => item.id), grounded: true });
    return recordAndReturn(tenantId, callId, await draftNaturalResponse(facts, utterance), "ANSWERING_ENQUIRY", context, turn.intent, turn.confidence);
  }

  if (turn.intent === "CANCEL_APPOINTMENT" || context.pendingAction === "cancel") {
    if (!context.appointmentReference || !context.customerPhone) {
      return recordAndReturn(tenantId, callId, "To safely find the appointment, please share the booking reference and the phone number used for the booking.", "VERIFY_CUSTOMER", { ...context, pendingAction: "cancel" }, "CANCEL_APPOINTMENT", turn.confidence);
    }
    const found = await findAppointmentForCustomer(tenantId, context.appointmentReference, context.customerPhone);
    await addToolEvent(tenantId, callId, "get_customer_booking", found ? "success" : "failure", { reference: context.appointmentReference, phone: "verified" }, found ? { appointmentId: found.appointment.id, status: found.appointment.status } : { found: false });
    if (!found || found.appointment.status !== "confirmed") {
      return recordAndReturn(tenantId, callId, "I couldn’t find an active appointment matching those details. I can transfer you to reception if you’d like.", "VERIFY_CUSTOMER", context, "CANCEL_APPOINTMENT", turn.confidence);
    }
    context = { ...context, appointmentId: found.appointment.id, pendingAction: "cancel", pendingConfirmation: true };
    if (!turn.confirmation) return recordAndReturn(tenantId, callId, `I found ${found.service.name} on ${formatSlot(found.appointment.startAt)}. Would you like me to cancel it?`, "CONFIRM_CANCELLATION", context, "CANCEL_APPOINTMENT", turn.confidence);
    await cancelAppointment(tenantId, found.appointment.id);
    await addToolEvent(tenantId, callId, "cancel_booking", "success", { appointmentId: found.appointment.id }, { reference: found.appointment.reference, status: "cancelled" });
    const response = assertValidatedTransactionalClaim(true, `Your appointment ${found.appointment.reference} has been cancelled.`);
    return recordAndReturn(tenantId, callId, response, "TRANSACTION_COMPLETE", { ...context, pendingConfirmation: false }, "CANCEL_APPOINTMENT", turn.confidence);
  }

  const appointmentIntent = ["BOOK_APPOINTMENT", "CHECK_AVAILABILITY", "RESCHEDULE_APPOINTMENT"].includes(turn.intent) || ["book", "reschedule"].includes(context.pendingAction ?? "");
  if (appointmentIntent) {
    const isReschedule = turn.intent === "RESCHEDULE_APPOINTMENT" || context.pendingAction === "reschedule";
    if (isReschedule && (!context.appointmentReference || !context.customerPhone)) {
      return recordAndReturn(tenantId, callId, "Please share your booking reference and the phone number used for the appointment so I can verify it before making changes.", "VERIFY_CUSTOMER", { ...context, pendingAction: "reschedule" }, "RESCHEDULE_APPOINTMENT", turn.confidence);
    }
    let existing: Awaited<ReturnType<typeof findAppointmentForCustomer>> | undefined;
    if (isReschedule) {
      existing = await findAppointmentForCustomer(tenantId, context.appointmentReference!, context.customerPhone);
      await addToolEvent(tenantId, callId, "get_customer_booking", existing ? "success" : "failure", { reference: context.appointmentReference, phone: "verified" }, existing ? { appointmentId: existing.appointment.id } : { found: false });
      if (!existing) return recordAndReturn(tenantId, callId, "I couldn’t verify an appointment with those details. I can transfer you to the reception team.", "VERIFY_CUSTOMER", context, "RESCHEDULE_APPOINTMENT", turn.confidence);
      context = { ...context, serviceId: existing.service.id, serviceName: existing.service.name, customerName: existing.customer.name, appointmentId: existing.appointment.id, pendingAction: "reschedule" };
    }
    const service = context.serviceId ? bundle.services.find(item => item.id === context.serviceId) : context.serviceName ? await findService(tenantId, context.serviceName) : undefined;
    if (!service) {
      return recordAndReturn(tenantId, callId, `Which treatment would you like? I can help with ${bundle.services.map(item => item.name).join(", ")}.`, "COLLECT_SERVICE", { ...context, pendingAction: isReschedule ? "reschedule" : "book" }, isReschedule ? "RESCHEDULE_APPOINTMENT" : "BOOK_APPOINTMENT", turn.confidence);
    }
    context = { ...context, serviceId: service.id, serviceName: service.name, pendingAction: isReschedule ? "reschedule" : "book" };
    if (!context.date) return recordAndReturn(tenantId, callId, `What date would suit you for the ${service.name}?`, "COLLECT_DATE", context, turn.intent, turn.confidence);
    const slots = await getAvailability(tenantId, service.id, context.date);
    await addToolEvent(tenantId, callId, "check_availability", "success", { serviceId: service.id, date: context.date }, { slots: slots.slice(0, 6), authoritative: true });
    if (!slots.length) return recordAndReturn(tenantId, callId, `I checked the appointment book and there are no available ${service.name} appointments on ${context.date}. Please choose another date.`, "COLLECT_DATE", { ...context, date: undefined, time: undefined }, turn.intent, turn.confidence);
    if (!context.time) {
      return recordAndReturn(tenantId, callId, `I checked the appointment book. Available times on ${context.date} include ${slots.slice(0, 4).map(slot => slot.label).join(", ")}. Which time works for you?`, "PRESENT_AVAILABILITY", context, turn.intent, turn.confidence);
    }
    const valid = await validateSlot(tenantId, service.id, context.date, context.time, existing?.appointment.id);
    if (!valid.valid) {
      return recordAndReturn(tenantId, callId, `That time isn’t available. I can offer ${valid.alternatives?.map(slot => slot.label).join(", ") || "another date"}.`, "PRESENT_AVAILABILITY", { ...context, time: undefined }, turn.intent, turn.confidence);
    }
    context = { ...context, proposedStartAt: valid.startAt, proposedEndAt: valid.endAt };
    if (turn.intent === "CHECK_AVAILABILITY" && !context.customerName) {
      return recordAndReturn(tenantId, callId, `${formatSlot(valid.startAt)} is currently available for ${service.name}. Would you like to book it?`, "PRESENT_AVAILABILITY", { ...context, pendingAction: "book" }, "CHECK_AVAILABILITY", turn.confidence);
    }
    if (!context.customerName || !context.customerPhone) {
      return recordAndReturn(tenantId, callId, "That time is available. To prepare the booking, may I have your full name and phone number?", "COLLECT_CUSTOMER", context, turn.intent, turn.confidence);
    }
    if (!context.pendingConfirmation || !turn.confirmation) {
      return recordAndReturn(tenantId, callId, `I’ve verified that ${formatSlot(valid.startAt)} is available for ${service.name}. Shall I ${isReschedule ? "move your appointment" : "confirm the booking"} for ${context.customerName}?`, "CONFIRM_BOOKING", { ...context, pendingConfirmation: true }, turn.intent, turn.confidence);
    }

    let appointmentId: number;
    let reference: string;
    if (isReschedule && existing) {
      await rescheduleAppointment(tenantId, existing.appointment.id, valid.startAt, valid.endAt);
      appointmentId = existing.appointment.id;
      reference = existing.appointment.reference;
      await addToolEvent(tenantId, callId, "reschedule_booking", "success", { appointmentId, startAt: valid.startAt }, { reference, status: "confirmed", authoritative: true });
    } else {
      const created = await createAppointment({ tenantId, serviceId: service.id, customerName: context.customerName, customerPhone: context.customerPhone, customerEmail: context.customerEmail, startAt: valid.startAt, endAt: valid.endAt });
      appointmentId = created.id;
      reference = created.reference;
      await addToolEvent(tenantId, callId, "create_booking", "success", { serviceId: service.id, startAt: valid.startAt }, { appointmentId, reference, status: "confirmed", authoritative: true });
    }
    const confirmation = await new InAppConfirmationAdapter().send({ tenantId, appointmentId, reference, practiceName: bundle.tenant.name, customerName: context.customerName, serviceName: service.name, startAt: valid.startAt, recipient: context.customerEmail ?? context.customerPhone });
    await addToolEvent(tenantId, callId, "send_confirmation", "success", { channel: "in_app" }, confirmation);
    const response = assertValidatedTransactionalClaim(true, `${isReschedule ? "Your appointment has been moved" : "Your appointment is confirmed"} for ${formatSlot(valid.startAt)}. Your reference is ${reference}, and I’ve added an in-app confirmation.`);
    await updateCall(tenantId, callId, { appointmentId });
    return recordAndReturn(tenantId, callId, response, "TRANSACTION_COMPLETE", { ...context, appointmentReference: reference, appointmentId, pendingConfirmation: false }, isReschedule ? "RESCHEDULE_APPOINTMENT" : "BOOK_APPOINTMENT", turn.confidence);
  }

  return recordAndReturn(tenantId, callId, "I’m sorry, I didn’t quite catch what you need. I can book, move or cancel an appointment, answer practice questions, or connect you with reception.", "IDENTIFY_INTENT", context, turn.intent, turn.confidence);
}

export async function processTurn(tenantId: number, callId: number, utterance: string) {
  try {
    return await processTurnInternal(tenantId, callId, utterance);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool failure";
    try {
      const data = await getCall(tenantId, callId);
      const context = (data.call.context ?? {}) as CallContext;
      await addToolEvent(tenantId, callId, "required_backend", "failure", { utterance }, { error: message, safeFallback: "human_handoff" });
      return handoff(tenantId, callId, toolUnavailableHandoffReason("booking or practice-system"), context, (data.call.intent as ReceptionIntent) ?? "UNKNOWN", data.call.confidence ?? 0);
    } catch (handoffError) {
      console.error("[Agent] Unable to persist backend-failure handoff", handoffError);
      throw error;
    }
  }
}

export async function transferCall(tenantId: number, callId: number, reason: string) {
  const data = await getCall(tenantId, callId);
  return handoff(tenantId, callId, reason, (data.call.context ?? {}) as CallContext, (data.call.intent as ReceptionIntent) ?? "HUMAN_HANDOFF", data.call.confidence ?? 100);
}

export async function endCall(tenantId: number, callId: number) {
  const data = await getCall(tenantId, callId);
  const summary = data.call.summary ?? `Call ended after ${data.messages.length} conversation turns. Intent: ${data.call.intent ?? "not determined"}.${data.call.appointmentId ? " A validated appointment transaction was completed." : ""}`;
  await updateCall(tenantId, callId, { status: "completed", state: "END", summary, endedAt: Date.now() });
  return getCall(tenantId, callId);
}
