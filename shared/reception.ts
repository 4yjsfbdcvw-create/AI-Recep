export const intentValues = [
  "BOOK_APPOINTMENT",
  "RESCHEDULE_APPOINTMENT",
  "CANCEL_APPOINTMENT",
  "CHECK_AVAILABILITY",
  "GENERAL_ENQUIRY",
  "PRICING_QUERY",
  "OPENING_HOURS",
  "LOCATION_QUERY",
  "COMPLAINT",
  "HUMAN_HANDOFF",
  "UNKNOWN",
] as const;

export type ReceptionIntent = (typeof intentValues)[number];

export type CallContext = {
  serviceId?: number;
  serviceName?: string;
  date?: string;
  time?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  appointmentReference?: string;
  pendingConfirmation?: boolean;
  pendingAction?: "book" | "cancel" | "reschedule";
  appointmentId?: number;
  proposedStartAt?: number;
  proposedEndAt?: number;
  misunderstandingCount?: number;
};

export type ExtractedTurn = {
  intent: ReceptionIntent;
  confidence: number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  appointmentReference: string | null;
  confirmation: boolean;
  sensitive: boolean;
};
