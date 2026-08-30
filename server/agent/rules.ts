import type { ExtractedTurn, ReceptionIntent } from "../../shared/reception";

const INTENT_KEYWORDS: Array<[ReceptionIntent, RegExp]> = [
  ["HUMAN_HANDOFF", /\b(human|person|receptionist|someone real|speak to staff)\b/i],
  ["COMPLAINT", /\b(complaint|unhappy|angry|unacceptable|negligence|hurt me)\b/i],
  ["CANCEL_APPOINTMENT", /\b(cancel|call off)\b/i],
  ["RESCHEDULE_APPOINTMENT", /\b(reschedule|move|change).*(appointment|booking)|\bappointment.*(later|earlier|different)\b/i],
  ["CHECK_AVAILABILITY", /\b(available|availability|free slot|open slot)\b/i],
  ["BOOK_APPOINTMENT", /\b(book|appointment|schedule|see a dentist)\b/i],
  ["PRICING_QUERY", /\b(price|pricing|cost|how much|fee)\b/i],
  ["OPENING_HOURS", /\b(open|close|hours|weekend)\b/i],
  ["LOCATION_QUERY", /\b(where|address|located|parking|directions)\b/i],
  ["GENERAL_ENQUIRY", /\b(service|offer|provide|policy|dentist|treatment)\b/i],
];

export function fallbackExtractTurn(utterance: string, now = new Date()): ExtractedTurn {
  const intent = INTENT_KEYWORDS.find(([, pattern]) => pattern.test(utterance))?.[0] ?? "UNKNOWN";
  const lower = utterance.toLowerCase();
  const phone = utterance.match(/(?:\+?44\s?|0)\d(?:[\s-]?\d){8,10}/)?.[0]?.replace(/[\s-]/g, "") ?? null;
  const email = utterance.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const isoDate = utterance.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const relativeDate = lower.includes("tomorrow")
    ? new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
    : lower.includes("today")
      ? now.toISOString().slice(0, 10)
      : null;
  const timeMatch = utterance.match(/\b(?:([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?|((?:1[0-2]|0?\d))\s*(am|pm))\b/i);
  let time: string | null = null;
  if (timeMatch) {
    let hour = Number(timeMatch[1] ?? timeMatch[4]);
    const minute = Number(timeMatch[2] ?? "00");
    const meridiem = (timeMatch[3] ?? timeMatch[5])?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  const service = ["emergency", "check-up", "checkup", "cleaning", "hygiene", "whitening", "filling"]
    .find(item => lower.includes(item)) ?? null;
  const nameMatch = utterance.match(/(?:my name is|i(?:'m| am)|this is)\s+([a-z][a-z' -]{1,60}?)(?=\s+(?:and\s+)?(?:my\s+)?(?:phone|number|email)\b|[,.]|$)/i);

  return {
    intent,
    confidence: intent === "UNKNOWN" ? 34 : 76,
    customerName: nameMatch?.[1]?.trim() ?? null,
    customerPhone: phone,
    customerEmail: email,
    service,
    date: isoDate ?? relativeDate,
    time,
    appointmentReference: utterance.match(/\bHD-[A-Z0-9]{6}\b/i)?.[0]?.toUpperCase() ?? null,
    confirmation: /^(yes\b|confirm\b|that'?s right\b|go ahead\b|book it\b)/i.test(utterance.trim()),
    sensitive: /\b(payment|refund|medical record|diagnosis|prescription|severe pain|bleeding)\b/i.test(lower),
  };
}

export function shouldEscalate(turn: ExtractedTurn, misunderstandingCount: number) {
  if (turn.intent === "HUMAN_HANDOFF") return "Caller requested a human receptionist.";
  if (turn.intent === "COMPLAINT") return "Complaint or sensitive service issue requires a human receptionist.";
  if (turn.sensitive) return "Sensitive clinical, payment, or account matter requires human review.";
  if (misunderstandingCount >= 2) return "The assistant could not confidently understand the caller after repeated attempts.";
  if (turn.confidence < 35) return "Intent confidence fell below the safe automation threshold.";
  return null;
}

export function assertValidatedTransactionalClaim(validated: boolean, message: string) {
  if (!validated) {
    throw new Error(`Blocked unvalidated transactional claim: ${message}`);
  }
  return message;
}

export function toolUnavailableHandoffReason(toolName: string) {
  return `The required ${toolName} service is unavailable. Reception needs to complete this request safely.`;
}
